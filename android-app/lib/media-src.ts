/** Adds a version query so a replaced hero or avatar is not served from the browser cache. */
export function mediaVersionUrl(src: string | null | undefined, version?: string | number | Date | null): string {
  const raw = String(src ?? '').trim();
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  const stamp = version instanceof Date ? version.toISOString() : version == null || version === '' ? '' : String(version);
  if (!stamp) return raw;
  const hashAt = raw.indexOf('#');
  const hash = hashAt >= 0 ? raw.slice(hashAt) : '';
  const base = hashAt >= 0 ? raw.slice(0, hashAt) : raw;
  const join = base.includes('?') ? '&' : '?';
  return `${base}${join}v=${encodeURIComponent(stamp)}${hash}`;
}
