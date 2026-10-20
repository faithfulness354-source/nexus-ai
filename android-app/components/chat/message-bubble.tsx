'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { RotateCcw, Pencil, GitBranch, Trash2, Copy, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { StatusTracker } from './status-tracker';
import { RoleplayText } from './roleplay-text';
import { CharacterAvatar } from '@/components/character/character-avatar';
import { MeterDef, MeterSnapshot } from '@/lib/types';
import { stripSceneTags } from '@/lib/scene-tags';
import { visibleChatText } from '@/lib/prompt-leak';

interface MessageBubbleProps {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  model?: string | null;
  onRegenerate?: () => void;
  onEdit?: (newContent: string) => void;
  onBranch?: () => void;
  onDelete?: () => void;
  characterName?: string;
  characterAvatar?: string | null;
  userName?: string;
  meters?: MeterDef[];
  meterValues?: MeterSnapshot;
  previousMeterValues?: MeterSnapshot;
  isStreaming?: boolean;
  /** Display-only text transform (user "Display" scripts). Never affects stored/edited content. */
  transform?: (text: string) => string;
}

/** Removes inline meter tags like "[Trust: 4]" — they are shown in the status bar instead. */
export function stripMeterTags(text: string, meters?: MeterDef[]): string {
  if (!meters?.length) return text;
  let out = text;
  for (const m of meters) {
    const name = m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\[\\s*${name}\\s*[:=]\\s*-?\\d+\\s*\\]`, 'gi'), '');
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function ActionButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground transition-colors',
        danger ? 'hover:text-rose-400 hover:bg-rose-500/10' : 'hover:text-foreground hover:bg-secondary'
      )}
    >
      {children}
    </button>
  );
}

export function MessageBubble({
  role, content, model, onRegenerate, onEdit, onBranch, onDelete,
  characterName, characterAvatar, userName, meters, meterValues, previousMeterValues, isStreaming,
  transform,
}: MessageBubbleProps) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(content ?? '');
  const [copied, setCopied] = useState(false);

  if (role === 'SYSTEM') return null;
  const spoken = visibleChatText(content ?? '');
  if (!spoken.trim()) return null;
  const isUser = role === 'USER';
  const base = isUser ? spoken : stripMeterTags(spoken, meters);
  const raw = transform ? transform(base) : base;
  const display = stripSceneTags(raw);
  if (!display.trim()) return null;
  const name = isUser ? userName || 'You' : characterName ?? 'Character';

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(stripSceneTags(display));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Copy failed', err);
      toast.error('Could not copy text');
    }
  }

  function handleSaveEdit() {
    const next = editContent.trim();
    if (next && next !== content) onEdit?.(next);
    setEditing(false);
  }

  return (
    <div className={cn('group flex gap-2.5 sm:gap-3 min-w-0', isUser && 'flex-row-reverse')}>
      {isUser ? (
        <div className="h-9 w-9 shrink-0 rounded-full bg-primary/25 text-primary font-bold text-sm flex items-center justify-center">
          {name.slice(0, 1).toUpperCase()}
        </div>
      ) : (
        <CharacterAvatar src={characterAvatar} name={characterName} className="h-9 w-9 text-sm" />
      )}

      <div className={cn('flex flex-col min-w-0', isUser ? 'items-end max-w-[85%] sm:max-w-[80%]' : 'flex-1')}>
        <div className={cn('flex items-center gap-2 mb-1 px-1', isUser && 'flex-row-reverse')}>
          <span className="text-sm font-semibold text-foreground">{name}</span>
          {model && !isUser && <span className="hidden sm:inline text-[10px] font-mono text-muted-foreground/60">{model}</span>}
        </div>

        <div
          className={cn(
            'relative px-4 py-3 min-w-0 max-w-full',
            isUser
              ? 'rounded-2xl rounded-tr-md bg-primary/20 ring-1 ring-primary/30'
              : 'w-full rounded-2xl rounded-tl-md bg-card ring-1 ring-white/5 shadow-md shadow-black/20'
          )}
        >
          {editing ? (
            <div className="space-y-2">
              <textarea
                autoFocus
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full min-h-[120px] bg-background rounded-lg p-2 text-sm resize-y outline-none ring-1 ring-border focus:ring-primary"
              />
              <div className="flex gap-1 justify-end">
                <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>
                  <X className="h-3 w-3 mr-1" /> Cancel
                </Button>
                <Button size="xs" onClick={handleSaveEdit}>
                  <Check className="h-3 w-3 mr-1" /> Save
                </Button>
              </div>
            </div>
          ) : (
            <RoleplayText content={display} streaming={isStreaming} />
          )}

          {!isUser && !editing && (meters?.length ?? 0) > 0 && meterValues && (
            <StatusTracker meters={meters!} values={meterValues} previous={previousMeterValues} />
          )}
        </div>

        {!editing && !isStreaming && (
          <div
            className={cn(
              'flex items-center gap-0.5 mt-1 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100',
              isUser && 'flex-row-reverse'
            )}
          >
            {!isUser && onRegenerate && (
              <ActionButton label="Regenerate" onClick={onRegenerate}><RotateCcw className="h-3.5 w-3.5" /></ActionButton>
            )}
            {onEdit && (
              <ActionButton label="Edit message" onClick={() => { setEditContent(content ?? ''); setEditing(true); }}>
                <Pencil className="h-3.5 w-3.5" />
              </ActionButton>
            )}
            <ActionButton label={copied ? 'Copied' : 'Copy text'} onClick={handleCopy}>
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            </ActionButton>
            {onBranch && (
              <ActionButton label="Branch from here" onClick={onBranch}><GitBranch className="h-3.5 w-3.5" /></ActionButton>
            )}
            {onDelete && (
              <ActionButton label="Delete message" onClick={onDelete} danger><Trash2 className="h-3.5 w-3.5" /></ActionButton>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
