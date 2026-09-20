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
  /**
   * Guided practice: the key the student should press next.
   *
   * Only ONE key is ever pointed at, deliberately. Highlighting the whole remaining sequence would
   * let somebody copy a pattern off the screen without reading a word of what the keys do, which is
   * the opposite of the point.
   */
  nextKey?: string | null;
  /** A key just pressed in error, so it can say so and settle. */
  wrongKey?: string | null;
}

export function Keypad({ keys, rows, cols, onKey, shiftActive, nextKey, wrongKey }: KeypadProps) {
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
          className={[
            'calc-key',
            `calc-key--${k.tone || 'soft'}`,
            shiftActive && k.kind === 'shift' ? 'calc-key--armed' : '',
            nextKey === k.id ? 'calc-key--next' : '',
            wrongKey === k.id ? 'calc-key--wrong' : '',
          ].filter(Boolean).join(' ')}
          style={{
            gridRow: `${k.row} / span ${k.rowSpan ?? 1}`,
            gridColumn: `${k.col} / span ${k.colSpan ?? 1}`,
          }}
          onClick={onKey ? () => onKey(k) : undefined}
          aria-label={nextKey === k.id ? `${k.label} — press this next` : k.label}
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
