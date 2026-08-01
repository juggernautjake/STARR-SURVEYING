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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  clamp, clampViewport, fitScale, fitViewport, isVisible, lodFor, minSpacing, panBy, scaleLimits,
  transformOf, visibleNearest, zoomAt, type Bounds, type Lod, type Viewport,
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
  /**
   * The map's drill-down markers, in world coordinates. Feeds BOTH M3-3's level of detail and M3-4's
   * prefetch, which is why it is one prop rather than two: the tier is decided by how close together
   * these are on screen, and the warming by which of them the reader has centred. Two lists could
   * disagree about where a pin is, and the symptom would be a label hidden for a pin that is nowhere
   * near the one it supposedly collides with.
   *
   * PLAIN DATA, not a callback, and that is what makes the feature possible at all: the surface that
   * knows where the pins are is a SERVER component, so it can hand over `{href, x, y}` but cannot hand
   * over a function. The viewport is the only piece that knows where the reader is looking, so both
   * decisions have to live here.
   *
   * `href` is optional — a pin marked but not yet built has nowhere to go, and it still takes up the
   * space that decides whether its neighbours can be labelled.
   */
  markers?: readonly { href?: string; x: number; y: number }[];
}

const DEFAULT_BOUNDS: Bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
/** One wheel notch. Small enough that a trackpad's many small deltas feel continuous. */
const WHEEL_STEP = 1.0015;

/**
 * M3-4's "small cache", and both halves of it are load-bearing.
 *
 * `PREFETCH_NEAREST` is how many destinations one settled view warms — the reader is going to open ONE
 * of them, so warming the three nearest the centre covers the realistic choice without spending a
 * phone's bandwidth on a whole city. `PREFETCH_MAX` is the lifetime ceiling for the mount: panning
 * across forty pins would otherwise walk the cache up to forty entries three at a time, which is the
 * unbounded prefetch this constant exists to prevent, arrived at slowly instead of all at once.
 */
const PREFETCH_NEAREST = 3;
const PREFETCH_MAX = 24;
/** Warm what the reader STOPPED on. Prefetching mid-drag warms everything the map slid past. */
const PREFETCH_SETTLE_MS = 300;

export default function MapViewport({
  bounds = DEFAULT_BOUNDS,
  children,
  onLodChange,
  className,
  style,
  label = 'Map',
  markers,
}: MapViewportProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
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

  // How far in and out this node may go, in THIS frame. Derived rather than constant — see `MIN_ZOOM`
  // in the maths module for what the constant version actually did: capped a battle map at 1.3× because
  // "8" meant eight pixels per world unit and the whole map already fit at six.
  //
  // Memoised on the NUMBERS, not on `bounds`: the caller writes `bounds={{...}}` inline, so the object
  // is new on every render and a dependency on it would re-register the wheel listener every frame.
  const limits = useMemo(
    () => scaleLimits(bounds, frame),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, frame.width, frame.height],
  );

  // Derived, not stored: one source for the attribute below and the callback, so the two cannot disagree
  // about what zoom the reader is at.
  // M3-3 — measured against what is ON SCREEN, not against the whole map: panning a dense quarter of a
  // city out of view is exactly when its neighbours have room for their names again.
  const onScreen = markers?.length
    ? markers.filter((m) => isVisible(vp, frame, { x: m.x, y: m.y, w: 0, h: 0 }))
    : [];
  const lod = lodFor({
    scale: vp.scale,
    fitScale: fitScale(bounds, frame),
    minSpacingPx: minSpacing(onScreen, vp.scale),
  });
  useEffect(() => { onLodChange?.(lod); }, [lod, onLodChange]);

  // ── M3-4 · warm the level the reader is about to open ─────────────────────────────────────────────
  //
  // The plan says "on pin hover/focus", and hover is exactly the signal a tablet does not have — G5 says
  // mobile is a first-class target, so a prefetch that only fires for a mouse is a prefetch that misses
  // half the table. **Where the reader has centred the map is the touch equivalent of hover**, and it is
  // available on every device.
  //
  // Deliberately NOT `<Link prefetch>` on the pins themselves. This route is dynamic (`?node=`), so an
  // eager Link prefetches the full RSC payload the moment it scrolls into view — forty pins, forty
  // requests, to make one of them fast.
  const warmed = useRef(new Set<string>());
  useEffect(() => {
    if (!markers?.length || !frame.width) return;
    const t = setTimeout(() => {
      // Only the ones that GO somewhere. A pin marked but not built has nothing to warm, and it must
      // not consume one of the three slots the reader's real choices are competing for.
      const destinations = markers.filter((m): m is { href: string; x: number; y: number } => Boolean(m.href));
      for (const p of visibleNearest(destinations, vp, frame, PREFETCH_NEAREST)) {
        if (warmed.current.size >= PREFETCH_MAX || warmed.current.has(p.href)) continue;
        warmed.current.add(p.href);
        router.prefetch(p.href);
      }
    }, PREFETCH_SETTLE_MS);
    return () => clearTimeout(t);
  }, [markers, vp, frame, router]);

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
      apply(zoomAt(vp, frame, Math.pow(WHEEL_STEP, -e.deltaY), e.clientX - r.left, e.clientY - r.top, limits));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [vp, frame, apply, limits]);

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
      apply(zoomAt(vp, frame, factor, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, limits));
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
      '+':        () => apply(zoomAt(vp, frame, 1.25, mid.sx, mid.sy, limits)),
      '=':        () => apply(zoomAt(vp, frame, 1.25, mid.sx, mid.sy, limits)),
      '-':        () => apply(zoomAt(vp, frame, 0.8, mid.sx, mid.sy, limits)),
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
            onClick={() => apply(zoomAt(vp, frame, factor, frame.width / 2, frame.height / 2, limits))}
            disabled={factor > 1 ? vp.scale >= limits.max : vp.scale <= limits.min}
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
