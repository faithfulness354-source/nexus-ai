import zlib from 'zlib';

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Keywords used by Tavern/SillyTavern (chara), Character Card V3 (ccv3) and some exporters (character). */
const CARD_KEYS = ['ccv3', 'chara', 'character'];

export const isPng = (buf: Buffer) => buf.length > 8 && buf.subarray(0, 8).equals(PNG_SIG);

/** Reads every tEXt / zTXt / iTXt chunk into a keyword → text map. */
export function readPngTextChunks(buf: Buffer): Record<string, string> {
  if (!isPng(buf)) throw new Error('Not a PNG file');
  const out: Record<string, string> = {};
  let pos = 8;
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const start = pos + 8;
    const end = start + len;
    if (end > buf.length) break;
    const data = buf.subarray(start, end);
    try {
      const nul = data.indexOf(0);
      if (nul > 0) {
        const key = data.toString('latin1', 0, nul);
        if (type === 'tEXt') {
          out[key] = data.toString('latin1', nul + 1);
        } else if (type === 'zTXt') {
          out[key] = zlib.inflateSync(data.subarray(nul + 2)).toString('latin1');
        } else if (type === 'iTXt') {
          const compressed = data[nul + 1] === 1;
          let p = nul + 3;
          p = data.indexOf(0, p) + 1; // language tag
          p = data.indexOf(0, p) + 1; // translated keyword
          const body = data.subarray(p);
          out[key] = (compressed ? zlib.inflateSync(body) : body).toString('utf8');
        }
      }
    } catch (err) {
      console.warn(`Skipping unreadable PNG ${type} chunk:`, err);
    }
    if (type === 'IEND') break;
    pos = end + 4; // skip CRC
  }
  return out;
}

/** Payloads are usually base64(JSON); some tools store raw JSON. */
function decodePayload(text: string): any | null {
  const t = text.trim();
  if (!t) return null;
  if (t.startsWith('{')) {
    try { return JSON.parse(t); } catch { /* fall through */ }
  }
  try {
    const decoded = Buffer.from(t, 'base64').toString('utf8').trim();
    if (decoded.startsWith('{')) return JSON.parse(decoded);
  } catch { /* not base64 JSON */ }
  try {
    const latin = Buffer.from(t, 'latin1').toString('utf8').trim(); // raw UTF-8 JSON stored in tEXt
    if (latin.startsWith('{')) return JSON.parse(latin);
  } catch { /* ignore */ }
  return null;
}

/** Returns the embedded character JSON from a card PNG, or null when there is none. */
export function extractCardFromPng(buf: Buffer): { card: any; key: string } | null {
  const chunks = readPngTextChunks(buf);
  for (const key of CARD_KEYS) {
    const hit = Object.keys(chunks).find((k) => k.toLowerCase() === key);
    if (hit) {
      const card = decodePayload(chunks[hit]);
      if (card) return { card, key: hit };
    }
  }
  // Any other chunk that decodes to something card-shaped.
  for (const [key, text] of Object.entries(chunks)) {
    const card = decodePayload(text);
    if (card && (card.name || card.data?.name || card.char_name)) return { card, key };
  }
  return null;
}
