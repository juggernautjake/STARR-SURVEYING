'use client';
// app/dnd/_ui/AiBudgetMeter.tsx — "AI assists: 34 of 120 today" (P2-2).
//
// The slice's bar is that the ceiling is visible BEFORE it is hit, not only after. A limit a player only
// discovers by being refused reads as arbitrary; the same limit shown while there is still room reads as
// fair, and lets them decide how to spend what is left.
//
// Two deliberate restraints:
//  · It reads `/api/dnd/ai/budget`, which uses `peekRateLimit` and does NOT consume budget. Rendering a
//    usage meter must never itself use the thing it measures.
//  · It stays QUIET until it matters. Showing "0 of 120" to someone who has used no AI is noise on every
//    page that mounts it; the meter appears once a quarter of either window is spent, and only warns in
//    colour past three quarters.
import { useEffect, useState } from 'react';

interface Budget { used: number; limit: number; remaining: number; resetsAt: string }

export default function AiBudgetMeter({ className }: { className?: string }) {
  const [hourly, setHourly] = useState<Budget | null>(null);
  const [daily, setDaily] = useState<Budget | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/dnd/ai/budget')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        setHourly(j.hourly ?? null);
        setDaily(j.daily ?? null);
      })
      // Silent: a budget meter that renders an error is worse than one that renders nothing.
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!daily || !hourly) return null;

  const frac = (b: Budget) => (b.limit > 0 ? b.used / b.limit : 0);
  const worst = Math.max(frac(daily), frac(hourly));
  if (worst < 0.25) return null;

  // Which window is actually the binding constraint right now — telling someone they have 90 left today
  // while the hourly window is what just refused them would be true and useless.
  const binding = frac(hourly) >= frac(daily) ? hourly : daily;
  const label = binding === hourly ? 'this hour' : 'today';
  const colour = worst >= 0.75 ? 'var(--hx-gold-2)' : 'var(--hx-muted)';

  return (
    <span
      className={className}
      title={`Resets ${new Date(binding.resetsAt).toLocaleTimeString()}`}
      style={{ fontSize: 11.5, color: colour }}
    >
      AI assists: {binding.used} of {binding.limit} {label}
      {binding.remaining === 0 && ' — limit reached'}
    </span>
  );
}
