export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import {
  applySubscriptionToUser,
  findUserBySubscribeStar,
  subscribeStarWebhookConfigured,
  verifySubscribeStarSignature,
} from '@/lib/subscribestar';

/**
 * SubscribeStar webhook. Verifies X-SubscribeStar-Signature (HMAC-MD5) and
 * returns 200 immediately after accepting a valid payload.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const signature = request.headers.get('x-subscribestar-signature')
    || request.headers.get('X-SubscribeStar-Signature');

  if (!subscribeStarWebhookConfigured()) {
    // Accept during review so SubscribeStar delivery tests do not hard-fail the app.
    console.warn('[subscribestar] webhook received but SUBSCRIBESTAR_WEBHOOK_SECRET is not configured');
    return new NextResponse('ok', { status: 200 });
  }

  if (!verifySubscribeStarSignature(raw, signature)) {
    return new NextResponse('invalid signature', { status: 401 });
  }

  // Acknowledge quickly; process after verify.
  let body: any = {};
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse('ok', { status: 200 });
  }

  try {
    await processEvent(body);
  } catch (err) {
    console.error('[subscribestar] webhook process error', err instanceof Error ? err.message : err);
  }

  return new NextResponse('ok', { status: 200 });
}

async function processEvent(body: any) {
  const event = String(body?.event || '').trim();
  const payload = body?.payload ?? {};
  const subscription = payload?.subscription ?? {};
  const subscriber = payload?.subscriber ?? payload?.pledger ?? {};
  const payment = payload?.payment ?? {};

  const subscribeStarId = String(
    subscriber?.id ?? subscription?.subscriber_id ?? payment?.subscriber_id ?? '',
  ).trim();
  const email = (subscriber?.email || '').trim() || null;
  const username = (subscriber?.nickname || subscriber?.name || '').trim() || null;
  const costCents = typeof subscription?.cost === 'number'
    ? subscription.cost
    : typeof payment?.amount === 'number'
      ? payment.amount
      : null;
  const tierId = subscription?.tier_id != null ? String(subscription.tier_id) : null;

  const chargedAt = subscription?.charged_at_timestamp
    ?? subscription?.extended_at_timestamp
    ?? payment?.authorized_at_timestamp
    ?? body?.timestamp;
  let paidUntil: Date | null = null;
  if (typeof chargedAt === 'number' && Number.isFinite(chargedAt)) {
    const base = chargedAt > 1e12 ? chargedAt : chargedAt * 1000;
    paidUntil = new Date(base + 30 * 24 * 60 * 60 * 1000);
  }

  const cancelled = event === 'subscription_cancelled'
    || subscription?.cancelled === true;
  const billingFailed = event === 'subscription_billing_failed'
    || subscription?.billing_failed === true;

  const user = await findUserBySubscribeStar({ subscribeStarId, email });
  if (!user) {
    console.warn('[subscribestar] webhook: no linked Nexus user for', subscribeStarId || email);
    return;
  }

  if (event === 'subscription_cancelled' || cancelled) {
    await applySubscriptionToUser({
      userId: user.id,
      email: user.email,
      subscribeStarId: subscribeStarId || user.id,
      username,
      tierId,
      costCents,
      paidUntil,
      cancelled: true,
      statusOverride: paidUntil && paidUntil > new Date() ? 'canceling' : 'canceled',
    });
    return;
  }

  if (billingFailed) {
    await applySubscriptionToUser({
      userId: user.id,
      email: user.email,
      subscribeStarId: subscribeStarId || String(subscriber?.id || ''),
      username,
      tierId,
      costCents,
      paidUntil,
      statusOverride: 'past_due',
    });
    return;
  }

  // new_subscription, recurring_pledge_*, payment_succeed, subscription_restored, etc.
  if (
    event === 'new_subscription'
    || event === 'recurring_pledge_increased'
    || event === 'recurring_pledge_decreased'
    || event === 'subscription_restored'
    || event === 'payment_succeed'
    || event.startsWith('subscription')
    || event.startsWith('recurring')
  ) {
    await applySubscriptionToUser({
      userId: user.id,
      email: user.email,
      subscribeStarId: subscribeStarId || String(subscriber?.id || ''),
      username,
      tierId,
      costCents,
      paidUntil,
      cancelled: false,
      statusOverride: 'active',
    });
  }
}
