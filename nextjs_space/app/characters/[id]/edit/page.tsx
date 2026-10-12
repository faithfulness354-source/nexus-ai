import { EditCharacterPage } from '@/components/pages/edit-character-page';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditCharacterPage characterId={id} />;
}
