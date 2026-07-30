'use client';
// app/dnd/_ui/maps/MapViewport.tsx — pan and zoom (M3-1).
//
// The maths lives in `lib/dnd/maps/viewport.ts` and is covered by 25 tests; this file is the event plumbing
// around it. That split is deliberate: the bugs worth catching in a viewport are arithmetic ("the map slides
// away from my cursor"), and those are assertable in a millisecond, whereas the plumbing is only checkable
// by driving a browser.
//
// POINTER EVENTS ONLY — never mouse* or touch*. One code path for mouse, touch and pen means a tablet works
// on day one instead of being retrofitted, which is the lesson P7-2 recorded from the superseded battle-map
// plan and the reason G5 says mobile is a first-class target rather than a later pass.
//
// TRANSFORM, NOT LAYOUT. The world layer moves via a single `transform`, so the browser composites one
// element per frame instead of relaying out every child. `will-change` is set only while a gesture is
// active — leaving it on permanently keeps a layer promoted forever and costs memory on exactly the
// low-end phones G5 is about.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  MAX_SCALE, MIN_SCALE, clamp, clampViewport, fitViewport, lodFor, panBy, transformOf, zoomAt,
  type Bounds, type Lod, type Viewport,
} from '@/lib/dnd/maps/viewport';

interface MapViewportProps {
  bounds?: Bounds;
  /** Rendered inside the transformed world layer, positioned in world units. */
  children: React.ReactNode;
  /** Told the current level of detail, so callers can thin what they draw (M3-3). */
  onLodChange?: (lod: Lod) => void;
  className?: string;
  /** Merged over the frame's own styles — the caller owns its size (aspect ratio, height), the viewport
   *  owns its behaviour (overflow, touch-action, cursor). Those must not be overridable by accident, so
   *  they are applied AFTER this. */
  style?: React.CSSProperties;
  /** Accessible name — a viewport with no label is an unlabelled application region to a screen reader. */
  label?: string;
}

const DEFAULT_BOUNDS: Bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
/** One wheel notch. Small enough that a trackpad's many small deltas feel continuous. */
const WHEEL_STEP = 1.0015;

