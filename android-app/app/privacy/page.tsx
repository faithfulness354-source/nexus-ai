import type { Metadata } from 'next';
import { PolicyView } from '@/components/legal/legal-document';
import { privacy } from '@/src/content/legal/privacy';

export const metadata: Metadata = { title: privacy.pageTitle };

export default function PrivacyPage() {
  return <PolicyView policy={privacy} />;
}
