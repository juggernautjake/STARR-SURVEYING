// lib/design/snap.ts — where a dragged element lands.
//
// Slice W3 of docs/planning/in-progress/DESIGN_STUDIO_2026-08-23.md.
//
// ── WHAT THE OWNER ASKED FOR ────────────────────────────────────────────────────────────────────
//
// *"we will have the option to turn on a grid for snapping elements to the view, or we can turn it
// off and freehand place the elements into the view. We will be able to dynamically change the size
// of the grid squares… Each element will have to have nodes or something that helps us determine
// where the element will snap to on the grid."*
//
// Three ideas, and they are separable:
//
//   1. THE GRID is a set of lines every `size` pixels. Snapping to it is optional and independent
//      of whether it is drawn.
//   2. THE ANCHOR is the "node": the point ON the element that meets the grid. Nine of them, plus a
//      text baseline. Which one is active depends on how you grabbed the element — drag by the
//      top-left handle and the top-left lands on the line; drag by the centre and the centre does.
//      Without this, snapping means "the top-left corner, always", and centring anything on a grid
//      becomes arithmetic done by hand.
//   3. SMART GUIDES align to OTHER ELEMENTS — edges, centres, and equal spacing. No grid size can
//      substitute for these, because the thing you usually want to line up with is not a grid line,
//      it is the card above.
//
// All pure. Tested in `__tests__/design/snap.test.ts`.

import type { AnchorName } from './catalogue/types';

export interface Rect { x: number; y: number; w: number; h: number }

export interface SnapSettings {
  enabled: boolean;
  size: number;
  /** Max distance in px at which a target pulls. Snapping should assist, not fight. */
  strength: number;
  guides: boolean;
}

/** Where an anchor sits within a rect, as a fraction of its width and height. */
const ANCHOR_FRACTIONS: Record<Exclude<AnchorName, 'baseline'>, { fx: number; fy: number }> = {
  'top-left': { fx: 0, fy: 0 },
  'top-center': { fx: 0.5, fy: 0 },
  'top-right': { fx: 1, fy: 0 },
  'middle-left': { fx: 0, fy: 0.5 },
  center: { fx: 0.5, fy: 0.5 },
  'middle-right': { fx: 1, fy: 0.5 },
  'bottom-left': { fx: 0, fy: 1 },
  'bottom-center': { fx: 0.5, fy: 1 },
  'bottom-right': { fx: 1, fy: 1 },
};

/** The absolute position of an element's anchor. `baseline` is treated as bottom-left minus a
 *  descender allowance — close enough to align two labels by their text rather than their boxes. */
export function anchorPoint(rect: Rect, anchor: AnchorName, baselineOffset = 4): { x: number; y: number } {
  if (anchor === 'baseline') return { x: rect.x, y: rect.y + rect.h - baselineOffset };
  const { fx, fy } = ANCHOR_FRACTIONS[anchor];
  return { x: rect.x + rect.w * fx, y: rect.y + rect.h * fy };
}

/** Round a single value to the nearest grid line. */
export function snapValue(value: number, size: number): number {
  if (size <= 0) return value;
  return Math.round(value / size) * size;
}

/**
 * Snap a rect so that its ANCHOR lands on the grid.
 *
 * Returns the whole rect moved, never resized: snapping is about placement. A pull only happens
 * when the grid line is within `strength` — beyond that the element stays exactly where the pointer
 * put it, which is what keeps a fine grid from feeling like glue.
 */
export function snapRectToGrid(rect: Rect, anchor: AnchorName, settings: SnapSettings): Rect {
  if (!settings.enabled || settings.size <= 0) return rect;
  const point = anchorPoint(rect, anchor);
  const targetX = snapValue(point.x, settings.size);
  const targetY = snapValue(point.y, settings.size);
  const dx = Math.abs(targetX - point.x) <= settings.strength ? targetX - point.x : 0;
  const dy = Math.abs(targetY - point.y) <= settings.strength ? targetY - point.y : 0;
  return { ...rect, x: rect.x + dx, y: rect.y + dy };
}

export type GuideAxis = 'x' | 'y';
export interface Guide {
  axis: GuideAxis;
  /** Where to draw the line. */
  position: number;
  /** What it lined up with — used for the guide's tooltip and for tests. */
  kind: 'edge-start' | 'edge-end' | 'center' | 'artboard-center' | 'artboard-edge';
  /** Ids of the elements this guide passes through. */
  matched: string[];
}

export interface AlignResult {
  rect: Rect;
  guides: Guide[];
}

interface Candidate { id: string; rect: Rect }

/**
 * Align a moving rect to other elements and to the artboard.
 *
 * For each axis it collects candidate lines — every other element's start edge, end edge and centre,
 * plus the artboard's edges and centre — and takes the single nearest within `strength`. One line
 * per axis, deliberately: two competing guides on the same axis produce a jitter that reads as a
 * bug, and the second-nearest is never the one you meant.
 */
