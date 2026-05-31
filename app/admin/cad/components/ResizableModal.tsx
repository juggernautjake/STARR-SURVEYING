'use client';
// app/admin/cad/components/ResizableModal.tsx
//
// cad-calculator-suite Slice 3 — resizable modal shell. Self-
// contained corner-drag resize via pointer events (no external
// library). Children get the current size + a scale factor through
// `ResizableContext` so they can grow their fonts / buttons
// proportionally as the modal expands.
//
// Position is fixed to the viewport center; resize tracks the
// pointer delta from the bottom-right corner handle. Min size is
// the natural size for the current calculator; max size is the
// viewport minus a margin so the modal can't escape the screen.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export interface ResizableSize {
  width: number;
  height: number;
}

export interface ResizableContextValue {
  /** Current width/height in pixels. */
  size: ResizableSize;
  /** Scale factor based on size vs naturalSize. min = 1; grows as
   *  the modal is dragged larger. Children can multiply their
   *  font-size / button dimensions by this. */
  scale: number;
}

const ResizableContext = createContext<ResizableContextValue | null>(null);

/** Hook used by children to read the modal's current size + scale.
 *  Throws when used outside a ResizableModal so misuse is caught
 *  loudly. */
export function useResizable(): ResizableContextValue {
  const ctx = useContext(ResizableContext);
  if (!ctx) {
    throw new Error('useResizable must be used inside a <ResizableModal>');
  }
  return ctx;
}

interface ResizableModalProps {
  /** Whether the modal is open. Caller manages this. */
  open: boolean;
  /** Caller-controlled close handler (clicking the backdrop /
   *  pressing Escape fires this). */
  onClose: () => void;
  /** Initial + minimum size. Used as the scale-1 baseline. */
  naturalSize: ResizableSize;
  /** Hard maximum (defaults to viewport - 32px margin). */
  maxSize?: ResizableSize;
  /** Title shown in the modal header. */
  title?: string;
  /** Optional title-bar slot (right-aligned, e.g. the calculator
   *  picker dropdown from Slice 4). */
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

/** Clamp a size into [naturalSize, max]. */
function clampSize(size: ResizableSize, natural: ResizableSize, max: ResizableSize): ResizableSize {
  return {
    width: Math.max(natural.width, Math.min(max.width, size.width)),
    height: Math.max(natural.height, Math.min(max.height, size.height)),
  };
}

export default function ResizableModal({
  open,
  onClose,
  naturalSize,
  maxSize,
  title,
  headerActions,
  children,
}: ResizableModalProps) {
  // Current size — initialized to naturalSize. Caller can grow it
  // by dragging the corner handle.
  const [size, setSize] = useState<ResizableSize>(naturalSize);
  // Track the active drag — pointer start position + size start so
  // every pointermove diff updates from the original anchor (avoids
  // drift across frames).
  const dragRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  // Reset to naturalSize when the modal closes so it reopens at the
  // expected baseline. (If the user wants persistent sizing across
  // sessions, layer that on top via the calculator-store.)
  useEffect(() => {
    if (!open) setSize(naturalSize);
  }, [open, naturalSize]);

  // Compute the effective max (defaults to viewport minus margin).
  const effectiveMax: ResizableSize = useMemo(() => {
    if (maxSize) return maxSize;
    if (typeof window === 'undefined') return { width: 2000, height: 2000 };
    const margin = 32;
    return {
      width: Math.max(naturalSize.width, window.innerWidth - margin),
      height: Math.max(naturalSize.height, window.innerHeight - margin),
    };
  }, [maxSize, naturalSize]);

  // Pointer-based resize. Listens at window scope so a fast drag
  // doesn't lose the pointer when it leaves the handle bounding box.
  const onHandlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: size.width,
      startH: size.height,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [size]);

  const onHandlePointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const next = clampSize(
      { width: d.startW + (e.clientX - d.startX), height: d.startH + (e.clientY - d.startY) },
      naturalSize,
      effectiveMax,
    );
    setSize(next);
  }, [naturalSize, effectiveMax]);

  const onHandlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // Escape-to-close. Wired to the document so the modal catches it
  // regardless of focus.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const scale = Math.max(1, size.width / naturalSize.width);
  const ctxValue: ResizableContextValue = useMemo(() => ({ size, scale }), [size, scale]);

  if (!open) return null;

  return (
    <div
      data-testid="resizable-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      onContextMenu={(e) => { e.preventDefault(); onClose(); }}
    >
      <div
        data-testid="resizable-modal"
        data-modal-width={Math.round(size.width)}
        data-modal-height={Math.round(size.height)}
        className="relative flex flex-col bg-gray-900 border border-gray-700 rounded-lg shadow-2xl overflow-hidden"
        style={{ width: size.width, height: size.height }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-gray-700 text-xs text-gray-300 select-none">
          <span className="font-semibold truncate">{title ?? ''}</span>
          <div className="flex items-center gap-2">
            {headerActions}
            <button
              type="button"
              data-testid="resizable-modal-close"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-100 px-1"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>
        {/* Body — children own the layout inside the available area. */}
        <ResizableContext.Provider value={ctxValue}>
          <div className="flex-1 min-h-0 overflow-hidden">
            {children}
          </div>
        </ResizableContext.Provider>
        {/* Resize handle — bottom-right corner. */}
        <div
          data-testid="resizable-modal-handle"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize bg-gradient-to-br from-transparent to-gray-500/60"
          aria-label="Resize"
          role="separator"
        />
      </div>
    </div>
  );
}
