// app/dnd/_ui/useResizable.ts — drag-to-resize for the AI chat surfaces (Slice 9).
//
// The chat panels ship at a fixed size, which is wrong in both directions: a long adjudication
// gets read through a 380px letterbox, and on a small screen the panel covers the sheet you are
// asking about. So the reader sizes it, and we remember.
//
// Why a hook and not CSS `resize: both`:
//  · The builder chat is anchored BOTTOM-RIGHT. The native resizer only ever lives on the
//    bottom-right corner, so dragging it would push the panel off-screen instead of growing it.
//    This hook inverts the axis so a top-left handle grows the panel up and to the left.
//  · Native resize doesn't persist. Re-sizing the panel on every page load is the same annoyance
//    as the fixed size, just with extra steps.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface Size {
  w: number;
  h: number;
}

export interface ResizableOptions {
  /** localStorage key. Omit to resize without remembering. */
  storageKey?: string;
  /** Which axes the handle drives. */
  axis?: 'x' | 'y' | 'both';
  /** Drag direction is reversed on this axis (a handle that grows the box as it moves toward 0). */
  invert?: { x?: boolean; y?: boolean };
  min?: Partial<Size>;
  /** Cap. Defaults to the viewport, so a remembered size from a big monitor can't strand the
   *  panel off-screen on a laptop. */
  max?: Partial<Size>;
}

const DEFAULT_MIN: Size = { w: 280, h: 220 };

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Read a remembered size, tolerating anything (a hand-edited or stale value must not throw). */
function readStored(key: string | undefined): Partial<Size> | null {
  if (!key || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Size>;
    const ok = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n > 0;
    if (!ok(v?.w) && !ok(v?.h)) return null;
    return { w: ok(v.w) ? v.w : undefined, h: ok(v.h) ? v.h : undefined };
  } catch {
    return null;
  }
}

/**
 * Resize state + a pointer handler for a drag handle.
 *
 * `size` is null until mounted, so the server and the first client render agree (reading
 * localStorage during render would hydrate-mismatch). Render your CSS default while it's null.
 */
export function useResizable(initial: Size, opts: ResizableOptions = {}) {
  const { storageKey, axis = 'both', invert, min, max } = opts;
  const [size, setSize] = useState<Size | null>(null);
  const [resizing, setResizing] = useState(false);
  // Live values for the pointer handlers, which are bound once per drag.
  const startRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const sizeRef = useRef<Size>(initial);

  // Restore AFTER mount, never during render.
  useEffect(() => {
    const stored = readStored(storageKey);
    const next = { w: stored?.w ?? initial.w, h: stored?.h ?? initial.h };
    sizeRef.current = next;
    setSize(next);
    // initial is a fresh object literal at most call sites; depending on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const bounds = useCallback(() => {
    const vw = typeof window === 'undefined' ? 1280 : window.innerWidth;
    const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
    return {
      minW: min?.w ?? DEFAULT_MIN.w,
      minH: min?.h ?? DEFAULT_MIN.h,
      // Clamp to the viewport even when a max is given: a remembered 900px panel must not be
      // unreachable on a phone.
      maxW: Math.min(max?.w ?? Infinity, vw - 24),
      maxH: Math.min(max?.h ?? Infinity, vh - 24),
    };
  }, [min?.w, min?.h, max?.w, max?.h]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const start = { x: e.clientX, y: e.clientY, w: sizeRef.current.w, h: sizeRef.current.h };
      startRef.current = start;
      setResizing(true);

      const move = (ev: PointerEvent) => {
        const s = startRef.current;
        if (!s) return;
        const { minW, minH, maxW, maxH } = bounds();
        const dx = (ev.clientX - s.x) * (invert?.x ? -1 : 1);
        const dy = (ev.clientY - s.y) * (invert?.y ? -1 : 1);
        const next: Size = {
          w: axis === 'y' ? s.w : clamp(s.w + dx, minW, maxW),
          h: axis === 'x' ? s.h : clamp(s.h + dy, minH, maxH),
        };
        sizeRef.current = next;
        setSize(next);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setResizing(false);
        startRef.current = null;
        if (storageKey) {
          try {
            window.localStorage.setItem(storageKey, JSON.stringify(sizeRef.current));
          } catch {
            /* private mode / quota — resizing still worked for this session. */
          }
        }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [axis, bounds, invert?.x, invert?.y, storageKey],
  );

  /** Keyboard resize: a drag handle nobody can reach without a mouse is not an affordance. */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = e.shiftKey ? 64 : 16;
      const dirs: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const d = dirs[e.key];
      if (!d) return;
      e.preventDefault();
      const { minW, minH, maxW, maxH } = bounds();
      const [rx, ry] = d;
      const dx = rx * (invert?.x ? -1 : 1);
      const dy = ry * (invert?.y ? -1 : 1);
      const cur = sizeRef.current;
      const next: Size = {
        w: axis === 'y' ? cur.w : clamp(cur.w + dx, minW, maxW),
        h: axis === 'x' ? cur.h : clamp(cur.h + dy, minH, maxH),
      };
      sizeRef.current = next;
      setSize(next);
      if (storageKey) {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* ignore */
        }
      }
    },
    [axis, bounds, invert?.x, invert?.y, storageKey],
  );

  /** Spread onto the handle element. */
  const handleProps = {
    onPointerDown,
    onKeyDown,
    role: 'separator' as const,
    tabIndex: 0,
    'aria-label': 'Resize panel (arrow keys, or drag)',
    'aria-orientation': (axis === 'x' ? 'vertical' : 'horizontal') as 'vertical' | 'horizontal',
  };

  return { size, resizing, handleProps };
}
