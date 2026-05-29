'use client';
// lib/hub/components/WidgetResizeHandle.tsx
//
// Bottom-right resize handle. Edit-mode-only. Snaps to grid cells via
// `lib/hub/grid-resize`, enforces the widget definition's min/max,
// shows a live "{w}×{h}" badge while dragging, fires `onCommit` with
// the snapped size on pointer-up.
//
// Slice 99 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useState } from 'react';
import {
  computeResize,
  isDifferentSize,
  type CellDimensions,
  type GridSize,
} from '@/lib/hub/grid-resize';

interface WidgetResizeHandleProps {
  currentSize: GridSize;
  minSize: GridSize;
  maxSize: GridSize;
  cell: CellDimensions;
  /** Fires on pointer-up with the final snapped size. Only fires when
   *  the target differs from the current size. */
  onCommit: (next: GridSize) => void;
  /** Optional preview hook — fires on every pointer-move with the
   *  current snapped target. Used by the canvas to render a
   *  ghost-frame outline at the target size. */
  onPreview?: (next: GridSize) => void;
}

export default function WidgetResizeHandle({
  currentSize,
  minSize,
  maxSize,
  cell,
  onCommit,
  onPreview,
}: WidgetResizeHandleProps) {
  const [active, setActive] = useState(false);
  const [target, setTarget] = useState<GridSize>(currentSize);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = currentSize.w;
      const startH = currentSize.h;
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      setActive(true);
      setTarget({ w: startW, h: startH });

      function handleMove(ev: PointerEvent) {
        const next = computeResize(
          { w: startW, h: startH },
          { dx: ev.clientX - startX, dy: ev.clientY - startY },
          cell,
          minSize,
          maxSize,
        );
        setTarget(next);
        onPreview?.(next);
      }

      function handleUp(ev: PointerEvent) {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
        window.removeEventListener('pointercancel', handleUp);
        const finalSize = computeResize(
          { w: startW, h: startH },
          { dx: ev.clientX - startX, dy: ev.clientY - startY },
          cell,
          minSize,
          maxSize,
        );
        setActive(false);
        setTarget(finalSize);
        if (isDifferentSize(finalSize, { w: startW, h: startH })) {
          onCommit(finalSize);
        }
      }

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
      window.addEventListener('pointercancel', handleUp);
    },
    [cell, currentSize.w, currentSize.h, minSize, maxSize, onCommit, onPreview],
  );

  return (
    <>
      <button
        type="button"
        onPointerDown={onPointerDown}
        aria-label={`Resize widget. Current size ${currentSize.w} by ${currentSize.h}.`}
        title="Drag to resize"
        style={handleStyle}
      >
        <span aria-hidden style={glyphStyle}>⤡</span>
      </button>
      {active && (
        <div role="status" aria-live="polite" style={badgeStyle}>
          {target.w} × {target.h}
        </div>
      )}
    </>
  );
}

// ─── Style fragments ───────────────────────────────────────────────────

const handleStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 4,
  right: 4,
  width: 18,
  height: 18,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  background: 'var(--theme-bg-elevated)',
  color: 'var(--theme-fg-secondary)',
  border: '1px solid var(--theme-border)',
  borderRadius: 4,
  cursor: 'nwse-resize',
  fontSize: 12,
  lineHeight: 1,
  // Hide the focus ring from native button styles so the affordance is
  // entirely owned by the box style + cursor.
  outline: 'none',
};

const glyphStyle: React.CSSProperties = {
  transform: 'rotate(90deg)',
  display: 'inline-block',
};

const badgeStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 28,
  right: 8,
  padding: '2px 8px',
  borderRadius: 4,
  background: 'var(--theme-accent)',
  color: 'var(--theme-accent-fg)',
  fontSize: 12,
  fontWeight: 600,
  pointerEvents: 'none',
};
