import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Subscription upgrade entry. Lands on the plan picker. */
export default function SubscribePage() {
  redirect('/settings?tab=subscription');
}
