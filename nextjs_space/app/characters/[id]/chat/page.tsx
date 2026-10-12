import { ChatPage } from '@/components/pages/chat-page';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

export default async function CharacterChat({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await auth())?.user) redirect(`/login?callbackUrl=${encodeURIComponent(`/characters/${id}/chat`)}`);
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin" /></div>}>
      <ChatPage characterId={id} />
    </Suspense>
  );
}
