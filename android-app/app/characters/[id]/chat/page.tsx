import { Suspense } from 'react';
import { ChatPage } from '@/components/pages/chat-page';
import { characterStaticParams } from '@/lib/android-static-params';

export function generateStaticParams() {
  return characterStaticParams();
}

export default async function CharacterChat({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin" /></div>}>
      <ChatPage characterId={id} />
    </Suspense>
  );
}
