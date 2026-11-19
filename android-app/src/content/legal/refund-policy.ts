import type { LegalPolicy } from './types';

export const refundPolicy: LegalPolicy = {
  title: 'Refund Policy',
  pageTitle: 'Refund Policy · NexusAI',
  effective: 'November 19, 2026',
  sections: [
    {
      title: 'Billing provider',
      blocks: [
        { kind: 'p', text: 'Nexus AI subscriptions are sold and billed exclusively through SubscribeStar.adult. Nexus AI does not charge your card directly and does not store payment card numbers.' },
      ],
    },
    {
      title: 'How to request a refund',
      blocks: [
        { kind: 'p', text: 'All refund requests must be submitted through SubscribeStar support. Open a ticket or contact SubscribeStar from your SubscribeStar.adult account billing area and reference the Nexus AI subscription pledge.' },
        { kind: 'p', text: 'Nexus AI cannot issue chargebacks or refunds independently of SubscribeStar. Once SubscribeStar processes a refund or cancellation, your Nexus AI tier updates after the next webhook or after you re-link your SubscribeStar account in Settings.' },
      ],
    },
    {
      title: 'Cancellations',
      blocks: [
        { kind: 'p', text: 'You may cancel a recurring pledge at any time on SubscribeStar. Access to paid Nexus AI features continues until the paid period ends (subscribestar_paid_until / current period end), then returns to Free.' },
      ],
    },
  ],
};
