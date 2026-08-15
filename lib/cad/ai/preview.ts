// lib/cad/ai/preview.ts
//
// C38 — preview before apply, across the AI's whole writing reach.
//
// The COPILOT card has painted a dashed ghost of a proposal since Phase 6 §32 Slice 5, and the
// builder lived inside `CopilotCard.tsx` handling exactly three tools: a point, a line and a
// polyline. C34–C36 gave the AI eleven more ways to change the drawing, and every one of them
// showed the surveyor a JSON blob and an Apply button — including `deleteFeatures`, which is the
// one proposal in the registry where "show me first" is not a convenience.
//
// So the builder moves out here: pure, document-in / shapes-out, no store reads and no React, which
// is what lets it be tested against real geometry in Node instead of eyeballed on a canvas.
//
// Two rules run through it.
//
// **A modify preview shows the RESULT, not the input.** "Rotate these forty features 3°" is
// meaningless as a highlight of what is already on screen — the surveyor already knows where those
// are. The ghost is drawn where the geometry will END UP, so accepting is a confirmation of
// something seen rather than a bet on an adjective.
//
// **A delete preview shows what will GO.** Same channel, same dashed outline; the card's wording
// carries the difference. Painting nothing for a delete would make the most destructive proposal in
// the registry the only one with no preview at all.

import type { DrawingDocument, Feature, Point2D } from '../types';
import { transformFeature, translate, rotate, scale, mirror } from '../geometry/transform';
import { circleThrough3Points } from '../geometry/curve';
import type {
  AddPointArgs,
  DrawLineBetweenArgs,
  DrawPolylineThroughArgs,
  DrawRectangleArgs,
  DrawCircleArgs,
  DrawArcArgs,
  DrawTextArgs,
  MoveFeaturesArgs,
  RotateFeaturesArgs,
  ScaleFeaturesArgs,
  MirrorFeaturesArgs,
  DeleteFeaturesArgs,
} from './tool-registry';

/** One dashed outline the canvas can paint. The four kinds the ghost renderer already knows. */
export interface PreviewShape {
  kind: 'POINT' | 'LINE' | 'POLYLINE' | 'POLYGON';
  point?: Point2D;
  from?: Point2D;
  to?: Point2D;
  vertices?: Point2D[];
  color?: string;
}

/**
 * How many segments a curve is sampled into for the ghost. Curves are stored parametrically and
 * drawn parametrically; only the PREVIEW approximates, and at 64 segments a circle's chord error is
 * under a thousandth of its radius — invisible at any zoom where the whole circle is on screen, and
 * the real geometry is exact regardless.
 */
const CURVE_SEGMENTS = 64;

/** Sample a full circle into a closed ring of vertices. */
export function sampleCircle(center: Point2D, radius: number, segments = CURVE_SEGMENTS): Point2D[] {
  const out: Point2D[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    out.push({ x: center.x + radius * Math.cos(t), y: center.y + radius * Math.sin(t) });
  }
  return out;
}

/** Sample an arc between two angles, following the stored sweep direction. */
export function sampleArc(
  center: Point2D,
  radius: number,
  startAngle: number,
  endAngle: number,
  anticlockwise: boolean,
  segments = CURVE_SEGMENTS,
): Point2D[] {
  const TAU = Math.PI * 2;
  const norm = (a: number) => ((a % TAU) + TAU) % TAU;
  // Sweep is read from the flag rather than inferred from which angle is larger — the same measured
  // -not-assumed rule C29 paid for, and the reason a 300-foot major arc does not appear here.
  let sweep = anticlockwise ? norm(endAngle - startAngle) : -norm(startAngle - endAngle);
  if (Math.abs(sweep) < 1e-12) sweep = anticlockwise ? TAU : -TAU;
  const out: Point2D[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = startAngle + (sweep * i) / segments;
    out.push({ x: center.x + radius * Math.cos(t), y: center.y + radius * Math.sin(t) });
  }
  return out;
}

/**
 * Outline an existing feature for the ghost channel. Returns null for shapes with no drawable
 * outline (a text note has no geometry to trace, so it previews as its insertion point).
 */
export function featureToPreviewShape(feature: Feature, color?: string): PreviewShape | null {
  const g = feature.geometry;
  if (g.circle) {
    return { kind: 'POLYGON', vertices: sampleCircle(g.circle.center, g.circle.radius), color };
  }
  if (g.arc) {
    return {
      kind: 'POLYLINE',
      vertices: sampleArc(g.arc.center, g.arc.radius, g.arc.startAngle, g.arc.endAngle, !!g.arc.anticlockwise),
      color,
    };
  }
  if (g.vertices && g.vertices.length >= 2) {
    return { kind: feature.type === 'POLYGON' ? 'POLYGON' : 'POLYLINE', vertices: g.vertices, color };
  }
  if (g.start && g.end) return { kind: 'LINE', from: g.start, to: g.end, color };
  if (g.point) return { kind: 'POINT', point: g.point, color };
  return null;
}

/** Resolve the named features against the document, skipping ids that are not there. */
function liveFeatures(ids: unknown, doc: DrawingDocument): Feature[] {
  if (!Array.isArray(ids)) return [];
  const out: Feature[] = [];
  for (const id of ids) {
    const f = typeof id === 'string' ? doc.features[id] : undefined;
    if (f) out.push(f);
  }
  return out;
}

