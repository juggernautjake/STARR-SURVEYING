// app/admin/receipts/ReceiptImageStage.tsx — slice V2 of
// docs/planning/in-progress/RECEIPT_REVIEW_SLIDESHOW_2026-08-14.md
//
// Owner: *"make it so that we can zoom in on the receipts to review the information and pan around
// on the image."*
//
// ── ONE POINTER PATH, NOT A MOUSE PATH AND A TOUCH PATH ─────────────────────────────────────────
//
// Pointer Events cover mouse, finger, trackpad and stylus with the same handlers. Writing
// `mousedown` + `touchstart` separately is how a viewer works at the desk and not on the truck, and
// the existing precedent in this repo (`SourceDocumentViewer`) is mouse-only for exactly that
// reason.
//
// `setPointerCapture` is the load-bearing detail: without it a drag ends the instant the pointer
// leaves the image, which feels like the receipt is stuck to the edge of the frame.
//
// ── THE WHEEL LISTENER CANNOT BE A REACT PROP ───────────────────────────────────────────────────
//
// React attaches `onWheel` passively, so `preventDefault()` inside it is ignored and the browser
// scrolls the page behind the overlay while you are trying to zoom. It has to be a manual
// `addEventListener('wheel', …, { passive: false })`.
//
// All the arithmetic lives in `lib/receipts/zoom-pan.ts`, tested without a DOM. This file is
// gestures and refs.
'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2, RotateCw, ImageOff, Loader2 } from 'lucide-react';
import {
  IDENTITY, MIN_ZOOM, MAX_ZOOM, clampTransform, isPannable, panBy, pinchDistance, pinchMidpoint,
  toCssTransform, toggleZoom, zoomAbout, zoomStep, type Transform, type Viewport,
} from '@/lib/receipts/zoom-pan';

interface Props {
  /** Signed URL. Null when signing failed — rendered as an explanation, not a broken image. */
  src: string | null;
  alt: string;
  /** Bumping this resets zoom and rotation. Inheriting the previous receipt's 4× zoom on a
   *  differently-sized photo lands the reader in the middle of nowhere. */
  resetKey: string;
  /** Asked for a fresh signed URL when the current one has expired. Signed URLs live 15 minutes and
   *  a review session does not — see D3 in the plan. */
  onNeedsFreshUrl?: () => void;
}

