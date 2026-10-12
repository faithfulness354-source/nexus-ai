import type { Metadata } from 'next';
import { PolicyView } from '@/components/legal/legal-document';
import { terms } from '@/src/content/legal/terms';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: terms.pageTitle };

export default function TermsPage() {
  return <PolicyView policy={terms} />;
}
