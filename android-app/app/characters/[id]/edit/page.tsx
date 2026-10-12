import { EditCharacterPage } from '@/components/pages/edit-character-page';
import { characterStaticParams } from '@/lib/android-static-params';

export function generateStaticParams() {
  return characterStaticParams();
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditCharacterPage characterId={id} />;
}
