'use client';

import { Info } from 'lucide-react';

interface ContextBarProps {
  systemTokens: number;
  historyTokens: number;
  maxTokens: number;
}

export function ContextBar({ systemTokens, historyTokens, maxTokens }: ContextBarProps) {
  const total = (systemTokens ?? 0) + (historyTokens ?? 0);
  const max = maxTokens ?? 8192;
  const pct = Math.min(100, (total / max) * 100);
  const sysPct = Math.min(100, (systemTokens / max) * 100);

  return (
    <div className="px-4 py-2 border-b border-border bg-card/50">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <Info className="h-3 w-3" />
        <span>Definitions: {(systemTokens ?? 0).toLocaleString('en-US')} tokens</span>
        <span className="text-border">|</span>
        <span>Recent history: {(historyTokens ?? 0).toLocaleString('en-US')} tokens</span>
        <span className="text-border">|</span>
        <span>Sent: {total.toLocaleString('en-US')} / {(max).toLocaleString('en-US')}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full flex">
          <div className="h-full bg-primary/60 transition-all" style={{ width: `${sysPct}%` }} />
          <div className="h-full bg-primary transition-all" style={{ width: `${pct - sysPct}%` }} />
        </div>
      </div>
    </div>
  );
}
