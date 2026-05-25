'use client';
// app/admin/components/ui/ModalFrame.tsx
//
// Shared modal shell: draggable (by the header), resizable (8 edge/corner
// handles), viewport-clamped, and persisted to localStorage when given a
// storageKey. Always renders an X close button and supports Escape-to-close
// and click-away on the backdrop. Rendered through a portal at document.body
// so it escapes any parent stacking/overflow context.
//
// Drag math + viewport clamping mirror the proven CalculatorModal
// implementation; resize is layered on top.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ModalFrameProps {
  open: boolean;
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  /** Extra controls rendered in the header, left of the close button. */
  headerActions?: React.ReactNode;
  initialWidth?: number;
  initialHeight?: number;
  minWidth?: number;
  minHeight?: number;
  /** Where to place the modal on first open when nothing is persisted. */
  initialPlacement?: 'center' | 'top-right';
  /** Persist position + size across opens/reloads under this key. */
  storageKey?: string;
  /** Dim + intercept clicks behind the modal. Default true. */
  backdrop?: boolean;
  /** Close when the backdrop is clicked. Default true. */
  closeOnBackdrop?: boolean;
  /** Extra classes for the body wrapper. */
  bodyClassName?: string;
  /**
   * When true (default) the body scrolls (`overflow-auto`). Set false for
   * dialogs that manage their own internal layout (e.g. a sticky tab bar +
   * scrolling content + sticky footer) — the body becomes a flex column.
   */
  scrollBody?: boolean;
  /** z-index for the portal layer. Default 1000. */
  zIndex?: number;
}

const MARGIN = 8;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function readRect(key: string): Partial<Rect> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Rect>;
    return p && typeof p === 'object' ? p : null;
  } catch {
    return null;
  }
}

function writeRect(key: string, rect: Rect): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(rect));
  } catch {
    /* ignore quota */
  }
}

/** Keep the modal inside the viewport, leaving at least the header grabbable. */
function clampRect(rect: Rect): Rect {
  if (typeof window === 'undefined') return rect;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = clamp(rect.width, 0, vw - MARGIN * 2);
  const height = clamp(rect.height, 0, vh - MARGIN * 2);
  // Always keep ~48px of the header reachable on each axis.
  const x = clamp(rect.x, 48 - width, vw - 48);
  const y = clamp(rect.y, 0, vh - 48);
  return { x, y, width, height };
}

