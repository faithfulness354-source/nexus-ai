/** Keeps background audio pointed at a local nexus asset, an older /audio file, or a direct http(s) audio URL. */
const AUDIO_EXT = 'mp3|wav|ogg|m4a|aac|webm';

export function normalizeAudioUrl(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const local = new RegExp(`^/(?:nexus_assets/audio|audio)/[^/\\\\]+\\.(${AUDIO_EXT})$`, 'i');
  if (local.test(raw)) return raw;
  const file = raw.match(new RegExp(`^([^/\\\\]+)\\.(${AUDIO_EXT})$`, 'i'));
  if (file) return `/nexus_assets/audio/${file[1]}.${file[2].toLowerCase()}`;
  try {
    const url = new URL(raw);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && new RegExp(`\\.(${AUDIO_EXT})($|\\?)`, 'i').test(url.pathname + url.search)) {
      return url.toString();
    }
  } catch {
    /* not a URL */
  }
  return '';
}