export function alignToNeighbours(
  rect: Rect,
  others: Candidate[],
  artboard: { width: number; height: number },
  settings: SnapSettings,
): AlignResult {
  if (!settings.guides) return { rect, guides: [] };

  const lines: { axis: GuideAxis; position: number; kind: Guide['kind']; id?: string }[] = [];
  for (const other of others) {
    lines.push({ axis: 'x', position: other.rect.x, kind: 'edge-start', id: other.id });
    lines.push({ axis: 'x', position: other.rect.x + other.rect.w, kind: 'edge-end', id: other.id });
    lines.push({ axis: 'x', position: other.rect.x + other.rect.w / 2, kind: 'center', id: other.id });
    lines.push({ axis: 'y', position: other.rect.y, kind: 'edge-start', id: other.id });
    lines.push({ axis: 'y', position: other.rect.y + other.rect.h, kind: 'edge-end', id: other.id });
    lines.push({ axis: 'y', position: other.rect.y + other.rect.h / 2, kind: 'center', id: other.id });
  }
  lines.push({ axis: 'x', position: artboard.width / 2, kind: 'artboard-center' });
  lines.push({ axis: 'x', position: 0, kind: 'artboard-edge' });
  lines.push({ axis: 'x', position: artboard.width, kind: 'artboard-edge' });
  lines.push({ axis: 'y', position: 0, kind: 'artboard-edge' });

  // The moving rect offers the same three points per axis.
  const movingX = [rect.x, rect.x + rect.w / 2, rect.x + rect.w];
  const movingY = [rect.y, rect.y + rect.h / 2, rect.y + rect.h];

  let best: Record<GuideAxis, { delta: number; line: typeof lines[number] } | null> = { x: null, y: null };

  for (const line of lines) {
    const points = line.axis === 'x' ? movingX : movingY;
    for (const point of points) {
      const delta = line.position - point;
      if (Math.abs(delta) > settings.strength) continue;
      const current = best[line.axis];
      if (!current || Math.abs(delta) < Math.abs(current.delta)) {
        best = { ...best, [line.axis]: { delta, line } };
      }
    }
  }

  const guides: Guide[] = [];
  let next = { ...rect };
  for (const axis of ['x', 'y'] as GuideAxis[]) {
    const hit = best[axis];
    if (!hit) continue;
    next = axis === 'x' ? { ...next, x: next.x + hit.delta } : { ...next, y: next.y + hit.delta };
    guides.push({
      axis,
      position: hit.line.position,
      kind: hit.line.kind,
      matched: hit.line.id ? [hit.line.id] : [],
    });
  }
  return { rect: next, guides };
}

/**
 * The whole placement decision, in the order it has to happen.
 *
 * Neighbour guides run FIRST and win, because lining up with the card above is almost always what
 * you meant; the grid then only pulls on an axis no guide claimed. Doing it the other way round
 * means the grid quietly drags an element half a cell off the thing it was aligned to.
 */
export function placeRect(
  rect: Rect,
  anchor: AnchorName,
  others: Candidate[],
  artboard: { width: number; height: number },
  settings: SnapSettings,
): AlignResult {
  const aligned = alignToNeighbours(rect, others, artboard, settings);
  const claimed = new Set(aligned.guides.map((g) => g.axis));
  const snapped = snapRectToGrid(aligned.rect, anchor, settings);
  return {
    rect: {
      ...aligned.rect,
      x: claimed.has('x') ? aligned.rect.x : snapped.x,
      y: claimed.has('y') ? aligned.rect.y : snapped.y,
    },
    guides: aligned.guides,
  };
}

/** Keep a rect inside the artboard horizontally, and off the top. Vertically the artboard grows, so
 *  there is no bottom to hit — a page is as long as it needs to be. */
export function clampToArtboard(rect: Rect, artboard: { width: number }): Rect {
  const x = Math.min(Math.max(rect.x, -rect.w + 24), artboard.width - 24);
  return { ...rect, x, y: Math.max(rect.y, 0) };
}

/** The gaps between a rect and its nearest neighbours, for the live spacing badges (§20b.1). Every
 *  "crammed together too tightly" complaint is a spacing decision made by eye; this is what makes it
 *  a decision made on purpose. */
export function spacingTo(rect: Rect, others: Candidate[]): { left?: number; right?: number; above?: number; below?: number } {
  const overlapsY = (o: Rect) => o.y < rect.y + rect.h && o.y + o.h > rect.y;
  const overlapsX = (o: Rect) => o.x < rect.x + rect.w && o.x + o.w > rect.x;
  const out: { left?: number; right?: number; above?: number; below?: number } = {};

  for (const { rect: o } of others) {
    if (overlapsY(o)) {
      if (o.x + o.w <= rect.x) {
        const gap = rect.x - (o.x + o.w);
        if (out.left === undefined || gap < out.left) out.left = gap;
      } else if (o.x >= rect.x + rect.w) {
        const gap = o.x - (rect.x + rect.w);
        if (out.right === undefined || gap < out.right) out.right = gap;
      }
    }
    if (overlapsX(o)) {
      if (o.y + o.h <= rect.y) {
        const gap = rect.y - (o.y + o.h);
        if (out.above === undefined || gap < out.above) out.above = gap;
      } else if (o.y >= rect.y + rect.h) {
        const gap = o.y - (rect.y + rect.h);
        if (out.below === undefined || gap < out.below) out.below = gap;
      }
    }
  }
  return out;
}
