// lib/admin/use-draggable.ts
//
// Slice MX3 — reusable drag hook for floating panels (messenger,
// discussion thread, anything else that wants a draggable header).
//
// Extracted from CalculatorModal's onPointerDown / Move / Up
// triplet so the same drag-with-clamp-and-persist behavior lands
// across every popup. The hook owns the position state +
// localStorage persistence; the consumer attaches the returned
// handlers to whatever element should be the drag handle (usually
// the header) and reads `position` to render the panel.
//
// SSR-safe: the initial position falls back to (0, 0) on the
// server and is hydrated from `localStorage` (or the
// `defaultPlacement` callback) in a mount effect.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface DragPosition {
  x: number;
  y: number;
}

export interface UseDraggableOptions {
  /** Key under which `{x, y}` persists in localStorage. */
  storageKey: string;
  /** Panel width in CSS px — used to clamp to the viewport. */
  width: number;
  /** Panel height in CSS px — used to clamp. */
  height: number;
  /** Called when there's no saved position to compute the initial
   *  placement from the live viewport (e.g. bottom-right). Runs
   *  exactly once on mount. */
  defaultPlacement: (viewport: { w: number; h: number }) => DragPosition;
  /** Optional gating — when false the hook still mounts but the
   *  handlers no-op so the consumer can keep the hook order
   *  stable while the panel is closed. */
  enabled?: boolean;
}

export interface UseDraggableResult {
  /** Current top-left position. (0, 0) on the server. */
  position: DragPosition;
  /** Imperative setter that ALSO clamps + persists. Useful for
   *  programmatic resets ("snap to bottom-right"). */
  setPosition: (next: DragPosition) => void;
  /** True after the first mount effect has run. Consumers can
   *  switch `style.left` / `top` rendering on after hydration so
   *  the SSR markup doesn't flicker. */
  mounted: boolean;
  /** Attach this to the header (or whatever should be the
   *  grabbable surface). Add `data-no-drag` to children that
   *  should swallow the drag (close button, links, inputs). */
  handlers: {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
  };
}

/** Clamp a candidate position into the viewport so the panel
 *  can't fly off-screen. Exported for the test suite. */
export function clampPosition(
  pos: DragPosition,
  width: number,
  height: number,
  viewport: { w: number; h: number },
): DragPosition {
  const maxX = Math.max(0, viewport.w - width);
  const maxY = Math.max(0, viewport.h - height);
  return {
    x: Math.min(Math.max(0, pos.x), maxX),
    y: Math.min(Math.max(0, pos.y), maxY),
  };
}

function readStored(storageKey: string): DragPosition | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed && typeof parsed === 'object' &&
      typeof (parsed as DragPosition).x === 'number' &&
      typeof (parsed as DragPosition).y === 'number'
    ) {
      return parsed as DragPosition;
    }
  } catch { /* malformed → fall through to default */ }
  return null;
}

function writeStored(storageKey: string, pos: DragPosition): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(storageKey, JSON.stringify(pos)); }
  catch { /* quota / private mode */ }
}

export function useDraggable(options: UseDraggableOptions): UseDraggableResult {
  const { storageKey, width, height, defaultPlacement, enabled = true } = options;
  const [position, setPositionState] = useState<DragPosition>({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const dragOffsetRef = useRef<DragPosition | null>(null);

  // Hydrate on mount.
  useEffect(() => {
    setMounted(true);
    const viewport = { w: window.innerWidth, h: window.innerHeight };
    const stored = readStored(storageKey);
    const initial = stored ?? defaultPlacement(viewport);
    setPositionState(clampPosition(initial, width, height, viewport));
    // intentionally fire-once on mount; width/height changes are
    // handled by the resize listener below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-clamp on window resize so the panel can't end up off-screen.
  useEffect(() => {
    function onResize() {
      const viewport = { w: window.innerWidth, h: window.innerHeight };
      setPositionState((prev) => clampPosition(prev, width, height, viewport));
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [width, height]);

  const setPosition = useCallback((next: DragPosition) => {
    if (typeof window === 'undefined') {
      setPositionState(next);
      return;
    }
    const viewport = { w: window.innerWidth, h: window.innerHeight };
    const clamped = clampPosition(next, width, height, viewport);
    setPositionState(clamped);
    writeStored(storageKey, clamped);
  }, [storageKey, width, height]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!enabled) return;
    const target = e.target as HTMLElement;
    // Inputs, buttons, links inside the header should never start
    // a drag. `data-no-drag` is the opt-out the consumer adds to
    // the close button, the "Open in messages" link, etc.
    if (target.closest('[data-no-drag]')) return;
    if (target.closest('input, textarea, select, button, a')) return;
    const handle = e.currentTarget as HTMLElement;
    const rect = handle.getBoundingClientRect();
    // Drag offset is the pointer's position WITHIN the panel's
    // current bounding box, not within the handle. Convert from
    // handle-relative to panel-relative using the position state.
    dragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    try { handle.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
  }, [enabled]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!enabled || !dragOffsetRef.current) return;
    e.preventDefault();
    const viewport = { w: window.innerWidth, h: window.innerHeight };
    const next = clampPosition(
      {
        x: e.clientX - dragOffsetRef.current.x,
        y: e.clientY - dragOffsetRef.current.y,
      },
      width, height, viewport,
    );
    setPositionState(next);
  }, [enabled, width, height]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!dragOffsetRef.current) return;
    dragOffsetRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); }
    catch { /* ignore */ }
    setPositionState((prev) => {
      writeStored(storageKey, prev);
      return prev;
    });
  }, [storageKey]);

  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!dragOffsetRef.current) return;
    dragOffsetRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); }
    catch { /* ignore */ }
  }, []);

  return {
    position,
    setPosition,
    mounted,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  };
}
