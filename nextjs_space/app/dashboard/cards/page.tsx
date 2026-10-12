import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/access';
import { CardsDirectory } from '@/components/dashboard/cards-directory';

export const dynamic = 'force-dynamic';

export default async function CardsDirectoryPage() {
  const viewer = await getViewer();
  if (!viewer) redirect('/login?callbackUrl=%2Fdashboard%2Fcards');
  if (!viewer.isCreatorAdmin) redirect('/dashboard/personas');
  return <CardsDirectory />;
}