export default function ReceiptImageStage({ src, alt, resetKey, onNeedsFreshUrl }: Props) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [transform, setTransform] = useState<Transform>(IDENTITY);
  const [rotation, setRotation] = useState(0);
  const [viewport, setViewport] = useState<Viewport>({ frameW: 0, frameH: 0, imageW: 0, imageH: 0 });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [dragging, setDragging] = useState(false);

  /** Live pointers, by id. Two of them means a pinch. A ref, not state: these change many times per
   *  frame and re-rendering on each one drops the gesture's frame rate. */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);
  const lastPan = useRef<{ x: number; y: number } | null>(null);
  /** One retry per receipt, so an image that is genuinely gone does not loop forever asking for a
   *  URL that will not help. */
  const retried = useRef(false);

  // ── reset on receipt change ──
  useEffect(() => {
    setTransform(IDENTITY);
    setRotation(0);
    setStatus(src ? 'loading' : 'error');
    retried.current = false;
  }, [resetKey, src]);

  // ── measure the frame ──
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setViewport((v) => ({ ...v, frameW: r.width, frameH: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-clamp when the frame changes size — rotating a phone at 6× zoom otherwise leaves the image
  // parked outside its new bounds, showing an empty frame.
  useEffect(() => {
    setTransform((t) => clampTransform(viewport, t));
  }, [viewport]);

  /** Pointer position relative to the frame's CENTRE, which is the coordinate space `zoomAbout`
   *  works in. Getting this wrong is what makes zoom drift away from the cursor. */
  const toFocus = useCallback((clientX: number, clientY: number) => {
    const el = stageRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: clientX - (r.left + r.width / 2), y: clientY - (r.top + r.height / 2) };
  }, []);

  // ── wheel: zoom about the cursor ──
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Always prevented, even at min zoom: otherwise a scroll gesture over the image scrolls the
      // page behind the overlay, which looks like the viewer has lost focus.
      e.preventDefault();
      // A trackpad pinch arrives as a wheel event with ctrlKey set. Treating it as a notch gives
      // pinch-to-zoom on a laptop for free.
      const focus = toFocus(e.clientX, e.clientY);
      const magnitude = Math.min(Math.abs(e.deltaY) / 100, 3) || 1;
      setTransform((t) => {
        const factor = 1 + 0.18 * magnitude;
        const next = e.deltaY < 0 ? t.zoom * factor : t.zoom / factor;
        return zoomAbout(viewport, t, next, focus);
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [viewport, toFocus]);

  // ── pointer down / move / up ──
  const onPointerDown = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    el.setPointerCapture?.(e.pointerId);

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = { distance: pinchDistance(a!, b!), zoom: transform.zoom };
      lastPan.current = null;
      setDragging(false);
      return;
    }
    if (isPannable(viewport, transform.zoom)) {
      lastPan.current = { x: e.clientX, y: e.clientY };
      setDragging(true);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size >= 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = pinchDistance(a!, b!);
      // A zero starting distance means both pointers landed on the same coordinate; dividing by it
      // yields Infinity, which `clamp` now absorbs, but skipping is cheaper and honest.
      if (pinchStart.current.distance > 0) {
        const mid = pinchMidpoint(a!, b!);
        const focus = toFocus(mid.x, mid.y);
        const ratio = distance / pinchStart.current.distance;
        const target = pinchStart.current.zoom * ratio;
        setTransform((t) => zoomAbout(viewport, t, target, focus));
      }
      return;
    }

    if (!lastPan.current) return;
    const dx = e.clientX - lastPan.current.x;
    const dy = e.clientY - lastPan.current.y;
    lastPan.current = { x: e.clientX, y: e.clientY };
    setTransform((t) => panBy(viewport, t, dx, dy));
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) {
      lastPan.current = null;
      setDragging(false);
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    setTransform((t) => toggleZoom(viewport, t, toFocus(e.clientX, e.clientY)));
  };

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setViewport((v) => ({ ...v, imageW: img.naturalWidth, imageH: img.naturalHeight }));
    setStatus('ready');
  };

  const onImageError = () => {
    // D3: a signed URL lives 15 minutes and a review session does not. The first failure asks for a
    // fresh one; a second means the object is genuinely missing.
    if (!retried.current && onNeedsFreshUrl) {
      retried.current = true;
      onNeedsFreshUrl();
      return;
    }
    setStatus('error');
  };

  const pannable = isPannable(viewport, transform.zoom);
  const zoomPct = Math.round(transform.zoom * 100);

  return (
    <div
      className="rcv__stage"
      ref={stageRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onDoubleClick={onDoubleClick}
    >
      {!src && (
        <div className="rcv__stageEmpty">
          <ImageOff size={22} aria-hidden />
          <span>
            This receipt has no readable photo. The row still holds everything the AI extracted —
            the image itself could not be signed for viewing.
          </span>
        </div>
      )}

      {src && status === 'error' && (
        <div className="rcv__stageEmpty">
          <ImageOff size={22} aria-hidden />
          <span>The photo could not be loaded. It may have been removed from storage.</span>
        </div>
      )}

      {src && status === 'loading' && (
        <div className="rcv__stageEmpty">
          <Loader2 size={20} className="rcv__spin" aria-hidden />
          <span>Loading…</span>
        </div>
      )}

      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- a signed, expiring URL to a private
        // bucket cannot go through the Next image optimiser, which would need to fetch and cache it.
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className={`rcv__img ${pannable ? (dragging ? 'rcv__img--grabbing' : 'rcv__img--grab') : ''}`}
          style={{
            transform: `${toCssTransform(transform)} rotate(${rotation}deg)`,
            visibility: status === 'ready' ? 'visible' : 'hidden',
          }}
          onLoad={onImageLoad}
          onError={onImageError}
          draggable={false}
        />
      )}

      {src && status === 'ready' && (
        <div className="rcv__zoomBar" role="group" aria-label="Zoom">
          <button
            type="button" className="rcv__zoomBtn" title="Zoom out"
            aria-label="Zoom out"
            disabled={transform.zoom <= MIN_ZOOM + 0.001}
            onClick={() => setTransform((t) => zoomStep(viewport, t, -1))}
          >
            <ZoomOut size={16} />
          </button>
          <span className="rcv__zoomLevel" aria-live="polite">{zoomPct}%</span>
          <button
            type="button" className="rcv__zoomBtn" title="Zoom in"
            aria-label="Zoom in"
            disabled={transform.zoom >= MAX_ZOOM - 0.001}
            onClick={() => setTransform((t) => zoomStep(viewport, t, 1))}
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button" className="rcv__zoomBtn" title="Fit to window"
            aria-label="Fit to window"
            disabled={transform.zoom <= MIN_ZOOM + 0.001 && rotation === 0}
            onClick={() => { setTransform(IDENTITY); setRotation(0); }}
          >
            <Maximize2 size={16} />
          </button>
          <button
            type="button" className="rcv__zoomBtn" title="Rotate 90°"
            aria-label="Rotate 90 degrees"
            onClick={() => setRotation((r) => (r + 90) % 360)}
          >
            <RotateCw size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
