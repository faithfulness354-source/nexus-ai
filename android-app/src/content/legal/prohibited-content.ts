import type { LegalPolicy } from './types';

export const prohibitedContent: LegalPolicy = {
  title: 'Prohibited Content & Use Rules',
  pageTitle: 'Prohibited Content · NexusAI',
  effective: 'November 19, 2026',
  sections: [
    {
      title: 'Absolute bans',
      blocks: [
        { kind: 'p', text: 'The following are prohibited on Nexus AI, including prompts, character cards, images, and chat:' },
        { kind: 'list', items: [
          'Any sexual, romantic, or intimate content involving anyone 17 or under — including fictional minors, “aged-up” characters who are underage in canon, and coded underage indicators',
          'Child sexual abuse material (CSAM) in any form',
          'Non-consensual intimate imagery of real people (NCII), revenge porn, or deepfake sexual content of real living people',
          'Real-person celebrity likenesses used for sexual deepfakes',
          'Extreme real-world gore / snuff content',
          'Content that facilitates illegal acts (trafficking, real-world violence for hire, etc.)',
        ] },
      ],
    },
    {
      title: 'Fictional adult content',
      blocks: [
        { kind: 'p', text: 'Fictional adult roleplay between consenting adult characters is allowed when it does not violate the bans above. See also the [[Acceptable Use Policy|/guidelines]] and [[Terms of Service|/terms]].' },
      ],
    },
    {
      title: 'Enforcement',
      blocks: [
        { kind: 'p', text: 'Nexus AI may remove content, suspend accounts, and report illegal material to relevant authorities. Generation requests that match the hard blocklist are rejected server-side without deducting credits.' },
      ],
    },
  ],
};
