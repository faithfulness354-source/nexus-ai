import dns from 'dns/promises';
import net from 'net';
import { extractCardFromPng, isPng } from './png-card';
import { normalizeCard, NormalizedCard } from './card-parser';
import { uploadBuffer, getFileUrl } from './s3';
import { savePublicUpload } from './local-upload';

const MAX_BYTES = 15 * 1024 * 1024;
const UA = 'Mozilla/5.0 (compatible; NexusAI-CardImporter/1.0)';

export class ImportError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export interface ImportResult { card: NormalizedCard; avatarPng: Buffer | null; source: string }

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:127.') || v.startsWith('::ffff:10.') || v.startsWith('::ffff:192.168.');
}

/** Blocks requests to internal hosts so the importer can't be used to probe our network. */
async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new ImportError('That doesn’t look like a valid link.'); }
  if (!/^https?:$/.test(url.protocol)) throw new ImportError('Only http(s) links are supported.');
  const addrs = await dns.lookup(url.hostname, { all: true }).catch(() => []);
  if (!addrs.length) throw new ImportError(`Couldn’t reach ${url.hostname}.`);
  if (addrs.some((a) => isPrivateIp(a.address))) throw new ImportError('That link points to a private address.');
  return url;
}

async function fetchBytes(raw: string, accept = '*/*'): Promise<{ buf: Buffer; type: string; status: number }> {
  let url = await assertPublicUrl(raw);
  let res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  // Follow up to 4 redirects, re-checking each hop so a public link can't bounce to an internal host.
  for (let hop = 0; hop < 4 && res.status >= 300 && res.status < 400 && res.headers.get('location'); hop++) {
    url = await assertPublicUrl(new URL(res.headers.get('location')!, url).toString());
    res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  }
  if (!res.ok) return { buf: Buffer.alloc(0), type: '', status: res.status };
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_BYTES) throw new ImportError('That file is larger than 15 MB.');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new ImportError('That file is larger than 15 MB.');
  return { buf, type: res.headers.get('content-type') ?? '', status: res.status };
}

/** Parses raw bytes that are either a card PNG or card JSON. */
export function parseCardBytes(buf: Buffer, source: string): ImportResult {
  if (isPng(buf)) {
    const found = extractCardFromPng(buf);
    if (!found) throw new ImportError('This PNG has no embedded character data (no chara / ccv3 metadata). It may be a plain image, or the site stripped the metadata.');
    return { card: normalizeCard(found.card), avatarPng: buf, source: `${source} (PNG "${found.key}" chunk)` };
  }
  const text = buf.toString('utf8').replace(/^\uFEFF/, '').trim();
  if (!text.startsWith('{')) throw new ImportError('Unsupported file. Upload a character card .png or .json.');
  let json: any;
  try { json = JSON.parse(text); } catch { throw new ImportError('The JSON is not valid. Check that you copied the whole card.'); }
  return { card: normalizeCard(json), avatarPng: null, source: `${source} (JSON)` };
}

const blocked = (site: string, status: number) => new ImportError(
  `${site} refused the request (HTTP ${status}). The site may block automated access, require login, or hide this character’s definition. Download the card as PNG or JSON from the page and upload it here instead.`,
  422,
);

/** Resolves a public character page link (Chub, Janitor AI, Character Tavern, or a direct .png/.json URL). */
export async function importFromUrl(raw: string): Promise<ImportResult> {
  const url = await assertPublicUrl(raw.trim());
  const host = url.hostname.replace(/^www\./, '');
  const parts = url.pathname.split('/').filter(Boolean);

  if (/(^|\.)(chub\.ai|characterhub\.org)$/.test(host)) {
    const i = parts.indexOf('characters');
    const [creator, slug] = i >= 0 ? parts.slice(i + 1, i + 3) : parts.slice(0, 2);
    if (!creator || !slug) throw new ImportError('Use a Chub character link like chub.ai/characters/creator/name.');
    const png = await fetchBytes(`https://avatars.charhub.io/avatars/${creator}/${slug}/chara_card_v2.png`, 'image/png');
    if (png.status === 200 && isPng(png.buf) && extractCardFromPng(png.buf)) return parseCardBytes(png.buf, 'Chub');
    const api = await fetchBytes(`https://api.chub.ai/api/characters/${creator}/${slug}?full=true`, 'application/json');
    if (api.status !== 200) throw blocked('Chub', api.status || png.status);
    return withRemoteAvatar(parseCardBytes(api.buf, 'Chub API'));
  }

  if (host.endsWith('janitorai.com')) {
    const id = parts[parts.indexOf('characters') + 1]?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
    if (!id) throw new ImportError('Use a Janitor AI character link like janitorai.com/characters/<id>_name.');
    const api = await fetchBytes(`https://janitorai.com/hampter/characters/${id}`, 'application/json');
    if (api.status !== 200) throw blocked('Janitor AI', api.status);
    const result = await withRemoteAvatar(parseCardBytes(api.buf, 'Janitor AI'));
    if (!result.card.personality) throw new ImportError('This Janitor AI character keeps its definition hidden, so it can’t be imported from the link. Ask the creator for the card file.', 422);
    return result;
  }

  if (host.endsWith('character-tavern.com') && parts[0] === 'character' && parts.length >= 3) {
    const png = await fetchBytes(`https://cards.character-tavern.com/${parts[1]}/${parts[2]}.png`, 'image/png');
    if (png.status !== 200) throw blocked('Character Tavern', png.status);
    return parseCardBytes(png.buf, 'Character Tavern');
  }

  const direct = await fetchBytes(url.toString());
  if (direct.status !== 200) throw blocked(host, direct.status);
  if (/text\/html/i.test(direct.type) && !isPng(direct.buf)) {
    throw new ImportError('That link is a web page, not a character card. Use a Chub, Janitor AI or Character Tavern character link, or a direct link to a card .png/.json.');
  }
  return withRemoteAvatar(parseCardBytes(direct.buf, host));
}

/** For JSON sources, pull the avatar the payload points to (best effort). */
async function withRemoteAvatar(result: ImportResult): Promise<ImportResult> {
  if (result.avatarPng || !result.card.avatarUrl) return result;
  try {
    const img = await fetchBytes(result.card.avatarUrl, 'image/*');
    if (img.status === 200 && /^image\/(png|jpe?g|webp|gif)/i.test(img.type)) return { ...result, avatarPng: img.buf };
  } catch (err) {
    console.warn('Avatar download skipped:', err);
  }
  return result;
}

function sniffImageType(buf: Buffer): { type: string; ext: string } | null {
  if (isPng(buf)) return { type: 'image/png', ext: 'png' };
  if (buf[0] === 0xff && buf[1] === 0xd8) return { type: 'image/jpeg', ext: 'jpg' };
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return { type: 'image/webp', ext: 'webp' };
  if (buf.toString('latin1', 0, 3) === 'GIF') return { type: 'image/gif', ext: 'gif' };
  return null;
}

/** Stores the card image as the character avatar; returns its public URL or null. */
export async function storeAvatar(buf: Buffer | null, name: string): Promise<string | null> {
  const kind = buf && sniffImageType(buf);
  if (!buf || !kind) return null;
  const fileName = `${name || 'character'}-avatar.${kind.ext}`;
  try {
    const stored = await uploadBuffer('uploads', fileName, buf, kind.type, true);
    const url = await getFileUrl(stored, kind.type, true);
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.toString();
  } catch (err) {
    console.error('Cloud avatar store unavailable:', err instanceof Error ? err.name : 'Error');
  }
  return savePublicUpload(fileName, buf, kind.type);
}
