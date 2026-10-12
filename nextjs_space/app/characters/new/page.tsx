import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { NewCharacterPage } from '@/components/pages/new-character-page';

export const dynamic = 'force-dynamic';

export default async function NewCharacter() {
  if (!(await auth())?.user) redirect('/login?callbackUrl=%2Fcharacters%2Fnew');
  return <NewCharacterPage />;
}
