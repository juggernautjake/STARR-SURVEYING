# STARR CAD — Phase 1: Project Foundation & CAD Engine Core

**Version:** 1.0 | **Date:** March 2026 | **Phase:** 1 of 7

**Goal:** A functional 2D drawing canvas with pan, zoom, basic geometry primitives, selection, undo/redo, snap, layers, grid, and file save/load. No survey-specific features — just a rock-solid CAD foundation.

**Duration:** 6-8 weeks | **Depends On:** Nothing (this is the starting phase)

---

## Table of Contents

1. [Monorepo Setup & Project Scaffolding](#1-monorepo-setup--project-scaffolding)
2. [Core TypeScript Types](#2-core-typescript-types)
3. [Coordinate System](#3-coordinate-system)
4. [State Management (Zustand Stores)](#4-state-management-zustand-stores)
5. [Rendering Engine (PixiJS)](#5-rendering-engine-pixijs)
6. [Viewport & Camera](#6-viewport--camera)
7. [Grid System](#7-grid-system)
8. [Geometry Primitives](#8-geometry-primitives)
9. [Selection System](#9-selection-system)
10. [Snap Engine](#10-snap-engine)
11. [Drawing Tools](#11-drawing-tools)
12. [Edit Operations](#12-edit-operations)
13. [Undo/Redo System](#13-undoredo-system)
14. [Layer System (Basic)](#14-layer-system-basic)
15. [Command Bar](#15-command-bar)
16. [File I/O (.starr format)](#16-file-io-starr-format)
17. [UI Layout & Components](#17-ui-layout--components)
18. [Keyboard Shortcuts](#18-keyboard-shortcuts)
19. [Status Bar](#19-status-bar)
20. [Acceptance Tests](#20-acceptance-tests)
21. [Build Order (Implementation Sequence)](#21-build-order-implementation-sequence)

---

## 1. Monorepo Setup & Project Scaffolding

### 1.1 Initialize Monorepo

```bash
# Create project root
mkdir starr-cad && cd starr-cad
git init

# Package manager: pnpm with workspaces
pnpm init
# turbo for monorepo task orchestration
pnpm add -D turbo typescript @types/node

# Root tsconfig with strict mode
# Root .eslintrc with shared rules
# Root .prettierrc
```

### 1.2 Package Structure (Phase 1 Only)

Only create what Phase 1 needs. Future phases add packages incrementally.

```
starr-cad/
├── apps/
│   └── web/                         # Next.js app
│       ├── app/
│       │   ├── layout.tsx           # Root layout with sidebar + canvas
│       │   ├── page.tsx             # Main drawing page
│       │   └── globals.css
│       ├── components/
│       │   ├── canvas/
│       │   │   ├── CanvasViewport.tsx    # PixiJS canvas mount point
│       │   │   ├── GridOverlay.tsx       # Grid rendering
│       │   │   └── SnapIndicator.tsx     # Snap cursor display
│       │   ├── panels/
│       │   │   ├── LayerPanel.tsx        # Layer list sidebar
│       │   │   └── PropertyPanel.tsx     # Selection properties (basic)
│       │   ├── toolbar/
│       │   │   ├── ToolBar.tsx           # Left tool buttons
│       │   │   └── ToolButton.tsx        # Individual tool button
│       │   ├── command/
│       │   │   └── CommandBar.tsx        # Bottom command input
│       │   └── status/
│       │       └── StatusBar.tsx         # Bottom coordinate display
│       ├── hooks/
│       │   ├── useViewport.ts           # Pan/zoom handlers
│       │   ├── useDrawingTool.ts        # Active tool state
│       │   ├── useSelection.ts          # Selection interactions
│       │   ├── useSnap.ts               # Snap computation
│       │   ├── useKeyboard.ts           # Keyboard shortcut handler
│       │   └── useUndoRedo.ts           # Undo/redo keybindings
│       ├── next.config.js
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   ├── core/                        # Shared types and constants
│   │   ├── src/
│   │   │   ├── types.ts             # All TypeScript interfaces
│   │   │   ├── constants.ts         # Default values, enums
│   │   │   └── utils.ts             # ID generation, clamp, etc.
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── geometry/                    # Pure math functions
│   │   ├── src/
│   │   │   ├── point.ts             # Point operations
│   │   │   ├── line.ts              # Line segment math
│   │   │   ├── polyline.ts          # Polyline operations
│   │   │   ├── polygon.ts           # Polygon operations (area, centroid, contains)
│   │   │   ├── intersection.ts      # Line-line, line-box, point-line distance
│   │   │   ├── transform.ts         # Translate, rotate, scale, mirror
│   │   │   ├── bounds.ts            # Bounding box computation
│   │   │   └── snap.ts              # Snap point computation
│   │   ├── __tests__/               # Vitest unit tests
│   │   │   ├── point.test.ts
│   │   │   ├── line.test.ts
│   │   │   ├── intersection.test.ts
│   │   │   └── snap.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── rendering/                   # PixiJS rendering logic
│   │   ├── src/
│   │   │   ├── viewport.ts          # ViewportManager class
│   │   │   ├── feature-renderer.ts  # Render features to PixiJS
│   │   │   ├── selection-renderer.ts # Highlight selected features
│   │   │   ├── grid-renderer.ts     # Grid lines/dots
│   │   │   ├── snap-renderer.ts     # Snap indicator symbols
│   │   │   ├── tool-preview.ts      # Preview for active drawing tool
│   │   │   └── render-loop.ts       # Main render orchestration
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── store/                       # Zustand state stores
│       ├── src/
│       │   ├── drawing-store.ts     # Features, points, layers
│       │   ├── selection-store.ts   # Selected IDs, mode
│       │   ├── tool-store.ts        # Active tool, tool state
│       │   ├── viewport-store.ts    # Pan, zoom, rotation
│       │   ├── ui-store.ts          # Panel visibility, dialogs
│       │   └── undo-store.ts        # Undo/redo stacks
│       ├── package.json
│       └── tsconfig.json
│
├── turbo.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── package.json
├── STARR_CAD_PHASE_ROADMAP.md
├── STARR_CAD_PHASE_1_ENGINE_CORE.md   # THIS FILE
└── STARR_CAD_IMPLEMENTATION.md         # Master spec (all phases)
```

### 1.3 Package Configuration

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
    "dev": { "cache": false, "persistent": true },
    "test": { "dependsOn": ["build"] },
    "lint": {}
  }
}
```

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "jsx": "react-jsx",
    "paths": {
      "@starr-cad/core": ["./packages/core/src"],
      "@starr-cad/geometry": ["./packages/geometry/src"],
      "@starr-cad/rendering": ["./packages/rendering/src"],
      "@starr-cad/store": ["./packages/store/src"]
    }
  }
}
```

### 1.4 Dependencies Per Package

```
apps/web:
  - next, react, react-dom
  - pixi.js (^7.x)
  - zustand (^4.x)
  - @starr-cad/core, @starr-cad/geometry, @starr-cad/rendering, @starr-cad/store
  - lucide-react (icons)
  - tailwindcss

packages/geometry:
  - (no runtime deps — pure TypeScript math)
  - vitest (dev)

packages/rendering:
  - pixi.js
  - @starr-cad/core, @starr-cad/geometry

packages/store:
  - zustand
  - @starr-cad/core

packages/core:
  - (no deps — types and constants only)
```

---

## 2. Core TypeScript Types

All types live in `packages/core/src/types.ts`. This is the single source of truth for data shapes.

```typescript
// --- IDENTIFIERS ---

/** Generate a unique ID. Use for all entities. */
export function generateId(): string {
  return crypto.randomUUID();
}

// --- GEOMETRY PRIMITIVES ---

export interface Point2D {
  x: number;  // Easting in survey coords, or screen X
  y: number;  // Northing in survey coords, or screen Y
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// --- DRAWING DOCUMENT ---

export interface DrawingDocument {
  id: string;
  name: string;
  created: string;           // ISO 8601
  modified: string;
  author: string;

  // Content
  features: Record<string, Feature>;   // featureId -> Feature
  layers: Record<string, Layer>;       // layerId -> Layer
  layerOrder: string[];                // Layer IDs in render order (bottom to top)

  // Configuration
  settings: DrawingSettings;
}

export interface DrawingSettings {
  // Coordinate system (hardcoded for now, configurable in Phase 4)
  units: 'FEET';

  // Grid
  gridVisible: boolean;
  gridMajorSpacing: number;    // World units (default: 100)
  gridMinorDivisions: number;  // Subdivisions per major (default: 10)
  gridStyle: 'DOTS' | 'LINES' | 'CROSSHAIRS';

  // Snap
  snapEnabled: boolean;
  snapTypes: SnapType[];
  snapRadius: number;          // Screen pixels (default: 15)

  // Display
  backgroundColor: string;    // Hex (default: "#FFFFFF")

  // Paper (used later for print, but stored from the start)
  paperSize: 'LETTER' | 'TABLOID' | 'ARCH_C' | 'ARCH_D' | 'ARCH_E';
  paperOrientation: 'PORTRAIT' | 'LANDSCAPE';
  drawingScale: number;        // e.g., 50 for 1"=50'
}

// --- FEATURES ---

export type FeatureType = 'POINT' | 'LINE' | 'POLYLINE' | 'POLYGON';
// Phase 4 adds: 'ARC' | 'CURVE' | 'SPLINE' | 'CLOSED_CURVE' | 'CLOSED_SPLINE'
// Phase 5 adds: 'TEXT' | 'DIMENSION' | 'LEADER' | 'HATCH'

export interface Feature {
  id: string;
  type: FeatureType;

  // Geometry (all coordinates in survey/world space)
  geometry: FeatureGeometry;

  // Visual
  layerId: string;
  style: FeatureStyle;

  // Metadata
  properties: Record<string, string | number | boolean>;

  // Selection state (transient, not saved)
  // Managed by selection store, not stored in feature
}

export interface FeatureGeometry {
  type: FeatureType;

  // POINT: single coordinate
  point?: Point2D;

  // LINE: two endpoints
  start?: Point2D;
  end?: Point2D;

  // POLYLINE: ordered vertices (open)
  // POLYGON: ordered vertices (closed — last vertex connects to first)
  vertices?: Point2D[];
}

export interface FeatureStyle {
  color: string;              // Hex color (e.g., "#000000")
  lineWeight: number;         // Pixels on screen (default: 1). Phase 3 changes to mm.
  opacity: number;            // 0-1 (default: 1)
  // Phase 3 adds: lineTypeId, symbolId, symbolSize, symbolRotation, labelConfig
}

// --- LAYERS ---

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  color: string;              // Default color for features on this layer
  lineWeight: number;         // Default line weight (pixels)
  opacity: number;
  isDefault: boolean;         // Cannot be deleted
}

// --- SNAP ---

export type SnapType =
  | 'ENDPOINT'
  | 'MIDPOINT'
  | 'INTERSECTION'
  | 'NEAREST'
  | 'CENTER'        // Phase 4: center of arcs
  | 'PERPENDICULAR' // Phase 4
  | 'GRID';

export interface SnapResult {
  point: Point2D;             // World coordinates
  type: SnapType;
  featureId: string | null;   // null for GRID snaps
  vertexIndex?: number;       // Which vertex (for ENDPOINT)
  distance: number;           // Screen distance from cursor to snap point
}

// --- SELECTION ---

export type SelectionMode = 'REPLACE' | 'ADD' | 'REMOVE' | 'TOGGLE';

export type BoxSelectMode = 'WINDOW' | 'CROSSING';
// WINDOW (left-to-right drag): only fully enclosed features
// CROSSING (right-to-left drag): any feature touching/inside box

// --- TOOLS ---

export type ToolType =
  | 'SELECT'
  | 'PAN'
  | 'DRAW_POINT'
  | 'DRAW_LINE'
  | 'DRAW_POLYLINE'
  | 'DRAW_POLYGON'
  | 'MOVE'
  | 'COPY'
  | 'ROTATE'
  | 'MIRROR'
  | 'ERASE';
  // Phase 4 adds: 'DRAW_ARC', 'DRAW_SPLINE', 'OFFSET', 'FILLET', 'TRIM', 'EXTEND'
  // Phase 5 adds: 'DRAW_TEXT', 'DRAW_DIMENSION', 'DRAW_LEADER'

export interface ToolState {
  activeTool: ToolType;

  // Drawing tool state
  drawingPoints: Point2D[];    // Points collected so far for current draw operation
  previewPoint: Point2D | null; // Current mouse position (snapped) for live preview

  // Move/copy state
  basePoint: Point2D | null;
  displacement: Point2D | null;

  // Rotate state
  rotateCenter: Point2D | null;
  rotateAngle: number;

  // Box select state
  boxStart: Point2D | null;    // Screen coordinates
  boxEnd: Point2D | null;
  isBoxSelecting: boolean;
}

// --- UNDO ---

export type UndoOperationType =
  | 'ADD_FEATURE'
  | 'REMOVE_FEATURE'
  | 'MODIFY_FEATURE'
  | 'ADD_LAYER'
  | 'REMOVE_LAYER'
  | 'MODIFY_LAYER'
  | 'BATCH';

export interface UndoOperation {
  type: UndoOperationType;
  // Data varies by type — see Section 13 for full definitions
  data: any;
}

export interface UndoEntry {
  id: string;
  description: string;
  timestamp: number;
  operations: UndoOperation[];
}

// --- COMMAND BAR ---

export interface CommandEntry {
  raw: string;                // What the user typed
  parsed: ParsedCommand;
  timestamp: number;
}

export interface ParsedCommand {
  type: 'COORDINATE' | 'DISTANCE' | 'ANGLE' | 'COMMAND' | 'UNKNOWN';
  // For COORDINATE: { x, y }
  // For DISTANCE: { value }
  // For ANGLE: { value } (degrees)
  // For COMMAND: { name, args }
  value: any;
}
```

### 2.1 Constants

```typescript
// packages/core/src/constants.ts

export const DEFAULT_DRAWING_SETTINGS: DrawingSettings = {
  units: 'FEET',
  gridVisible: true,
  gridMajorSpacing: 100,
  gridMinorDivisions: 10,
  gridStyle: 'DOTS',
  snapEnabled: true,
  snapTypes: ['ENDPOINT', 'MIDPOINT', 'INTERSECTION', 'NEAREST', 'GRID'],
  snapRadius: 15,
  backgroundColor: '#FFFFFF',
  paperSize: 'TABLOID',
  paperOrientation: 'LANDSCAPE',
  drawingScale: 50,
};

export const DEFAULT_FEATURE_STYLE: FeatureStyle = {
  color: '#000000',
  lineWeight: 1,
  opacity: 1,
};

export const DEFAULT_LAYERS: Omit<Layer, 'id'>[] = [
  { name: 'Layer 0', visible: true, locked: false, color: '#000000',
    lineWeight: 1, opacity: 1, isDefault: true },
  { name: 'Construction', visible: true, locked: false, color: '#999999',
    lineWeight: 0.5, opacity: 0.5, isDefault: true },
];
// Phase 2 replaces this with the full 22-layer survey default set.

export const SNAP_INDICATOR_STYLES: Record<SnapType, { shape: string; color: string }> = {
  ENDPOINT:      { shape: 'square',   color: '#00FF00' },
  MIDPOINT:      { shape: 'triangle', color: '#00FF00' },
  INTERSECTION:  { shape: 'cross',    color: '#FF0000' },
  NEAREST:       { shape: 'diamond',  color: '#FFFF00' },
  CENTER:        { shape: 'circle',   color: '#00FFFF' },
  PERPENDICULAR: { shape: 'square',   color: '#FF00FF' },
  GRID:          { shape: 'cross',    color: '#808080' },
};
```

---

## 3. Coordinate System

The CAD engine uses two coordinate systems. All math and storage use world/survey coordinates (Y-up). Rendering transforms to screen coordinates (Y-down) at the viewport level.

```typescript
// packages/geometry/src/point.ts

export interface Point2D {
  x: number;
  y: number;
}

/** Distance between two points */
export function distance(a: Point2D, b: Point2D): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

/** Midpoint between two points */
export function midpoint(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Angle from a to b in radians (atan2, CCW from east) */
export function angle(from: Point2D, to: Point2D): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/** Point at distance and angle from origin */
export function pointAtDistanceAngle(
  origin: Point2D, dist: number, angleRad: number
): Point2D {
  return {
    x: origin.x + dist * Math.cos(angleRad),
    y: origin.y + dist * Math.sin(angleRad),
  };
}

/** Perpendicular distance from point to line segment */
export function pointToSegmentDistance(
  p: Point2D, a: Point2D, b: Point2D
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return distance(p, a); // Degenerate segment

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t)); // Clamp to segment

  const closest: Point2D = { x: a.x + t * dx, y: a.y + t * dy };
  return distance(p, closest);
}

/** Closest point on segment to p (returns the point and the parameter t) */
export function closestPointOnSegment(
  p: Point2D, a: Point2D, b: Point2D
): { point: Point2D; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return { point: { ...a }, t: 0 };

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  return {
    point: { x: a.x + t * dx, y: a.y + t * dy },
    t,
  };
}

/** Check if point is inside polygon (ray casting algorithm) */
export function pointInPolygon(p: Point2D, vertices: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y;
    const xj = vertices[j].x, yj = vertices[j].y;

    if ((yi > p.y) !== (yj > p.y) &&
        p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
```

### Intersection Functions

```typescript
// packages/geometry/src/intersection.ts

/** Line-line intersection (infinite lines through a->b and c->d) */
export function lineLineIntersection(
  a: Point2D, b: Point2D, c: Point2D, d: Point2D
): Point2D | null {
  const denom = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (Math.abs(denom) < 1e-10) return null; // Parallel

  const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / denom;

  return {
    x: a.x + t * (b.x - a.x),
    y: a.y + t * (b.y - a.y),
  };
}

/** Segment-segment intersection (returns null if they don't cross) */
export function segmentSegmentIntersection(
  a: Point2D, b: Point2D, c: Point2D, d: Point2D
): Point2D | null {
  const denom = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (Math.abs(denom) < 1e-10) return null;

  const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / denom;
  const u = -((a.x - b.x) * (a.y - c.y) - (a.y - b.y) * (a.x - c.x)) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  }
  return null;
}

/** Test if a point is inside a bounding box */
export function pointInBounds(p: Point2D, bounds: BoundingBox): boolean {
  return p.x >= bounds.minX && p.x <= bounds.maxX &&
         p.y >= bounds.minY && p.y <= bounds.maxY;
}

/** Test if two bounding boxes overlap */
export function boundsOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX &&
         a.minY <= b.maxY && a.maxY >= b.minY;
}

/** Test if bbox inner is fully contained within outer */
export function boundsContains(outer: BoundingBox, inner: BoundingBox): boolean {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX &&
         inner.minY >= outer.minY && inner.maxY <= outer.maxY;
}
```

### Bounds Functions

```typescript
// packages/geometry/src/bounds.ts

/** Compute bounding box of a set of points */
export function computeBounds(points: Point2D[]): BoundingBox {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Get bounding box of a feature */
export function featureBounds(feature: Feature): BoundingBox {
  const geom = feature.geometry;
  switch (geom.type) {
    case 'POINT':
      return {
        minX: geom.point!.x, minY: geom.point!.y,
        maxX: geom.point!.x, maxY: geom.point!.y,
      };
    case 'LINE':
      return computeBounds([geom.start!, geom.end!]);
    case 'POLYLINE':
    case 'POLYGON':
      return computeBounds(geom.vertices!);
    default:
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
}

/** Expand a bounding box by a margin (in world units) */
export function expandBounds(bounds: BoundingBox, margin: number): BoundingBox {
  return {
    minX: bounds.minX - margin,
    minY: bounds.minY - margin,
    maxX: bounds.maxX + margin,
    maxY: bounds.maxY + margin,
  };
}
```

### Transform Functions

```typescript
// packages/geometry/src/transform.ts

/** Translate a point by dx, dy */
export function translate(p: Point2D, dx: number, dy: number): Point2D {
  return { x: p.x + dx, y: p.y + dy };
}

/** Rotate a point around a center by angle (radians, CCW) */
export function rotate(
  p: Point2D, center: Point2D, angleRad: number
): Point2D {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

/** Mirror a point across a line defined by two points */
export function mirror(
  p: Point2D, lineA: Point2D, lineB: Point2D
): Point2D {
  const dx = lineB.x - lineA.x;
  const dy = lineB.y - lineA.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { ...p };

  const t = ((p.x - lineA.x) * dx + (p.y - lineA.y) * dy) / lenSq;
  const closestX = lineA.x + t * dx;
  const closestY = lineA.y + t * dy;

  return {
    x: 2 * closestX - p.x,
    y: 2 * closestY - p.y,
  };
}

/** Scale a point relative to a center */
export function scale(
  p: Point2D, center: Point2D, factor: number
): Point2D {
  return {
    x: center.x + (p.x - center.x) * factor,
    y: center.y + (p.y - center.y) * factor,
  };
}

/** Apply transform to all geometry in a feature, returning a new Feature */
export function transformFeature(
  feature: Feature,
  transformFn: (p: Point2D) => Point2D
): Feature {
  const geom = { ...feature.geometry };

  switch (geom.type) {
    case 'POINT':
      geom.point = transformFn(geom.point!);
      break;
    case 'LINE':
      geom.start = transformFn(geom.start!);
      geom.end = transformFn(geom.end!);
      break;
    case 'POLYLINE':
    case 'POLYGON':
      geom.vertices = geom.vertices!.map(transformFn);
      break;
  }

  return { ...feature, geometry: geom };
}
```

---

## 4. State Management (Zustand Stores)

### 4.1 Drawing Store

The central store for all drawing data. Every mutation goes through actions here (which also creates undo entries).

```typescript
// packages/store/src/drawing-store.ts
import { create } from 'zustand';
import type { DrawingDocument, Feature, Layer, DrawingSettings, Point2D }
  from '@starr-cad/core';

interface DrawingStore {
  // State
  document: DrawingDocument;
  activeLayerId: string;
  isDirty: boolean;              // Unsaved changes

  // Feature actions
  addFeature: (feature: Feature) => void;
  removeFeature: (featureId: string) => void;
  updateFeature: (featureId: string, updates: Partial<Feature>) => void;
  updateFeatureGeometry: (featureId: string, geometry: Feature['geometry']) => void;

  // Layer actions
  addLayer: (layer: Layer) => void;
  removeLayer: (layerId: string) => void;
  updateLayer: (layerId: string, updates: Partial<Layer>) => void;
  setActiveLayer: (layerId: string) => void;
  reorderLayers: (layerOrder: string[]) => void;

  // Batch actions
  addFeatures: (features: Feature[]) => void;
  removeFeatures: (featureIds: string[]) => void;

  // Document actions
  newDocument: () => void;
  loadDocument: (doc: DrawingDocument) => void;
  updateSettings: (settings: Partial<DrawingSettings>) => void;
  markClean: () => void;

  // Queries
  getFeature: (id: string) => Feature | undefined;
  getLayer: (id: string) => Layer | undefined;
  getFeaturesOnLayer: (layerId: string) => Feature[];
  getVisibleFeatures: () => Feature[];
  getAllFeatures: () => Feature[];
}
```

### 4.2 Selection Store

```typescript
// packages/store/src/selection-store.ts
interface SelectionStore {
  selectedIds: Set<string>;       // Feature IDs
  hoveredId: string | null;       // Feature under cursor

  // Actions
  select: (featureId: string, mode: SelectionMode) => void;
  selectMultiple: (featureIds: string[], mode: SelectionMode) => void;
  deselectAll: () => void;
  setHovered: (featureId: string | null) => void;

  // Queries
  isSelected: (featureId: string) => boolean;
  selectionCount: () => number;
  getSelectedFeatures: () => Feature[];  // Pulls from drawing store
}
```

### 4.3 Tool Store

```typescript
// packages/store/src/tool-store.ts
interface ToolStore {
  state: ToolState;

  // Actions
  setTool: (tool: ToolType) => void;
  addDrawingPoint: (point: Point2D) => void;
  setPreviewPoint: (point: Point2D | null) => void;
  clearDrawingPoints: () => void;
  setBasePoint: (point: Point2D) => void;
  setDisplacement: (point: Point2D) => void;
  setRotateCenter: (point: Point2D) => void;
  setRotateAngle: (angle: number) => void;
  setBoxSelect: (start: Point2D | null, end: Point2D | null, active: boolean) => void;

  resetToolState: () => void;    // Called when switching tools
}
```

### 4.4 Viewport Store

```typescript
// packages/store/src/viewport-store.ts
interface ViewportStore {
  // Camera state (world coordinates at screen center)
  centerX: number;
  centerY: number;
  zoom: number;                  // Pixels per world unit
  screenWidth: number;
  screenHeight: number;

  // Actions
  pan: (screenDx: number, screenDy: number) => void;
  zoomAt: (screenX: number, screenY: number, factor: number) => void;
  zoomToExtents: (bounds: BoundingBox, padding?: number) => void;
  zoomToRect: (worldBounds: BoundingBox) => void;
  setScreenSize: (width: number, height: number) => void;

  // Transforms
  worldToScreen: (wx: number, wy: number) => { sx: number; sy: number };
  screenToWorld: (sx: number, sy: number) => { wx: number; wy: number };
  getWorldBounds: () => BoundingBox;
}
```

### 4.5 Undo Store

```typescript
// packages/store/src/undo-store.ts
interface UndoStore {
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];

  // Actions
  pushUndo: (entry: UndoEntry) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;

  // Queries
  canUndo: () => boolean;
  canRedo: () => boolean;
  undoDescription: () => string | null;
  redoDescription: () => string | null;
}

// MAX_UNDO_STACK = 500
```

---

## 5. Rendering Engine (PixiJS)

### 5.1 Viewport Manager

```typescript
// packages/rendering/src/viewport.ts
import * as PIXI from 'pixi.js';

export class ViewportManager {
  app: PIXI.Application;
  container: PIXI.Container;      // Root container — all drawing content goes here

  // Layers of rendering (child containers in order)
  gridLayer: PIXI.Container;
  featureLayer: PIXI.Container;
  selectionLayer: PIXI.Container;
  snapLayer: PIXI.Container;
  toolPreviewLayer: PIXI.Container;

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.app = new PIXI.Application({
      view: canvas,
      width,
      height,
      backgroundColor: 0xFFFFFF,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    this.container = new PIXI.Container();
    this.app.stage.addChild(this.container);

    // Create layer containers in render order (bottom to top)
    this.gridLayer = new PIXI.Container();
    this.featureLayer = new PIXI.Container();
    this.selectionLayer = new PIXI.Container();
    this.snapLayer = new PIXI.Container();
    this.toolPreviewLayer = new PIXI.Container();

    this.container.addChild(
      this.gridLayer,
      this.featureLayer,
      this.selectionLayer,
      this.snapLayer,
      this.toolPreviewLayer,
    );
  }

  /** Convert world coordinates to screen coordinates */
  worldToScreen(
    wx: number, wy: number,
    cx: number, cy: number, zoom: number,
    sw: number, sh: number
  ) {
    return {
      sx: (wx - cx) * zoom + sw / 2,
      sy: -(wy - cy) * zoom + sh / 2,   // Y-flip: survey Y-up -> screen Y-down
    };
  }

  /** Convert screen coordinates to world coordinates */
  screenToWorld(
    sx: number, sy: number,
    cx: number, cy: number, zoom: number,
    sw: number, sh: number
  ) {
    return {
      wx: (sx - sw / 2) / zoom + cx,
      wy: -(sy - sh / 2) / zoom + cy,   // Y-flip
    };
  }

  resize(width: number, height: number) {
    this.app.renderer.resize(width, height);
  }

  destroy() {
    this.app.destroy(true);
  }
}
```

### 5.2 Feature Renderer

```typescript
// packages/rendering/src/feature-renderer.ts
import * as PIXI from 'pixi.js';

export class FeatureRenderer {
  private graphics: Map<string, PIXI.Graphics> = new Map();
  private container: PIXI.Container;

  constructor(container: PIXI.Container) {
    this.container = container;
  }

  /** Render a single feature. Creates or updates PixiJS Graphics object. */
  renderFeature(
    feature: Feature,
    worldToScreen: (wx: number, wy: number) => { sx: number; sy: number },
    zoom: number,
  ): void {
    let g = this.graphics.get(feature.id);
    if (!g) {
      g = new PIXI.Graphics();
      this.graphics.set(feature.id, g);
      this.container.addChild(g);
    }

    g.clear();
    g.visible = true;

    const color = parseInt(feature.style.color.replace('#', ''), 16);
    const weight = feature.style.lineWeight;
    const alpha = feature.style.opacity;
    const geom = feature.geometry;

    switch (geom.type) {
      case 'POINT': {
        const { sx, sy } = worldToScreen(geom.point!.x, geom.point!.y);
        const size = 4;
        g.lineStyle(weight, color, alpha);
        g.moveTo(sx - size, sy);
        g.lineTo(sx + size, sy);
        g.moveTo(sx, sy - size);
        g.lineTo(sx, sy + size);
        break;
      }

      case 'LINE': {
        const s = worldToScreen(geom.start!.x, geom.start!.y);
        const e = worldToScreen(geom.end!.x, geom.end!.y);
        g.lineStyle(weight, color, alpha);
        g.moveTo(s.sx, s.sy);
        g.lineTo(e.sx, e.sy);
        break;
      }

      case 'POLYLINE': {
        const verts = geom.vertices!;
        if (verts.length < 2) break;
        g.lineStyle(weight, color, alpha);
        const first = worldToScreen(verts[0].x, verts[0].y);
        g.moveTo(first.sx, first.sy);
        for (let i = 1; i < verts.length; i++) {
          const v = worldToScreen(verts[i].x, verts[i].y);
          g.lineTo(v.sx, v.sy);
        }
        break;
      }

      case 'POLYGON': {
        const verts = geom.vertices!;
        if (verts.length < 3) break;
        g.lineStyle(weight, color, alpha);
        const first = worldToScreen(verts[0].x, verts[0].y);
        g.moveTo(first.sx, first.sy);
        for (let i = 1; i < verts.length; i++) {
          const v = worldToScreen(verts[i].x, verts[i].y);
          g.lineTo(v.sx, v.sy);
        }
        g.closePath();
        break;
      }
    }
  }

  /** Remove a feature's graphics */
  removeFeature(featureId: string): void {
    const g = this.graphics.get(featureId);
    if (g) {
      this.container.removeChild(g);
      g.destroy();
      this.graphics.delete(featureId);
    }
  }

  /** Hide all features (called before re-render) */
  hideAll(): void {
    for (const g of this.graphics.values()) {
      g.visible = false;
    }
  }

  /** Remove graphics for features that no longer exist */
  cleanup(activeFeatureIds: Set<string>): void {
    for (const [id, g] of this.graphics) {
      if (!activeFeatureIds.has(id)) {
        this.container.removeChild(g);
        g.destroy();
        this.graphics.delete(id);
      }
    }
  }
}
```

### 5.3 Selection Renderer

See Section 9 for hit testing. The SelectionRenderer draws blue highlight lines and grip squares at vertices of selected features, plus box selection rectangles (blue for window, green for crossing).

---

## 6. Viewport & Camera

### 6.1 Pan/Zoom Behavior

```
Pan:
  - Middle mouse drag: pan
  - Space + left drag: pan
  - Two-finger touch drag: pan (mobile)

Zoom:
  - Scroll wheel: zoom at cursor position
  - Pinch: zoom at pinch center (mobile)
  - Ctrl+scroll: fine zoom (slower)

Zoom limits:
  - Min zoom: 0.001 px/unit (very zoomed out — see whole state plane zone)
  - Max zoom: 1000 px/unit (very zoomed in — sub-foot precision)
  - Default: auto-fit to extents + 10% padding

Zoom targets:
  - Z then E: zoom to extents (fit all features with padding)
  - Z then S: zoom to selection
  - Z then P: zoom previous (restore last viewport before zoom change)
```

### 6.2 Implementation

The `useViewport` hook handles all pan/zoom interactions. See `apps/web/hooks/useViewport.ts` for the mouse event handler pattern (wheel -> zoomAt, middle mouse -> pan, Space+left -> pan).

---

## 7. Grid System

The grid renderer draws behind all features at the lowest z-order. It auto-scales grid spacing based on zoom level to prevent visual clutter. Major grid lines are drawn at `gridMajorSpacing` intervals (default 100'), minor lines at `gridMajorSpacing / gridMinorDivisions` intervals (default 10'). Supports three styles: DOTS, LINES, and CROSSHAIRS. An origin marker (subtle red cross) is drawn at (0,0).

---

## 8. Geometry Primitives

Phase 1 supports four geometry types:

| Type | Description | Vertex Count |
|------|-------------|-------------|
| `POINT` | Single coordinate. Rendered as a small cross. | 1 |
| `LINE` | Two endpoints. Always a single straight segment. | 2 |
| `POLYLINE` | Ordered vertices, connected by straight segments, open-ended. | 2+ |
| `POLYGON` | Ordered vertices, connected by straight segments, closed. | 3+ |

Arcs, curves, and splines are added in Phase 4.

---

## 9. Selection System

### 9.1 Hit Testing

Hit testing works in screen space with a tolerance of 5 pixels. Priority: points > line endpoints > lines > polygons. For polygons, both edge proximity and interior containment are checked.

### 9.2 Box Selection

- **WINDOW** (left-to-right drag): Only fully enclosed features are selected. Blue rectangle.
- **CROSSING** (right-to-left drag): Any feature touching or inside the box is selected. Green rectangle.

---

## 10. Snap Engine

The snap engine finds the best snap point near the cursor by checking all visible features for endpoint, midpoint, intersection, nearest point, and grid snap candidates within the snap radius (default 15 screen pixels).

**Priority order:** ENDPOINT > MIDPOINT > INTERSECTION > NEAREST > GRID

Each snap type has a distinct visual indicator (colored shape) displayed at the snap point with a tooltip label.

---

## 11. Drawing Tools

Each tool follows the same pattern: activate -> collect input (clicks, cursor movement) -> create feature -> push to drawing store + undo stack.

| Tool | Interaction |
|------|------------|
| `DRAW_POINT` | Click once -> create POINT at snapped location |
| `DRAW_LINE` | Click start -> preview line follows cursor -> click end -> create LINE |
| `DRAW_POLYLINE` | Click to add vertices -> double-click or Enter -> create POLYLINE |
| `DRAW_POLYGON` | Click to add vertices (min 3) -> double-click or Enter -> close and create POLYGON |

All drawing tools:
1. Get cursor position from mouse event
2. Run through snap engine to get snapped position
3. Store in tool store's `drawingPoints` array
4. Feature renderer shows a live preview (dashed) on the `toolPreviewLayer`
5. On completion, create the Feature object, assign to active layer with layer defaults, push to drawing store
6. Push UndoEntry with the `ADD_FEATURE` operation

---

## 12. Edit Operations

```
MOVE:   Select features -> click base point -> click destination -> translate all
COPY:   Same as MOVE but creates new features (new IDs) instead of modifying
ROTATE: Select features -> click center -> type angle or click reference -> rotate
MIRROR: Select features -> click two points defining mirror line -> mirror
ERASE:  Delete selected features (or Delete key)
GRIP:   Select feature -> drag a grip square -> vertex moves to new position
```

All edit operations create a single UndoEntry (batched for multi-feature operations).

---

## 13. Undo/Redo System

**Operation Types:**

| Type | Undo Action | Redo Action |
|------|------------|------------|
| `ADD_FEATURE` | Remove feature | Add feature |
| `REMOVE_FEATURE` | Add feature back | Remove feature |
| `MODIFY_FEATURE` | Restore `before` state | Restore `after` state |
| `ADD_LAYER` | Remove layer | Add layer |
| `REMOVE_LAYER` | Add layer back | Remove layer |
| `MODIFY_LAYER` | Restore `before` state | Restore `after` state |
| `BATCH` | Undo all ops in reverse order | Redo all ops in forward order |

**Rules:**
- New action clears the redo stack
- Consecutive similar operations within 300ms merge (e.g., dragging a grip)
- Max stack depth: 500 entries

---

## 14. Layer System (Basic)

Phase 1 layer system is functional but minimal. Phase 3 adds the full panel with all features.

### 14.1 Phase 1 Layer Panel

A simple collapsible sidebar on the left showing:
- List of layers with: visibility toggle (eye icon), name, color swatch
- Active layer highlighted with bold text
- Click layer name -> set as active layer
- Click eye icon -> toggle visibility
- Right-click -> context menu: Rename, Change Color, Delete (if not default)
- "New Layer" button at bottom
- Features created with the active tool go on the active layer
- Features inherit the active layer's color by default

### 14.2 Default Layers

Two default layers exist on every new drawing:
1. **Layer 0** — Default drawing layer (cannot be deleted)
2. **Construction** — Light gray, half opacity (cannot be deleted)

---

## 15. Command Bar

A text input at the bottom of the screen that accepts typed input.

### 15.1 Phase 1 Commands

| Command | Action |
|---------|--------|
| `x,y` | Input coordinate (e.g., `100,200` -> place point at E:100, N:200) |
| `@dx,dy` | Relative coordinate from last point (e.g., `@50,0` -> 50' east) |
| `number` | Distance input (context-dependent: used by active tool) |
| `undo` / `u` | Undo |
| `redo` | Redo |
| `escape` / `esc` | Cancel current operation |
| `delete` / `del` | Delete selection |
| `zoom extents` / `ze` | Zoom to fit all features |
| `zoom selection` / `zs` | Zoom to selection |
| `line` / `l` | Activate line tool |
| `polyline` / `pl` | Activate polyline tool |
| `polygon` / `pg` | Activate polygon tool |
| `point` / `p` | Activate point tool |
| `move` / `m` | Activate move tool |
| `copy` / `co` | Activate copy tool |
| `rotate` / `ro` | Activate rotate tool |
| `mirror` / `mi` | Activate mirror tool |
| `erase` / `e` | Activate erase tool |
| `select` / `s` | Activate select tool |
| `snap on` / `snap off` | Toggle snap |
| `grid on` / `grid off` | Toggle grid |

---

## 16. File I/O (.starr format)

```typescript
interface StarrFileV1 {
  version: '1.0';
  application: 'starr-cad';
  document: DrawingDocument;
}
```

- **Save:** `JSON.stringify(document)` -> create Blob -> trigger download as `.starr`
- **Load:** Read `.starr` file -> `JSON.parse` -> validate schema -> load into state
- **Auto-save:** Every 60 seconds, save to IndexedDB (browser) or temp file (Electron)
- **Crash recovery:** On load, check for auto-save newer than main file, offer to recover

---

## 17. UI Layout & Components

### 17.1 Main Layout

```
+-------------------------------------------------------------+
|  Starr CAD            [File] [Edit] [View] [Draw] [Help]    |
+---------+-----------------------------------------------+---+
|         |                                               |   |
|  Tool   |                                               |   |
|  Bar    |              CANVAS VIEWPORT                  |   |
|         |              (PixiJS)                          |   |
| ------- |                                               |   |
|         |                                               |   |
|  Layer  |                                               |   |
|  Panel  |                                               |   |
|         |                                               |   |
+---------+-----------------------------------------------+---+
|  Command: [____________________________________________]     |
|  X: 598234.123  Y: 2145678.456  | Layer 0 | Snap: ON       |
+-------------------------------------------------------------+
```

### 17.2 Component Tree

```
<App>
  <MenuBar />                    # Top menu (File, Edit, View, Draw, Help)
  <div className="flex flex-1">
    <div className="w-48 flex flex-col">
      <ToolBar />                # Drawing tool buttons (vertical)
      <LayerPanel />             # Layer list
    </div>
    <CanvasViewport />           # PixiJS canvas (flex-1, fills remaining space)
  </div>
  <div className="flex flex-col">
    <CommandBar />               # Text input
    <StatusBar />                # Coordinate display + layer + snap
  </div>
</App>
```

### 17.3 ToolBar Buttons (Phase 1)

| Icon | Tool | Shortcut |
|------|------|----------|
| Arrow | Select | `S` |
| Hand | Pan | `Space` (hold) |
| Dot | Draw Point | `P` |
| Slash | Draw Line | `L` |
| Zigzag | Draw Polyline | `P` then `L` |
| Hexagon | Draw Polygon | `P` then `G` |
| Arrows | Move | `M` |
| Clipboard | Copy | `C` then `O` |
| Rotate | Rotate | `R` then `O` |
| Flip | Mirror | `M` then `I` |
| X | Erase | `E` |

---

## 18. Keyboard Shortcuts

```typescript
const PHASE_1_SHORTCUTS: Record<string, () => void> = {
  // Global
  'ctrl+z':       () => undoStore.undo(),
  'ctrl+y':       () => undoStore.redo(),
  'ctrl+shift+z': () => undoStore.redo(),
  'ctrl+s':       () => saveCurrentDocument(),
  'ctrl+o':       () => openFileDialog(),
  'ctrl+n':       () => newDocument(),
  'escape':       () => { toolStore.setTool('SELECT'); selectionStore.deselectAll(); },
  'delete':       () => eraseSelected(),
  'backspace':    () => eraseSelected(),

  // Tools
  's':            () => toolStore.setTool('SELECT'),
  'l':            () => toolStore.setTool('DRAW_LINE'),
  'm':            () => toolStore.setTool('MOVE'),
  'e':            () => toolStore.setTool('ERASE'),

  // Zoom
  'z e':          () => zoomToExtents(),
  'z s':          () => zoomToSelection(),

  // Snap
  'f3':           () => toggleSnap(),

  // Enter: confirm current tool action (finish polyline, etc.)
  'enter':        () => confirmCurrentTool(),
};
```

Multi-key shortcuts (e.g., "z then e"): Track last key pressed within 500ms window. If "z" was pressed <500ms ago and "e" is pressed, trigger "z e".

---

## 19. Status Bar

The status bar (bottom of screen, below command bar) shows:

```
X: 598234.123   Y: 2145678.456   |   Layer: Layer 0   |   Snap: ON   |   Grid: ON
```

- **X/Y:** World coordinates at cursor position. Updates in real-time.
- **Layer:** Name of the active layer. Click to open layer selector.
- **Snap:** ON/OFF toggle. Click to toggle. Shows snap type when snapping.
- **Grid:** ON/OFF toggle. Click to toggle.

---

## 20. Acceptance Tests

Phase 1 is complete when ALL of the following pass:

### Canvas & Viewport

- [ ] Canvas fills available space and resizes with the window
- [ ] Pan with middle mouse drag works smoothly
- [ ] Pan with Space + left drag works
- [ ] Scroll wheel zooms at the cursor position
- [ ] Zoom to extents fits all features with 10% padding
- [ ] Zoom to selection zooms to the bounding box of selected features
- [ ] Coordinates at cursor update in real-time in the status bar

### Grid

- [ ] Grid renders with major and minor lines/dots
- [ ] Grid auto-scales: as you zoom out, grid spacing increases to prevent clutter
- [ ] Grid visibility can be toggled (command bar + keyboard + status bar click)
- [ ] Grid respects the gridStyle setting (dots, lines, crosshairs)

### Drawing Tools

- [ ] Point tool: click once -> point appears at cursor location (snapped)
- [ ] Line tool: click start -> preview line follows cursor -> click end -> line created
- [ ] Polyline tool: click to add vertices -> double-click or Enter -> polyline created
- [ ] Polygon tool: click to add vertices -> double-click or Enter -> closed polygon created
- [ ] Drawing tool preview (dashed line from last point to cursor) renders correctly
- [ ] Escape cancels the current drawing operation and clears preview
- [ ] All created features appear on the active layer with layer default color

### Selection

- [ ] Click on a feature selects it (blue highlight + grip squares)
- [ ] Click on empty space deselects all
- [ ] Shift+click adds to selection
- [ ] Left-to-right box -> window select (only fully enclosed features)
- [ ] Right-to-left box -> crossing select (any feature touching/overlapping box)
- [ ] Box select shows blue rectangle (window) or green rectangle (crossing)
- [ ] Selected features show grip points at all vertices

### Edit Operations

- [ ] Move: select -> M -> click base point -> click destination -> features moved
- [ ] Copy: select -> CO -> click base point -> click destination -> copies placed
- [ ] Rotate: select -> RO -> click center -> type angle -> features rotated
- [ ] Mirror: select -> MI -> click two mirror line points -> features mirrored
- [ ] Erase: select -> E -> features deleted (or Delete key)
- [ ] Grip edit: select feature -> drag a grip square -> vertex moves

### Snap

- [ ] Endpoint snap: cursor locks to vertices of nearby features (green square indicator)
- [ ] Midpoint snap: cursor locks to midpoints of line segments (green triangle indicator)
- [ ] Intersection snap: cursor locks to where two lines cross (red cross indicator)
- [ ] Grid snap: cursor locks to nearest grid intersection (gray cross indicator)
- [ ] Snap can be toggled with F3
- [ ] Snap indicator (colored shape) appears at the snap point
- [ ] Snap tooltip text appears near cursor ("Endpoint", "Midpoint", etc.)

### Undo/Redo

- [ ] Ctrl+Z undoes the last action
- [ ] Ctrl+Y / Ctrl+Shift+Z redoes
- [ ] Creating a feature -> undo -> feature disappears -> redo -> feature reappears
- [ ] Moving features -> undo -> features return to original position
- [ ] Deleting features -> undo -> features reappear
- [ ] Multiple undos work in sequence (10+ levels)
- [ ] New action after undo clears the redo stack

### Layers

- [ ] Two default layers exist: "Layer 0" and "Construction"
- [ ] Active layer is highlighted in the panel
- [ ] Click layer name -> becomes active layer
- [ ] Eye icon toggles visibility -> features on hidden layer disappear from canvas
- [ ] New Layer button creates a new layer
- [ ] Right-click -> Rename, Change Color, Delete work
- [ ] Cannot delete default layers
- [ ] New features go on the active layer

### Command Bar

- [ ] Typing a coordinate (e.g., `100,200`) and pressing Enter inputs that coordinate to the active tool
- [ ] Typing `@50,0` inputs a relative coordinate
- [ ] Typing `undo` triggers undo
- [ ] Typing `line` activates the line tool
- [ ] Typing `ze` triggers zoom to extents
- [ ] Focus returns to canvas after pressing Enter

### File I/O

- [ ] Ctrl+S opens save dialog -> file saved as `.starr` (JSON)
- [ ] Ctrl+O opens file dialog -> `.starr` file loaded -> drawing appears on canvas
- [ ] Save -> close -> reopen -> exact same drawing with all features, layers, settings
- [ ] New document (Ctrl+N) clears the canvas and resets to defaults

### Keyboard Shortcuts

- [ ] All shortcuts in Section 18 work
- [ ] Multi-key shortcuts (z+e, p+l) work within 500ms window
- [ ] Escape always cancels and returns to select tool

---

## 21. Build Order (Implementation Sequence)

Build in this exact order. Each step depends on the previous steps.

### Week 1-2: Scaffolding + Canvas

1. Initialize monorepo with pnpm, Turborepo, TypeScript
2. Create `packages/core` with all types from Section 2
3. Create `packages/geometry` with point, line, intersection, bounds, transform functions
4. Write unit tests for geometry package (Vitest)
5. Create `apps/web` with Next.js
6. Create `packages/rendering` with ViewportManager
7. Mount PixiJS canvas in CanvasViewport component
8. Implement pan (middle mouse / Space+drag) and zoom (scroll wheel at cursor)
9. Create ViewportStore in `packages/store`
10. Display cursor world coordinates in a basic status bar

### Week 3: Grid + Layers + State

1. Implement GridRenderer
2. Create DrawingStore with feature CRUD operations
3. Create basic Layer model and LayerPanel component
4. Implement active layer selection
5. Implement layer visibility toggle
6. Wire feature creation to assign to active layer

### Week 4: Drawing Tools + Snap

1. Implement ToolStore
2. Create ToolBar component with tool buttons
3. Implement DRAW_POINT tool
4. Implement DRAW_LINE tool with preview
5. Implement DRAW_POLYLINE tool with preview
6. Implement DRAW_POLYGON tool with preview
7. Implement SnapEngine (endpoint, midpoint, intersection, nearest, grid)
8. Create SnapIndicator renderer
9. Wire snap into all drawing tools

### Week 5: Selection + Edit

1. Implement hit testing (Section 9.1)
2. Implement click selection (single, shift-add)
3. Implement box selection (window + crossing modes)
4. Create SelectionRenderer (highlight + grips)
5. Implement Move tool
6. Implement Copy tool
7. Implement Rotate tool
8. Implement Mirror tool
9. Implement Erase tool / Delete key
10. Implement grip editing (drag vertex)

### Week 6: Undo + Command + File

1. Implement UndoStore with full undo/redo logic
2. Wire all operations (add, remove, modify, move, copy, rotate, etc.) to create UndoEntries
3. Implement CommandBar with parsing (Section 15)
4. Wire command bar to tools and actions
5. Implement .starr file save (JSON serialization)
6. Implement .starr file load (parse, validate, populate stores)
7. Implement Ctrl+S, Ctrl+O, Ctrl+N

### Week 7-8: Polish + Testing

1. Implement all keyboard shortcuts (Section 18)
2. Status bar: coordinate display, active layer, snap/grid toggles
3. Menu bar: File (New, Open, Save, Save As), Edit (Undo, Redo), View (Zoom Extents, Grid, Snap)
4. Handle edge cases (zero-size features, empty selections, rapid undo/redo)
5. Performance test with 10,000+ features
6. Run ALL acceptance tests from Section 20
7. Fix any failures
8. Document any deviations from spec

---

## Copilot Session Template

When starting a Copilot or Claude Code session for Phase 1, provide this context:

> I am building Starr CAD Phase 1 — the CAD engine core. This is a 2D drawing application for land surveyors. The tech stack is Next.js + TypeScript + PixiJS + Zustand in a Turborepo monorepo. I am currently working on [CURRENT TASK from Build Order]. The full Phase 1 spec is in `STARR_CAD_PHASE_1_ENGINE_CORE.md`. All TypeScript types are defined in Section 2. The coordinate system is Y-up (survey) with Y-flip at the rendering layer. The project structure is defined in Section 1.2.

---

*End of Phase 1 Specification*

*Starr Surveying Company — Belton, Texas — March 2026*
