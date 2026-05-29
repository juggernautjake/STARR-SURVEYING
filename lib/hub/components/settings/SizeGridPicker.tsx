'use client';
// lib/hub/components/settings/SizeGridPicker.tsx
//
// Visual 12×4 grid picker. The user hovers a cell; the picker
// highlights every cell from (0,0) → (hoveredCol, hoveredRow) as the
// "target size". Click commits — fires `onChange(w, h)`. Cells outside
// the widget's min/max envelope are dimmed and non-interactive.
//
// Keyboard accessible: arrow keys move the cursor, Enter / Space
// commit. Cursor seed is the current value.
//
// Slice 102 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useState } from 'react';

interface SizeGridPickerProps {
  value: { w: number; h: number };
  minSize: { w: number; h: number };
  maxSize: { w: number; h: number };
  onChange: (next: { w: number; h: number }) => void;
  /** Optional. The picker defaults to the new 8×8 grid (Slice 209).
   *  Larger widgets clamp to 8×8 in the visual. */
  cols?: number;
  rows?: number;
}

export default function SizeGridPicker({
  value,
  minSize,
  maxSize,
  onChange,
  cols = 8,
  rows = 8,
}: SizeGridPickerProps) {
  const [hover, setHover] = useState<{ w: number; h: number } | null>(null);
  const display = hover ?? value;

  const safeMax = {
    w: Math.min(maxSize.w, cols),
    h: Math.min(maxSize.h, rows),
  };

  const isOutOfRange = useCallback(
    (cw: number, ch: number) =>
      cw < minSize.w || cw > safeMax.w || ch < minSize.h || ch > safeMax.h,
    [minSize.w, minSize.h, safeMax.w, safeMax.h],
  );

  function handleKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const cursor = hover ?? value;
    let nextW = cursor.w;
    let nextH = cursor.h;
    if (e.key === 'ArrowRight') nextW = Math.min(safeMax.w, cursor.w + 1);
    else if (e.key === 'ArrowLeft') nextW = Math.max(minSize.w, cursor.w - 1);
    else if (e.key === 'ArrowDown') nextH = Math.min(safeMax.h, cursor.h + 1);
    else if (e.key === 'ArrowUp') nextH = Math.max(minSize.h, cursor.h - 1);
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onChange({ w: cursor.w, h: cursor.h });
      return;
    } else {
      return;
    }
    e.preventDefault();
    setHover({ w: nextW, h: nextH });
  }

  return (
    <div
      role="grid"
      tabIndex={0}
      aria-label={`Resize widget. Current size ${value.w} by ${value.h}.`}
      onKeyDown={handleKey}
      onMouseLeave={() => setHover(null)}
      style={pickerWrapperStyle}
    >
      <div
        role="presentation"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          gap: 2,
        }}
      >
        {Array.from({ length: rows }).map((_, rIdx) =>
          Array.from({ length: cols }).map((_unused, cIdx) => {
            const cellW = cIdx + 1;
            const cellH = rIdx + 1;
            const outOfRange = isOutOfRange(cellW, cellH);
            const filled = cellW <= display.w && cellH <= display.h;
            return (
              <button
                key={`${rIdx}-${cIdx}`}
                type="button"
                role="gridcell"
                tabIndex={-1}
                disabled={outOfRange}
                aria-label={`${cellW} by ${cellH}`}
                aria-selected={cellW === value.w && cellH === value.h}
                onMouseEnter={() => !outOfRange && setHover({ w: cellW, h: cellH })}
                onClick={() => !outOfRange && onChange({ w: cellW, h: cellH })}
                style={{
                  ...cellStyle,
                  background: outOfRange
                    ? 'transparent'
                    : filled
                      ? 'var(--theme-accent)'
                      : 'var(--theme-bg-elevated)',
                  border: outOfRange
                    ? '1px dashed var(--theme-border)'
                    : '1px solid var(--theme-border)',
                  cursor: outOfRange ? 'not-allowed' : 'pointer',
                  opacity: outOfRange ? 0.35 : 1,
                }}
              />
            );
          }),
        )}
      </div>
      <div style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)', marginTop: 4 }}>
        {display.w} × {display.h}
      </div>
    </div>
  );
}

// ─── Style fragments ───────────────────────────────────────────────────

const pickerWrapperStyle: React.CSSProperties = {
  outline: 'none',
};

const cellStyle: React.CSSProperties = {
  padding: 0,
  // Slice 209 — square aspect ratio so the picker visualizes the
  // same shape the user will see in the canvas (1×1 = square).
  aspectRatio: '1 / 1',
  borderRadius: 2,
};
