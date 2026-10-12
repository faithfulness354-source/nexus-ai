// In-process generation queue: limits concurrent LLM streams per server instance and serves waiting
// requests by plan priority (Ultimate/admin > Premium > Plus > Free), FIFO within the same priority.
import type { TierId } from '@/lib/tiers';

export type QueueLane = 'standard' | 'fast' | 'priority' | 'top-priority';

const PRIORITY: Record<QueueLane, number> = { standard: 0, fast: 1, priority: 2, 'top-priority': 3 };
const MAX_CONCURRENT = Math.max(1, Number(process.env.LLM_MAX_CONCURRENT) || 12);
/** Lower lanes give up after this long so a busy server returns a clear error instead of hanging. */
const MAX_WAIT_MS: Record<QueueLane, number> = { standard: 45_000, fast: 60_000, priority: 90_000, 'top-priority': 120_000 };

export function laneFor(tier: TierId, isAdmin: boolean): QueueLane {
  if (isAdmin || tier === 'ULTIMATE') return 'top-priority';
  if (tier === 'PREMIUM') return 'priority';
  if (tier === 'PLUS') return 'fast';
  return 'standard';
}

interface Waiter { lane: QueueLane; seq: number; start: () => void }

let active = 0;
let seq = 0;
const waiting: Waiter[] = [];

function next() {
  while (active < MAX_CONCURRENT && waiting.length) {
    waiting.sort((a, b) => PRIORITY[b.lane] - PRIORITY[a.lane] || a.seq - b.seq);
    const w = waiting.shift()!;
    active++;
    w.start();
  }
}

export class QueueTimeoutError extends Error {
  constructor() { super('The server is busy right now. Please try again in a moment.'); }
}

/** Waits for a generation slot. Returns a release function that must be called exactly once (idempotent). */
export function acquireSlot(lane: QueueLane): Promise<{ release: () => void; waitedMs: number }> {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      active = Math.max(0, active - 1);
      next();
    };
    const w: Waiter = { lane, seq: seq++, start: () => { clearTimeout(timer); resolve({ release, waitedMs: Date.now() - t0 }); } };
    const timer = setTimeout(() => {
      const i = waiting.indexOf(w);
      if (i >= 0) { waiting.splice(i, 1); reject(new QueueTimeoutError()); }
    }, MAX_WAIT_MS[lane]);
    waiting.push(w);
    next();
  });
}
