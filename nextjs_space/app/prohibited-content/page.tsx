import type { Metadata } from 'next';
import { PolicyView } from '@/components/legal/legal-document';
import { prohibitedContent } from '@/src/content/legal/prohibited-content';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: prohibitedContent.pageTitle };

export default function ProhibitedContentPage() {
  return <PolicyView policy={prohibitedContent} />;
}
