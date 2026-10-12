export const NSFW_COOKIE = 'nexus_nsfw';

export function nsfwCookieEnabled(value: string | undefined | null): boolean {
  return value === '1';
}
