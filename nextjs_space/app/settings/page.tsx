import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getViewer } from '@/lib/access';
import { SettingsPage } from '@/components/pages/settings-page';

export const dynamic = 'force-dynamic';

export default async function Settings({ searchParams }: { searchParams: Promise<{ tab?: string; checkout?: string }> }) {
  const { tab, checkout } = await searchParams;
  const session = await auth();
  if (!session?.user) {
    const back = `/settings${tab ? `?tab=${encodeURIComponent(tab)}` : ''}`;
    redirect(`/login?callbackUrl=${encodeURIComponent(back)}`);
  }
  const viewer = await getViewer();
  const allowApiSettings = !!viewer?.isCreatorAdmin;
  if (tab === 'api' && !allowApiSettings) redirect('/settings?tab=subscription');
  return <SettingsPage allowApiSettings={allowApiSettings} initialTab={allowApiSettings && tab === 'api' ? 'api' : tab} checkout={checkout} />;
}
