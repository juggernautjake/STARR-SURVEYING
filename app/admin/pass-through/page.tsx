// app/admin/pass-through/page.tsx — pass-through costs on screen (plan F2b).
//
// *"If we pay a sanitarian for something and then bill the customer for it, that should show as no
// net gain."*
//
// This is where that shows. The screen's job is to make the difference between **a wash and an
// almost-wash** impossible to miss, because that is the difference F2 was built to catch and the one
// a boolean loses: a row that says "pass-through" while the job absorbed $50 looks correct.
//
// So every row states three things — what was paid, what was billed, and the **signed** difference —
// and the states are visually distinct rather than a uniform list of green ticks. `UNDER_RECOVERED`
// and `NOT_RECOVERED` are the working queue; `OVER_RECOVERED` is margin and is labelled as such,
// because filing it as a wash understates income.
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RecoveryResult, RecoveryLink, RecoveryState } from '@/lib/finance/cost-recovery';

// Imported, never re-declared. The F1b page declared its own copy of a result type and `tsc` stayed
// silent while every card would have rendered `undefined` — a local interface is a valid type, so
// re-declaring one is how you switch the compiler off at exactly the place you need it.
interface Row {
  id: string;
  payee: string | null;
  description: string | null;
  jobId: string | null;
  createdAt: string;
  notRecoverableReason: string | null;
  costCents: number;
  links: RecoveryLink[];
  recovery: RecoveryResult;
}

interface Totals {
  count: number;
  costCents: number;
  recoveredCents: number;
  netCents: number;
  shortfallCents: number;
  needingAttention: number;
}

interface Response {
  recoveries: Row[];
  totals: Totals | null;
  tableExists: boolean;
  message?: string;
}

const money = (cents: number) => `$${(Math.abs(cents) / 100).toFixed(2)}`;

/** Colour carries the same meaning as the state, never a different one. */
const TONE: Record<RecoveryState, { label: string; color: string }> = {
  NO_NET_GAIN: { label: 'No net gain', color: '#15803D' },
  OVER_RECOVERED: { label: 'Margin', color: '#1D4ED8' },
  UNDER_RECOVERED: { label: 'Under-recovered', color: '#B45309' },
  NOT_RECOVERED: { label: 'Not billed yet', color: '#B91C1C' },
  NOT_RECOVERABLE: { label: 'Absorbed', color: 'var(--color-text-secondary)' },
};

export default function PassThroughPage() {
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/cost-recoveries');
      const json = (await res.json()) as Response & { error?: string };
      if (!res.ok) {
        throw new Error(
          res.status === 401 || res.status === 403
            ? 'You are not signed in as an admin, so pass-through costs could not be loaded.'
            : json.error || `Pass-through costs could not be loaded (HTTP ${res.status}).`,
        );
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (error) return <main className="admin-page"><p className="admin-error">{error}</p></main>;
  if (!data) return <main className="admin-page"><p>Loading pass-through costs…</p></main>;

  const t = data.totals;

  return (
    <main className="admin-page" style={{ padding: '1.25rem', maxWidth: 900 }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.35rem' }}>
        Pass-through costs
      </h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
        Money paid on a customer’s behalf — a sanitarian, a filing fee, a driller — and what was
        billed back. It is only a wash when the two match to the cent; anything else is a real gain
        or a real loss, and is shown as one.
      </p>

      {/* "Nothing recorded" and "nowhere to record it" are different sentences. */}
      {!data.tableExists && (
        <div style={{
          border: '1px solid #B45309', background: '#78350F22', borderRadius: 8,
          padding: '0.85rem', fontSize: '0.85rem', marginBottom: '1rem',
        }}>
          <strong>Pass-through tracking has not been created yet.</strong>
          <p style={{ marginTop: '0.4rem' }}>{data.message}</p>
        </div>
      )}

      {t && t.count > 0 && (
        <div style={{
          display: 'flex', gap: '1.25rem', flexWrap: 'wrap',
          border: '1px solid var(--color-border)', borderRadius: 8,
          padding: '0.75rem 0.9rem', marginBottom: '1rem', fontSize: '0.85rem',
        }}>
          <span><strong>{t.count}</strong> costs · {money(t.costCents)} paid</span>
          <span>{money(t.recoveredCents)} billed back</span>
          {/* Shown separately from the net, deliberately: margin on one job would otherwise hide
              money paid out on another and never billed. */}
          {t.shortfallCents > 0 && (
            <span style={{ color: '#B45309', fontWeight: 600 }}>
              {money(t.shortfallCents)} absorbed by jobs
            </span>
          )}
          {t.needingAttention > 0 && (
            <span style={{ color: '#B91C1C', fontWeight: 600 }}>
              {t.needingAttention} need attention
            </span>
          )}
        </div>
      )}

      {data.tableExists && data.recoveries.length === 0 && (
        <p style={{ fontSize: '0.9rem' }}>
          No pass-through costs recorded yet. One is created when a bill paid on a customer’s behalf
          is linked to the invoice that billed it back.
        </p>
      )}

      {data.recoveries.map((r) => {
        const tone = TONE[r.recovery.state];
        return (
          <div key={r.id} style={{
            border: '1px solid var(--color-border)',
            borderLeft: `3px solid ${tone.color}`,
            borderRadius: 8, padding: '0.75rem 0.9rem', marginBottom: '0.6rem',
          }}>
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong>{r.payee || r.description || 'Pass-through cost'}</strong>
              <span style={{ fontSize: '0.8rem', color: tone.color, fontWeight: 600 }}>
                {tone.label}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                {money(r.costCents)} paid
                {r.recovery.recoveredCents > 0 ? ` · ${money(r.recovery.recoveredCents)} billed` : ''}
                {/* The sign is the whole point, so it is printed rather than implied by colour. */}
                {r.recovery.deltaCents !== 0 && r.recovery.state !== 'NOT_RECOVERABLE'
                  ? ` · ${r.recovery.deltaCents > 0 ? '+' : '−'}${money(r.recovery.deltaCents)}`
                  : ''}
              </span>
            </div>

            <p style={{
              marginTop: '0.4rem', fontSize: '0.83rem',
              color: r.recovery.needsAttention ? '#B45309' : 'var(--color-text-secondary)',
              fontWeight: r.recovery.needsAttention ? 600 : 400,
            }}>
              {r.recovery.summary}
            </p>

            {r.notRecoverableReason && (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                Reason: {r.notRecoverableReason}
              </p>
            )}

            {/* The working shown. A voided link is displayed rather than dropped — an invoice raised
                and then voided is a fact about what happened, and its absence would read as though
                nobody ever tried to bill it. */}
            {r.links.length > 0 && (
              <ul style={{ marginTop: '0.35rem', fontSize: '0.8rem', paddingLeft: '1.1rem' }}>
                {r.links.map((l) => (
                  <li key={l.invoiceId} style={{ color: 'var(--color-text-secondary)' }}>
                    {money(l.amountCents)} on {l.invoiceNumber || 'an invoice'}
                    {l.voided ? ' — voided, so it does not count towards recovery' : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </main>
  );
}
