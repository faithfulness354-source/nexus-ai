export const dynamic = 'force-dynamic';
import { getViewer, accessStatus, json } from '@/lib/access';

export async function GET() {
  try {
    return json(accessStatus(await getViewer()));
  } catch (err: any) {
    console.error('GET /api/billing/status error:', err);
    return json({ error: 'Failed to load subscription status' }, 500);
  }
}
