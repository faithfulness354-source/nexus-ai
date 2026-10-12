import type { LegalPolicy } from './types';

export const terms: LegalPolicy = {
  title: 'Terms of Service',
  pageTitle: 'Terms of Service · NexusAI',
  effective: 'October 8, 2026',
  sections: [
    {
      title: 'Agreement',
      blocks: [
        { kind: 'p', text: 'These Terms are the user agreement between you and Nexus AI. By creating an account, checking the age-and-terms box, or using the site, you agree to these Terms, the [[Privacy Policy|/privacy]], and the [[Acceptable Use Policy|/guidelines]].' },
        { kind: 'p', text: 'Nexus AI is a fictional roleplay service for adults. You must be at least 18 years old to register or use it.' },
      ],
    },
    {
      title: 'Your content and our license',
      blocks: [
        { kind: 'p', text: 'You keep ownership of the character cards, messages, images, audio, and other material you submit.' },
        { kind: 'p', text: 'You grant Nexus AI a worldwide, non-exclusive, royalty-free license to host, store, reproduce, display, and distribute that content for as long as it remains on the service. The license exists so we can operate the site: show a card to the people you publish it to, run chats, make backups, and moderate. It is not an assignment of your copyright, and it is not an exclusive license.' },
        { kind: 'p', text: 'You can delete your own content. The license ends for a given item when it is removed from the service, except for copies kept as required for legal, security, or abuse-prevention records.' },
      ],
    },
    {
      title: 'Moderation and administrator access',
      blocks: [
        { kind: 'p', text: 'Administrators retain master access to the database. They may view, edit, hide, unlist, disable, or delete any character card, chat, or other material on the platform, including private drafts, when that material violates these Terms, the Acceptable Use Policy, or the law.' },
        { kind: 'p', text: 'A takedown can be immediate. Hiding a card removes it from public browse, search, and other users. We do this to enforce legal boundaries, including child sexual abuse material, sexual or intimate depictions of real living people made or shared without consent, copyright complaints, and real-world harassment.' },
      ],
    },
    {
      title: 'Fictional adult content that is allowed',
      blocks: [
        { kind: 'p', text: 'Nexus AI allows fictional adult roleplay. Dark fantasy, dubious consent (dub-con), non-consent (non-con), and Dead Dove themes are allowed when every character involved is a fictional adult. Original adult and NSFW character cards are allowed and may stay on the platform.' },
        { kind: 'p', text: 'Dead Dove means the work is tagged so readers know it contains extreme fictional themes. Those themes stay allowed only for fictional characters who are adults. Sexual, romantic, or intimate content involving anyone under 18 is prohibited, including fictional minors. The full list of what is prohibited and what is protected is in the Acceptable Use Policy.' },
      ],
    },
    {
      title: 'Your responsibilities',
      blocks: [
        { kind: 'p', text: 'You are responsible for the content you create and for keeping your account credentials private. You will not use the service to break the law or the Acceptable Use Policy. You confirm that you have the rights needed to upload anything you submit.' },
      ],
    },
    {
      title: 'The service',
      blocks: [
        { kind: 'p', text: 'The service is provided as available. AI replies can be wrong, incomplete, or unexpected. We may change, suspend, or discontinue features. We may suspend or close an account that breaks these Terms.' },
        { kind: 'p', text: 'To the extent the law allows, Nexus AI is not liable for indirect or consequential damages arising from your use of the service, and our total liability for a claim is limited to the amount you paid us in the three months before the claim.' },
      ],
    },
    {
      title: 'Changes',
      blocks: [
        { kind: 'p', text: 'We may update these Terms. The effective date at the top of this page will change when we do. Continuing to use Nexus AI after an update means you accept the revised Terms.' },
      ],
    },
  ],
};
