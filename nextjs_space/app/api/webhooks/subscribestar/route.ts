export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { json } from '@/lib/access';
import {
  subscribeStarConfigured,
  syncSubscribeStarEvent,
  verifySubscribeStarSignature,
  type SubscribeStarEvent,
} from '@/lib/subscribestar';

/**
 * SubscribeStar → Nexus subscription sync.
 * Verifies HMAC, dedupes on event id, then updates the matching user's tier from the DB
 * (never trusts the browser for plan state).
 */
export async function POST(request: NextRequest) {
  if (!subscribeStarConfigured()) return json({ error: 'SubscribeStar webhook not configured' }, 503);
  const raw = await request.text();
  let event: SubscribeStarEvent;
  try {
    event = JSON.parse(raw) as SubscribeStarEvent;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const signature = request.headers.get('x-subscribestar-signature')
    ?? request.headers.get('x-signature')
    ?? request.headers.get('subscribestar-signature');
  if (!verifySubscribeStarSignature(raw, signature)) return json({ error: 'Invalid signature' }, 400);

  const eventId = typeof event.id === 'string' && event.id ? event.id : null;
  if (eventId) {
    const existing = await prisma.stripeEvent.findUnique({ where: { id: `subscribestar:${eventId}` } });
    if (existing) return json({ received: true, duplicate: true });
  }

  try {
    const result = await syncSubscribeStarEvent(event);
    if (eventId) {
      await prisma.stripeEvent.create({
        data: { id: `subscribestar:${eventId}`, type: String(event.type ?? event.status ?? 'subscribestar') },
      }).catch(() => {});
    }
    if (!result.ok && result.reason === 'user_not_found') {
      // Acknowledge so SubscribeStar does not retry forever for unknown emails.
      return json({ received: true, matched: false });
    }
    return json({ received: true, matched: result.ok, reason: result.reason });
  } catch (err: any) {
    console.error('SubscribeStar webhook error:', err?.message);
    return json({ error: 'Webhook handling failed' }, 500);
  }
}
