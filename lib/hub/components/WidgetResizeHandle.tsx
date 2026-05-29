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
        title={`Drag to resize · ${currentSize.w}×${currentSize.h}`}
        style={handleStyle}
        data-testid="widget-resize-handle"
      >
        <span aria-hidden style={glyphStyle}>⤡</span>
      </button>
      {/* Slice 220 — size badge is now ALWAYS visible in edit mode
       *  (the wrapping cell only renders the handle when edit mode
       *  is on), so the surveyor knows what size the cell is at
       *  without having to start a drag. The badge shows the
       *  drag-target size while resizing and the current cell size
       *  otherwise. */}
      <div
        role="status"
        aria-live={active ? 'polite' : 'off'}
        style={active ? badgeActiveStyle : badgeStyle}
        data-testid="widget-resize-badge"
      >
        {(active ? target.w : currentSize.w)} × {(active ? target.h : currentSize.h)}
      </div>
    </>
  );
}

// ─── Style fragments ───────────────────────────────────────────────────

const handleStyle: React.CSSProperties = {
  position: 'absolute',
  // Slice 220 — bigger 28×28 grip in the accent color so the resize
  // affordance reads as deliberate. The handle sits flush with the
  // bottom-right corner of the cell (offset by 6px so it never gets
  // clipped by the dashed edit ring).
  bottom: 6,
  right: 6,
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  background: 'var(--theme-accent, #3b82f6)',
  color: 'var(--theme-accent-fg, #fff)',
  border: 'none',
  borderRadius: 6,
  cursor: 'nwse-resize',
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1,
  outline: 'none',
  boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
  // Slice 220 — make sure the grip stacks ABOVE the cell body so a
  // wide widget body can't render over it.
  zIndex: 2,
};

const glyphStyle: React.CSSProperties = {
  transform: 'rotate(90deg)',
  display: 'inline-block',
};

/** Slice 220 — Always-on size badge. Renders as a subtle muted chip
 *  in the top-left corner so the cell announces its current size
 *  without competing with the resize grip in the bottom-right. */
const badgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: 6,
  left: 6,
  padding: '2px 8px',
  borderRadius: 999,
  background: 'rgba(0,0,0,0.55)',
  color: '#fff',
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1.4,
  letterSpacing: 0.2,
  pointerEvents: 'none',
  zIndex: 2,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

/** Slice 220 — While actively resizing, the badge swaps to the
 *  accent color so the live target reads as a "you're at" signal. */
const badgeActiveStyle: React.CSSProperties = {
  ...badgeStyle,
  background: 'var(--theme-accent, #3b82f6)',
  color: 'var(--theme-accent-fg, #fff)',
  boxShadow: '0 2px 8px rgba(0,0,0,0.22)',
};
