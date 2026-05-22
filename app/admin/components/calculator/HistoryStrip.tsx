// app/admin/components/calculator/HistoryStrip.tsx
//
// Compact, scrollable history strip displayed above the active
// calculator's display. Each row shows entry → result.
//
// Originally C-8 of EXAM_CALCULATORS.md; refined by user feedback —
// the strip used to grow visually as more rows arrived even though
// max-height was set, because no scroll behavior was being asserted.
// Now: fixed compact height (2-3 visible rows), styled scrollbar that
// actually appears, auto-scroll to keep the newest entry in view,
// and a "more above" affordance so the user knows scrolling is possible.

'use client';

import { useEffect, useRef } from 'react';

export interface HistoryRow {
  entry: string;
  result: string;
}

interface HistoryStripProps {
  rows: HistoryRow[];
  onRecall?: (row: HistoryRow) => void;
}

export function HistoryStrip({ rows, onRecall }: HistoryStripProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to the top whenever new rows arrive — newest entries
  // render at the top (callers pass `history.reverse()`) so scrolling to
  // top keeps the most recent calculation visible.
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [rows.length]);

  if (rows.length === 0) return null;

  return (
    <div
      ref={ref}
      className="calc-history"
      role="log"
      aria-label="Calculator history"
      data-row-count={rows.length}
    >
      {rows.map((row, i) => (
        <button
          key={i}
          type="button"
          className="calc-history__row"
          onClick={onRecall ? () => onRecall(row) : undefined}
          tabIndex={onRecall ? 0 : -1}
          aria-label={`Recall ${row.entry} = ${row.result}`}
        >
          <span className="calc-history__entry">{row.entry}</span>
          <span className="calc-history__sep" aria-hidden="true">=</span>
          <span className="calc-history__result">{row.result}</span>
        </button>
      ))}
    </div>
  );
}
