'use client';

import { useState } from 'react';
import { Settings2, ChevronDown, ChevronUp, X, Lock } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GenSettings } from '@/lib/types';
import { SAMPLING_LIMITS, clampSampling } from '@/lib/tiers';

interface GenerationPanelProps {
  settings: Partial<GenSettings>;
  onChange: (settings: Partial<GenSettings>) => void;
  /** Free/Plus: sampling sliders are shown but disabled with an upgrade prompt. */
  samplingLocked?: boolean;
  /** Free: sampling sliders are not rendered at all, only a short upgrade line. */
  samplingHidden?: boolean;
  onUpgrade?: () => void;
  defaultExpanded?: boolean;
}

export function GenerationPanel({ settings, onChange, samplingLocked = false, samplingHidden = false, onUpgrade, defaultExpanded = false }: GenerationPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [newWord, setNewWord] = useState('');

  const temp = clampSampling('temperature', settings?.temperature) ?? SAMPLING_LIMITS.temperature.default;
  const topP = clampSampling('topP', settings?.topP) ?? SAMPLING_LIMITS.topP.default;
  const freqPen = settings?.frequencyPenalty ?? 0;
  const presPen = settings?.presencePenalty ?? 0;
  const maxTok = settings?.maxTokens ?? 2048;
  const forbidden = settings?.forbiddenWords ?? [];

  function update(key: string, val: any) {
    onChange?.({ ...(settings ?? {}), [key]: val });
  }

  function addForbidden() {
    const word = newWord?.trim();
    if (!word) return;
    const current = [...(forbidden ?? [])];
    if (!current.includes(word)) {
      current.push(word);
      update('forbiddenWords', current);
    }
    setNewWord('');
  }

  function removeForbidden(word: string) {
    update('forbiddenWords', (forbidden ?? []).filter((w: string) => w !== word));
  }

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Settings2 className="h-3.5 w-3.5" />
          Generation Settings
        </span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {samplingHidden ? (
            <div className="rounded-lg bg-muted/60 p-3 text-center">
              <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5" /> Sampling controls are available on Premium.
              </p>
              {onUpgrade && (
                <Button size="sm" variant="secondary" className="mt-2 h-7 text-xs" onClick={onUpgrade}>See plans</Button>
              )}
            </div>
          ) : (<>
          {samplingLocked && (
            <div className="rounded-lg bg-primary/10 ring-1 ring-primary/30 p-3 text-center">
              <p className="flex items-center justify-center gap-1.5 text-xs font-medium">
                <Lock className="h-3.5 w-3.5 text-primary" /> Upgrade to Premium to unlock sampling parameters.
              </p>
              {onUpgrade && (
                <Button size="sm" className="mt-2 h-7 text-xs" onClick={onUpgrade}>Upgrade to Premium</Button>
              )}
            </div>
          )}
          <div className={samplingLocked ? 'space-y-4 opacity-50' : 'space-y-4'} aria-disabled={samplingLocked}>
          {/* Temperature */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground flex items-center gap-1">{samplingLocked && <Lock className="h-3 w-3" />}Temperature</label>
              <span className="text-xs font-mono">{temp.toFixed(2)}</span>
            </div>
            <Slider
              value={[temp]}
              min={SAMPLING_LIMITS.temperature.min}
              max={SAMPLING_LIMITS.temperature.max}
              step={0.05}
              disabled={samplingLocked}
              onValueChange={(v: number[]) => update('temperature', v?.[0] ?? 0.8)}
            />
          </div>

          {/* Top P */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground flex items-center gap-1">{samplingLocked && <Lock className="h-3 w-3" />}Top P</label>
              <span className="text-xs font-mono">{topP.toFixed(2)}</span>
            </div>
            <Slider
              value={[topP]}
              min={SAMPLING_LIMITS.topP.min}
              max={SAMPLING_LIMITS.topP.max}
              step={0.05}
              disabled={samplingLocked}
              onValueChange={(v: number[]) => update('topP', v?.[0] ?? 0.95)}
            />
          </div>

          {/* Frequency Penalty */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground flex items-center gap-1">{samplingLocked && <Lock className="h-3 w-3" />}Frequency Penalty</label>
              <span className="text-xs font-mono">{freqPen.toFixed(2)}</span>
            </div>
            <Slider
              value={[freqPen]}
              min={0}
              max={2}
              step={0.05}
              disabled={samplingLocked}
              onValueChange={(v: number[]) => update('frequencyPenalty', v?.[0] ?? 0)}
            />
          </div>

          {/* Presence Penalty */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground flex items-center gap-1">{samplingLocked && <Lock className="h-3 w-3" />}Presence Penalty</label>
              <span className="text-xs font-mono">{presPen.toFixed(2)}</span>
            </div>
            <Slider
              value={[presPen]}
              min={0}
              max={2}
              step={0.05}
              disabled={samplingLocked}
              onValueChange={(v: number[]) => update('presencePenalty', v?.[0] ?? 0)}
            />
          </div>
          </div>
          </>)}

          {/* Max Tokens */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground">Max Tokens</label>
              <span className="text-xs font-mono">{maxTok}</span>
            </div>
            <Slider
              value={[maxTok]}
              min={256}
              max={8192}
              step={128}
              onValueChange={(v: number[]) => update('maxTokens', v?.[0] ?? 2048)}
            />
            <p className="text-[10px] text-muted-foreground mt-1">Replies are kept between 250 and 350 tokens on every plan.</p>
          </div>

          {/* Forbidden Words */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Forbidden Words</label>
            <div className="flex gap-1 mb-2">
              <Input
                value={newWord}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewWord(e.target.value)}
                placeholder="Add word..."
                className="text-xs h-7"
                onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && (e.preventDefault(), addForbidden())}
              />
              <Button variant="secondary" size="xs" onClick={addForbidden}>Add</Button>
            </div>
            {(forbidden?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1">
                {(forbidden ?? []).map((w: string) => (
                  <Badge key={w} variant="secondary" className="text-[10px] gap-0.5">
                    {w}
                    <button onClick={() => removeForbidden(w)}>
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
