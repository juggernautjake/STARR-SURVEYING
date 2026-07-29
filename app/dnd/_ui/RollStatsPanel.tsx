'use client';
// app/dnd/_ui/RollStatsPanel.tsx — what the dice have been doing (P3-3).
//
// Reads the EXISTING `/api/dnd/rolls` endpoint — already campaign-scoped, already membership-gated, already
// capped — and computes everything client-side through the pure `roll-stats` module. No new route and no
// new capture: P3-1 made the rolls land in the log, and this is the payoff.
//
// It renders NOTHING until there is something to say. A stats panel showing "0 rolls, average —" on a
// campaign that has not played yet is furniture; the interesting version only exists once the dice have.
import { useEffect, useMemo, useState } from 'react';
import styles from './hextech.module.css';
import { tableStats, type RollRow } from '@/lib/dnd/roll-stats';

/** Enough history to be meaningful, and the endpoint's own ceiling. */
const SAMPLE = 200;

export default function RollStatsPanel({ campaignId }: { campaignId: string }) {
  const [rows, setRows] = useState<RollRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/dnd/rolls?campaignId=${encodeURIComponent(campaignId)}&limit=${SAMPLE}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.rolls) setRows(j.rolls as RollRow[]); })
      // Silent: a statistics panel that renders an error is worse than one that renders nothing.
      .catch(() => {});
    return () => { cancelled = true; };
  }, [campaignId]);

  const stats = useMemo(() => (rows ? tableStats(rows) : null), [rows]);

  // Nothing to say yet — no rolls at all, or none of them d20s.
  if (!stats || stats.totalRolls === 0) return null;

  const num = { fontSize: 20, fontWeight: 800, color: 'var(--hx-gold-2)', lineHeight: 1.1 } as const;
  const cap = { fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--hx-muted)' } as const;

  return (
    <section className={styles.framedPanel} style={{ padding: '12px 16px', display: 'grid', gap: 12 }}>
      <div className={styles.framedPanelTop} />
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <h2 className={styles.panelTitle} style={{ margin: 0 }}>The dice so far</h2>
        <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>last {Math.min(SAMPLE, stats.totalRolls)} rolls</span>
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div><div style={num}>{stats.nat20s}</div><div style={cap}>Nat 20s</div></div>
        <div><div style={num}>{stats.nat1s}</div><div style={cap}>Nat 1s</div></div>
        <div>
          {/* Null rather than a number when no natural face could be read — never the mean of totals. */}
          <div style={num}>{stats.averageD20 ?? '—'}</div>
          <div style={cap}>Average d20</div>
        </div>
        <div><div style={num}>{stats.d20Rolls}</div><div style={cap}>d20 rolls</div></div>
      </div>

      {stats.actors.length > 0 && (
        <div style={{ display: 'grid', gap: 4 }}>
          {stats.actors.slice(0, 8).map((a) => (
            <div key={a.actor} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, fontSize: 12.5, borderTop: '1px solid var(--hx-line)', paddingTop: 4 }}>
              <span style={{ color: 'var(--hx-text)' }}>{a.actor}</span>
              <span style={{ color: 'var(--hx-muted)' }}>
                {a.rolls} rolls
                {a.averageD20 != null && <> · avg <strong style={{ color: 'var(--hx-teal-1)' }}>{a.averageD20}</strong></>}
                {a.nat20s > 0 && <> · {a.nat20s}× <span style={{ color: 'var(--hx-gold-2)' }}>20</span></>}
                {a.nat1s > 0 && <> · {a.nat1s}× 1</>}
              </span>
            </div>
          ))}
        </div>
      )}

      {stats.luckiest && (
        <div style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>
          Luckiest session: {stats.luckiest.nat20s} nat-20s to {stats.luckiest.nat1s} nat-1s
          {' '}across {stats.luckiest.rolls} d20 rolls.
        </div>
      )}
    </section>
  );
}
