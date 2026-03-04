// lib/cad/geometry/spline.ts — Fit-point and control-point splines
import type { Point2D, FitPointSplineDefinition, TangentHandle, ControlPointSplineDefinition } from '../types';

export function cubicBezier(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, t: number): Point2D {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

export function evaluateFitPointSpline(
  spline: FitPointSplineDefinition,
  samplesPerSegment: number = 20,
): Point2D[] {
  const pts = spline.fitPoints;
  if (pts.length < 2) return [...pts];

  const result: Point2D[] = [];

  for (let i = 0; i < pts.length - 1; i++) {
    const handle = spline.tangentHandles[i];
    const nextHandle = spline.tangentHandles[i + 1];

    const p0 = pts[i];
    const p3 = pts[i + 1];

    const p1: Point2D = {
      x: p0.x + (handle?.rightDirection.x ?? 0) * (handle?.rightMagnitude ?? 0),
      y: p0.y + (handle?.rightDirection.y ?? 0) * (handle?.rightMagnitude ?? 0),
    };
    const p2: Point2D = {
      x: p3.x - (nextHandle?.leftDirection.x ?? 0) * (nextHandle?.leftMagnitude ?? 0),
      y: p3.y - (nextHandle?.leftDirection.y ?? 0) * (nextHandle?.leftMagnitude ?? 0),
    };

    for (let s = 0; s <= samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      if (i > 0 && s === 0) continue;
      result.push(cubicBezier(p0, p1, p2, p3, t));
    }
  }

  if (spline.isClosed && pts.length > 2) {
    const lastIdx = pts.length - 1;
    const p0 = pts[lastIdx], p3 = pts[0];
    const h0 = spline.tangentHandles[lastIdx], h1 = spline.tangentHandles[0];
    const p1 = {
      x: p0.x + (h0?.rightDirection.x ?? 0) * (h0?.rightMagnitude ?? 0),
      y: p0.y + (h0?.rightDirection.y ?? 0) * (h0?.rightMagnitude ?? 0),
    };
    const p2 = {
      x: p3.x - (h1?.leftDirection.x ?? 0) * (h1?.leftMagnitude ?? 0),
      y: p3.y - (h1?.leftDirection.y ?? 0) * (h1?.leftMagnitude ?? 0),
    };
    for (let s = 1; s <= samplesPerSegment; s++) {
      result.push(cubicBezier(p0, p1, p2, p3, s / samplesPerSegment));
    }
  }

  return result;
}

export function autoComputeTangentHandles(fitPoints: Point2D[], isClosed: boolean): TangentHandle[] {
  const n = fitPoints.length;
  const handles: TangentHandle[] = [];

  for (let i = 0; i < n; i++) {
    const prev = fitPoints[(i - 1 + n) % n];
    const curr = fitPoints[i];
    const next = fitPoints[(i + 1) % n];

    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = len > 0 ? dx / len : 1;
    const ny = len > 0 ? dy / len : 0;

    const dPrev = Math.sqrt((curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2);
    const dNext = Math.sqrt((next.x - curr.x) ** 2 + (next.y - curr.y) ** 2);
    const mag = Math.min(dPrev, dNext) / 3;

    const isEndpoint = !isClosed && (i === 0 || i === n - 1);

    handles.push({
      pointIndex: i,
      leftDirection: { x: -nx, y: -ny },
      leftMagnitude: isEndpoint ? 0 : mag,
      rightDirection: { x: nx, y: ny },
      rightMagnitude: isEndpoint ? 0 : mag,
      symmetric: true,
      isCorner: false,
    });
  }

  return handles;
}

export function evaluateNURBS(
  spline: ControlPointSplineDefinition,
  samples: number = 100,
): Point2D[] {
  const n = spline.controlPoints.length;
  const p = spline.degree;
  if (n < p + 1) return [...spline.controlPoints];

  const knots = generateClampedKnots(n, p);

  const result: Point2D[] = [];
  for (let s = 0; s <= samples; s++) {
    const t = s / samples;
    const u = knots[p] + t * (knots[n] - knots[p]);
    const pt = evaluateNURBSPoint(spline.controlPoints, spline.weights, knots, p, u);
    result.push(pt);
  }

  return result;
}

function generateClampedKnots(n: number, p: number): number[] {
  const m = n + p + 1;
  const knots = new Array(m);
  for (let i = 0; i <= p; i++) knots[i] = 0;
  for (let i = p + 1; i < n; i++) knots[i] = (i - p) / (n - p);
  for (let i = n; i < m; i++) knots[i] = 1;
  return knots;
}

function evaluateNURBSPoint(
  controlPoints: Point2D[], weights: number[],
  knots: number[], degree: number, u: number,
): Point2D {
  const n = controlPoints.length;
  let wx = 0, wy = 0, wSum = 0;

  for (let i = 0; i < n; i++) {
    const basis = bSplineBasis(i, degree, knots, u);
    const w = basis * weights[i];
    wx += w * controlPoints[i].x;
    wy += w * controlPoints[i].y;
    wSum += w;
  }

  if (wSum === 0) return controlPoints[0];
  return { x: wx / wSum, y: wy / wSum };
}

function bSplineBasis(i: number, p: number, knots: number[], u: number): number {
  if (p === 0) return (u >= knots[i] && u < knots[i + 1]) ? 1 : 0;

  let left = 0, right = 0;
  const denom1 = knots[i + p] - knots[i];
  if (denom1 > 0) left = ((u - knots[i]) / denom1) * bSplineBasis(i, p - 1, knots, u);
  const denom2 = knots[i + p + 1] - knots[i + 1];
  if (denom2 > 0) right = ((knots[i + p + 1] - u) / denom2) * bSplineBasis(i + 1, p - 1, knots, u);

  return left + right;
}
