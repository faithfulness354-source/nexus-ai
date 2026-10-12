import type { Metadata } from 'next';
import { PolicyView } from '@/components/legal/legal-document';
import { dmca } from '@/src/content/legal/dmca';

export const metadata: Metadata = { title: dmca.pageTitle };

export default function DmcaPage() {
  return <PolicyView policy={dmca} />;
}
