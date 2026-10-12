'use client';

import { Check, Crown, Gem, Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TIERS, TIER_ORDER, type TierId } from '@/lib/tiers';
import { cn } from '@/lib/utils';

const ICONS: Record<TierId, typeof Zap> = { FREE: Sparkles, PLUS: Zap, PREMIUM: Gem, ULTIMATE: Crown };
const ACCENTS: Record<TierId, string> = {
  FREE: 'text-muted-foreground',
  PLUS: 'text-sky-400',
  PREMIUM: 'text-violet-400',
  ULTIMATE: 'text-amber-400',
};

interface TierCardProps {
  tier: TierId;
  currentTier?: TierId;
  loading?: boolean;
  disabled?: boolean;
  onSelect?: (tier: TierId) => void;
  compact?: boolean;
}

export function TierCard({ tier, currentTier, loading, disabled, onSelect, compact }: TierCardProps) {
  const def = TIERS[tier];
  const Icon = ICONS[tier];
  const isCurrent = currentTier === tier;
  const isDowngrade = currentTier ? TIER_ORDER.indexOf(tier) < TIER_ORDER.indexOf(currentTier) : false;
  const featured = tier === 'PREMIUM';
  const selectable = tier !== 'FREE' && !!onSelect && !disabled && !loading;

  function select() {
    if (selectable && onSelect) onSelect(tier);
  }

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-2xl bg-card p-4 shadow-lg shadow-black/20 ring-1 transition pointer-events-auto',
        isCurrent ? 'ring-primary' : featured ? 'ring-violet-500/40' : 'ring-white/5',
        tier === 'ULTIMATE' && !isCurrent && 'ring-amber-400/30',
        selectable && 'cursor-pointer hover:ring-primary/60',
      )}
      onClick={select}
    >
      {featured && !isCurrent && (
        <span className="absolute -top-2.5 left-4 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
          Most popular
        </span>
      )}
      {isCurrent && (
        <span className="absolute -top-2.5 left-4 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-primary">
          Current plan
        </span>
      )}
      <div className="flex items-center gap-2">
        <Icon className={cn('h-5 w-5', ACCENTS[tier])} />
        <h3 className="font-display font-semibold">{def.name}</h3>
      </div>
      <p className="mt-2">
        <span className="text-2xl font-bold">${def.price.toFixed(2)}</span>
        <span className="text-xs text-muted-foreground">/month</span>
      </p>
      <ul className={cn('mt-3 flex-1 space-y-1.5 text-xs text-muted-foreground', compact && 'space-y-1')}>
        {def.features.map((f) => (
          <li key={f} className="flex gap-1.5">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {tier !== 'FREE' && onSelect && (
        <Button
          type="button"
          className="mt-4 w-full pointer-events-auto"
          variant={isCurrent ? 'secondary' : featured || tier === 'ULTIMATE' ? 'default' : 'outline'}
          disabled={!!disabled || !!loading}
          loading={loading}
          onClick={(event) => {
            event.stopPropagation();
            select();
          }}
        >
          {isCurrent ? 'Your plan' : isDowngrade ? `Switch to ${def.name}` : `Upgrade to ${def.name}`}
        </Button>
      )}
    </div>
  );
}
