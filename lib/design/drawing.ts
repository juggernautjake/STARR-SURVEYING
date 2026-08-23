// lib/design/drawing.ts — the sketch layer: freehand, shapes, and a fill bucket.
//
// Phase D of docs/planning/in-progress/DESIGN_STUDIO_QUALITY_2026-08-23.md.
//
// Owner: *"a simple drawing tool that I can use to draw straight lines, free hand, circles, ovals,
// squares with sharp and rounded corners, rectangles with sharp and rounded corners… a fill bucket
// to fill in spaces that I have drawn that are closed drawings… control line width and color."*
//
// ── WHY THIS IS RASTER WHEN EVERYTHING ELSE IN THE STUDIO IS NOT ────────────────────────────────
//
// The catalogue's shapes are vector elements: each is a box with its own fill, movable and editable
// forever. That is the right model for a rectangle you place deliberately.
//
// It is the wrong model for a FILL BUCKET. "Fill the space I have drawn, if it is closed" is a
// question about REGIONS — about what three overlapping freehand strokes happen to enclose — and
// vector shapes cannot answer it, because there is no object corresponding to the enclosed area.
// Flood fill is a pixel algorithm and needs pixels.
//
// So the sketch layer is a canvas. The trade is real and worth stating: a stroke cannot be selected
// and moved after you draw it. That is what "a simple drawing tool" means everywhere else it exists
// — Paint, Preview, a whiteboard — and it is the price of the bucket.
//
// ── WHAT LIVES HERE AND WHAT LIVES IN THE COMPONENT ─────────────────────────────────────────────
//
// Everything in this file is pure: geometry, the flood fill, and the stroke model. The component
// owns the canvas element and the pointer events. That split is what lets the fill algorithm — the
// part with an actual bug surface — be tested without a browser.

export type DrawTool =
  | 'freehand' | 'line' | 'rect' | 'rounded-rect' | 'square' | 'rounded-square'
  | 'ellipse' | 'circle' | 'fill' | 'eraser' | 'text';

export interface DrawStyle {
  colour: string;
  width: number;
  /** Corner radius for the rounded variants, in px. */
  radius: number;
  /** Shapes are outlines unless this is set — the bucket is the other way to fill one. */
  fill: string | null;
}

export const DEFAULT_DRAW_STYLE: DrawStyle = {
  colour: '#1D3095',
  width: 3,
  radius: 12,
  fill: null,
};

/** The line widths offered. Under 1 is invisible on export; over 24 is a fill with extra steps. */
export const LINE_WIDTHS = [1, 2, 3, 5, 8, 12, 16, 24];

export interface Point { x: number; y: number }

/**
 * A shape being dragged out, resolved to the rectangle it covers.
 *
 * `constrain` is Shift: a rectangle becomes a square and an ellipse becomes a circle, both measured
 * from the corner you started at, so the shape stays under the cursor rather than jumping.
 */
export function dragRect(from: Point, to: Point, constrain: boolean): { x: number; y: number; w: number; h: number } {
  let dx = to.x - from.x;
  let dy = to.y - from.y;
  if (constrain) {
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * size;
    dy = Math.sign(dy || 1) * size;
  }
  return {
    x: Math.min(from.x, from.x + dx),
    y: Math.min(from.y, from.y + dy),
    w: Math.abs(dx),
    h: Math.abs(dy),
  };
}

/** A straight line, snapped to 45° steps while Shift is held. */
export function constrainLine(from: Point, to: Point, constrain: boolean): Point {
  if (!constrain) return to;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const length = Math.hypot(dx, dy);
  return { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length };
}

/**
 * Thin a freehand stroke without changing its shape.
 *
 * A pointer emits a point every few milliseconds; a two-second scribble is hundreds of points, and
 * storing them all makes the saved document enormous for no visible gain. Ramer–Douglas–Peucker
 * drops the points that sit within `epsilon` of the line their neighbours already describe.
 */
export function simplify(points: Point[], epsilon = 1): Point[] {
  if (points.length < 3) return points;

  const distanceToSegment = (p: Point, a: Point, b: Point): number => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };

  let worst = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = distanceToSegment(points[i], points[0], points[points.length - 1]);
    if (d > worst) { worst = d; index = i; }
  }

  if (worst <= epsilon) return [points[0], points[points.length - 1]];
  return [
    ...simplify(points.slice(0, index + 1), epsilon).slice(0, -1),
    ...simplify(points.slice(index), epsilon),
  ];
}

// ── THE FILL BUCKET ─────────────────────────────────────────────────────────────────────────────

export interface Rgba { r: number; g: number; b: number; a: number }

export function parseFillColour(css: string): Rgba {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(css.trim());
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 255 };
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+))?/i.exec(css.trim());
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: rgb[4] === undefined ? 255 : Math.round(parseFloat(rgb[4]) * 255) };
  return { r: 0, g: 0, b: 0, a: 255 };
}

