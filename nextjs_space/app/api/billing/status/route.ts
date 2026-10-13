export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { getViewer, accessStatus, json } from '@/lib/access';
import { adultCardsEnabled } from '@/lib/nsfw-account';

export async function GET() {
  try {
    const viewer = await getViewer();
    return json({ ...accessStatus(viewer), nsfwEnabled: await adultCardsEnabled(viewer) });
  } catch (err: any) {
    console.error('GET /api/billing/status error:', err);
    return json({ error: 'Failed to load subscription status' }, 500);
  }
}
