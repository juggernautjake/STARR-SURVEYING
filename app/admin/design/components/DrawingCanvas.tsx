'use client';
// app/admin/design/components/DrawingCanvas.tsx — the sketch layer on the artboard.
//
// Phase D of docs/planning/completed/DESIGN_STUDIO_QUALITY_2026-08-23.md.
// The geometry and the fill algorithm live in `lib/design/drawing.ts` and are tested there; this
// file owns the canvas element, the pointer events, and nothing else worth arguing about.
//
// ── TWO CANVASES, NOT ONE ───────────────────────────────────────────────────────────────────────
//
// Dragging out a rectangle has to show the rectangle following the cursor. Drawing that preview
// onto the real canvas would mean erasing and repainting the whole drawing on every pointermove —
// at which point a long stroke over a busy sketch drops frames, and any mistake in the repaint
// destroys work that was already committed.
//
// So there is a COMMITTED canvas that only ever receives finished strokes, and a PREVIEW canvas on
// top of it that is cleared and redrawn freely. Freehand is the exception: it draws directly to the
// committed canvas as it goes, because a freehand stroke has no "preview" state — the line you have
// already drawn is the line.
//
// ── DEVICE PIXELS ───────────────────────────────────────────────────────────────────────────────
//
// The canvas is sized in artboard pixels but backed at `devicePixelRatio`, or every line is soft on
// a retina screen and the exported PNG looks like a photograph of a drawing. All coordinates coming
// from pointer events are converted through the element's own bounding box, which accounts for the
// artboard's zoom without this file needing to know what the zoom is.

import { useCallback, useEffect, useRef } from 'react';
import {
  type DrawTool, type DrawStyle, type Point,
  dragRect, constrainLine, simplify, floodFill, parseFillColour,
  roundedRectPath, isBoxTool, alwaysConstrained, isRounded,
} from '@/lib/design/drawing';

interface Props {
  width: number;
  height: number;
  /** The committed drawing, as a PNG data URL. Null when nothing has been drawn yet. */
  value: string | null;
  tool: DrawTool;
  style: DrawStyle;
  /** False when the pointer belongs to the element canvas rather than to drawing. */
  active: boolean;
  /** Called once per finished gesture with the new drawing. One call = one undo step. */
  onCommit: (dataUrl: string) => void;
  /** Called when a gesture starts, so the studio can snapshot for undo before anything changes. */
  onGestureStart: () => void;
  /** Placing text: the studio owns the prompt, this reports where. */
  onPlaceText: (at: Point) => void;
}

export default function DrawingCanvas({
  width, height, value, tool, style, active, onCommit, onGestureStart, onPlaceText,
}: Props) {
  const committedRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef<{ from: Point; points: Point[]; shift: boolean } | null>(null);
  /** What `value` was when we last painted it, so an echo of our own commit does not reload. */
  const painted = useRef<string | null>(null);

  const dpr = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 3);

  /** Set a canvas's backing store to the artboard size at device resolution. */
  const size = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return null;
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d');
    if (ctx) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; }
    return ctx;
  }, [width, height, dpr]);

  // Load the saved drawing whenever it changes from the outside (opening a design, undo, redo).
  useEffect(() => {
    const canvas = committedRef.current;
    const ctx = size(canvas);
    if (!canvas || !ctx) return;
    if (value === painted.current) return;
    painted.current = value;

    ctx.clearRect(0, 0, width, height);
    if (!value) return;
    const img = new Image();
    img.onload = () => {
      const c = size(committedRef.current);
      if (c) c.drawImage(img, 0, 0, width, height);
    };
    img.src = value;
  }, [value, width, height, size]);

  useEffect(() => { size(previewRef.current); }, [size]);

  const pointFrom = (e: React.PointerEvent): Point => {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Divide by the rendered/backing ratio so the artboard's zoom is handled without knowing it.
    return {
      x: ((e.clientX - box.left) / box.width) * width,
      y: ((e.clientY - box.top) / box.height) * height,
    };
  };

  const commit = () => {
    const canvas = committedRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    painted.current = url;
    onCommit(url);
  };

  const strokeStyleOn = (ctx: CanvasRenderingContext2D) => {
    ctx.strokeStyle = style.colour;
    ctx.fillStyle = style.fill ?? style.colour;
    ctx.lineWidth = style.width;
  };

  /** Draw the current shape onto a context — used for both the preview and the commit. */
  const paintShape = (ctx: CanvasRenderingContext2D, from: Point, to: Point, shift: boolean) => {
    strokeStyleOn(ctx);
    if (tool === 'line') {
      const end = constrainLine(from, to, shift);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      return;
    }
    const r = dragRect(from, to, shift || alwaysConstrained(tool));
    if (r.w < 1 || r.h < 1) return;

    if (tool === 'ellipse' || tool === 'circle') {
      ctx.beginPath();
      ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
    } else if (isRounded(tool)) {
      roundedRectPath(ctx, r.x, r.y, r.w, r.h, style.radius);
    } else {
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
    }
    if (style.fill) ctx.fill();
    ctx.stroke();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!active) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const at = pointFrom(e);

    if (tool === 'text') { onPlaceText(at); return; }

    if (tool === 'fill') {
      const ctx = size(committedRef.current);
      if (!ctx) return;
      onGestureStart();
      const image = ctx.getImageData(0, 0, Math.round(width * dpr), Math.round(height * dpr));
      floodFill(
        image.data, image.width, image.height,
        at.x * dpr, at.y * dpr,
        parseFillColour(style.fill ?? style.colour),
      );
      ctx.putImageData(image, 0, 0);
      commit();
      return;
    }

    onGestureStart();
    drawing.current = { from: at, points: [at], shift: e.shiftKey };

    if (tool === 'freehand' || tool === 'eraser') {
      const ctx = size(committedRef.current);
      if (!ctx) return;
      strokeStyleOn(ctx);
      // The eraser is destination-out rather than a white brush: white would paint over the page
      // behind the drawing instead of revealing it.
      ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.beginPath();
      ctx.moveTo(at.x, at.y);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const state = drawing.current;
    if (!active || !state) return;
    const at = pointFrom(e);
    state.points.push(at);
    state.shift = e.shiftKey;

    if (tool === 'freehand' || tool === 'eraser') {
      const ctx = committedRef.current?.getContext('2d');
      if (!ctx) return;
      ctx.lineTo(at.x, at.y);
      ctx.stroke();
      return;
    }

    const preview = size(previewRef.current);
    if (!preview) return;
    preview.clearRect(0, 0, width, height);
    paintShape(preview, state.from, at, state.shift);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const state = drawing.current;
    if (!state) return;
    drawing.current = null;
    const at = pointFrom(e);

    const ctx = size(committedRef.current);
    const preview = size(previewRef.current);
    preview?.clearRect(0, 0, width, height);
    if (!ctx) return;

    if (tool === 'freehand' || tool === 'eraser') {
      ctx.globalCompositeOperation = 'source-over';
      // `simplify` is not applied to the painted pixels — they are already drawn — it is here as
      // the shape a future vector export would use. Kept deliberately: the stroke is committed.
      void simplify(state.points);
    } else {
      paintShape(ctx, state.from, at, state.shift);
    }
    commit();
  };

  return (
    <div
      className={`dsx-draw${active ? ' is-active' : ''}`}
      style={{ width, height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      data-testid="ds-drawing-layer"
    >
      <canvas ref={committedRef} className="dsx-draw__canvas" style={{ width, height }} />
      <canvas ref={previewRef} className="dsx-draw__canvas dsx-draw__canvas--preview" style={{ width, height }} />
    </div>
  );
}
