import type { LegalPolicy } from './types';

export const privacy: LegalPolicy = {
  title: 'Privacy Policy',
  pageTitle: 'Privacy Policy · NexusAI',
  effective: 'October 8, 2026',
  sections: [
    {
      title: 'What this covers',
      blocks: [
        { kind: 'p', text: 'This policy describes the account information and technical logs Nexus AI collects when you register and use the site. It applies to the Nexus AI roleplay service.' },
      ],
    },
    {
      title: 'Account registration',
      blocks: [
        { kind: 'p', text: 'When you create an account we collect:' },
        { kind: 'list', items: [
          'Email address, used to identify the account and to sign you in.',
          'Display name, which you choose.',
          'Password, stored only as a hash. We do not keep the password you type.',
          'The date and time you accept the Terms of Service and confirm that you are 18 or older.',
        ] },
        { kind: 'p', text: 'If you later fill out a public profile, we also store the username, bio, images, and other profile fields you submit. Character cards, chats, personas, and uploads you create are stored so the service can show them to you and, when you publish a card, to other users under the visibility you choose.' },
      ],
    },
    {
      title: 'IP addresses and logs',
      blocks: [
        { kind: 'p', text: 'Our servers and hosting provider record technical logs for security, abuse prevention, and operations. A typical log entry can include:' },
        { kind: 'list', items: [
          'IP address',
          'Date and time of the request',
          'The URL or route requested',
          'Browser user agent',
          'A status code and basic error details if a request fails',
        ] },
        { kind: 'p', text: 'We use these logs to keep the site online, investigate abuse such as attacks or prohibited content, and understand failures. We do not sell IP addresses or account data.' },
      ],
    },
    {
      title: 'Session cookies',
      blocks: [
        { kind: 'p', text: 'Signing in sets a session cookie so you stay logged in. The cookie is required for account features. You can clear it by signing out or by clearing cookies in your browser.' },
      ],
    },
    {
      title: 'Payments',
      blocks: [
        { kind: 'p', text: 'Paid plans are processed by the payment provider (PayPal, when checkout is enabled). The provider collects the payment details needed to charge you. Nexus AI stores the subscription status and provider customer or subscription identifiers, not your full card number.' },
      ],
    },
    {
      title: 'How long we keep it',
      blocks: [
        { kind: 'p', text: 'Account data and content stay while your account is open. Server logs are kept for a limited operations window and longer when needed to investigate abuse or comply with law. If you delete content, it is removed from the public site. Residual copies may remain in backups or abuse records for a limited time.' },
      ],
    },
    {
      title: 'Sharing',
      blocks: [
        { kind: 'p', text: 'We share information with infrastructure and payment providers who process it for us, and when the law requires it, such as a valid legal demand. Published character cards are visible according to the visibility you set. Private drafts are not shown in public browse.' },
      ],
    },
  ],
};
