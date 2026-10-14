'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MessageInputProps {
  onSend: (content: string) => void | boolean | Promise<void | boolean>;
  disabled: boolean;
  currentModel: string;
  models: string[];
  onModelChange: (model: string) => void;
}

export function MessageInput({ onSend, disabled, currentModel, models, onModelChange }: MessageInputProps) {
  const [content, setContent] = useState('');
  const [showModels, setShowModels] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef?.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  }, [content]);

  async function handleSend() {
    const trimmed = content?.trim();
    if (!trimmed || disabled) return;
    try {
      const accepted = await onSend?.(trimmed);
      if (accepted !== false) setContent('');
    } catch (err) {
      console.error('Chat send failed', err);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.nativeEvent.isComposing || e.key === 'Process') return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t border-border bg-card p-3">
      <div className="flex items-end gap-2">
        {/* Model selector */}
        <div className="relative">
          <button
            onClick={() => setShowModels(!showModels)}
            className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-mono text-muted-foreground bg-secondary rounded-md hover:bg-accent transition-colors"
          >
            <span className="max-w-[80px] truncate">{currentModel ?? 'model'}</span>
            <ChevronDown className="h-3 w-3" />
          </button>
          {showModels && (
            <div className="absolute bottom-full mb-1 left-0 w-56 bg-popover border border-border rounded-lg shadow-lg py-1 z-50 max-h-48 overflow-y-auto">
              {(models ?? []).map((m: string) => (
                <button
                  key={m}
                  onClick={() => { onModelChange?.(m); setShowModels(false); }}
                  className={cn(
                    'w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-accent transition-colors',
                    m === currentModel ? 'text-primary bg-primary/5' : 'text-foreground'
                  )}
                >
                  {m}
                </button>
              ))}
              {(models?.length ?? 0) === 0 && (
                <p className="px-3 py-1.5 text-xs text-muted-foreground">No models available</p>
              )}
            </div>
          )}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message..."
          disabled={disabled}
          readOnly={false}
          rows={1}
          enterKeyHint="send"
          className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 touch-manipulation"
        />

        {/* Send */}
        <Button
          size="icon"
          onClick={handleSend}
          disabled={disabled || !content?.trim()}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
