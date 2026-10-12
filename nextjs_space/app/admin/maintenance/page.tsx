import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/layout/app-header';
import { MaintenancePanel } from '@/components/admin/maintenance-panel';
import { getViewer } from '@/lib/access';

export const dynamic = 'force-dynamic';

export default async function MaintenancePage() {
  const viewer = await getViewer();
  if (!viewer) redirect('/login?callbackUrl=%2Fadmin%2Fmaintenance');
  if (!viewer.isCreatorAdmin) redirect('/dashboard');
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 pb-16">
        <MaintenancePanel />
      </main>
    </div>
  );
}
