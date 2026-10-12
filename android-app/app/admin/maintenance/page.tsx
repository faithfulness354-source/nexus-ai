import { AppHeader } from '@/components/layout/app-header';
import { MaintenancePanel } from '@/components/admin/maintenance-panel';

export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 pb-16">
        <MaintenancePanel />
      </main>
    </div>
  );
}