export default function ModalFrame({
  open,
  title,
  onClose,
  children,
  headerActions,
  initialWidth = 480,
  initialHeight = 380,
  minWidth = 280,
  minHeight = 160,
  initialPlacement = 'center',
  storageKey,
  backdrop = true,
  closeOnBackdrop = true,
  bodyClassName = '',
  scrollBody = true,
  zIndex = 1000,
}: ModalFrameProps) {
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<Rect>({
    x: 0,
    y: 0,
    width: initialWidth,
    height: initialHeight,
  });

  // A drag (move) or resize gesture in progress. Kept in a ref so the
  // window-level pointer listeners always read fresh values.
  const gestureRef = useRef<
    | { kind: 'move'; offsetX: number; offsetY: number }
    | { kind: 'resize'; dir: ResizeDir; start: Rect; pointerX: number; pointerY: number }
    | null
  >(null);

  // Initialise position/size once the modal opens (SSR-safe).
  useEffect(() => {
    if (!open) return;
    setMounted(true);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const saved = storageKey ? readRect(storageKey) : null;
    const width = clamp(saved?.width ?? initialWidth, minWidth, vw - MARGIN * 2);
    const height = clamp(saved?.height ?? initialHeight, minHeight, vh - MARGIN * 2);
    let x: number;
    let y: number;
    if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
      x = saved.x;
      y = saved.y;
    } else if (initialPlacement === 'top-right') {
      x = Math.max(MARGIN, vw - width - 32);
      y = 80;
    } else {
      x = Math.max(MARGIN, (vw - width) / 2);
      y = Math.max(MARGIN, (vh - height) / 3);
    }
    setRect(clampRect({ x, y, width, height }));
    // Only re-run when the modal transitions open; size props are initial-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, storageKey]);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Re-clamp on viewport resize so the modal can't slip off-screen.
  useEffect(() => {
    if (!open) return;
    function onResize() {
      setRect((prev) => clampRect(prev));
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);

  const endGesture = useCallback(() => {
    if (!gestureRef.current) return;
    gestureRef.current = null;
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', endGesture);
    if (storageKey) {
      setRect((prev) => {
        writeRect(storageKey, prev);
        return prev;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const handleMove = useCallback((e: PointerEvent) => {
    const g = gestureRef.current;
    if (!g) return;
    e.preventDefault();
    if (g.kind === 'move') {
      setRect((prev) =>
        clampRect({ ...prev, x: e.clientX - g.offsetX, y: e.clientY - g.offsetY })
      );
      return;
    }
    // resize
    const dx = e.clientX - g.pointerX;
    const dy = e.clientY - g.pointerY;
    const s = g.start;
    let { x, y, width, height } = s;
    if (g.dir.includes('e')) width = s.width + dx;
    if (g.dir.includes('s')) height = s.height + dy;
    if (g.dir.includes('w')) {
      width = s.width - dx;
      x = s.x + dx;
    }
    if (g.dir.includes('n')) {
      height = s.height - dy;
      y = s.y + dy;
    }
    // Enforce minimums while keeping the anchored edge fixed.
    if (width < minWidth) {
      if (g.dir.includes('w')) x = s.x + (s.width - minWidth);
      width = minWidth;
    }
    if (height < minHeight) {
      if (g.dir.includes('n')) y = s.y + (s.height - minHeight);
      height = minHeight;
    }
    setRect(clampRect({ x, y, width, height }));
  }, [minWidth, minHeight]);

  const beginMove = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
      gestureRef.current = {
        kind: 'move',
        offsetX: e.clientX - rect.x,
        offsetY: e.clientY - rect.y,
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', endGesture);
    },
    [rect.x, rect.y, handleMove, endGesture]
  );

  const beginResize = useCallback(
    (dir: ResizeDir) => (e: React.PointerEvent) => {
      e.stopPropagation();
      gestureRef.current = {
        kind: 'resize',
        dir,
        start: { ...rect },
        pointerX: e.clientX,
        pointerY: e.clientY,
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', endGesture);
    },
    [rect, handleMove, endGesture]
  );

  // Clean up any stray listeners on unmount.
  useEffect(() => () => {
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', endGesture);
  }, [handleMove, endGesture]);

  if (!mounted || !open) return null;

  const handles: { dir: ResizeDir; className: string }[] = [
    { dir: 'n', className: 'top-0 left-2 right-2 h-1.5 cursor-ns-resize' },
    { dir: 's', className: 'bottom-0 left-2 right-2 h-1.5 cursor-ns-resize' },
    { dir: 'e', className: 'top-2 bottom-2 right-0 w-1.5 cursor-ew-resize' },
    { dir: 'w', className: 'top-2 bottom-2 left-0 w-1.5 cursor-ew-resize' },
    { dir: 'ne', className: 'top-0 right-0 h-3 w-3 cursor-nesw-resize' },
    { dir: 'nw', className: 'top-0 left-0 h-3 w-3 cursor-nwse-resize' },
    { dir: 'se', className: 'bottom-0 right-0 h-3 w-3 cursor-nwse-resize' },
    { dir: 'sw', className: 'bottom-0 left-0 h-3 w-3 cursor-nesw-resize' },
  ];

  const node = (
    <>
      {backdrop && (
        <div
          className="fixed inset-0 bg-black/40"
          style={{ zIndex }}
          onClick={closeOnBackdrop ? onClose : undefined}
        />
      )}
      <div
        role="dialog"
        aria-modal="true"
        className="fixed flex flex-col bg-gray-800 border border-gray-600 rounded-lg shadow-2xl text-gray-200 overflow-hidden"
        style={{
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
          zIndex: zIndex + 1,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header / drag handle */}
        <div
          className="shrink-0 flex items-center justify-between gap-3 px-3 h-9 bg-gray-900/60 border-b border-gray-700 cursor-grab active:cursor-grabbing select-none"
          onPointerDown={beginMove}
          style={{ touchAction: 'none' }}
        >
          <span className="text-xs font-semibold text-gray-200 truncate">{title}</span>
          <div className="flex items-center gap-1" data-no-drag>
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              title="Close (Esc)"
              className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div
          className={`flex-1 min-h-0 ${scrollBody ? 'overflow-auto' : 'flex flex-col'} ${bodyClassName}`}
        >
          {children}
        </div>

        {/* Resize handles */}
        {handles.map((h) => (
          <div
            key={h.dir}
            className={`absolute ${h.className}`}
            style={{ touchAction: 'none', zIndex: zIndex + 2 }}
            onPointerDown={beginResize(h.dir)}
          />
        ))}
      </div>
    </>
  );

  return createPortal(node, document.body);
}
