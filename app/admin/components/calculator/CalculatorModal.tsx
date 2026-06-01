// app/admin/components/calculator/CalculatorModal.tsx
//
// Draggable, viewport-clamped modal shell for the exam-calculator
// emulators. C-2 of EXAM_CALCULATORS.md.
//
// Doesn't know anything about calculators yet — that's wired in C-3
// (context) and C-6+ (per-model keypads). This component:
//   • Renders via a portal at document.body
//   • Drags via the header bar (pointer events; touch + mouse)
//   • Persists position to localStorage so the next open snaps back
//   • Clamps to the viewport so the user can't lose the modal
//   • Shows close + (optional) clear-state buttons
//   • Exposes a tab-strip slot above the content area and a content slot
//
// Resize is deliberately deferred per the plan — calculators have a
// natural aspect ratio per model and free-form resize fights that.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './CalculatorModal.css';

interface CalculatorModalProps {
  open: boolean;
  title: string;
  width: number;
  height: number;
  /** Optional content rendered between the header and the body — usually a tab strip. */
  toolbar?: React.ReactNode;
  /** The active calculator's keypad + display. */
  children: React.ReactNode;
  /** Called when the user clicks the × button. The parent decides whether to fully unmount or hide. */
  onClose: () => void;
  /** Optional clear-state button next to the close. */
  onClearState?: () => void;
  /** localStorage key for position; falls back to a default if omitted. */
  storageKey?: string;
}

interface Position { x: number; y: number; }

const STORAGE_KEY_DEFAULT = 'calculatorModalPos';

function readPosition(key: string): Position | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Position;
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') return parsed;
  } catch { /* fall through */ }
  return null;
}

function writePosition(key: string, pos: Position): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(key, JSON.stringify(pos)); } catch { /* ignore quota */ }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// cad-trv-fidelity Slice 14b — the modal is expandable. A single SCALE
// factor multiplies the model's natural width/height; the body content
// is rendered at its base size and `transform: scale()`d to fill, so
// EVERY calculator (the generic grid + the absolute-layout device
// models) grows perfectly proportionally with zero layout breakage.
const MIN_SCALE = 1;
const MAX_SCALE = 3;

function readScale(key: string): number {
  if (typeof window === 'undefined') return 1;
  try {
    const raw = window.localStorage.getItem(`${key}:scale`);
    const n = raw ? parseFloat(raw) : NaN;
    if (Number.isFinite(n)) return clamp(n, MIN_SCALE, MAX_SCALE);
  } catch { /* ignore */ }
  return 1;
}

function writeScale(key: string, scale: number): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(`${key}:scale`, String(scale)); } catch { /* ignore */ }
}

export function CalculatorModal({
  open,
  title,
  width,
  height,
  toolbar,
  children,
  onClose,
  onClearState,
  storageKey = STORAGE_KEY_DEFAULT,
}: CalculatorModalProps) {
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 64, y: 64 });
  const [scale, setScale] = useState(1);
  const dragOffsetRef = useRef<Position | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startScale: number } | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);

  // Scaled (on-screen) dimensions — base size × the user's expand factor.
  const scaledWidth = Math.round(width * scale);
  const scaledHeight = Math.round(height * scale);

  // Hydrate position from localStorage; SSR-safe via mounted gate.
  useEffect(() => {
    setMounted(true);
    setScale(readScale(storageKey));
    const stored = readPosition(storageKey);
    if (stored) {
      setPosition(clampToViewport(stored, width, height));
    } else {
      // Default: top-right with a comfortable inset.
      setPosition({
        x: Math.max(24, window.innerWidth - width - 32),
        y: 80,
      });
    }
  }, [storageKey, width, height]);

  // Re-clamp on window resize so the modal can't end up off-screen.
  useEffect(() => {
    if (!open) return;
    function onResize() {
      setPosition(prev => clampToViewport(prev, width, height));
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, width, height]);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!frameRef.current) return;
    // Ignore drags on the close button etc.
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-drag]')) return;
    const rect = frameRef.current.getBoundingClientRect();
    dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragOffsetRef.current) return;
    e.preventDefault();
    const newPos = clampToViewport({
      x: e.clientX - dragOffsetRef.current.x,
      y: e.clientY - dragOffsetRef.current.y,
    }, scaledWidth, scaledHeight);
    setPosition(newPos);
  }, [scaledWidth, scaledHeight]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragOffsetRef.current) return;
    dragOffsetRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    setPosition(prev => {
      writePosition(storageKey, prev);
      return prev;
    });
  }, [storageKey]);

  // ── Resize (corner handle) — adjusts the proportional scale factor ──
  const onResizeDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startScale: scale };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [scale]);

  const onResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const r = resizeRef.current;
    if (!r) return;
    e.preventDefault();
    // Drive scale by the diagonal drag so width + height grow together,
    // keeping the model's aspect ratio exactly.
    const dx = e.clientX - r.startX;
    const dy = e.clientY - r.startY;
    const delta = (dx / width + dy / height) / 2;
    setScale(clamp(r.startScale + delta, MIN_SCALE, MAX_SCALE));
  }, [width, height]);

  const onResizeUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    setScale(prev => {
      writeScale(storageKey, prev);
      setPosition(p => clampToViewport(p, width * prev, height * prev));
      return prev;
    });
  }, [storageKey, width, height]);

  if (!mounted || !open) return null;

  const node = (
    <div
      ref={frameRef}
      className="calc-modal"
      role="dialog"
      aria-label={title}
      style={{
        left: position.x,
        top: position.y,
        width: scaledWidth,
      }}
    >
      <div
        className="calc-modal__header"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ touchAction: 'none' }}
      >
        <span className="calc-modal__title">{title}</span>
        <div className="calc-modal__actions">
          {onClearState && (
            <button
              type="button"
              className="calc-modal__btn"
              data-no-drag
              onClick={onClearState}
              title="Clear saved state for this calculator"
              aria-label="Clear saved state"
            >
              ⟲
            </button>
          )}
          <button
            type="button"
            className="calc-modal__btn calc-modal__btn--close"
            data-no-drag
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>
      {toolbar && <div className="calc-modal__toolbar">{toolbar}</div>}
      {/* cad-trv-fidelity Slice 14b — the body is sized to the SCALED
          dimensions; the inner wrapper renders each calculator at its
          natural base size and is transform-scaled to fill, so every
          model grows proportionally with no layout breakage. */}
      <div className="calc-modal__body" style={{ width: scaledWidth, height: scaledHeight, overflow: 'hidden' }}>
        <div
          className="calc-modal__scaler"
          style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        >
          {children}
        </div>
      </div>
      {/* Resize handle (bottom-right corner) — drag to expand. */}
      <div
        className="calc-modal__resize"
        data-no-drag
        data-testid="calc-modal-resize"
        title="Drag to resize"
        aria-label="Resize calculator"
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onPointerCancel={onResizeUp}
        style={{ touchAction: 'none' }}
      />
    </div>
  );

  return createPortal(node, document.body);
}

function clampToViewport(pos: Position, width: number, height: number): Position {
  if (typeof window === 'undefined') return pos;
  // Keep at least 40px of the header visible so the user can always grab it.
  const maxX = window.innerWidth - 40;
  const maxY = window.innerHeight - 40;
  const minX = 40 - width;
  const minY = 0;
  return {
    x: clamp(pos.x, minX, maxX),
    y: clamp(pos.y, minY, maxY),
  };
}
