import type { Metadata } from 'next';
import { PolicyView } from '@/components/legal/legal-document';
import { guidelines } from '@/src/content/legal/guidelines';

export const metadata: Metadata = { title: guidelines.pageTitle };

export default function GuidelinesPage() {
  return <PolicyView policy={guidelines} />;
}
