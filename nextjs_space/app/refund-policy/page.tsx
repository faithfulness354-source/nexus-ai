import type { Metadata } from 'next';
import { PolicyView } from '@/components/legal/legal-document';
import { refundPolicy } from '@/src/content/legal/refund-policy';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: refundPolicy.pageTitle };

export default function RefundPolicyPage() {
  return <PolicyView policy={refundPolicy} />;
}
