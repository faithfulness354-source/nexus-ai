import type { LegalPolicy } from './types';

export const dmca: LegalPolicy = {
  title: 'DMCA and Take It Down',
  pageTitle: 'DMCA & Take It Down · NexusAI',
  effective: 'October 8, 2026',
  sections: [
    {
      title: 'Copyright notice and takedown',
      blocks: [
        { kind: 'p', text: 'If you believe material on Nexus AI infringes a copyright you own, send a notice to the site operator. A complete notice includes:' },
        { kind: 'list', items: [
          'Your name, mailing address, telephone number, and email address.',
          'A description of the copyrighted work you claim is infringed.',
          'The URL or other exact location of the material on Nexus AI.',
          'A statement that you have a good-faith belief the use is not authorized by the copyright owner, its agent, or the law.',
          'A statement, under penalty of perjury, that the information is accurate and that you are the owner or are authorized to act for the owner.',
          'Your physical or electronic signature.',
        ] },
        { kind: 'p', text: 'After a complete notice, we remove or disable access to the identified material and notify the user who posted it. Repeat infringement can result in account termination.' },
      ],
    },
    {
      title: 'Counter-notice',
      blocks: [
        { kind: 'p', text: 'If your content was removed because of a copyright notice and you believe that was a mistake, you may send a counter-notice. Include your contact details, identification of the removed material and its former location, a statement under penalty of perjury that the removal was the result of mistake or misidentification, your consent to the jurisdiction of the federal court for your address (or, if you are outside the United States, for any judicial district where the operator may be found), and your signature. If the copyright claimant does not file a court action after a valid counter-notice, we may restore the material.' },
      ],
    },
    {
      title: 'Take It Down: real living people',
      blocks: [
        { kind: 'p', text: 'Nexus AI follows a notice-and-takedown process for non-consensual intimate imagery of real, identifiable, living human beings. This includes intimate or sexual depictions of a real person, and deepfakes or other synthetic likenesses of a real person, that were created or shared without that person’s consent.' },
        { kind: 'p', text: 'This process is how we comply with the TAKE IT DOWN Act and similar rules. It covers real people. It does not apply to fictional characters.' },
        { kind: 'p', text: 'A complete request from the person depicted, or from someone authorized to act for them, should include:' },
        { kind: 'list', items: [
          'Your name and an email address or other contact where we can reach you.',
          'The URL or exact location of the depiction on Nexus AI.',
          'A description sufficient to find the depiction.',
          'A statement that you are the person depicted, or the authorized representative of that person.',
          'A statement that the intimate depiction was created or shared without consent.',
          'A good-faith statement that the information in the request is accurate.',
        ] },
        { kind: 'p', text: 'When we receive a complete request, we remove or disable access to the identified depiction promptly, and within 48 hours. We also take reasonable steps to block the same depiction from being uploaded again. We may ask for clarification if a request does not identify the content or the person. Knowingly false requests can be rejected.' },
        { kind: 'p', text: 'Intimate depictions of real living people shared without consent are also prohibited by the Acceptable Use Policy, and administrators can hide or delete them from the database as soon as they are identified.' },
      ],
    },
    {
      title: 'Where to send a notice',
      blocks: [
        { kind: 'p', text: 'Send copyright notices and Take It Down requests to the operator of this Nexus AI site, with the subject line “Copyright notice” or “Take It Down request” and the information listed above. Include the exact URL so the material can be found.' },
      ],
    },
  ],
};