/** Are two pixels close enough to count as the same region? */
export function withinTolerance(a: Rgba, b: Rgba, tolerance: number): boolean {
  return Math.abs(a.r - b.r) <= tolerance
    && Math.abs(a.g - b.g) <= tolerance
    && Math.abs(a.b - b.b) <= tolerance
    && Math.abs(a.a - b.a) <= tolerance;
}

/**
 * Flood fill, scanline, in place on an `ImageData`-shaped buffer.
 *
 * ── WHY SCANLINE AND NOT THE FOUR-WAY RECURSION EVERY TUTORIAL SHOWS ──────────────────────────
 *
 * The recursive version pushes one stack entry per PIXEL. On a 1440×900 artboard a fill of the
 * background is 1.3 million entries and the tab dies. Scanline pushes one entry per horizontal RUN,
 * which for any real drawing is a few thousand — the difference between working and not.
 *
 * ── TOLERANCE IS THE WHOLE USER EXPERIENCE ────────────────────────────────────────────────────
 *
 * A hand-drawn outline is anti-aliased: its edge pixels are a gradient from line colour to
 * background. With zero tolerance the fill leaks through that gradient and floods the entire
 * canvas, which is the classic "why did my whole picture turn blue". With tolerance the fill stops
 * at the soft edge. It is defaulted generously for that reason.
 *
 * Returns the number of pixels changed, so the caller can tell "filled a region" from "filled
 * nothing because you clicked on the line itself".
 */
export function floodFill(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  fill: Rgba,
  tolerance = 32,
): number {
  const x0 = Math.floor(startX);
  const y0 = Math.floor(startY);
  if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) return 0;

  const at = (x: number, y: number) => (y * width + x) * 4;
  const read = (i: number): Rgba => ({ r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] });

  const target = read(at(x0, y0));
  // Clicking a pixel that is already the fill colour would otherwise scan the whole region to
  // change nothing, and look like the tool is broken.
  if (withinTolerance(target, fill, 0)) return 0;

  const matches = (x: number, y: number) => withinTolerance(read(at(x, y)), target, tolerance);
  const paint = (i: number) => {
    data[i] = fill.r; data[i + 1] = fill.g; data[i + 2] = fill.b; data[i + 3] = fill.a;
  };

  let changed = 0;
  const stack: Array<[number, number]> = [[x0, y0]];
  const seen = new Uint8Array(width * height);

  while (stack.length) {
    const [sx, sy] = stack.pop()!;
    if (seen[sy * width + sx]) continue;

    // Walk left and right to the ends of this run.
    let left = sx;
    while (left > 0 && matches(left - 1, sy)) left -= 1;
    let right = sx;
    while (right < width - 1 && matches(right + 1, sy)) right += 1;

    let spanAbove = false;
    let spanBelow = false;
    for (let x = left; x <= right; x += 1) {
      const key = sy * width + x;
      if (!seen[key]) { seen[key] = 1; paint(at(x, sy)); changed += 1; }

      // Push at most ONE seed per contiguous run above and below, which is what keeps the stack
      // proportional to runs rather than to pixels.
      if (sy > 0) {
        const above = matches(x, sy - 1) && !seen[(sy - 1) * width + x];
        if (above && !spanAbove) { stack.push([x, sy - 1]); spanAbove = true; }
        else if (!above) spanAbove = false;
      }
      if (sy < height - 1) {
        const below = matches(x, sy + 1) && !seen[(sy + 1) * width + x];
        if (below && !spanBelow) { stack.push([x, sy + 1]); spanBelow = true; }
        else if (!below) spanBelow = false;
      }
    }
  }
  return changed;
}

/**
 * A rounded rectangle path, used for every box tool.
 *
 * The radius is clamped to half the shorter side: asking for a 40px radius on a 20px-tall box is a
 * thing people do by dragging small, and an unclamped radius renders as a shape that is not a
 * rectangle at all.
 */
export function roundedRectPath(
  ctx: { beginPath(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void;
         quadraticCurveTo(cx: number, cy: number, x: number, y: number): void; closePath(): void },
  x: number, y: number, w: number, h: number, radius: number,
): void {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Tools that drag out a box. Everything else is a click, a stroke or a two-point drag. */
export const BOX_TOOLS: DrawTool[] = ['rect', 'rounded-rect', 'square', 'rounded-square', 'ellipse', 'circle'];
export const CONSTRAINED_TOOLS: DrawTool[] = ['square', 'rounded-square', 'circle'];
export const ROUNDED_TOOLS: DrawTool[] = ['rounded-rect', 'rounded-square'];

export function isBoxTool(tool: DrawTool): boolean { return BOX_TOOLS.includes(tool); }
export function alwaysConstrained(tool: DrawTool): boolean { return CONSTRAINED_TOOLS.includes(tool); }
export function isRounded(tool: DrawTool): boolean { return ROUNDED_TOOLS.includes(tool); }
