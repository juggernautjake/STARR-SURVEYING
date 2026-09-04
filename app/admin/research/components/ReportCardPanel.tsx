'use client';
// app/admin/research/components/ReportCardPanel.tsx — what the run achieved, per dollar (plan R30).
//
// "As cheap but as effective as possible" has not been a number. This is the number — and the list
// of things it deliberately does not claim, which matters as much: a score that looks objective and
// is not is worse than no score.

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { CardComparison, ReportCard } from '@/lib/research/report-card';

interface Payload {
  card: ReportCard | null;
  comparison: CardComparison | null;
  contentIsPerProject?: boolean;
  /** True when every count above came from documents attributed to this run. */
  documentsScopedToRun?: boolean;
  runNumber?: number | null;
  message?: string;
}

const money = (n: number) => `$${n.toFixed(2)}`;
const rate = (r: number | null) => (r == null ? '—' : `${Math.round(r * 100)}%`);

export default function ReportCardPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);
  const [comparing, setComparing] = useState(false);

  const load = useCallback(async (withComparison: boolean) => {
    try {
      const res = await fetch(`/api/admin/research/${projectId}/report-card${withComparison ? '?compare=1' : ''}`);
      if (!res.ok) { setFailed(true); return; }
      setData((await res.json()) as Payload);
      setFailed(false);
    } catch { setFailed(true); }
  }, [projectId]);

  useEffect(() => { void load(comparing); }, [load, comparing]);

  if (failed) {
    return <div className="report-card report-card--bad">The run report could not be read — this is not the same as no run having happened.</div>;
  }
  if (!data?.card) return null;

  const c = data.card;

  return (
    <div className={`report-card${c.truncated ? ' report-card--truncated' : ''}`}>
      <div className="report-card__head">
        <span className="report-card__title">Run report card</span>
        <button className="report-card__compare" onClick={() => setComparing(v => !v)}>
          {comparing ? 'Hide comparison' : 'Compare with the previous run'}
        </button>
      </div>

      <p className="report-card__headline">
        {c.truncated && <AlertTriangle size={14} aria-hidden />} {c.headline}
      </p>

      <div className="report-card__metrics">
        <Metric label="Cost" value={money(c.costUsd)} />
        <Metric label="Wall clock" value={c.wallClockMinutes != null ? `${c.wallClockMinutes} min` : '—'} />
        {/* Null rather than $0.00: a divide-by-zero would make the emptiest run look the most
            efficient. */}
        <Metric label="Cost per fact" value={c.costPerFact != null ? `$${c.costPerFact.toFixed(3)}` : 'no facts'} />
        <Metric label="Facts" value={String(c.facts)} />
        <Metric label="Conflicts" value={String(c.conflicts)} />
        <Metric label="Sources reached" value={rate(c.sourceCoverage)} title="Of the adapters registered for this county." />
        <Metric label="Facts with a source" value={rate(c.evidenceRate)} />
        <Metric label="Facts checked" value={rate(c.reviewRate)} />
      </div>

      {c.skipped.length > 0 && (
        <details className="report-card__skipped">
          <summary>{c.skipped.length} piece(s) of work were skipped</summary>
          <ul>{c.skipped.map((s, i) => <li key={i}><strong>{s.what}</strong> — {s.partial ? <>stopped mid-way, work kept: {s.partial}</> : s.reason}</li>)}</ul>
        </details>
      )}

      {data.documentsScopedToRun && (
        <p className="report-card__scope">
          These counts are for run {data.runNumber ?? '?'} alone.
        </p>
      )}

      {/* The honest half. A missing measurement said out loud is worth more than a fabricated one. */}
      <div className="report-card__not-measured">
        <span className="report-card__not-measured-label">This card does not measure:</span>
        <ul>
          {c.notMeasured.map((n, i) => <li key={i}>{n}</li>)}
          {/* ── D5: THIS DISCLAIMER OUTLIVED ITS LIMITATION ─────────────────────────────────
              It read, unconditionally: "nothing tags a document or fact with its run, so the
              counts above are for the whole project, not this run alone." That was true when it
              was written and seed 623 made it false — research_documents.research_run_id records
              which run produced each row.

              A disclaimer that survives the limitation it describes is worse than none: it
              trains people to discount a number that has become correct. So it now fires only
              when the counts really are project-wide, and says WHY they are. */}
          {data.contentIsPerProject && (
            <li>
              Which run produced which fact. No document in this project carries a run
              attribution — 671 rows predate it — so the counts above are for the whole project,
              not this run alone. Documents retrieved from now on are attributed, and this note
              disappears once they are.
            </li>
          )}
        </ul>
      </div>

      {comparing && (
        data.comparison ? (
          <div className="report-card__comparison">
            <ul>{data.comparison.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
            <p className="report-card__verdict">{data.comparison.verdict}</p>
          </div>
        ) : (
          <p className="report-card__note">There is only one run for this property, so there is nothing to compare it against.</p>
        )
      )}
    </div>
  );
}

function Metric({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="report-card__metric" title={title}>
      <span className="report-card__metric-value">{value}</span>
      <span className="report-card__metric-label">{label}</span>
    </div>
  );
}
