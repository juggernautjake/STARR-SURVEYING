// lib/cad/labels/label-optimizer.ts — Simulated-annealing label placement optimizer
import type { Point2D } from '../types';
import type { AnnotationBase, BearingDistanceDimension } from './annotation-types';

export interface LabelOptConfig {
  maxIterations: number;
  startTemperature: number;
  coolingRate: number;
  collisionPadding: number;
  minFontSize: number;
  maxLeaderLength: number;
}

export const DEFAULT_LABEL_OPT_CONFIG: LabelOptConfig = {
  maxIterations: 2000,
  startTemperature: 100,
  coolingRate: 0.995,
  collisionPadding: 0.03,
  minFontSize: 5,
  maxLeaderLength: 1.0,
};

export interface LabelRect {
  annotationId: string;
  priority: number;
  cx: number;
  cy: number;
  halfWidth: number;
  halfHeight: number;
  rotation: number;
  isManuallyPlaced: boolean;
}

export interface LabelPlacement {
  offsetX: number;
  offsetY: number;
  rotation: number;
  fontSize: number;
  strategy: 'ORIGINAL' | 'FLIPPED' | 'SLID' | 'LEADER_ADDED' | 'SHRUNK' | 'STACKED' | 'ABBREVIATED' | 'FLAGGED_MANUAL';
  hasLeader: boolean;
  leaderPoints: Point2D[];
}

export interface OptimizationResult {
  placements: Map<string, LabelPlacement>;
  collisionsResolved: number;
  collisionsRemaining: number;
  iterationsUsed: number;
  flaggedForManual: string[];
}

function getAnnotationFontSize(annotation: AnnotationBase): number {
  return (annotation as unknown as { fontSize?: number }).fontSize ?? 7;
}

/** Estimate annotation bounding box half-dimensions (approximate, world units). */
function estimateLabelSize(
  annotation: AnnotationBase,
  drawingScale: number,
): { halfWidth: number; halfHeight: number } {
  const fontSize = getAnnotationFontSize(annotation);
  const lineHeight = (fontSize / 72) * drawingScale * 1.4; // world units per line

  let lines = 1;
  let maxChars = 12;

  if (annotation.type === 'BEARING_DISTANCE') {
    lines = 2;
    maxChars = 18;
  } else if (annotation.type === 'CURVE_DATA') {
    const dim = annotation as unknown as { textLines?: string[] };
    lines = dim.textLines?.length ?? 5;
    maxChars = (dim.textLines ?? []).reduce((m, l) => Math.max(m, l.length), 12);
  } else if (annotation.type === 'AREA_LABEL') {
    lines = 2;
    maxChars = 20;
  }

  const charWidth = (fontSize / 72) * drawingScale * 0.6;
  return {
    halfWidth: (maxChars * charWidth) / 2,
    halfHeight: (lines * lineHeight) / 2,
  };
}

/** Build LabelRect for each annotation at its default position. */
function buildLabelRects(annotations: AnnotationBase[], drawingScale: number): LabelRect[] {
  return annotations.map((a) => {
    const { halfWidth, halfHeight } = estimateLabelSize(a, drawingScale);
    let cx = 0, cy = 0;

    if (a.type === 'BEARING_DISTANCE') {
      const dim = a as BearingDistanceDimension;
      cx = (dim.startPoint.x + dim.endPoint.x) / 2;
      cy = (dim.startPoint.y + dim.endPoint.y) / 2;
    } else if ('position' in a && a.position) {
      const pos = a.position as Point2D;
      cx = pos.x;
      cy = pos.y;
    }

    return {
      annotationId: a.id,
      priority: a.priority,
      cx,
      cy,
      halfWidth,
      halfHeight,
      rotation: 0,
      isManuallyPlaced: a.isManuallyPlaced,
    };
  });
}

function doRectsOverlap(
  a: LabelRect,
  pa: LabelPlacement,
  b: LabelRect,
  pb: LabelPlacement,
  padding: number,
): boolean {
  const ax = a.cx + pa.offsetX, ay = a.cy + pa.offsetY;
  const bx = b.cx + pb.offsetX, by = b.cy + pb.offsetY;
  return (
    Math.abs(ax - bx) < a.halfWidth + b.halfWidth + padding &&
    Math.abs(ay - by) < a.halfHeight + b.halfHeight + padding
  );
}

function findCollisions(
  rects: LabelRect[],
  placements: Map<string, LabelPlacement>,
  padding: number,
): { a: LabelRect; b: LabelRect }[] {
  const result: { a: LabelRect; b: LabelRect }[] = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const pa = placements.get(rects[i].annotationId)!;
      const pb = placements.get(rects[j].annotationId)!;
      if (doRectsOverlap(rects[i], pa, rects[j], pb, padding)) {
        result.push({ a: rects[i], b: rects[j] });
      }
    }
  }
  return result;
}

function findCollisionsForRect(
  mover: LabelRect,
  allRects: LabelRect[],
  placements: Map<string, LabelPlacement>,
  padding: number,
): { a: LabelRect; b: LabelRect }[] {
  const pm = placements.get(mover.annotationId)!;
  return allRects
    .filter((r) => r.annotationId !== mover.annotationId)
    .filter((r) => doRectsOverlap(mover, pm, r, placements.get(r.annotationId)!, padding))
    .map((r) => ({ a: mover, b: r }));
}

