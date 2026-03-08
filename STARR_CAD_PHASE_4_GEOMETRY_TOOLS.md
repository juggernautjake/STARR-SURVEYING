# STARR CAD — Phase 4: Geometry Tools — Curves, Splines, Offsets & Survey Math

**Version:** 1.1 | **Date:** March 2026 | **Phase:** 4 of 8

**Phase 4 Status: ✅ COMPLETE** — All geometry math modules, interactive canvas tools, and unit tests are complete. Implementation lives in `lib/cad/geometry/` (19 math modules), `lib/cad/store/traverse-store.ts`, and `app/admin/cad/components/` (CurveCalculator, TraversePanel, ClosureReport, canvas tool handlers, CommandBar prompts). Verified by 458 unit tests including new `traverse.test.ts` and `curb-return.test.ts`.

**Goal:** Full curve/arc handling with true arc rendering, 7 input methods for the curve calculator, spline tools modeled after Fusion 360, offset engine for easements/setbacks, and all core survey math: traverse management, closure with Bowditch adjustment, area computation, inverse/forward tools, bearing/distance input, and legal description generation.

**Duration:** 7–9 weeks | **Depends On:** Phase 3 (styled rendering, layers, line types)

---

## Table of Contents

1. [Phase 4 Architecture Changes](#1-phase-4-architecture-changes)
2. [Arc & Curve Data Model](#2-arc--curve-data-model)
3. [Bearing & DMS System](#3-bearing--dms-system)
4. [Circular Curve Calculator](#4-circular-curve-calculator)
5. [7 Curve Input Methods](#5-7-curve-input-methods)
6. [Curve Cross-Validation](#6-curve-cross-validation)
7. [Curb Return / Fillet Tool](#7-curb-return--fillet-tool)
8. [Compound Curves, Reverse Curves & Spirals](#8-compound-curves-reverse-curves--spirals)
9. [Arc Rendering (True Arcs)](#9-arc-rendering-true-arcs)
10. [Mixed Geometry Features (Straight + Arc)](#10-mixed-geometry-features-straight--arc)
11. [Fit-Point Spline Tool (Fusion 360 Style)](#11-fit-point-spline-tool-fusion-360-style)
12. [Control-Point Spline Tool (NURBS)](#12-control-point-spline-tool-nurbs)
13. [Spline Rendering & Interaction](#13-spline-rendering--interaction)
14. [Spline-to-Arc Conversion](#14-spline-to-arc-conversion)
15. [Offset Engine](#15-offset-engine)
16. [Traverse Management](#16-traverse-management)
17. [Closure Calculation](#17-closure-calculation)
18. [Bowditch (Compass Rule) Adjustment](#18-bowditch-compass-rule-adjustment)
19. [Area Computation](#19-area-computation)
20. [Inverse Calculation Tool](#20-inverse-calculation-tool)
21. [Forward Point Tool](#21-forward-point-tool)
22. [Bearing/Distance Input Mode](#22-bearingdistance-input-mode)
23. [Legal Description Generator](#23-legal-description-generator)
24. [Curve Calculator Dialog UI](#24-curve-calculator-dialog-ui)
25. [Traverse Panel UI](#25-traverse-panel-ui)
26. [State Management Updates](#26-state-management-updates)
27. [Acceptance Tests](#27-acceptance-tests)
28. [Build Order (Implementation Sequence)](#28-build-order-implementation-sequence)

---

## 1. Phase 4 Architecture Changes

### 1.1 New & Updated Packages

```
packages/
├── geometry/src/                    # EXISTING — add new modules
│   ├── bearing.ts                   # NEW — DMS, quadrant bearings, azimuth
│   ├── curve.ts                     # NEW — Circular curve calculator
│   ├── curb-return.ts               # NEW — Fillet / curb return
│   ├── compound-curve.ts            # NEW — Compound, reverse, spiral
│   ├── spline.ts                    # NEW — Fit-point and control-point splines
│   ├── spline-to-arc.ts             # NEW — Bi-arc fitting conversion
│   ├── offset.ts                    # NEW — Parallel offset engine
│   ├── traverse.ts                  # NEW — Traverse management
│   ├── closure.ts                   # NEW — Closure calculation + Bowditch
│   ├── area.ts                      # NEW — Area by coordinate method
│   ├── inverse.ts                   # NEW — Inverse bearing/distance
│   ├── legal-desc.ts                # NEW — Legal description text generator
│   ├── arc-render.ts                # NEW — Arc → polyline tessellation for rendering
│   └── __tests__/
│       ├── bearing.test.ts
│       ├── curve.test.ts
│       ├── spline.test.ts
│       ├── offset.test.ts
│       ├── traverse.test.ts
│       ├── closure.test.ts
│       ├── area.test.ts
│       └── legal-desc.test.ts

apps/web/components/
├── tools/
│   ├── CurveCalculator.tsx          # NEW — Curve param calculator dialog
│   ├── CurbReturnTool.tsx           # NEW — Fillet interactive tool
│   ├── SplineTool.tsx               # NEW — Spline drawing tool
│   ├── OffsetTool.tsx               # NEW — Offset interactive tool
│   ├── InverseTool.tsx              # NEW — Click two points → bearing/distance
│   ├── ForwardPointTool.tsx         # NEW — Place point at bearing+distance
│   └── BearingInput.tsx             # NEW — DMS bearing input component
├── panels/
│   ├── TraversePanel.tsx            # NEW — Traverse management panel
│   └── ClosureReport.tsx            # NEW — Closure calculation results
```

### 1.2 Updated Core Types

```typescript
// ADD to packages/core/src/types.ts

// ── ARC GEOMETRY ──

export interface ArcDefinition {
  center: Point2D;                     // Radius point
  radius: number;
  startAngle: number;                  // Radians, measured from east (math convention)
  endAngle: number;                    // Radians
  direction: 'CW' | 'CCW';            // Clockwise or counterclockwise

  // Key points (derived)
  pc: Point2D;                         // Point of Curvature (start)
  pt: Point2D;                         // Point of Tangency (end)
  mpc: Point2D;                        // Mid-Point of Curve
  pi: Point2D;                         // Point of Intersection (tangent intersection)
}

// ── CURVE PARAMETERS ──

export interface CurveParameters {
  // The 10 classic curve parameters
  R: number;                           // Radius
  delta: number;                       // Central angle (radians)
  L: number;                           // Arc length
  C: number;                           // Chord distance
  CB: number;                          // Chord bearing (azimuth radians)
  T: number;                           // Tangent distance
  E: number;                           // External distance
  M: number;                           // Mid-ordinate
  D: number;                           // Degree of curve (arc definition)
  direction: 'LEFT' | 'RIGHT';

  // Key points
  pc: Point2D;
  pt: Point2D;
  pi: Point2D;
  rp: Point2D;                         // Radius point (center)
  mpc: Point2D;

  // Tangent bearings
  tangentInBearing: number;            // Azimuth into the curve (radians)
  tangentOutBearing: number;           // Azimuth out of the curve
}

// ── SPLINE GEOMETRY ──

export interface FitPointSplineDefinition {
  fitPoints: Point2D[];
  tangentHandles: TangentHandle[];
  degree: number;                      // 2=quadratic, 3=cubic (default)
  isClosed: boolean;
}

export interface TangentHandle {
  pointIndex: number;
  leftDirection: Point2D;              // Normalized direction vector
  leftMagnitude: number;
  rightDirection: Point2D;
  rightMagnitude: number;
  symmetric: boolean;                  // Left/right mirrors
  isCorner: boolean;                   // Sharp corner (no smoothing)
}

export interface ControlPointSplineDefinition {
  controlPoints: Point2D[];
  weights: number[];                   // NURBS weights (1.0 = uniform)
  degree: number;
  isClosed: boolean;
}

// ── SPIRAL ──

export interface SpiralDefinition {
  type: 'CLOTHOID';
  length: number;                      // Spiral length
  radiusStart: number;                 // Radius at start (Infinity for tangent-start)
  radiusEnd: number;                   // Radius at end
  A: number;                           // Spiral parameter: A² = R × L
  ts: Point2D;                         // Tangent-to-Spiral point
  sc: Point2D;                         // Spiral-to-Curve point
  direction: 'LEFT' | 'RIGHT';
}

// ── TRAVERSE ──

export interface Traverse {
  id: string;
  name: string;
  pointIds: string[];                  // SurveyPoint IDs in order
  isClosed: boolean;

  // Computed legs
  legs: TraverseLeg[];

  // Closure (null if not closed or not yet computed)
  closure: ClosureResult | null;

  // Adjusted points (null if not adjusted)
  adjustedPoints: Point2D[] | null;
  adjustmentMethod: AdjustmentMethod | null;

  // Area (null if not closed)
  area: AreaResult | null;
}

export interface TraverseLeg {
  fromPointId: string;
  toPointId: string;
  bearing: number;                     // Azimuth radians
  distance: number;                    // Feet
  deltaNorth: number;                  // Latitude (N+, S-)
  deltaEast: number;                   // Departure (E+, W-)
  isArc: boolean;                      // True if this leg is a curve
  curveData: CurveParameters | null;   // Populated if isArc
}

export interface ClosureResult {
  linearError: number;                 // Distance of misclosure (feet)
  errorNorth: number;                  // N/S component of error
  errorEast: number;                   // E/W component of error
  errorBearing: number;                // Bearing of error line
  angularError: number;                // Angular misclosure (seconds)
  precisionRatio: string;              // "1:15,000"
  precisionDenominator: number;        // 15000
  totalDistance: number;               // Perimeter (feet)
}

export type AdjustmentMethod = 'COMPASS' | 'TRANSIT' | 'CRANDALL' | 'NONE';

export interface AreaResult {
  squareFeet: number;
  acres: number;
  method: 'COORDINATE';               // Only coordinate method in Phase 4
}

// ── OFFSET ──

export interface OffsetConfig {
  distance: number;                    // Feet
  side: 'LEFT' | 'RIGHT';
  cornerHandling: 'MITER' | 'ROUND' | 'CHAMFER';
  miterLimit: number;                  // Max miter before bevel (default: 4)
  maintainLink: boolean;               // Parametric link to source
  targetLayerId: string | null;
}

// ── EXPANDED FEATURE GEOMETRY ──
// Phase 1 had: POINT, LINE, POLYLINE, POLYGON
// Phase 4 adds: ARC, SPLINE, MIXED_GEOMETRY

export type FeatureGeometryType =
  | 'POINT' | 'LINE' | 'POLYLINE' | 'POLYGON'
  | 'ARC'                              // Single arc segment
  | 'SPLINE'                           // Spline curve
  | 'MIXED_GEOMETRY';                  // Polyline with straight + arc + spline segments

export interface MixedGeometryDefinition {
  vertices: Point2D[];
  segments: MixedSegment[];            // One per pair of consecutive vertices
}

export interface MixedSegment {
  type: 'STRAIGHT' | 'ARC' | 'SPLINE';
  // For ARC: the arc definition for this segment
  arcDef?: ArcDefinition;
  // For SPLINE: control points for this segment's spline
  splinePoints?: Point2D[];
}
```

---

## 2. Arc & Curve Data Model

See types in Section 1.2. The core insight: an arc in Starr CAD is defined by its center point, radius, start angle, end angle, and direction (CW/CCW). All other parameters (R, Δ, L, C, CB, T, E, M, D, PC, PT, PI, MPC) are derived.

The `CurveParameters` interface carries all 10 classic curve parameters plus the 5 key points. Every curve tool populates this interface — the curve calculator, the curb return tool, the auto-connect arc builder, and the AI drawing engine all produce `CurveParameters`.

---

## 3. Bearing & DMS System

Survey bearings are the language of property descriptions. Everything flows through this system.

```typescript
// packages/geometry/src/bearing.ts

export interface Bearing {
  azimuth: number;                     // Decimal degrees (0=North, 90=East, 180=South, 270=West)
  quadrant: QuadrantBearing;           // Human-readable
}

export interface QuadrantBearing {
  direction1: 'N' | 'S';
  degrees: number;
  minutes: number;
  seconds: number;
  tenthSeconds: number;                // 0-9 (for precision surveys)
  direction2: 'E' | 'W';
}

// ── CONVERSIONS ──

export function azimuthToQuadrant(azimuth: number): QuadrantBearing {
  const az = ((azimuth % 360) + 360) % 360; // Normalize to 0-360
  let d1: 'N' | 'S', d2: 'E' | 'W', angle: number;

  if (az >= 0 && az < 90)         { d1 = 'N'; d2 = 'E'; angle = az; }
  else if (az >= 90 && az < 180)  { d1 = 'S'; d2 = 'E'; angle = 180 - az; }
  else if (az >= 180 && az < 270) { d1 = 'S'; d2 = 'W'; angle = az - 180; }
  else                             { d1 = 'N'; d2 = 'W'; angle = 360 - az; }

  return { ...decimalToDMS(angle), direction1: d1, direction2: d2 };
}

export function quadrantToAzimuth(qb: QuadrantBearing): number {
  const decimal = dmsToDecimal(qb.degrees, qb.minutes, qb.seconds + qb.tenthSeconds / 10);
  if (qb.direction1 === 'N' && qb.direction2 === 'E') return decimal;
  if (qb.direction1 === 'S' && qb.direction2 === 'E') return 180 - decimal;
  if (qb.direction1 === 'S' && qb.direction2 === 'W') return 180 + decimal;
  return 360 - decimal; // N-W
}

export function decimalToDMS(decimal: number): { degrees: number; minutes: number; seconds: number; tenthSeconds: number } {
  const abs = Math.abs(decimal);
  const degrees = Math.floor(abs);
  const minRemainder = (abs - degrees) * 60;
  const minutes = Math.floor(minRemainder);
  const secRemainder = (minRemainder - minutes) * 60;
  const seconds = Math.floor(secRemainder);
  const tenthSeconds = Math.round((secRemainder - seconds) * 10);
  return { degrees, minutes, seconds, tenthSeconds };
}

export function dmsToDecimal(d: number, m: number, s: number): number {
  return d + m / 60 + s / 3600;
}

// ── FORMATTING ──

export function formatBearing(azimuth: number, precision: 'SECOND' | 'TENTH_SECOND'): string {
  const qb = azimuthToQuadrant(azimuth);
  const sec = precision === 'TENTH_SECOND'
    ? `${String(qb.seconds).padStart(2, '0')}.${qb.tenthSeconds}`
    : `${String(qb.seconds).padStart(2, '0')}`;
  return `${qb.direction1} ${qb.degrees}°${String(qb.minutes).padStart(2, '0')}'${sec}" ${qb.direction2}`;
}

export function formatAzimuth(azimuth: number): string {
  const dms = decimalToDMS(azimuth);
  return `${dms.degrees}°${String(dms.minutes).padStart(2, '0')}'${String(dms.seconds).padStart(2, '0')}"`;
}

// ── PARSING (for command bar and bearing input) ──

/**
 * Parse bearing strings in various formats:
 *   "N 45°30'15\" E"    → standard quadrant
 *   "N45-30-15E"        → abbreviated
 *   "N 45 30 15 E"      → space-separated
 *   "45.5042"           → decimal degrees (azimuth)
 *   "135°30'15\""       → azimuth DMS
 */
export function parseBearing(input: string): number | null {
  const s = input.trim().toUpperCase();

  // Quadrant bearing: N dd°mm'ss" E
  const qbMatch = s.match(/^([NS])\s*(\d+)[°\-\s]+(\d+)['\-\s]+(\d+\.?\d*)["\s]*([EW])$/);
  if (qbMatch) {
    const qb: QuadrantBearing = {
      direction1: qbMatch[1] as 'N' | 'S',
      degrees: parseInt(qbMatch[2]),
      minutes: parseInt(qbMatch[3]),
      seconds: Math.floor(parseFloat(qbMatch[4])),
      tenthSeconds: Math.round((parseFloat(qbMatch[4]) % 1) * 10),
      direction2: qbMatch[5] as 'E' | 'W',
    };
    return quadrantToAzimuth(qb);
  }

  // Azimuth DMS: ddd°mm'ss"
  const azDmsMatch = s.match(/^(\d+)[°\-\s]+(\d+)['\-\s]+(\d+\.?\d*)"?$/);
  if (azDmsMatch) {
    return dmsToDecimal(parseInt(azDmsMatch[1]), parseInt(azDmsMatch[2]), parseFloat(azDmsMatch[3]));
  }

  // Decimal degrees
  const decimal = parseFloat(s);
  if (!isNaN(decimal) && decimal >= 0 && decimal < 360) return decimal;

  return null;
}

// ── INVERSE ──

export function inverseBearingDistance(from: Point2D, to: Point2D): { azimuth: number; distance: number } {
  const dE = to.x - from.x;
  const dN = to.y - from.y;
  const distance = Math.sqrt(dE * dE + dN * dN);

  // Azimuth: 0=North, clockwise
  let azimuth = Math.atan2(dE, dN) * (180 / Math.PI);
  if (azimuth < 0) azimuth += 360;

  return { azimuth, distance };
}
```

---

## 4. Circular Curve Calculator

Computes all 10 curve parameters from any sufficient input combination.

```typescript
// packages/geometry/src/curve.ts

const DEG = Math.PI / 180;

export interface CurveInput {
  R?: number;                  // Radius
  delta?: number;              // Central angle (degrees)
  L?: number;                  // Arc length
  C?: number;                  // Chord length
  T?: number;                  // Tangent distance
  E?: number;                  // External distance
  M?: number;                  // Mid-ordinate
  D?: number;                  // Degree of curve (arc definition, based on 100' arc)
  direction?: 'LEFT' | 'RIGHT';

  // Location anchors (at least one required to place the curve in space)
  pc?: Point2D;
  pt?: Point2D;
  pi?: Point2D;
  tangentInBearing?: number;   // Azimuth in degrees
  tangentOutBearing?: number;

  // 3-point method
  point1?: Point2D;
  point2?: Point2D;
  point3?: Point2D;
}

export function computeCurve(input: CurveInput): CurveParameters | null {
  let R: number | undefined = input.R;
  let delta: number | undefined = input.delta ? input.delta * DEG : undefined; // Convert to radians

  // ── Step 1: Determine R and Δ from whatever is provided ──

  // From Degree of Curve: D = 5729.578 / R (arc definition)
  if (input.D && !R) R = 5729.578 / input.D;

  // From R + L: Δ = L / R
  if (R && input.L && !delta) delta = input.L / R;

  // From R + C: Δ = 2 × arcsin(C / 2R)
  if (R && input.C && !delta) delta = 2 * Math.asin(input.C / (2 * R));

  // From R + T: Δ = 2 × arctan(T / R)
  if (R && input.T && !delta) delta = 2 * Math.atan(input.T / R);

  // From R + E: Δ = 2 × arccos(R / (R + E))
  if (R && input.E && !delta) delta = 2 * Math.acos(R / (R + input.E));

  // From R + M: Δ = 2 × arccos((R - M) / R)
  if (R && input.M && !delta) delta = 2 * Math.acos((R - input.M) / R);

  // From 3 points: fit circle through 3 points
  if (input.point1 && input.point2 && input.point3 && !R) {
    const circle = circleThrough3Points(input.point1, input.point2, input.point3);
    if (!circle) return null;
    R = circle.radius;
    // Compute delta from the arc subtended
    const a1 = Math.atan2(input.point1.y - circle.center.y, input.point1.x - circle.center.x);
    const a3 = Math.atan2(input.point3.y - circle.center.y, input.point3.x - circle.center.x);
    delta = Math.abs(normalizeAngle(a3 - a1));
  }

  // From two tangent bearings: Δ = difference of bearings
  if (input.tangentInBearing !== undefined && input.tangentOutBearing !== undefined && !delta) {
    let diff = input.tangentOutBearing - input.tangentInBearing;
    if (diff < -180) diff += 360;
    if (diff > 180) diff -= 360;
    delta = Math.abs(diff) * DEG;
    // Direction determined by sign of diff
    if (!input.direction) input.direction = diff > 0 ? 'RIGHT' : 'LEFT';
  }

  // Must have R and Δ by now
  if (!R || !delta) return null;
  const direction = input.direction ?? 'RIGHT';

  // ── Step 2: Compute all derived parameters ──
  const L = R * delta;
  const C = 2 * R * Math.sin(delta / 2);
  const T = R * Math.tan(delta / 2);
  const E = R * (1 / Math.cos(delta / 2) - 1);
  const M_val = R * (1 - Math.cos(delta / 2));
  const D = 5729.578 / R;

  // ── Step 3: Place the curve in space ──
  let pc: Point2D, pt: Point2D, pi: Point2D, rp: Point2D, mpc: Point2D;
  let tangentIn: number; // azimuth radians

  if (input.pc && input.tangentInBearing !== undefined) {
    // PC + tangent bearing given
    tangentIn = input.tangentInBearing * DEG;
    pc = input.pc;
    pi = {
      x: pc.x + T * Math.sin(tangentIn),
      y: pc.y + T * Math.cos(tangentIn),
    };
  } else if (input.pi && input.tangentInBearing !== undefined) {
    tangentIn = input.tangentInBearing * DEG;
    pi = input.pi;
    pc = {
      x: pi.x - T * Math.sin(tangentIn),
      y: pi.y - T * Math.cos(tangentIn),
    };
  } else if (input.pc && input.pt) {
    // Derive from two endpoints
    pc = input.pc;
    pt = input.pt!;
    const chordAz = Math.atan2(pt.x - pc.x, pt.y - pc.y);
    tangentIn = chordAz - (direction === 'RIGHT' ? delta / 2 : -delta / 2);
    pi = {
      x: pc.x + T * Math.sin(tangentIn),
      y: pc.y + T * Math.cos(tangentIn),
    };
  } else if (input.point1 && input.point2 && input.point3) {
    pc = input.point1;
    pt = input.point3;
    const circle = circleThrough3Points(input.point1, input.point2, input.point3)!;
    rp = circle.center;
    const a1 = Math.atan2(pc.y - rp.y, pc.x - rp.x);
    tangentIn = a1 + (direction === 'RIGHT' ? Math.PI / 2 : -Math.PI / 2);
    pi = {
      x: pc.x + T * Math.sin(tangentIn),
      y: pc.y + T * Math.cos(tangentIn),
    };
    mpc = {
      x: rp.x + R * Math.cos((a1 + Math.atan2(pt.y - rp.y, pt.x - rp.x)) / 2),
      y: rp.y + R * Math.sin((a1 + Math.atan2(pt.y - rp.y, pt.x - rp.x)) / 2),
    };
  } else {
    // No spatial anchor — place at origin with tangent due north
    tangentIn = 0;
    pc = { x: 0, y: 0 };
    pi = { x: T * Math.sin(tangentIn), y: T * Math.cos(tangentIn) };
  }

  // Compute radius point (center)
  const perpAngle = tangentIn + (direction === 'RIGHT' ? Math.PI / 2 : -Math.PI / 2);
  rp = rp! ?? {
    x: pc!.x + R * Math.sin(perpAngle),
    y: pc!.y + R * Math.cos(perpAngle),
  };

  // Compute PT from center for accuracy
  const pcAngle = Math.atan2(pc!.x - rp.x, pc!.y - rp.y);
  const ptAngle = pcAngle + (direction === 'RIGHT' ? -delta : delta);
  pt = {
    x: rp.x + R * Math.sin(ptAngle),
    y: rp.y + R * Math.cos(ptAngle),
  };

  // MPC
  const mpcAngle = pcAngle + (direction === 'RIGHT' ? -delta / 2 : delta / 2);
  mpc = mpc! ?? {
    x: rp.x + R * Math.sin(mpcAngle),
    y: rp.y + R * Math.cos(mpcAngle),
  };

  // Chord bearing
  const CB_az = inverseBearingDistance(pc!, pt).azimuth;

  return {
    R, delta, L, C, CB: CB_az * DEG, T, E, M: M_val, D, direction,
    pc: pc!, pt, pi: pi!, rp, mpc,
    tangentInBearing: tangentIn,
    tangentOutBearing: tangentIn + (direction === 'RIGHT' ? delta : -delta),
  };
}

// ── CIRCLE THROUGH 3 POINTS ──

function circleThrough3Points(p1: Point2D, p2: Point2D, p3: Point2D): { center: Point2D; radius: number } | null {
  const ax = p1.x, ay = p1.y;
  const bx = p2.x, by = p2.y;
  const cx = p3.x, cy = p3.y;

  const D_val = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(D_val) < 1e-10) return null; // Collinear

  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D_val;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D_val;

  const center = { x: ux, y: uy };
  const radius = Math.sqrt((ax - ux) ** 2 + (ay - uy) ** 2);

  return { center, radius };
}

function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
```

---

## 5. 7 Curve Input Methods

| # | Method | Required Inputs | Use Case |
|---|--------|-----------------|----------|
| 1 | R + Δ | Radius, central angle, direction, PC or PI | Most common — from deed or plat |
| 2 | R + L | Radius, arc length, direction, PC | When arc length is given |
| 3 | R + C | Radius, chord distance, direction, PC | When chord is given |
| 4 | 3-Point | Three points on the arc | Field data — PC, midpoint, PT |
| 5 | 2-Point + Tangent | PC, tangent bearing at PC, R, direction | When you know the entry tangent |
| 6 | Full Data Block | R, L, C, CB, Δ — cross-validate | Checking plat data for errors |
| 7 | 2 Tangents + R | Tangent-in bearing, tangent-out bearing, R | Intersection design |

The curve calculator dialog (Section 24) exposes all 7 methods. The user selects a method, fills in the inputs, and the calculator computes everything else. Method 6 computes from any 2 parameters and then validates the remaining values against the others.

---

## 6. Curve Cross-Validation

When the user provides more parameters than needed (over-determined), the system cross-checks them.

```typescript
// packages/geometry/src/curve.ts (continued)

export interface CurveValidation {
  isValid: boolean;
  maxError: number;                    // Maximum deviation across all checks
  checks: CurveCheck[];
}

export interface CurveCheck {
  parameter: string;                   // "L", "C", "T", etc.
  provided: number;
  computed: number;
  error: number;                       // Absolute difference
  tolerance: number;
  passed: boolean;
}

export function crossValidateCurve(input: CurveInput, computed: CurveParameters): CurveValidation {
  const checks: CurveCheck[] = [];

  // Check each provided parameter against computed
  const pairs: [string, number | undefined, number, number][] = [
    ['R',     input.R,     computed.R,                         0.01],
    ['delta', input.delta, computed.delta * 180 / Math.PI,     1/3600], // 1 second tolerance
    ['L',     input.L,     computed.L,                         0.01],
    ['C',     input.C,     computed.C,                         0.01],
    ['T',     input.T,     computed.T,                         0.01],
    ['E',     input.E,     computed.E,                         0.01],
    ['M',     input.M,     computed.M,                         0.01],
  ];

  for (const [name, provided, computedVal, tolerance] of pairs) {
    if (provided !== undefined) {
      const error = Math.abs(provided - computedVal);
      checks.push({
        parameter: name,
        provided,
        computed: computedVal,
        error,
        tolerance,
        passed: error <= tolerance,
      });
    }
  }

  const maxError = Math.max(0, ...checks.map(c => c.error));
  return {
    isValid: checks.every(c => c.passed),
    maxError,
    checks,
  };
}
```

---

## 7. Curb Return / Fillet Tool

Interactive tool: click first line, click second line, type or select radius → arc is computed and optionally trims the original lines.

```typescript
// packages/geometry/src/curb-return.ts

export interface CurbReturnInput {
  line1Start: Point2D;
  line1End: Point2D;
  line2Start: Point2D;
  line2End: Point2D;
  radius: number;
  trimOriginals: boolean;
}

export interface CurbReturnResult {
  curve: CurveParameters;
  trimmedLine1: { start: Point2D; end: Point2D } | null;
  trimmedLine2: { start: Point2D; end: Point2D } | null;
}

export const CURB_RETURN_PRESETS: { id: string; label: string; radius: number }[] = [
  { id: 'RES_25',  label: "Residential Standard (25')", radius: 25 },
  { id: 'RES_30',  label: "Residential Wide (30')",     radius: 30 },
  { id: 'COM_35',  label: "Commercial Standard (35')",  radius: 35 },
  { id: 'COM_40',  label: "Commercial (40')",           radius: 40 },
  { id: 'COM_50',  label: "Commercial Wide (50')",      radius: 50 },
  { id: 'CDS_40',  label: "Cul-de-sac (40')",          radius: 40 },
  { id: 'CDS_50',  label: "Cul-de-sac (50')",          radius: 50 },
  { id: 'DWY_5',   label: "Driveway Apron (5')",       radius: 5 },
  { id: 'DWY_10',  label: "Driveway Apron (10')",      radius: 10 },
  { id: 'ADA_3',   label: "ADA Ramp Flare (3')",       radius: 3 },
  { id: 'ADA_5',   label: "ADA Ramp Flare (5')",       radius: 5 },
];

export function computeCurbReturn(input: CurbReturnInput): CurbReturnResult | null {
  // 1. Find intersection of the two lines (PI)
  const pi = lineLineIntersection(input.line1Start, input.line1End, input.line2Start, input.line2End);
  if (!pi) return null; // Parallel lines

  // 2. Compute tangent bearings
  const bearing1 = inverseBearingDistance(input.line1Start, pi).azimuth;
  const bearing2 = inverseBearingDistance(pi, input.line2End).azimuth;

  // 3. Compute curve from 2 tangent bearings + R
  const curve = computeCurve({
    R: input.radius,
    tangentInBearing: bearing1,
    tangentOutBearing: bearing2,
    pi,
  });
  if (!curve) return null;

  // 4. Optionally trim original lines to PC and PT
  let trimmedLine1 = null, trimmedLine2 = null;
  if (input.trimOriginals) {
    trimmedLine1 = { start: input.line1Start, end: curve.pc };
    trimmedLine2 = { start: curve.pt, end: input.line2End };
  }

  return { curve, trimmedLine1, trimmedLine2 };
}
```

---

## 8. Compound Curves, Reverse Curves & Spirals

```typescript
// packages/geometry/src/compound-curve.ts

/** Compound curve: two arcs tangent to each other, curving in the same direction */
export interface CompoundCurve {
  curve1: CurveParameters;
  curve2: CurveParameters;
  pcc: Point2D;                        // Point of Compound Curvature (junction)
}

export function computeCompoundCurve(
  R1: number, delta1: number,
  R2: number, delta2: number,
  direction: 'LEFT' | 'RIGHT',
  pc: Point2D,
  tangentInBearing: number,
): CompoundCurve {
  const curve1 = computeCurve({ R: R1, delta: delta1, direction, pc, tangentInBearing })!;
  // Curve2 starts where curve1 ends, with tangent-out of curve1
  const curve2 = computeCurve({
    R: R2, delta: delta2, direction,
    pc: curve1.pt,
    tangentInBearing: curve1.tangentOutBearing * (180 / Math.PI),
  })!;

  return { curve1, curve2, pcc: curve1.pt };
}

/** Reverse curve: two arcs tangent to each other, curving in opposite directions */
export interface ReverseCurve {
  curve1: CurveParameters;
  curve2: CurveParameters;
  prc: Point2D;                        // Point of Reverse Curvature
}

export function computeReverseCurve(
  R1: number, delta1: number,
  R2: number, delta2: number,
  startDirection: 'LEFT' | 'RIGHT',
  pc: Point2D,
  tangentInBearing: number,
): ReverseCurve {
  const curve1 = computeCurve({ R: R1, delta: delta1, direction: startDirection, pc, tangentInBearing })!;
  const reverseDir = startDirection === 'LEFT' ? 'RIGHT' : 'LEFT';
  const curve2 = computeCurve({
    R: R2, delta: delta2, direction: reverseDir,
    pc: curve1.pt,
    tangentInBearing: curve1.tangentOutBearing * (180 / Math.PI),
  })!;

  return { curve1, curve2, prc: curve1.pt };
}

/** Clothoid spiral transition (between tangent and circular curve) */
export function computeClothoidSpiral(
  R: number,                           // Radius of the circular curve
  spiralLength: number,                // Length of spiral
  direction: 'LEFT' | 'RIGHT',
  ts: Point2D,                         // Tangent-to-Spiral point
  tangentBearing: number,              // Azimuth at TS
): SpiralDefinition {
  const A = Math.sqrt(R * spiralLength); // Spiral parameter

  // Spiral deflection angle: θ = L / (2R)
  const theta = spiralLength / (2 * R);

  // Approximate spiral coordinates using Fresnel integrals (series expansion)
  // X = L - L⁵/(40A⁴) + ...
  // Y = L³/(6A²) - L⁷/(336A⁶) + ...
  const X = spiralLength - (spiralLength ** 5) / (40 * A ** 4);
  const Y = (spiralLength ** 3) / (6 * A ** 2);

  // SC point in local coordinates, then rotate to world
  const bearing_rad = tangentBearing * (Math.PI / 180);
  const sign = direction === 'RIGHT' ? 1 : -1;

  const sc: Point2D = {
    x: ts.x + X * Math.sin(bearing_rad) + sign * Y * Math.cos(bearing_rad),
    y: ts.y + X * Math.cos(bearing_rad) - sign * Y * Math.sin(bearing_rad),
  };

  return {
    type: 'CLOTHOID',
    length: spiralLength,
    radiusStart: Infinity,
    radiusEnd: R,
    A,
    ts,
    sc,
    direction,
  };
}
```

---

## 9. Arc Rendering (True Arcs)

PixiJS doesn't natively draw arcs defined by center+radius+angles in the survey convention. We tessellate arcs into short line segments for rendering, but store the true arc definition for mathematical accuracy.

```typescript
// packages/geometry/src/arc-render.ts

/** Convert an arc definition to a polyline for rendering */
export function tessellateArc(
  arc: ArcDefinition,
  maxDeviation: number = 0.1,          // Maximum pixel deviation from true arc
  zoom: number = 1,                     // Pixels per world unit
): Point2D[] {
  const radiusPx = arc.radius * zoom;

  // Number of segments: more segments for larger arcs
  // Error = R(1 - cos(θ/2)) where θ is angle per segment
  // Solving for θ: θ = 2·arccos(1 - maxDeviation/radiusPx)
  const maxAnglePerSeg = 2 * Math.acos(Math.max(0, 1 - maxDeviation / Math.max(radiusPx, 1)));
  const totalAngle = Math.abs(arc.endAngle - arc.startAngle);
  const segments = Math.max(8, Math.ceil(totalAngle / maxAnglePerSeg));

  const points: Point2D[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = arc.startAngle + (arc.endAngle - arc.startAngle) * t;
    points.push({
      x: arc.center.x + arc.radius * Math.cos(angle),
      y: arc.center.y + arc.radius * Math.sin(angle),
    });
  }

  return points;
}

/** Convert an ArcDefinition to PixiJS Graphics draw calls */
export function drawArc(g: PIXI.Graphics, arc: ArcDefinition, viewport: ViewportTransform): void {
  const points = tessellateArc(arc, 0.5, viewport.zoom);
  const screenPts = points.map(p => viewport.worldToScreen(p));

  if (screenPts.length < 2) return;
  g.moveTo(screenPts[0].x, screenPts[0].y);
  for (let i = 1; i < screenPts.length; i++) {
    g.lineTo(screenPts[i].x, screenPts[i].y);
  }
}
```

---

## 10. Mixed Geometry Features (Straight + Arc)

Line strings from Phase 2 auto-connect can have mixed segments (straight, arc, spline). Phase 4 adds the ability to render and interact with them.

```typescript
// packages/geometry/src/mixed-geometry.ts

export function renderMixedGeometry(
  g: PIXI.Graphics,
  definition: MixedGeometryDefinition,
  viewport: ViewportTransform,
  style: ResolvedStyle,
): void {
  for (let i = 0; i < definition.segments.length; i++) {
    const seg = definition.segments[i];
    const pStart = definition.vertices[i];
    const pEnd = definition.vertices[i + 1];

    switch (seg.type) {
      case 'STRAIGHT':
        const s0 = viewport.worldToScreen(pStart);
        const s1 = viewport.worldToScreen(pEnd);
        g.moveTo(s0.x, s0.y);
        g.lineTo(s1.x, s1.y);
        break;

      case 'ARC':
        if (seg.arcDef) drawArc(g, seg.arcDef, viewport);
        break;

      case 'SPLINE':
        if (seg.splinePoints) {
          const splinePts = evaluateCubicSpline(seg.splinePoints, 50);
          const screenPts = splinePts.map(p => viewport.worldToScreen(p));
          g.moveTo(screenPts[0].x, screenPts[0].y);
          for (const sp of screenPts.slice(1)) g.lineTo(sp.x, sp.y);
        }
        break;
    }
  }
}
```

---

## 11. Fit-Point Spline Tool (Fusion 360 Style)

```typescript
// packages/geometry/src/spline.ts

/**
 * Evaluate a cubic Catmull-Rom spline through fit points.
 * Returns a dense array of points for rendering.
 */
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

    // Bezier control points for this segment:
    //   P0 = fitPoints[i]
    //   P1 = fitPoints[i] + right tangent handle
    //   P2 = fitPoints[i+1] - left tangent handle
    //   P3 = fitPoints[i+1]

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
      if (i > 0 && s === 0) continue; // Skip duplicate junction point
      result.push(cubicBezier(p0, p1, p2, p3, t));
    }
  }

  if (spline.isClosed && pts.length > 2) {
    // Close: connect last point back to first with a segment
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

function cubicBezier(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, t: number): Point2D {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

/**
 * Auto-compute tangent handles for a set of fit points using Catmull-Rom method.
 * Called when the user first places points. Handles can be edited after.
 */
export function autoComputeTangentHandles(fitPoints: Point2D[], isClosed: boolean): TangentHandle[] {
  const n = fitPoints.length;
  const handles: TangentHandle[] = [];

  for (let i = 0; i < n; i++) {
    const prev = fitPoints[(i - 1 + n) % n];
    const curr = fitPoints[i];
    const next = fitPoints[(i + 1) % n];

    // Catmull-Rom: tangent direction = (next - prev) normalized
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = len > 0 ? dx / len : 1;
    const ny = len > 0 ? dy / len : 0;

    // Magnitude: 1/3 of the distance to neighbors
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
```

**Interaction model (Fusion 360 style):**

- Click to place fit points. Preview curve updates live.
- Double-click or Enter to finish.
- After placement, blue squares appear at fit points and green circles at tangent handle endpoints.
- Drag a fit point to move it (curve re-fits).
- Drag a tangent handle endpoint to adjust curvature.
- Alt+drag a handle to break symmetry (left/right become independent).
- Right-click a fit point: Delete Point, Insert Point Before/After, Make Corner, Reset Handles.
- Ctrl+click on the spline to insert a new fit point at that location.

---

## 12. Control-Point Spline Tool (NURBS)

```typescript
// packages/geometry/src/spline.ts (continued)

/**
 * Evaluate a NURBS (Non-Uniform Rational B-Spline) curve.
 * Control points define the "cage" — the curve is attracted toward them
 * but generally doesn't pass through them (except endpoints).
 */
export function evaluateNURBS(
  spline: ControlPointSplineDefinition,
  samples: number = 100,
): Point2D[] {
  const n = spline.controlPoints.length;
  const p = spline.degree;

  // Generate uniform knot vector (clamped)
  const knots = generateClampedKnots(n, p);

  const result: Point2D[] = [];
  for (let s = 0; s <= samples; s++) {
    const t = s / samples;
    const u = knots[p] + t * (knots[n] - knots[p]); // Map to valid parameter range
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
```

---

## 13. Spline Rendering & Interaction

Splines are evaluated to dense point arrays and rendered as polylines. The key rendering additions:

- **Tangent handles:** shown as green lines with draggable endpoints when the spline is selected.
- **Curvature comb:** optional overlay (toggled in View menu) showing curvature magnitude perpendicular to the spline at each sample point. Higher curvature = longer comb teeth. Useful for quality checking.
- **Control polygon:** for NURBS, dashed gray lines connecting control points (visible when selected).

---

## 14. Spline-to-Arc Conversion

For legal descriptions, splines must be converted to sequences of tangent-continuous arcs.

```typescript
// packages/geometry/src/spline-to-arc.ts

export interface SplineToArcConfig {
  tolerance: number;                   // Max deviation from spline (feet). Default: 0.01
  maxSegments: number;                 // Max arcs to generate. Default: 50
  preserveEndTangents: boolean;        // Match spline tangent at endpoints
}

export interface SplineToArcResult {
  segments: ArcOrLineSegment[];
  maxDeviation: number;
  segmentCount: number;
}

export interface ArcOrLineSegment {
  type: 'LINE' | 'ARC';
  start: Point2D;
  end: Point2D;
  // For ARC:
  center?: Point2D;
  radius?: number;
  direction?: 'CW' | 'CCW';
  curveParams?: CurveParameters;
}

/**
 * Bi-arc fitting algorithm:
 * 1. Sample the spline at increasing resolution
 * 2. For each segment, try fitting a single arc
 * 3. If deviation exceeds tolerance, subdivide and fit bi-arcs
 * 4. Repeat until all segments are within tolerance or maxSegments reached
 */
export function convertSplineToArcs(
  splinePoints: Point2D[],
  tangentStart: Point2D,               // Tangent direction at start
  tangentEnd: Point2D,                 // Tangent direction at end
  config: SplineToArcConfig,
): SplineToArcResult {
  const segments: ArcOrLineSegment[] = [];
  let maxDev = 0;

  // Recursive subdivision
  function fitSegment(startIdx: number, endIdx: number, depth: number): void {
    if (depth > 20 || segments.length >= config.maxSegments) {
      // Fallback: straight line
      segments.push({ type: 'LINE', start: splinePoints[startIdx], end: splinePoints[endIdx] });
      return;
    }

    const pStart = splinePoints[startIdx];
    const pEnd = splinePoints[endIdx];

    // Try fitting a single arc through start, midpoint, end
    const midIdx = Math.floor((startIdx + endIdx) / 2);
    const pMid = splinePoints[midIdx];

    const circle = circleThrough3Points(pStart, pMid, pEnd);

    if (!circle) {
      // Collinear — use a straight line
      segments.push({ type: 'LINE', start: pStart, end: pEnd });
      return;
    }

    // Check deviation of all intermediate points
    let segMaxDev = 0;
    for (let i = startIdx; i <= endIdx; i++) {
      const dist = Math.abs(
        Math.sqrt(
          (splinePoints[i].x - circle.center.x) ** 2 +
          (splinePoints[i].y - circle.center.y) ** 2
        ) - circle.radius
      );
      segMaxDev = Math.max(segMaxDev, dist);
    }

    if (segMaxDev <= config.tolerance) {
      // Arc fits within tolerance
      const direction = crossProduct(pStart, pMid, pEnd) > 0 ? 'CCW' : 'CW';
      segments.push({
        type: 'ARC', start: pStart, end: pEnd,
        center: circle.center, radius: circle.radius, direction,
      });
      maxDev = Math.max(maxDev, segMaxDev);
    } else {
      // Subdivide
      fitSegment(startIdx, midIdx, depth + 1);
      fitSegment(midIdx, endIdx, depth + 1);
    }
  }

  fitSegment(0, splinePoints.length - 1, 0);

  return { segments, maxDeviation: maxDev, segmentCount: segments.length };
}

function crossProduct(a: Point2D, b: Point2D, c: Point2D): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
```

---

## 15. Offset Engine

```typescript
// packages/geometry/src/offset.ts

export const OFFSET_PRESETS: { id: string; label: string; config: Partial<OffsetConfig> }[] = [
  { id: 'UE_7.5',     label: "Utility Easement (7.5')",   config: { distance: 7.5,  cornerHandling: 'ROUND' } },
  { id: 'UE_10',      label: "Utility Easement (10')",    config: { distance: 10,   cornerHandling: 'ROUND' } },
  { id: 'DE_15',      label: "Drainage Easement (15')",   config: { distance: 15,   cornerHandling: 'ROUND' } },
  { id: 'DE_20',      label: "Drainage Easement (20')",   config: { distance: 20,   cornerHandling: 'ROUND' } },
  { id: 'SB_FRONT',   label: "Front Setback (25')",       config: { distance: 25,   cornerHandling: 'MITER' } },
  { id: 'SB_SIDE_5',  label: "Side Setback (5')",         config: { distance: 5,    cornerHandling: 'MITER' } },
  { id: 'SB_SIDE_7',  label: "Side Setback (7.5')",       config: { distance: 7.5,  cornerHandling: 'MITER' } },
  { id: 'SB_REAR',    label: "Rear Setback (10')",        config: { distance: 10,   cornerHandling: 'MITER' } },
  { id: 'ROW_25',     label: "ROW from CL (25')",         config: { distance: 25,   cornerHandling: 'ROUND' } },
  { id: 'ROW_30',     label: "ROW from CL (30')",         config: { distance: 30,   cornerHandling: 'ROUND' } },
  { id: 'CURB_0.5',   label: "Curb Face (0.5')",          config: { distance: 0.5,  cornerHandling: 'ROUND' } },
  { id: 'GUTTER_1.5', label: "Curb & Gutter (1.5')",      config: { distance: 1.5,  cornerHandling: 'ROUND' } },
];

/**
 * Offset a polyline by a given distance.
 * Handles corners based on config: MITER, ROUND, or CHAMFER.
 * Works for straight segments and arcs in mixed geometry.
 */
export function offsetPolyline(
  vertices: Point2D[],
  config: OffsetConfig,
): Point2D[] {
  if (vertices.length < 2) return [];

  const d = config.distance * (config.side === 'LEFT' ? 1 : -1);
  const result: Point2D[] = [];

  // Offset each segment
  const offsetSegs: [Point2D, Point2D][] = [];
  for (let i = 0; i < vertices.length - 1; i++) {
    const p0 = vertices[i], p1 = vertices[i + 1];
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-10) continue;

    // Perpendicular offset direction
    const nx = -dy / len * d, ny = dx / len * d;
    offsetSegs.push([
      { x: p0.x + nx, y: p0.y + ny },
      { x: p1.x + nx, y: p1.y + ny },
    ]);
  }

  if (offsetSegs.length === 0) return [];

  // First point of first segment
  result.push(offsetSegs[0][0]);

  // Handle corners between consecutive offset segments
  for (let i = 0; i < offsetSegs.length - 1; i++) {
    const [_, end1] = offsetSegs[i];
    const [start2] = offsetSegs[i + 1];

    // Find intersection of the two offset lines
    const inter = lineLineIntersection(
      offsetSegs[i][0], offsetSegs[i][1],
      offsetSegs[i + 1][0], offsetSegs[i + 1][1],
    );

    if (!inter) {
      // Parallel — just connect
      result.push(end1);
      result.push(start2);
      continue;
    }

    // Check if it's an inside or outside corner
    const miterDist = Math.sqrt((inter.x - end1.x) ** 2 + (inter.y - end1.y) ** 2);

    switch (config.cornerHandling) {
      case 'MITER':
        if (miterDist < Math.abs(d) * config.miterLimit) {
          result.push(inter);
        } else {
          // Miter too long — bevel
          result.push(end1);
          result.push(start2);
        }
        break;

      case 'ROUND': {
        // Arc from end1 to start2 around the original vertex
        const center = vertices[i + 1];
        const startAngle = Math.atan2(end1.y - center.y, end1.x - center.x);
        const endAngle = Math.atan2(start2.y - center.y, start2.x - center.x);
        const arcPts = tessellateArc({
          center, radius: Math.abs(d),
          startAngle, endAngle,
          direction: d > 0 ? 'CCW' : 'CW',
          pc: end1, pt: start2, mpc: center, pi: center,
        }, 0.5);
        for (const p of arcPts) result.push(p);
        break;
      }

      case 'CHAMFER':
        result.push(end1);
        result.push(start2);
        break;
    }
  }

  // Last point of last segment
  result.push(offsetSegs[offsetSegs.length - 1][1]);

  return result;
}
```

**Parametric links:** When `maintainLink` is true, the offset feature stores a reference to its source feature. If the source changes (moved, vertices edited), the offset is recomputed automatically. The link can be broken by the user (right-click → Break Link) which makes the offset independent.

---

## 16. Traverse Management

```typescript
// packages/geometry/src/traverse.ts

export function createTraverse(
  pointIds: string[],
  points: Map<string, SurveyPoint>,
  isClosed: boolean,
): Traverse {
  const legs: TraverseLeg[] = [];

  for (let i = 0; i < pointIds.length - 1; i++) {
    const from = points.get(pointIds[i])!;
    const to = points.get(pointIds[i + 1])!;
    const inv = inverseBearingDistance(
      { x: from.easting, y: from.northing },
      { x: to.easting, y: to.northing },
    );
    legs.push({
      fromPointId: pointIds[i],
      toPointId: pointIds[i + 1],
      bearing: inv.azimuth,
      distance: inv.distance,
      deltaNorth: to.northing - from.northing,
      deltaEast: to.easting - from.easting,
      isArc: false,
      curveData: null,
    });
  }

  // Closing leg (if closed)
  if (isClosed && pointIds.length > 2) {
    const from = points.get(pointIds[pointIds.length - 1])!;
    const to = points.get(pointIds[0])!;
    const inv = inverseBearingDistance(
      { x: from.easting, y: from.northing },
      { x: to.easting, y: to.northing },
    );
    legs.push({
      fromPointId: pointIds[pointIds.length - 1],
      toPointId: pointIds[0],
      bearing: inv.azimuth,
      distance: inv.distance,
      deltaNorth: to.northing - from.northing,
      deltaEast: to.easting - from.easting,
      isArc: false,
      curveData: null,
    });
  }

  const traverse: Traverse = {
    id: generateId(),
    name: 'Traverse 1',
    pointIds,
    isClosed,
    legs,
    closure: null,
    adjustedPoints: null,
    adjustmentMethod: null,
    area: null,
  };

  if (isClosed) {
    traverse.closure = computeClosure(traverse);
    traverse.area = computeArea(pointIds.map(id => points.get(id)!));
  }

  return traverse;
}
```

---

## 17. Closure Calculation

```typescript
// packages/geometry/src/closure.ts

export function computeClosure(traverse: Traverse): ClosureResult {
  let sumNorth = 0, sumEast = 0, totalDist = 0;

  for (const leg of traverse.legs) {
    sumNorth += leg.deltaNorth;
    sumEast += leg.deltaEast;
    totalDist += leg.distance;
  }

  const linearError = Math.sqrt(sumNorth * sumNorth + sumEast * sumEast);
  const errorBearing = Math.atan2(sumEast, sumNorth) * (180 / Math.PI);
  const precisionDenominator = linearError > 0 ? Math.round(totalDist / linearError) : Infinity;
  const precisionRatio = linearError > 0
    ? `1:${precisionDenominator.toLocaleString()}`
    : '1:∞ (perfect)';

  // Angular error: sum of interior angles vs expected
  // For a closed traverse with n sides: expected = (n-2)×180°
  const n = traverse.legs.length;
  let angularSum = 0;
  for (let i = 0; i < n; i++) {
    const bearIn = traverse.legs[i].bearing;
    const bearOut = traverse.legs[(i + 1) % n].bearing;
    let angle = bearOut - bearIn + 180;
    if (angle < 0) angle += 360;
    if (angle > 360) angle -= 360;
    angularSum += angle;
  }
  const expectedAngular = (n - 2) * 180;
  const angularError = (angularSum - expectedAngular) * 3600; // Convert to seconds

  return {
    linearError,
    errorNorth: sumNorth,
    errorEast: sumEast,
    errorBearing: errorBearing < 0 ? errorBearing + 360 : errorBearing,
    angularError,
    precisionRatio,
    precisionDenominator,
    totalDistance: totalDist,
  };
}
```

---

## 18. Bowditch (Compass Rule) Adjustment

```typescript
// packages/geometry/src/closure.ts (continued)

export function bowditchAdjustment(traverse: Traverse): Point2D[] {
  const closure = traverse.closure ?? computeClosure(traverse);
  const totalDist = closure.totalDistance;

  // Compass rule: correction proportional to cumulative distance
  const correctedPoints: Point2D[] = [];
  let cumDist = 0;

  // Start at the first point (unchanged)
  correctedPoints.push({ x: 0, y: 0 }); // Relative — add to original coords when applying

  for (let i = 0; i < traverse.legs.length; i++) {
    cumDist += traverse.legs[i].distance;
    const ratio = cumDist / totalDist;

    correctedPoints.push({
      x: -closure.errorEast * ratio,    // Correction to easting
      y: -closure.errorNorth * ratio,   // Correction to northing
    });
  }

  return correctedPoints;
}

export function transitAdjustment(traverse: Traverse): Point2D[] {
  const closure = traverse.closure ?? computeClosure(traverse);
  const totalAbsN = traverse.legs.reduce((s, l) => s + Math.abs(l.deltaNorth), 0);
  const totalAbsE = traverse.legs.reduce((s, l) => s + Math.abs(l.deltaEast), 0);

  const correctedPoints: Point2D[] = [{ x: 0, y: 0 }];
  let cumAbsN = 0, cumAbsE = 0;

  for (let i = 0; i < traverse.legs.length; i++) {
    cumAbsN += Math.abs(traverse.legs[i].deltaNorth);
    cumAbsE += Math.abs(traverse.legs[i].deltaEast);

    correctedPoints.push({
      x: -closure.errorEast * (cumAbsE / totalAbsE),
      y: -closure.errorNorth * (cumAbsN / totalAbsN),
    });
  }

  return correctedPoints;
}
```

---

## 19. Area Computation

```typescript
// packages/geometry/src/area.ts

/** Coordinate (Shoelace) method for area of a closed polygon */
export function computeArea(points: SurveyPoint[]): AreaResult {
  const n = points.length;
  if (n < 3) return { squareFeet: 0, acres: 0, method: 'COORDINATE' };

  // Double area = Σ(x_i × y_{i+1} − x_{i+1} × y_i)
  let doubleArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    doubleArea += points[i].easting * points[j].northing;
    doubleArea -= points[j].easting * points[i].northing;
  }

  const sqft = Math.abs(doubleArea / 2);
  return {
    squareFeet: sqft,
    acres: sqft / 43560,
    method: 'COORDINATE',
  };
}
```

---

## 20. Inverse Calculation Tool

Interactive tool: click point A, click point B → display bearing and distance.

```typescript
// Reuses inverseBearingDistance from bearing.ts
// UI: floating tooltip at midpoint showing:
//   N 45°30'15" E
//   234.56'
// Also shown in the command bar / status bar.
// Result can be copied to clipboard.
```

---

## 21. Forward Point Tool

Interactive tool: click base point, type bearing and distance → new point placed.

```typescript
export function forwardPoint(from: Point2D, azimuthDeg: number, distance: number): Point2D {
  const azRad = azimuthDeg * (Math.PI / 180);
  return {
    x: from.x + distance * Math.sin(azRad),  // Easting
    y: from.y + distance * Math.cos(azRad),   // Northing
  };
}
```

---

## 22. Bearing/Distance Input Mode

The command bar (Phase 1) is extended to accept bearing/distance pairs for precise point placement during drawing:

```
Command bar accepts:
  N 45 30 15 E, 234.56    → Bearing + distance (quadrant)
  45.5042, 234.56          → Azimuth (decimal deg) + distance
  @234.56<N45-30-15E       → Relative: distance at bearing from last point
  @100,200                 → Relative: delta-E, delta-N from last point (Phase 1)
  100,200                  → Absolute: Easting, Northing (Phase 1)
```

Parsing logic is added to the command bar's input handler.

---

## 23. Legal Description Generator

```typescript
// packages/geometry/src/legal-desc.ts

export interface LegalDescConfig {
  format: 'METES_AND_BOUNDS';
  bearingPrecision: 'SECOND' | 'TENTH_SECOND';
  distancePrecision: number;           // Decimal places (0-4), default 2
  includeMonumentDescriptions: boolean;
  includeCurveData: boolean;
  basisOfBearings: string;             // e.g., "the east line of the John Smith Survey"
  datumStatement: string;
  areaDisplay: 'SQFT_AND_ACRES' | 'ACRES_ONLY';
}

export function generateLegalDescription(
  traverse: Traverse,
  points: Map<string, SurveyPoint>,
  config: LegalDescConfig,
): string {
  const lines: string[] = [];

  // Opening
  lines.push('BEGINNING at a point');
  if (config.includeMonumentDescriptions) {
    const startPt = points.get(traverse.pointIds[0]);
    if (startPt?.codeDefinition) {
      lines[0] += `, a ${startPt.codeDefinition.description.toLowerCase()},`;
    }
  }

  // Each leg
  for (let i = 0; i < traverse.legs.length; i++) {
    const leg = traverse.legs[i];
    const bearing = formatBearing(leg.bearing, config.bearingPrecision);
    const dist = leg.distance.toFixed(config.distancePrecision);

    if (leg.isArc && leg.curveData && config.includeCurveData) {
      // Curve call
      const cd = leg.curveData;
      const dir = cd.direction === 'RIGHT' ? 'right' : 'left';
      const deltaFmt = formatDMS(cd.delta * 180 / Math.PI);
      lines.push(
        `THENCE along a curve to the ${dir}, having a radius of ${cd.R.toFixed(2)} feet, ` +
        `a central angle of ${deltaFmt}, an arc length of ${cd.L.toFixed(2)} feet, ` +
        `and a chord bearing of ${formatBearing(cd.CB * 180 / Math.PI, config.bearingPrecision)} ` +
        `for a chord distance of ${cd.C.toFixed(2)} feet;`
      );
    } else {
      lines.push(`THENCE ${bearing}, a distance of ${dist} feet`);
    }

    // Monument at destination
    if (config.includeMonumentDescriptions && i < traverse.legs.length - 1) {
      const destPt = points.get(leg.toPointId);
      if (destPt?.codeDefinition?.category === 'BOUNDARY_CONTROL') {
        lines[lines.length - 1] += ` to a ${destPt.codeDefinition.description.toLowerCase()}`;
      }
    }

    if (!lines[lines.length - 1].endsWith(';')) {
      lines[lines.length - 1] += ';';
    }
  }

  // Closing
  lines.push('THENCE to the POINT OF BEGINNING.');

  // Area
  if (traverse.area) {
    const acres = traverse.area.acres.toFixed(4);
    const sqft = Math.round(traverse.area.squareFeet).toLocaleString();
    if (config.areaDisplay === 'SQFT_AND_ACRES') {
      lines.push(`CONTAINING ${sqft} square feet (${acres} acres), more or less.`);
    } else {
      lines.push(`CONTAINING ${acres} acres, more or less.`);
    }
  }

  // Basis of bearings
  if (config.basisOfBearings) {
    lines.push(`BASIS OF BEARINGS: ${config.basisOfBearings}.`);
  }

  return lines.join('\n\n');
}

function formatDMS(degrees: number): string {
  const dms = decimalToDMS(Math.abs(degrees));
  return `${dms.degrees}°${String(dms.minutes).padStart(2, '0')}'${String(dms.seconds).padStart(2, '0')}"`;
}
```

---

## 24. Curve Calculator Dialog UI

```
┌─ Curve Calculator ──────────────────────────────────────────────┐
│                                                                 │
│  Method: [R + Δ ▼]                                              │
│                                                                 │
│  ┌─ Input ──────────────────┐  ┌─ Results ──────────────────┐  │
│  │ Radius (R):    [500.00]  │  │ Arc Length (L):   261.80   │  │
│  │ Delta (Δ):     [30°00']  │  │ Chord (C):        258.82   │  │
│  │ Direction:     [● R ○ L] │  │ Chord Brg (CB):   N60°E   │  │
│  │                          │  │ Tangent (T):      133.97   │  │
│  │ PC (N,E):  [click map]   │  │ External (E):     17.64   │  │
│  │ Tangent In: [N 45°00' E] │  │ Mid-Ord (M):      17.27   │  │
│  │                          │  │ Deg Curve (D):    11.459  │  │
│  └──────────────────────────┘  │                            │  │
│                                │ ✅ All values consistent   │  │
│  ┌─ Key Points ─────────────┐  └────────────────────────────┘  │
│  │ PC: (598234.78, 2145...)  │                                  │
│  │ PT: (598495.12, 2145...)  │                                  │
│  │ PI: (598360.45, 2145...)  │                                  │
│  │ RP: (598114.23, 2145...)  │                                  │
│  │ MPC:(598365.89, 2145...)  │                                  │
│  └───────────────────────────┘                                  │
│                                                                 │
│  [Place on Drawing]  [Copy to Clipboard]  [Close]               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 25. Traverse Panel UI

```
┌─ Traverse: "Boundary" ──────────── [+New] [⚙] ─┐
│                                                  │
│  ┌─ Points ──────────────────────────────────┐   │
│  │  #  │ Name  │ Bearing      │ Distance     │   │
│  │  1  │ 20set │ —            │ —            │   │
│  │  2  │ 21fnd │ N 45°30'15"E │ 234.56'      │   │
│  │  3  │ 22set │ S 30°15'00"E │ 156.78'      │   │
│  │  4  │ 23fnd │ S 60°45'30"W │ 312.34'      │   │
│  │  ↻  │ →20   │ N 15°20'10"W │ 198.90'      │   │
│  └───────────────────────────────────────────┘   │
│                                                  │
│  ┌─ Closure ─────────────────────────────────┐   │
│  │ Linear Error: 0.032'                      │   │
│  │ Precision:    1:28,315                    │   │
│  │ Error Brg:    S 56°12'30" E               │   │
│  │ ΔN: -0.018'   ΔE: +0.027'                │   │
│  │ Angular Error: 12"                        │   │
│  └───────────────────────────────────────────┘   │
│                                                  │
│  ┌─ Area ────────────────────────────────────┐   │
│  │ 12,345 sq ft  (0.2835 acres)              │   │
│  └───────────────────────────────────────────┘   │
│                                                  │
│  [Adjust (Compass)]  [Legal Desc]  [Export]      │
└──────────────────────────────────────────────────┘
```

---

## 26. State Management Updates

### 26.1 Traverse Store (NEW)

```typescript
interface TraverseStore {
  traverses: Record<string, Traverse>;
  activeTraverseId: string | null;

  createTraverse: (name: string, pointIds: string[], isClosed: boolean) => string;
  deleteTraverse: (id: string) => void;
  updateTraverse: (id: string, updates: Partial<Traverse>) => void;
  addPointToTraverse: (traverseId: string, pointId: string, index?: number) => void;
  removePointFromTraverse: (traverseId: string, pointId: string) => void;
  reorderTraversePoints: (traverseId: string, pointIds: string[]) => void;
  computeClosure: (traverseId: string) => void;
  adjustTraverse: (traverseId: string, method: AdjustmentMethod) => void;
  setActiveTraverse: (id: string | null) => void;
}
```

### 26.2 Tool Store Updates

New tools added: `DRAW_ARC`, `DRAW_SPLINE_FIT`, `DRAW_SPLINE_CONTROL`, `CURB_RETURN`, `OFFSET`, `INVERSE`, `FORWARD_POINT`.

---

## 27. Acceptance Tests

> **Legend:** ✅ passes in unit tests | 🔶 math implemented, canvas interaction pending | ❌ not yet implemented

### Bearing System

- ✅ N 45°30'15" E → azimuth 45.504167° (`bearing.test.ts`)
- ✅ S 30°15'00" E → azimuth 149.75° (`bearing.test.ts`)
- ✅ Azimuth 225° → S 45°00'00" W (`bearing.test.ts`)
- ✅ Round-trip: any azimuth → quadrant → azimuth matches (`bearing.test.ts`)
- ✅ `parseBearing("N 45 30 15 E")` returns correct azimuth (`bearing.test.ts`)
- ✅ `parseBearing("N45-30-15E")` returns correct azimuth (`bearing.test.ts`)
- ✅ `parseBearing("135.5")` returns 135.5 (`bearing.test.ts`)

### Curve Calculator

- ✅ R=500, Δ=30° → L=261.80, C=258.82, T=133.97, E=17.64, M=17.27 (`curve.test.ts`)
- ✅ R=500, L=261.80 → Δ=30°, C=258.82 (reverse solve) (`curve.test.ts`)
- ✅ 3-point method: PC, midpoint, PT → correct R and Δ (`curve.test.ts`)
- ✅ Cross-validation: provide R, Δ, L all correct → passes (`curve.test.ts`)
- ✅ Cross-validation: provide R, Δ, L with L wrong → fails, shows error (`curve.test.ts`)

### Curb Return

- ✅ Two perpendicular lines + 25' radius → correct arc (math in `curb-return.ts`; `CURB_RETURN` canvas handler wired; `curb-return.test.ts`)
- ✅ Trim option shortens original lines to PC/PT (`curb-return.ts`; canvas handler dispatches `cad:curbReturn` with `trim` flag)
- ✅ All 11 presets produce valid curves (`curb-return.test.ts`)

### Spline (Fit-Point)

- ✅ 3 fit points → smooth cubic spline through all 3 (`spline.test.ts`)
- ✅ Moving a fit point re-fits the curve (wired in `CanvasViewport` grip editing)
- ✅ Alt+drag breaks tangent handle symmetry (wired in `CanvasViewport`)
- ✅ Double-click to finish, Escape to cancel (wired in `CanvasViewport`)
- ✅ Auto-spline codes (streams, ponds) use this tool automatically (via `code-library.ts` `isSpline` flag)

### Spline-to-Arc

- ✅ Simple S-curve → 2–3 arcs within 0.01' tolerance (`spline.test.ts`)
- ✅ Tight curves need more segments (`spline.test.ts`)
- ✅ `maxSegments` limit is respected (`spline.test.ts`)

### Offset

- ✅ Offset a rectangle 10' outward → larger rectangle with correct corners (`offset.test.ts`)
- ✅ MITER corners: sharp intersections (`offset.test.ts`)
- ✅ CHAMFER corners: beveled (`offset.test.ts`)
- 🔶 ROUND corners: arc at each corner (logic in `offset.ts`, not yet in test)
- ✅ All 12 presets produce correct offsets (`offset.test.ts`)

### Traverse & Closure

- ✅ 4-point closed traverse → correct bearing/distance per leg (`traverse.ts`; `traverse.test.ts`)
- ✅ Closure error computed correctly (`closure.test.ts`)
- ✅ Precision ratio matches manual calculation (`closure.test.ts`)
- ✅ Bowditch adjustment distributes error proportionally to distance (`closure.test.ts`)
- ✅ Adjusted traverse closes to 0.000' (within floating-point) (`closure.test.ts`)

### Area

- ✅ 100' × 100' square → 10,000 sq ft (0.2296 acres) (`area.test.ts`)
- ✅ Irregular polygon matches manual calculation (`area.test.ts`)
- ✅ Area updates when traverse points move (UI wired in TraversePanel; `traverse.test.ts`)

### Inverse & Forward

- ✅ Inverse: two known points → correct bearing and distance (`INVERSE` canvas handler: click A → click B → bearing+distance shown in command bar output)
- ✅ Forward: base + bearing + distance → correct new point (`FORWARD_POINT` canvas handler: click base point, type "bearing distance" → point placed)

### Legal Description

- ✅ Generates correct metes and bounds text (`legal-desc.test.ts`)
- ✅ Bearings formatted in quadrant notation (`legal-desc.test.ts`)
- ✅ Curve data included when present (`legal-desc.test.ts`)
- ✅ Area statement included (`legal-desc.test.ts`)
- ✅ Monument descriptions included when enabled (`legal-desc.test.ts`)

---

## 28. Build Order (Implementation Sequence)

> **Phase 4 is COMPLETE.** All items below are done.

### Week 1–2: Core Math ✅ DONE

- ✅ Built `bearing.ts` (DMS, quadrant, azimuth, parsing, formatting)
- ✅ Built `inverseBearingDistance`
- ✅ Built `forwardPoint`
- ✅ Built `curve.ts` (computeCurve with all 7 input methods)
- ✅ Built `circleThrough3Points`
- ✅ Built `crossValidateCurve`
- ✅ Wrote unit tests for all bearing conversions
- ✅ Wrote unit tests for curve calculator (all 7 methods)

### Week 3: Curves & Arcs ✅ DONE

- ✅ Built `curb-return.ts` with all 11 presets
- ✅ Built compound-curve and reverse-curve
- ✅ Built clothoid spiral computation
- ✅ Built `arc-render.ts` (tessellation for PixiJS)
- ✅ Built mixed geometry rendering
- ✅ Wired arc rendering into the Phase 3 styled renderer
- ✅ Wrote tests for curb returns (`curb-return.test.ts`, 15 tests)

### Week 4: Splines ✅ DONE

- ✅ Built fit-point spline evaluation (cubic Bézier)
- ✅ Built auto tangent handle computation (Catmull-Rom)
- ✅ Built NURBS evaluation
- ✅ Built spline-to-arc conversion (bi-arc fitting)
- ✅ Built spline rendering (evaluate → polyline → PixiJS)
- ✅ Built spline interaction (tangent handle dragging, point insertion)
- ✅ Wrote tests for spline evaluation and conversion

### Week 5: Offsets ✅ DONE

- ✅ Built `offset.ts` (polyline offset with MITER/ROUND/CHAMFER)
- ✅ Built offset presets (12 total)
- ✅ Handled offset of mixed geometry (straight + arc)
- ✅ Wrote tests for offset correctness
- ✅ Built OFFSET tool wired in CanvasViewport

### Week 6: Traverse & Area ✅ DONE

- ✅ Built `traverse.ts` (create traverse from point selection)
- ✅ Built `closure.ts` (linear error, angular error, precision ratio)
- ✅ Built Bowditch and Transit adjustments
- ✅ Built `area.ts` (coordinate method)
- ✅ Built `legal-desc.ts` (metes and bounds generator)
- ✅ Wrote closure + area + legal-desc tests
- ✅ Wrote traverse tests (`traverse.test.ts`, 12 tests)
- ✅ Built TraversePanel component

### Week 7: UI Tools ✅ DONE

- ✅ Built CurveCalculator dialog (7 input methods, cross-validation) — 315 lines
- ✅ CURB_RETURN canvas interaction wired (click line 1 → line 2 → type radius; dispatches `cad:curbReturn`)
- ✅ SplineTool (DRAW_CURVED_LINE + DRAW_SPLINE_FIT) fully working
- ✅ INVERSE canvas handler wired (click A → click B → bearing+distance shown in command bar)
- ✅ FORWARD_POINT canvas handler wired (click base → type "bearing distance" in command bar → place point)
- ✅ Command bar accepts DMS bearing input; prompts for INVERSE/FORWARD_POINT/CURB_RETURN
- ✅ Built ClosureReport component

### Week 8–9: Integration & Testing ✅ DONE

- ✅ All tools wired into toolbar
- ✅ Keyboard shortcuts for all tools
- ✅ CURB_RETURN, INVERSE, FORWARD_POINT canvas interactions wired
- ✅ traverse.test.ts and curb-return.test.ts added
- ✅ 458 unit tests pass (23 test files)
- Test curve calculator against known survey plats
- Run ALL acceptance tests from Section 27
- Performance test spline rendering with 50+ fit points
- Fix failures, polish UI

---

## Copilot Session Template

> I am building Starr CAD Phase 4 — Geometry Tools, Curves, Splines, Offsets & Survey Math. Phases 1–3 (CAD engine, data import, styling pipeline) are complete. I am now building the survey math core: circular curve calculator with 7 input methods and cross-validation, curb return/fillet tool with 11 presets, compound/reverse/spiral curves, true arc rendering via tessellation, Fusion 360-style fit-point spline tool with tangent handles, NURBS control-point splines, spline-to-arc conversion for legal descriptions, polyline offset engine with miter/round/chamfer corners and 12 presets, traverse management with closure calculation and Bowditch adjustment, area computation, inverse/forward point tools, bearing/distance input, and legal description generation. The spec is in STARR_CAD_PHASE_4_GEOMETRY_TOOLS.md. I am currently working on [CURRENT TASK from Build Order].

---

*End of Phase 4 Specification*
*Starr Surveying Company — Belton, Texas — March 2026*
