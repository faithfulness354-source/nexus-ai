'use client';

import { ChatView } from '@/components/chat/chat-view';

interface ChatPageProps {
  characterId: string;
}

export function ChatPage({ characterId }: ChatPageProps) {
  return (
    <main className="h-[100dvh] w-full max-w-full bg-background overflow-hidden">
      <ChatView characterId={characterId} />
    </main>
  );
}