/**
 * Optimize label placement using a greedy strategy with simulated annealing.
 */
export function optimizeLabels(
  annotations: AnnotationBase[],
  drawingScale: number,
  config: LabelOptConfig = DEFAULT_LABEL_OPT_CONFIG,
): OptimizationResult {
  const rects = buildLabelRects(annotations, drawingScale);
  rects.sort((a, b) => a.priority - b.priority);

  const placements = new Map<string, LabelPlacement>();
  for (const rect of rects) {
    const ann = annotations.find((a) => a.id === rect.annotationId)!;
    placements.set(rect.annotationId, {
      offsetX: 0,
      offsetY: 0,
      rotation: rect.rotation,
      fontSize: getAnnotationFontSize(ann),
      strategy: 'ORIGINAL',
      hasLeader: false,
      leaderPoints: [],
    });
  }

  let temperature = config.startTemperature;
  let resolved = 0;

  for (let iter = 0; iter < config.maxIterations; iter++) {
    const collisions = findCollisions(rects, placements, config.collisionPadding);
    if (collisions.length === 0) break;

    const collision = collisions[Math.floor(Math.random() * collisions.length)];
    const moverId =
      collision.a.priority > collision.b.priority
        ? collision.a.annotationId
        : collision.b.annotationId;

    const moverRect = rects.find((r) => r.annotationId === moverId)!;
    if (moverRect.isManuallyPlaced) continue;

    const annotation = annotations.find((a) => a.id === moverId)!;
    const existing = placements.get(moverId)!;

    let newPlacement: LabelPlacement | null = null;

    // Strategy 1: FLIP — mirror across the associated line
    const flipOffset = moverRect.halfHeight * 2 + config.collisionPadding * drawingScale;
    const flipped: LabelPlacement = {
      ...existing,
      offsetY: existing.offsetY < 0 ? flipOffset : -flipOffset,
      strategy: 'FLIPPED',
    };
    const testFlip = new Map(placements);
    testFlip.set(moverId, flipped);
    if (findCollisionsForRect(moverRect, rects, testFlip, config.collisionPadding).length === 0) {
      newPlacement = flipped;
    }

    // Strategy 2: SLIDE — move along x by a fraction of half-width
    if (!newPlacement) {
      const slideAmount = moverRect.halfWidth * 0.3 * (Math.random() > 0.5 ? 1 : -1);
      const slid: LabelPlacement = {
        ...existing,
        offsetX: existing.offsetX + slideAmount,
        strategy: 'SLID',
      };
      const testSlid = new Map(placements);
      testSlid.set(moverId, slid);
      if (findCollisionsForRect(moverRect, rects, testSlid, config.collisionPadding).length === 0) {
        newPlacement = slid;
      }
    }

    // Strategy 3: SHRINK — reduce font size (only low-priority annotations)
    if (!newPlacement && annotation.priority >= 4 && existing.fontSize > config.minFontSize) {
      newPlacement = { ...existing, fontSize: existing.fontSize - 1, strategy: 'SHRUNK' };
    }

    // Strategy 4: LEADER — move to a random nearby clear space
    if (!newPlacement) {
      const angle = Math.random() * 2 * Math.PI;
      const dist = (moverRect.halfWidth + moverRect.halfHeight) * 1.5;
      const leader: LabelPlacement = {
        ...existing,
        offsetX: Math.cos(angle) * dist,
        offsetY: Math.sin(angle) * dist,
        strategy: 'LEADER_ADDED',
        hasLeader: true,
        leaderPoints: [
          { x: moverRect.cx, y: moverRect.cy },
          { x: moverRect.cx + Math.cos(angle) * dist, y: moverRect.cy + Math.sin(angle) * dist },
        ],
      };
      const testLeader = new Map(placements);
      testLeader.set(moverId, leader);
      if (
        findCollisionsForRect(moverRect, rects, testLeader, config.collisionPadding).length === 0
      ) {
        newPlacement = leader;
      }
    }

    if (newPlacement) {
      placements.set(moverId, newPlacement);
      resolved++;
    }

  // TODO: use temperature for probabilistic acceptance of worse placements (simulated annealing extension)
    temperature *= config.coolingRate;
    void temperature;
  }

  // Flag remaining collisions for manual review
  const remaining = findCollisions(rects, placements, config.collisionPadding);
  const flagged: string[] = [];
  for (const c of remaining) {
    const moverId =
      c.a.priority > c.b.priority ? c.a.annotationId : c.b.annotationId;
    if (!flagged.includes(moverId)) {
      flagged.push(moverId);
      const p = placements.get(moverId)!;
      placements.set(moverId, { ...p, strategy: 'FLAGGED_MANUAL' });
    }
  }

  return {
    placements,
    collisionsResolved: resolved,
    collisionsRemaining: remaining.length,
    iterationsUsed: config.maxIterations,
    flaggedForManual: flagged,
  };
}
