// app/admin/research/[projectId]/_sections/SourceComparisonCard.tsx — plan 1.6 (A6).
//
// Renders the free-first engine's source-comparison manifest: one row per document, every source
// that offers it with its cost, and the engine's decision (free-capture / buy / skip) + the reason.
// Dumb by design — `sourceComparisonOf` decides whether there is a manifest to show; this only
// renders one. Colours + layout live in `.source-comparison__*` in AdminResearch.css.

'use client';

import { Check, ShoppingCart, MinusCircle } from 'lucide-react';
import {
  rowLabel,
  type SourceComparison,
  type SourceDecision,
} from './source-comparison-data';

const DECISION_META: Record<SourceDecision, { icon: typeof Check; label: string; tone: string }> = {
  free_capture: { icon: Check, label: 'Free capture', tone: 'free' },
  purchase: { icon: ShoppingCart, label: 'Buy (paid-only)', tone: 'paid' },
  skip: { icon: MinusCircle, label: 'Skip', tone: 'skip' },
};

export default function SourceComparisonCard({ report }: { report: SourceComparison | null }) {
  if (!report) return null;

  return (
    <div className="source-comparison">
      <h4 className="source-comparison__title">Source Comparison — what each source provides</h4>
      <p className="source-comparison__summary">
        {report.rows.length} document{report.rows.length === 1 ? '' : 's'} compared across sources ·{' '}
        {report.purchaseCount} to buy (paid-only, ${report.plannedPaidUsd.toFixed(2)}) ·{' '}
        {report.freeCount} free · {report.skipCount} skipped
      </p>

      <div className="source-comparison__rows">
        {report.rows.map((r, i) => {
          const meta = DECISION_META[r.decision];
          const Icon = meta.icon;
          return (
            <div key={i} className="source-comparison__row">
              <div className="source-comparison__row-head">
                <span className={`source-comparison__decision source-comparison__decision--${meta.tone}`}>
                  <Icon size={14} strokeWidth={2.5} aria-hidden="true" />
                  {meta.label}
                </span>
                <span className="source-comparison__doc">{rowLabel(r)}</span>
                <span className="source-comparison__type">{r.docType}</span>
                {r.recordingDate && <span className="source-comparison__date">{r.recordingDate}</span>}
              </div>

              <div className="source-comparison__offers">
                {r.sources.map((s, j) => {
                  const chosen = r.chosenSource === s.sourceId && r.decision !== 'skip';
                  return (
                    <span
                      key={j}
                      className={`source-comparison__offer source-comparison__offer--${s.kind}${chosen ? ' source-comparison__offer--chosen' : ''}`}
                      title={chosen ? 'Chosen source' : undefined}
                    >
                      {s.sourceId}
                      {s.kind === 'paid' ? ` · $${s.unitCostUsd}` : ' · free'}
                      {chosen ? ' ✓' : ''}
                    </span>
                  );
                })}
              </div>

              {r.reason && <p className="source-comparison__reason">{r.reason}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
