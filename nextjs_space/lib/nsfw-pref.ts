import { cookies } from 'next/headers';
import { NSFW_COOKIE, nsfwCookieEnabled } from '@/lib/nsfw-cookie';

/** Profile setting mirrored into a cookie so server-rendered decks can honor it. */
export async function readNsfwToggle(): Promise<boolean> {
  const jar = await cookies();
  return nsfwCookieEnabled(jar.get(NSFW_COOKIE)?.value);
}

export function nsfwToggleFromRequest(request: { cookies: { get(name: string): { value: string } | undefined } }): boolean {
  return nsfwCookieEnabled(request.cookies.get(NSFW_COOKIE)?.value);
}