export default function MapViewport({
  bounds = DEFAULT_BOUNDS,
  children,
  onLodChange,
  className,
  style,
  label = 'Map',
}: MapViewportProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [vp, setVp] = useState<Viewport>({ x: 50, y: 50, scale: 1 });
  const [gesturing, setGesturing] = useState(false);

  // Live pointers, keyed by pointerId. Two of them means a pinch; one means a drag. Keeping them in a ref
  // rather than state is what stops a re-render per pointermove.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);
  const fitted = useRef(false);

  // Measure the frame. ResizeObserver rather than a window listener: the roller and the sheet can resize
  // this element without the window changing at all.
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setFrame({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit once, when the frame is first measured. Re-fitting on every resize would yank the map out from
  // under someone who had zoomed in and then rotated their phone.
  useEffect(() => {
    if (fitted.current || frame.width === 0 || frame.height === 0) return;
    fitted.current = true;
    setVp(fitViewport(bounds, frame));
  }, [frame, bounds]);

  // Derived, not stored: one source for the attribute below and the callback, so the two cannot disagree
  // about what zoom the reader is at.
  const lod = lodFor(vp.scale);
  useEffect(() => { onLodChange?.(lod); }, [lod, onLodChange]);

  const apply = useCallback(
    (next: Viewport) => setVp(frame.width ? clampViewport(next, bounds, frame) : next),
    [bounds, frame],
  );

  // ── wheel ─────────────────────────────────────────────────────────────────────────────────────
  //
  // Registered manually with `{ passive: false }`. React's onWheel is passive, so `preventDefault()` there
  // is ignored and the PAGE scrolls while the map zooms — the single most common way an embedded map
  // fights its host page.
  useEffect(() => {
    const el = frameRef.current;
    if (!el || !frame.width) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      apply(zoomAt(vp, frame, Math.pow(WHEEL_STEP, -e.deltaY), e.clientX - r.left, e.clientY - r.top));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [vp, frame, apply]);

  // ── pointers ──────────────────────────────────────────────────────────────────────────────────
  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Capture, so a drag that leaves the element still gets its moves and its up. Without it a fast drag
    // off the edge leaves the map stuck mid-gesture.
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) pinchStart.current = { dist: dist(), scale: vp.scale };
    setGesturing(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const el = frameRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const [a, b] = [...pointers.current.values()];
      // Zoom about the midpoint between the fingers — the same "hold the focal point still" rule as the
      // wheel, which is what makes a pinch feel like it is pulling the map rather than sliding it.
      const factor = clamp(dist() / pinchStart.current.dist, 0.02, 50) * (pinchStart.current.scale / vp.scale);
      apply(zoomAt(vp, frame, factor, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top));
      return;
    }

    if (pointers.current.size === 1) apply(panBy(vp, e.clientX - prev.x, e.clientY - prev.y));
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) setGesturing(false);
  };

  const fit = useCallback(() => { if (frame.width) setVp(fitViewport(bounds, frame)); }, [bounds, frame]);

  // ── keyboard ──────────────────────────────────────────────────────────────────────────────────
  // A map reachable only by dragging is a map some people cannot use at all.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = 40;
    const mid = { sx: frame.width / 2, sy: frame.height / 2 };
    const moves: Record<string, () => void> = {
      ArrowLeft:  () => apply(panBy(vp, step, 0)),
      ArrowRight: () => apply(panBy(vp, -step, 0)),
      ArrowUp:    () => apply(panBy(vp, 0, step)),
      ArrowDown:  () => apply(panBy(vp, 0, -step)),
      '+':        () => apply(zoomAt(vp, frame, 1.25, mid.sx, mid.sy)),
      '=':        () => apply(zoomAt(vp, frame, 1.25, mid.sx, mid.sy)),
      '-':        () => apply(zoomAt(vp, frame, 0.8, mid.sx, mid.sy)),
      '0':        fit,
    };
    const fn = moves[e.key];
    if (fn) { e.preventDefault(); fn(); }
  };

  return (
    <div
      ref={frameRef}
      className={className}
      role="application"
      aria-label={`${label} — drag to pan, scroll to zoom, 0 to fit`}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onDoubleClick={fit}
      onKeyDown={onKeyDown}
      style={{
        // Caller's sizing first; the viewport's own behavioural styles below are not overridable by
        // accident — a caller that unset `touch-action` would silently break pinch-zoom on every phone.
        ...style,
        position: 'relative',
        overflow: 'hidden',
        // The browser must not claim the gesture for scrolling before we see it.
        touchAction: 'none',
        cursor: gesturing ? 'grabbing' : 'grab',
        outlineOffset: 2,
      }}
    >
      <div
        // M3-3 — THE LEVEL OF DETAIL, PUBLISHED THE SAME WAY THE SCALE IS.
        //
        // `lodFor` and `onLodChange` were built with M3-1 and had no consumer: the value was computed
        // every frame and handed to a callback nobody passed. The reason is structural rather than
        // forgetful — the surface that draws pins (the campaign world page) is a SERVER component, so it
        // cannot hold the state a React callback would deliver into.
        //
        // So the LOD travels as a data attribute for exactly the reason `--map-scale` travels as a CSS
        // variable, one comment down: a server-rendered child can respond to it in CSS without becoming a
        // client component. `onLodChange` stays for callers that genuinely are client components and want
        // to thin what they RENDER rather than what they show.
        data-lod={lod}
        style={{
          position: 'absolute',
          inset: 0,
          transform: frame.width ? transformOf(vp, frame) : undefined,
          transformOrigin: '0 0',
          // Only while gesturing — a permanently promoted layer costs memory on the phones G5 is about.
          willChange: gesturing ? 'transform' : undefined,
          // PUBLISHED FOR CHILDREN THAT MUST NOT SCALE. A pin or a label inside this layer inherits the
          // zoom and would balloon as the reader zooms in; counter-scaling by `1 / var(--map-scale)` keeps
          // it a constant size on screen. Exposed as a CSS variable rather than a React prop so a purely
          // server-rendered child (the world page's pins) can use it without becoming a client component.
          ['--map-scale' as string]: String(vp.scale),
        }}
      >
        {children}
      </div>

      <div style={{ position: 'absolute', right: 8, bottom: 8, display: 'flex', gap: 6 }}>
        {([['−', 0.8, 'Zoom out'], ['+', 1.25, 'Zoom in']] as const).map(([glyph, factor, title]) => (
          <button
            key={glyph}
            type="button"
            title={title}
            aria-label={title}
            onClick={() => apply(zoomAt(vp, frame, factor, frame.width / 2, frame.height / 2))}
            disabled={factor > 1 ? vp.scale >= MAX_SCALE : vp.scale <= MIN_SCALE}
            // 44px, the G5 touch minimum, rather than a dainty 24px chevron.
            style={{
              width: 44, height: 44, borderRadius: 8, cursor: 'pointer', fontSize: 18,
              border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.72)',
              color: 'var(--hx-text)',
            }}
          >
            {glyph}
          </button>
        ))}
      </div>
    </div>
  );
}
