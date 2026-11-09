'use client';

import type { Conversation } from '@/lib/types';

export function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onOpenSettings,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
}) {
  return (
    <aside className="flex h-full w-full flex-col border-r border-white/10 bg-ink-900/70 backdrop-blur md:w-72">
      <div className="border-b border-white/10 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Local</p>
        <h1 className="mt-1 font-semibold text-lg text-mist-100">Privacy assistant</h1>
        <p className="mt-1 text-xs text-mist-500">Open-weight models on your machine</p>
      </div>

      <div className="flex gap-2 px-3 py-3">
        <button
          type="button"
          onClick={onNew}
          className="flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-ink-950"
        >
          New chat
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded-lg border border-white/10 px-3 py-2 text-sm text-mist-100 hover:bg-white/5"
        >
          Settings
        </button>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-4">
        {conversations.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-mist-500">No conversations yet</p>
        )}
        {conversations.map((conversation) => {
          const active = conversation.id === activeId;
          return (
            <div
              key={conversation.id}
              className={`group flex items-center gap-1 rounded-lg px-2 py-2 ${active ? 'bg-accent/20 ring-1 ring-accent/40' : 'hover:bg-white/5'}`}
            >
              <button
                type="button"
                onClick={() => onSelect(conversation.id)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm font-medium">{conversation.title || 'Untitled'}</p>
                <p className="truncate text-[11px] text-mist-500">
                  {new Date(conversation.updatedAt).toLocaleString()}
                </p>
              </button>
              <button
                type="button"
                onClick={() => onDelete(conversation.id)}
                className="rounded px-2 py-1 text-xs text-mist-500 opacity-0 hover:bg-white/10 hover:text-red-300 group-hover:opacity-100"
                aria-label="Delete conversation"
              >
                ×
              </button>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
