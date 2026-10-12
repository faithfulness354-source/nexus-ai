import type { LegalPolicy } from './types';

export const guidelines: LegalPolicy = {
  title: 'Acceptable Use Policy',
  pageTitle: 'Acceptable Use · NexusAI',
  effective: 'October 8, 2026',
  sections: [
    {
      title: 'Who this is for',
      blocks: [
        { kind: 'p', text: 'Nexus AI is for adults. Every account holder confirms they are 18 or older. These rules are the only categories of content that are strictly prohibited. Fictional adult material that is not in this list is allowed.' },
      ],
    },
    {
      title: 'Strictly prohibited',
      blocks: [
        { kind: 'p', text: 'The following are not allowed anywhere on Nexus AI, including private drafts, chats, images, and character cards. Administrators may hide or delete them immediately.' },
        { kind: 'list', items: [
          '**Child sexual abuse material, and any depiction of minors.** Sexual, romantic, or intimate content involving anyone under 18 is prohibited. So is any character card, story, or image that depicts a minor, including fictional minors, “aged-up” minors, and characters described as under 18. Every character in sexual or romantic content must be a fictional adult.',
          '**Non-consensual intimate imagery of real people.** Intimate or sexual images, video, or audio of a real, living human being, shared without that person’s consent, are prohibited. Non-consensual deepfakes and other synthetic likenesses of a real, living person are prohibited. A person depicted this way can request removal through the [[Take It Down process|/dmca]].',
          '**Real-world harm to real people.** Targeted harassment, extortion, and doxxing of real individuals are prohibited. That includes publishing a real person’s private contact details, location, or identity in order to threaten, blackmail, or incite abuse.',
        ] },
      ],
    },
    {
      title: 'Fictional adult content that is allowed',
      blocks: [
        { kind: 'p', text: 'Fictional, original, adult, and NSFW character cards are allowed and stay on the platform. Dark fantasy is allowed. Dubious consent (dub-con), non-consent (non-con), and Dead Dove themes are allowed when they involve fictional adult characters.' },
        { kind: 'p', text: 'Dead Dove is a warning that a fictional work contains extreme themes a reader expects to find inside. Tagging a card that way does not make prohibited content acceptable. It does mean extreme fictional themes between adult characters are permitted.' },
        { kind: 'p', text: 'Non-con and dub-con on Nexus AI mean fictional roleplay between adult characters. They do not permit sexual content about real people who have not consented, and they do not permit any sexual or romantic content about minors.' },
      ],
    },
    {
      title: 'Enforcement',
      blocks: [
        { kind: 'p', text: 'Administrators have master database access and may view private drafts. Content in a prohibited category can be hidden from the public site or deleted. Accounts that post prohibited content can be suspended or closed. Copyright complaints are handled under the DMCA page.' },
      ],
    },
  ],
};
