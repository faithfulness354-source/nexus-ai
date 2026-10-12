'use client';

import { Activity } from 'lucide-react';
import { MeterDef, MeterSnapshot } from '@/lib/types';

interface StatusTrackerProps {
  meters: MeterDef[];
  values: MeterSnapshot;
  previous?: MeterSnapshot;
}

const METER_COLORS = ['#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899'];

/** Scenario state bar rendered at the bottom of a character response. */
export function StatusTracker({ meters, values, previous }: StatusTrackerProps) {
  if (!meters || meters.length === 0) return null;

  return (
    <div className="mt-3 -mx-4 -mb-3 px-4 py-2.5 rounded-b-2xl bg-black/25 border-t border-white/5">
      <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Activity className="h-3 w-3 text-primary" /> Scene status
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
        {meters.map((meter, idx) => {
          const val = values?.[meter.name] ?? meter.default ?? 0;
          const min = meter.min ?? 0;
          const max = meter.max ?? 100;
          const range = max - min || 1;
          const pct = Math.min(100, Math.max(0, ((val - min) / range) * 100));
          const color = meter.color ?? METER_COLORS[idx % METER_COLORS.length];
          const prev = previous?.[meter.name];
          const delta = typeof prev === 'number' ? val - prev : 0;

          return (
            <div key={meter.name ?? idx} className="min-w-0">
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="text-[11px] font-medium text-foreground/80 truncate">{meter.name}</span>
                <span className="text-[11px] font-mono text-foreground shrink-0">
                  {val}/{max}
                  {delta !== 0 && (
                    <span className={delta > 0 ? 'ml-1 text-emerald-400' : 'ml-1 text-rose-400'}>
                      {delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`}
                    </span>
                  )}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${pct}%`, backgroundColor: color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
