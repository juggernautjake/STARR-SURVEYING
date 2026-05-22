// app/admin/components/calculator/HistoryStrip.tsx
//
// Compact, scrollable history strip displayed above the active
// calculator's display. Each row shows entry → result; clicking a row
// is reserved for a future slice (recall into the entry buffer).
//
// C-8 of EXAM_CALCULATORS.md.

'use client';

export interface HistoryRow {
  entry: string;
  result: string;
}

interface HistoryStripProps {
  rows: HistoryRow[];
  onRecall?: (row: HistoryRow) => void;
}

export function HistoryStrip({ rows, onRecall }: HistoryStripProps) {
  if (rows.length === 0) return null;
  return (
    <div className="calc-history" role="log" aria-label="Calculator history">
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
