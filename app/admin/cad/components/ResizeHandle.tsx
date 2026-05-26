'use client';
// app/admin/cad/components/ResizeHandle.tsx
//
// A thin draggable splitter for resizing an adjacent panel. Pointer
// drag + arrow-key support (role="separator"). The parent owns the size
// state (via usePanelSize) and applies it; this component only reports
// the new size.
//
//   axis 'x' → resizes width;  axis 'y' → resizes height.
//   sign +1  → dragging in the +axis direction grows the panel
//              (handle on the panel's right/bottom edge).
//   sign -1  → dragging in the -axis direction grows the panel
//              (handle on the panel's left/top edge).
//
// Spec: docs/planning/completed/cad-standalone-and-ux-audit.md

import { useCallback, useRef } from 'react';

interface Props {
  axis: 'x' | 'y';
  sign: 1 | -1;
  size: number;
  min: number;
  max: number;
  onResize: (next: number) => void;
  /** px per arrow-key press */
  step?: number;
  ariaLabel?: string;
}

export default function ResizeHandle({
  axis,
  sign,
  size,
  min,
  max,
  onResize,
  step = 16,
  ariaLabel,
}: Props) {
  const startRef = useRef<{ pos: number; size: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      startRef.current = { pos: axis === 'x' ? e.clientX : e.clientY, size };
    },
    [axis, size],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = startRef.current;
      if (!start) return;
      const cur = axis === 'x' ? e.clientX : e.clientY;
      const delta = (cur - start.pos) * sign;
      onResize(start.size + delta);
    },
    [axis, sign, onResize],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    startRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const grow = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
      const shrink = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
      if (e.key === grow) {
        e.preventDefault();
        onResize(size + step * sign);
      } else if (e.key === shrink) {
        e.preventDefault();
        onResize(size - step * sign);
      }
    },
    [axis, sign, size, step, onResize],
  );

  const isX = axis === 'x';
  return (
    <div
      role="separator"
      aria-orientation={isX ? 'vertical' : 'horizontal'}
      aria-label={ariaLabel ?? 'Resize panel'}
      aria-valuenow={size}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      className={
        isX
          ? 'group relative shrink-0 cursor-col-resize w-1 hover:w-1 bg-gray-700 hover:bg-blue-500 transition-colors focus:outline-none focus:bg-blue-500'
          : 'group relative shrink-0 cursor-row-resize h-1 bg-gray-700 hover:bg-blue-500 transition-colors focus:outline-none focus:bg-blue-500'
      }
      style={isX ? { touchAction: 'none' } : { touchAction: 'none' }}
    />
  );
}
