// app/admin/components/calculator/Keypad.tsx
//
// Generic keypad renderer for the calculator emulators. Takes a list of
// KeyDef from a model's keypad-data file and lays them out in a CSS grid.
// Visual-only for C-6 — onKey is optional so we can wire engines later.

'use client';

import type { KeyDef } from '@/lib/calculators/shared';

interface KeypadProps {
  keys: KeyDef[];
  rows: number;
  cols: number;
  /** C-7+: per-engine click handler. C-6 doesn't pass one. */
  onKey?: (key: KeyDef) => void;
  /** Whether the 2nd / shift modifier is currently armed (changes label color). */
  shiftActive?: boolean;
}

export function Keypad({ keys, rows, cols, onKey, shiftActive }: KeypadProps) {
  return (
    <div
      className="calc-keypad"
      style={{
        gridTemplateRows: `repeat(${rows}, minmax(34px, auto))`,
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
      }}
    >
      {keys.map(k => (
        <button
          key={k.id}
          type="button"
          className={`calc-key calc-key--${k.tone || 'soft'}${shiftActive && k.kind === 'shift' ? ' calc-key--armed' : ''}`}
          style={{
            gridRow: `${k.row} / span ${k.rowSpan ?? 1}`,
            gridColumn: `${k.col} / span ${k.colSpan ?? 1}`,
          }}
          onClick={onKey ? () => onKey(k) : undefined}
          aria-label={k.label}
          tabIndex={onKey ? 0 : -1}
        >
          {k.shiftLabel && (
            <span className="calc-key__shift-label" aria-hidden="true">{k.shiftLabel}</span>
          )}
          <span className="calc-key__label">{k.label}</span>
        </button>
      ))}
    </div>
  );
}
