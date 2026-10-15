'use client';

import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ageFromDob } from '@/lib/age-gate';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const AGE_DENIED_MESSAGE = 'Access denied. You must be 18 years or older to view age-restricted content.';

interface AgeGateModalProps {
  open: boolean;
  denied: boolean;
  onSubmit: (age: number) => void;
  onClose: () => void;
}

const selectCls = 'h-11 w-full rounded-lg bg-muted/60 px-3 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-primary';

export function AgeGateModal({ open, denied, onSubmit, onClose }: AgeGateModalProps) {
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState('');
  const [currentYear, setCurrentYear] = useState<number | null>(null);
  if (currentYear === null && typeof window !== 'undefined') {
    setCurrentYear(new Date().getFullYear());
  }
  const [openSeen, setOpenSeen] = useState(open);
  if (openSeen !== open) {
    setOpenSeen(open);
    if (open) {
      setMonth('');
      setDay('');
      setYear('');
      setError('');
    }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const years = useMemo(() => (currentYear ? Array.from({ length: 111 }, (_, i) => currentYear - i) : []), [currentYear]);

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!month || !day || !year) return setError('Please choose your month, day and year of birth.');
    const age = ageFromDob(Number(year), Number(month), Number(day));
    if (age === null) return setError('Please enter a valid date of birth.');
    onSubmit(age);
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="age-gate-title" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
      <div className="w-full max-w-md rounded-2xl bg-card p-6 sm:p-8 shadow-2xl shadow-black/60 ring-1 ring-white/10">
        {denied ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15">
              <ShieldX className="h-6 w-6 text-rose-400" />
            </div>
            <h2 id="age-gate-title" className="font-display text-xl font-bold">18+ Age Verification Required</h2>
            <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-3 text-sm text-rose-300">{AGE_DENIED_MESSAGE}</p>
            <Button className="mt-6 w-full" variant="secondary" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
              <ShieldAlert className="h-6 w-6 text-primary" />
            </div>
            <h2 id="age-gate-title" className="text-center font-display text-xl font-bold">18+ Age Verification Required</h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              This section contains mature/NSFW themes. Please enter your date of birth to proceed.
            </p>
            <fieldset className="mt-6">
              <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Date of birth</legend>
              <div className="grid grid-cols-[1.4fr_0.8fr_1fr] gap-2">
                <select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)} className={selectCls}>
                  <option value="">Month</option>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <select aria-label="Day" value={day} onChange={(e) => setDay(e.target.value)} className={selectCls}>
                  <option value="">Day</option>
                  {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                </select>
                <select aria-label="Year" value={year} onChange={(e) => setYear(e.target.value)} className={selectCls}>
                  <option value="">Year</option>
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </fieldset>
            {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
            <div className="mt-6 flex gap-2">
              <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button type="submit" className="flex-1 font-semibold">Verify age</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
