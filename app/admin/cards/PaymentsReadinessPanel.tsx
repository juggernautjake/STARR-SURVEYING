'use client';
// app/admin/cards/PaymentsReadinessPanel.tsx — what is still stopping real money from moving.
//
// M0b of docs/planning/in-progress/MONEY_RAILS_AND_CARDS_2026-08-17.md.
//
// ── WHY A PANEL AND NOT JUST THE ENDPOINT ───────────────────────────────────────────────────────
//
// M0 shipped `GET /api/admin/payments/readiness` and nothing that opened it. That is this repo's most
// frequent defect — work that exists, is correct, and is unreachable — and the M0 note admitted it in
// writing ("Not yet rendered on a page"). An answer nobody sees is the same as no answer.
//
// ── WHY ON THE CARDS PAGE ───────────────────────────────────────────────────────────────────────
//
// Because this is where the owner already is. The plan's first step is registering cards, one of the
// readiness checks IS the company-card count, and the whole point of the register is deciding what a
// charge means for the books. Putting the go-live state on a page nobody visits until launch day
// would repeat the mistake at one remove.
//
// It renders nothing at all when everything is clear — a panel that is always present stops being
// read, and this one only matters while something is unresolved.

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Check {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'blocker';
  detail: string;
}

interface Payload {
  summary: { status: 'ok' | 'warn' | 'blocker'; text: string };
  checks: Check[];
}

export function PaymentsReadinessPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/payments/readiness');
      if (!res.ok) { setFailed(true); return; }
      setData(await res.json() as Payload);
    } catch {
      // Silent: this panel is context on a page about cards, never the point of it.
      setFailed(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (failed || !data) return null;
  // Nothing to say is said by saying nothing.
  if (data.summary.status === 'ok') return null;

  const blockers = data.checks.filter((c) => c.status === 'blocker');
  const warns = data.checks.filter((c) => c.status === 'warn');

  return (
    <section style={s.card} aria-labelledby="readiness-heading">
      <h3 id="readiness-heading" style={s.h3}>
        {data.summary.status === 'blocker'
          ? <AlertTriangle size={15} strokeWidth={2} aria-hidden />
          : <CheckCircle2 size={15} strokeWidth={2} aria-hidden />}
        Before customers can be charged
      </h3>
      <p style={s.summary}>{data.summary.text}</p>

      <ul style={s.list}>
        {/* Blockers first — somebody opening this wants the thing stopping them, not a tour. */}
        {[...blockers, ...warns].map((c) => (
          <li key={c.id} style={s.item}>
            <span style={c.status === 'blocker' ? s.pillBlocker : s.pillWarn}>
              {c.status === 'blocker' ? 'blocks' : 'check'}
            </span>
            <span>
              <strong style={s.label}>{c.label}</strong>
              <span style={s.detail}> — {c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Bare `var(--theme-*)`: tokens.css and themes.css are imported by the root layout, so a hex
// fallback is dead code that only re-introduces the literal the colour scanner exists to stop.
const s: Record<string, React.CSSProperties> = {
  card: {
    border: '1px solid var(--theme-border)',
    borderLeft: '3px solid var(--theme-warning)',
    background: 'var(--theme-bg-elevated)',
    borderRadius: 8, padding: '0.85rem 1rem', marginBottom: '1rem',
  },
  h3: {
    display: 'flex', alignItems: 'center', gap: 7, margin: '0 0 0.25rem',
    fontSize: '0.95rem', fontWeight: 700, color: 'var(--theme-fg-primary)',
  },
  summary: { margin: '0 0 0.6rem', fontSize: '0.85rem', color: 'var(--theme-fg-secondary)' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.45rem' },
  item: { display: 'flex', gap: 8, alignItems: 'baseline', fontSize: '0.82rem', lineHeight: 1.45 },
  pillBlocker: {
    flexShrink: 0, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.04em', padding: '1px 6px', borderRadius: 4,
    color: 'var(--theme-danger)', border: '1px solid var(--theme-danger)',
  },
  pillWarn: {
    flexShrink: 0, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.04em', padding: '1px 6px', borderRadius: 4,
    color: 'var(--theme-warning)', border: '1px solid var(--theme-warning)',
  },
  label: { color: 'var(--theme-fg-primary)' },
  detail: { color: 'var(--theme-fg-secondary)' },
};
