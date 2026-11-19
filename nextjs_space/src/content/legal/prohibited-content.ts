import type { LegalPolicy } from './types';

export const prohibitedContent: LegalPolicy = {
  title: 'Prohibited Content & Use Rules',
  pageTitle: 'Prohibited Content · NexusAI',
  effective: 'November 19, 2026',
  sections: [
    {
      title: 'SFW vs NSFW on Nexus AI',
      blocks: [
        { kind: 'p', text: 'Every character card, image, and text field is rated SFW or NSFW under the following rules. Creators must not mark NSFW material as SFW.' },
        { kind: 'p', text: '**NSFW** means either of the following:' },
        { kind: 'list', items: [
          '**Visual nudity:** outwardly exposed bare breasts or nipples, genitalia, or bare buttocks (including explicit pelvic outlines that reveal those areas).',
          '**Explicit sexual text:** sexually explicit dialogue, descriptions, bios, greetings, or scenarios — even when the character image is fully clothed.',
        ] },
        { kind: 'p', text: '**SFW** means a non-sexual character card where the character is clothed. The following are allowed on SFW cards when nipples, genitalia, bare buttocks, and explicit pelvic outlines are not visible and the card text is non-sexual:' },
        { kind: 'list', items: [
          'High-slit dresses and nightgowns',
          'Bare hips and midriff',
          'Bikini-style armor',
          'Sheer or semi-translucent fabrics',
        ] },
        { kind: 'p', text: 'Attempting to publish or save SFW-marked content that violates these SFW rules is rejected before it is stored. The creator is shown: “This falls under NSFW content and cannot be applied to SFW fields,” with the option to switch the card to NSFW when they are eligible under these Terms.' },
      ],
    },
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
        { kind: 'p', text: '**Underage / childlike image detection (multi-signal):** Images are not flagged as childlike or underage based solely on a flat chest, small bust, short height/stature, or a slim/petite/skinny build. Flagging requires multiple visual cues converging across facial maturity/proportions, body maturity, and overall presentation. Adult-presenting characters with flat chests, short stature, or petite builds are allowed when facial presentation and overall depiction read as adult and the card is marked 18+ adult.' },
      ],
    },
    {
      title: 'Fictional adult content',
      blocks: [
        { kind: 'p', text: 'Fictional adult roleplay between consenting adult characters is allowed when it does not violate the bans above and is correctly rated NSFW when it meets the NSFW definition. See also the [[Acceptable Use Policy|/guidelines]] and [[Terms of Service|/terms]].' },
      ],
    },
    {
      title: 'Enforcement',
      blocks: [
        { kind: 'p', text: 'Nexus AI may remove content, suspend accounts, and report illegal material to relevant authorities. SFW-field violations are blocked at save time. Generation requests that match the hard blocklist are rejected server-side without deducting credits.' },
      ],
    },
  ],
};