/** Centroid of a feature set's transformable points — mirrors the tool's default pivot exactly. */
function centroidOf(features: Feature[]): Point2D {
  let sx = 0, sy = 0, n = 0;
  const add = (p?: Point2D) => { if (p) { sx += p.x; sy += p.y; n += 1; } };
  for (const f of features) {
    const g = f.geometry;
    add(g.point);
    add(g.start);
    add(g.end);
    for (const v of g.vertices ?? []) add(v);
    add(g.circle?.center);
    add(g.ellipse?.center);
    add(g.arc?.center);
  }
  return n === 0 ? { x: 0, y: 0 } : { x: sx / n, y: sy / n };
}

/** Ghost the result of applying `fn` to every named feature. */
function transformedShapes(
  ids: unknown,
  doc: DrawingDocument,
  fn: (p: Point2D) => Point2D,
  color?: string,
): PreviewShape[] {
  return liveFeatures(ids, doc)
    .map((f) => featureToPreviewShape(transformFeature(f, fn), color))
    .filter((s): s is PreviewShape => s !== null);
}

/**
 * Build every dashed outline a proposal should paint before it is applied.
 *
 * Returns an empty array — not null — when a tool has nothing to show (`createLayer` and
 * `applyLayerStyle` change the layer panel, not the canvas). An empty array clears the ghost the
 * same way, and callers never have to distinguish "no preview" from "not built yet".
 */
export function buildPreviewShapes(
  toolName: string,
  args: unknown,
  doc: DrawingDocument,
  activeLayerId: string,
): PreviewShape[] {
  // Colour the ghost like its TARGET layer (the one chosen in the card's picker, stored on
  // args.layerId) so it reads visually where it will land. Falls back to the active layer, then
  // amber.
  const targetLayerId = (args as { layerId?: string } | undefined)?.layerId ?? activeLayerId;
  const color = doc.layers[targetLayerId]?.color ?? '#fbbf24';

  switch (toolName) {
    case 'addPoint': {
      const a = args as AddPointArgs;
      return [{ kind: 'POINT', point: { x: a.x, y: a.y }, color }];
    }
    case 'drawLineBetween': {
      const a = args as DrawLineBetweenArgs;
      return [{ kind: 'LINE', from: a.from, to: a.to, color }];
    }
    case 'drawPolylineThrough': {
      const a = args as DrawPolylineThroughArgs;
      return [{ kind: a.closed ? 'POLYGON' : 'POLYLINE', vertices: a.points, color }];
    }
    case 'drawRectangle': {
      const a = args as DrawRectangleArgs;
      const { x: x1, y: y1 } = a.corner;
      const { x: x2, y: y2 } = a.opposite;
      return [{
        kind: 'POLYGON',
        vertices: [
          { x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 },
        ],
        color,
      }];
    }
    case 'drawCircle': {
      const a = args as DrawCircleArgs;
      if (!(a.radius > 0)) return [];
      return [{ kind: 'POLYGON', vertices: sampleCircle(a.center, a.radius), color }];
    }
    case 'drawArc': {
      const a = args as DrawArcArgs;
      const circle = circleThrough3Points(a.start, a.through, a.end);
      // Collinear points have no arc, and the tool refuses them. Ghosting a straight line here would
      // preview geometry that Apply will never produce.
      if (!circle) return [];
      const ang = (p: Point2D) => Math.atan2(p.y - circle.center.y, p.x - circle.center.x);
      const TAU = Math.PI * 2;
      const norm = (v: number) => ((v % TAU) + TAU) % TAU;
      const startAngle = ang(a.start);
      const endAngle = ang(a.end);
      const ccw = norm(ang(a.through) - startAngle) <= norm(endAngle - startAngle);
      return [{
        kind: 'POLYLINE',
        vertices: sampleArc(circle.center, circle.radius, startAngle, endAngle, ccw),
        color,
      }];
    }
    case 'drawText': {
      const a = args as DrawTextArgs;
      // A note has no outline to trace, so the insertion point is what there is to show. It is where
      // the surveyor will look for it, which is the question the preview is answering.
      return [{ kind: 'POINT', point: a.at, color }];
    }
    case 'moveFeatures': {
      const a = args as MoveFeaturesArgs;
      return transformedShapes(a.ids, doc, (p) => translate(p, a.dx, a.dy), color);
    }
    case 'rotateFeatures': {
      const a = args as RotateFeaturesArgs;
      const features = liveFeatures(a.ids, doc);
      const pivot = a.about ?? centroidOf(features);
      const rad = ((a.angleDeg ?? 0) * Math.PI) / 180;
      return transformedShapes(a.ids, doc, (p) => rotate(p, pivot, rad), color);
    }
    case 'scaleFeatures': {
      const a = args as ScaleFeaturesArgs;
      if (!(a.factor > 0)) return [];
      const features = liveFeatures(a.ids, doc);
      const pivot = a.about ?? centroidOf(features);
      return transformedShapes(a.ids, doc, (p) => scale(p, pivot, a.factor), color);
    }
    case 'mirrorFeatures': {
      const a = args as MirrorFeaturesArgs;
      if (Math.hypot(a.axisEnd.x - a.axisStart.x, a.axisEnd.y - a.axisStart.y) < 1e-9) return [];
      return transformedShapes(a.ids, doc, (p) => mirror(p, a.axisStart, a.axisEnd), color);
    }
    case 'deleteFeatures': {
      const a = args as DeleteFeaturesArgs;
      // Outlined in place: this is the geometry that will be gone.
      return liveFeatures(a.ids, doc)
        .map((f) => featureToPreviewShape(f, color))
        .filter((s): s is PreviewShape => s !== null);
    }
    default:
      // createLayer / applyLayerStyle, and anything read-only that reaches here by mistake.
      return [];
  }
}
