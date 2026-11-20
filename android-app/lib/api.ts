/** Production Next.js host. The phone always calls this cloud deployment. */
export const LIVE_API_URL = 'https://nexus-ai-navy-xi.vercel.app';

export function liveApiUrl(): string {
  return LIVE_API_URL;
}
