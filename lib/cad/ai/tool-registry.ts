// lib/cad/ai/tool-registry.ts
//
// Phase 6 §32 — AI Integration Framework.
//
// The "tool registry" is the AI's instrument panel. Every action
// the AI is allowed to take on the drawing is declared here as
// a typed `ToolDefinition`. Each definition pairs:
//
//   1. A stable name (also used by the COMMAND-mode palette).
//   2. A JSON-schema description of its arguments (passed to
//      Claude's tool-use API as-is).
//   3. An `execute(args)` function that calls into the same
//      kernel a manual UI button would, returning a structured
//      `{ ok, result, reason }` envelope so the AI can react to
//      failures rather than blow up.
//
// Slice 2 ships the first five tools:
//
//   - addPoint            wraps drawingStore.addFeature (POINT)
//   - drawLineBetween     wraps drawingStore.addFeature (LINE)
//   - drawPolylineThrough wraps drawingStore.addFeature (POLYLINE / POLYGON)
//   - createLayer         wraps drawingStore.addLayer
//   - applyLayerStyle     wraps drawingStore.updateLayer
//
// The registry is *pure* — no AI calls live here. The Claude
// adapter (a later slice) loads the registry, exposes the
// schemas as tools, and dispatches model-emitted tool calls
// through `execute(args)`.

import {
  useDrawingStore,
  useUndoStore,
  makeAddFeatureEntry,
  makeBatchEntry,
} from '../store';
// C35 — the MODIFY family transforms points with the same helpers the manual tools use, so an AI
// move and a dragged move produce identical geometry.
import { transformFeature, translate, rotate, scale, mirror } from '../geometry/transform';
// C36 — measurement over geometry already on the drawing, and the LIST equivalent.
import { computeFeatureArea } from '../geometry/area';
import { pointNumberOf, pointCodeOf, pointDescriptionOf } from '../feature-fields';
import { readDerivation } from '../derivation';
import { generateId } from '../types';
import type { Feature, Layer, Point2D, FeatureStyle } from '../types';
import { stampProvenance, type AIProvenance } from './provenance';
import { ensureDraftLayerFor } from './sandbox';
import { stampDisambiguatedPointName } from '../points/disambiguate';
import { assignSymbolForCode } from '../styles/code-to-symbol';
import {
  calcFourthParallelogramCorner,
  calcPointFromBearingDistance,
  calcPointFromTwoBearings,
  calcPointFromBearingAndLine,
  calcPointParallelToLine,
} from '../geometry/solver';
import { vertexClosure, vertexBowditchAdjust, type VertexClosureResult } from '../geometry/closure';
// C34 — three-point arc fitting, for drawArc.
import { circleThrough3Points } from '../geometry/curve';
import { inverseBearingDistance, formatBearing, formatAzimuth } from '../geometry/bearing';

// ────────────────────────────────────────────────────────────
// Envelope + definition types
// ────────────────────────────────────────────────────────────

/**
 * Structured result every tool returns. The AI sees a typed
 * payload on success and a human-readable reason on failure
 * (e.g. "Layer name 'BACK_OF_CURB' already exists"). No tool
 * throws — every error is returned as an envelope so the AI's
 * tool-use loop stays predictable.
 */
export type ToolResult<T> =
  | { ok: true; result: T }
  | { ok: false; reason: string };

/**
 * One entry in the registry. `inputSchema` is a JSON-schema-
 * compatible object describing `Args`; the Claude adapter
 * forwards it verbatim as the tool's `input_schema`. We type
 * it as `object` rather than a strict schema type so each
 * definition keeps its concrete shape inline.
 */
export interface ToolDefinition<Args, Result> {
  name: string;
  description: string;
  inputSchema: object;
  execute(args: Args): ToolResult<Result>;
}

// ────────────────────────────────────────────────────────────
// Shared helpers
// ────────────────────────────────────────────────────────────

/**
 * Resolve the layer id to write to. Falls back to the active
 * layer; emits a clear reason when neither is usable. When
 * `sandbox` is true the resolved id is redirected to the
 * matching `DRAFT__<targetname>` layer per §32.3 — the target
 * layer must still exist (and not be locked), but the actual
 * write lands on the auto-created draft.
 */
function resolveLayerId(
  layerId: string | null | undefined,
  sandbox: boolean,
): ToolResult<string> {
  const store = useDrawingStore.getState();
  let resolvedTargetId: string;
  if (layerId) {
    const layer = store.document.layers[layerId];
    if (!layer) return { ok: false, reason: `Layer '${layerId}' does not exist.` };
    if (!sandbox && layer.locked) {
      return { ok: false, reason: `Layer '${layer.name}' is locked.` };
    }
    resolvedTargetId = layerId;
  } else {
    const active = store.activeLayerId;
    if (!active) return { ok: false, reason: 'No layer specified and no active layer set.' };
    const layer = store.document.layers[active];
    if (!layer) return { ok: false, reason: `Active layer '${active}' is missing from the document.` };
    if (!sandbox && layer.locked) {
      return { ok: false, reason: `Active layer '${layer.name}' is locked.` };
    }
    resolvedTargetId = active;
  }
  if (!sandbox) return { ok: true, result: resolvedTargetId };

  // Sandbox: redirect to the mirrored DRAFT__ layer (auto-
  // created if missing). The target must still exist so the
  // surveyor can promote the draft back to a known home.
  const draft = ensureDraftLayerFor(resolvedTargetId);
  if (!draft.ok) return { ok: false, reason: draft.reason };
  return { ok: true, result: draft.draftLayerId };
}

/** Build a baseline FeatureStyle inheriting from the layer. The
 *  AI tools default everything to "use layer" so a future Slice
 *  3 stylings pass can override fields surgically. */
function defaultStyle(): FeatureStyle {
  return {
    color: null,
    lineWeight: null,
    opacity: 1,
    lineTypeId: null,
    symbolId: null,
    symbolSize: null,
    symbolRotation: 0,
    labelVisible: null,
    labelFormat: null,
    labelOffset: { x: 0, y: 0 },
    isOverride: false,
  };
}

/**
 * Push the feature + return the ok envelope. Stamps the §32.7
 * provenance fields onto `properties` when provided so a
 * right-click "Why did AI draw this?" can audit the source.
 */
function commitFeature(
  feature: Feature,
  provenance: AIProvenance | undefined,
): ToolResult<Feature> {
  const stamped: Feature = provenance
    ? { ...feature, properties: stampProvenance(feature.properties, provenance) }
    : feature;
  useDrawingStore.getState().addFeature(stamped);
  useUndoStore.getState().pushUndo(makeAddFeatureEntry(stamped));
  return { ok: true, result: stamped };
}

// ────────────────────────────────────────────────────────────
// Tool 1 — addPoint
// ────────────────────────────────────────────────────────────

export interface AddPointArgs {
  x: number;
  y: number;
  /** Optional — falls back to the active layer. */
  layerId?: string | null;
  /** Optional surveyor / AI code stamped on `properties.code`. */
  code?: string;
  /** Extra properties merged in last (surveyor / AI specific). */
  properties?: Record<string, string | number | boolean>;
  /** §32.7 provenance stamps. Supplied by the AI adapter when
   *  the call originated from AI; omitted for direct test / UI
   *  invocations. */
  provenance?: AIProvenance;
  /** §32.3 sandbox routing. When true the write is redirected
   *  to the matching `DRAFT__<targetname>` layer (auto-created
   *  on first use). The target layer must still exist; only
   *  promotion of the draft (§11.7 transfer) writes to it. */
  sandbox?: boolean;
}

export const addPoint: ToolDefinition<AddPointArgs, Feature> = {
  name: 'addPoint',
  description:
    'Drop a single POINT feature at the given world coordinates. ' +
    'Falls back to the active layer when layerId is omitted. ' +
    'Returns the created feature so the caller can chain references to it.',
  inputSchema: {
    type: 'object',
    required: ['x', 'y'],
    properties: {
      x: { type: 'number', description: 'World-space X coordinate (US Survey Feet).' },
      y: { type: 'number', description: 'World-space Y coordinate (US Survey Feet).' },
      layerId: { type: ['string', 'null'], description: 'Target layer id; omit to use the active layer.' },
      code: { type: 'string', description: "Optional point code (e.g. 'BC-1')." },
      properties: { type: 'object', additionalProperties: true },
    },
    additionalProperties: false,
  },
  execute(args) {
    if (!Number.isFinite(args.x) || !Number.isFinite(args.y)) {
      return { ok: false, reason: 'x and y must be finite numbers.' };
    }
    const layerResult = resolveLayerId(args.layerId, !!args.sandbox);
    if (!layerResult.ok) return layerResult;
    // cad-domain-audit Slice L — disambiguate a user-supplied point
    // name against existing POINT features so silent overwrites can't
    // happen. When `properties.pointName` (or any legacy alias) is
    // already in use, the new point gets `${bare}:K` (K = smallest
    // free suffix) — same rule the TRV importer applies.
    const doc = useDrawingStore.getState().document;
    const safeProperties = stampDisambiguatedPointName(doc, {
      ...(args.code ? { code: args.code } : {}),
      ...(args.properties ?? {}),
    });
    // cad-domain-audit Slice M — assign the symbol library's glyph
    // when the code (or the free-form description token) matches a
    // monument / utility symbol. Same rule the TRV importer uses, so
    // a "309" point dropped via AI gets the iron-rod monument glyph
    // instead of the default crosshair.
    const style = defaultStyle();
    const codeForSymbol =
      (typeof safeProperties?.code === 'string' && safeProperties.code) ||
      (typeof safeProperties?.description === 'string' && safeProperties.description) ||
      args.code ||
      '';
    style.symbolId =
      assignSymbolForCode(codeForSymbol, doc.customSymbols ?? []) ?? style.symbolId;
    const feature: Feature = {
      id: generateId(),
      type: 'POINT',
      geometry: { type: 'POINT', point: { x: args.x, y: args.y } },
      layerId: layerResult.result,
      style,
      properties: safeProperties ?? {},
    };
    return commitFeature(feature, args.provenance);
  },
};

// ────────────────────────────────────────────────────────────
// Tool 2 — drawLineBetween
// ────────────────────────────────────────────────────────────

export interface DrawLineBetweenArgs {
  from: Point2D;
  to: Point2D;
  layerId?: string | null;
  properties?: Record<string, string | number | boolean>;
  provenance?: AIProvenance;
  /** §32.3 sandbox routing — see AddPointArgs.sandbox. */
  sandbox?: boolean;
}

export const drawLineBetween: ToolDefinition<DrawLineBetweenArgs, Feature> = {
  name: 'drawLineBetween',
  description:
    'Draw a single LINE feature between two world-space points. ' +
    'Use this for two-point connections; use drawPolylineThrough for chains of 3+ points.',
  inputSchema: {
    type: 'object',
    required: ['from', 'to'],
    properties: {
      from: pointSchema('Start of the segment.'),
      to: pointSchema('End of the segment.'),
      layerId: { type: ['string', 'null'] },
      properties: { type: 'object', additionalProperties: true },
    },
    additionalProperties: false,
  },
  execute(args) {
    const fromOk = validatePoint(args.from, 'from');
    if (!fromOk.ok) return fromOk;
    const toOk = validatePoint(args.to, 'to');
    if (!toOk.ok) return toOk;
    if (pointsEqual(args.from, args.to)) {
      return { ok: false, reason: 'from and to are the same point; cannot draw a zero-length line.' };
    }
    const layerResult = resolveLayerId(args.layerId, !!args.sandbox);
    if (!layerResult.ok) return layerResult;
    const feature: Feature = {
      id: generateId(),
      type: 'LINE',
      geometry: { type: 'LINE', start: args.from, end: args.to },
      layerId: layerResult.result,
      style: defaultStyle(),
      properties: { ...(args.properties ?? {}) },
    };
    return commitFeature(feature, args.provenance);
  },
};

// ────────────────────────────────────────────────────────────
// Tool 3 — drawPolylineThrough
// ────────────────────────────────────────────────────────────

export interface DrawPolylineThroughArgs {
  points: Point2D[];
  /** When true emits a closed POLYGON instead of a POLYLINE. */
  closed?: boolean;
  layerId?: string | null;
  properties?: Record<string, string | number | boolean>;
  provenance?: AIProvenance;
  /** §32.3 sandbox routing — see AddPointArgs.sandbox. */
  sandbox?: boolean;
}

export const drawPolylineThrough: ToolDefinition<DrawPolylineThroughArgs, Feature> = {
  name: 'drawPolylineThrough',
  description:
    'Draw a POLYLINE (or POLYGON when closed=true) through an ordered list of world-space points. ' +
    'Requires at least 2 points for an open polyline or at least 3 for a closed polygon.',
  inputSchema: {
    type: 'object',
    required: ['points'],
    properties: {
      points: {
        type: 'array',
        items: pointSchema('A vertex along the polyline.'),
        minItems: 2,
      },
      closed: { type: 'boolean', description: 'Emit a POLYGON instead of a POLYLINE.', default: false },
      layerId: { type: ['string', 'null'] },
      properties: { type: 'object', additionalProperties: true },
    },
    additionalProperties: false,
  },
  execute(args) {
    if (!Array.isArray(args.points) || args.points.length < 2) {
      return { ok: false, reason: 'points must be an array of at least 2 vertices.' };
    }
    if (args.closed && args.points.length < 3) {
      return { ok: false, reason: 'A closed polygon needs at least 3 vertices.' };
    }
    for (let i = 0; i < args.points.length; i++) {
      const v = validatePoint(args.points[i], `points[${i}]`);
      if (!v.ok) return v;
    }
    const layerResult = resolveLayerId(args.layerId, !!args.sandbox);
    if (!layerResult.ok) return layerResult;
    const type = args.closed ? 'POLYGON' : 'POLYLINE';
    const feature: Feature = {
      id: generateId(),
      type,
      geometry: { type, vertices: args.points.map((p) => ({ x: p.x, y: p.y })) },
      layerId: layerResult.result,
      style: defaultStyle(),
      properties: { ...(args.properties ?? {}) },
    };
    return commitFeature(feature, args.provenance);
  },
};

// ────────────────────────────────────────────────────────────
// Tool 4 — createLayer
// ────────────────────────────────────────────────────────────

export interface CreateLayerArgs {
  name: string;
  color?: string;
  lineWeight?: number;
  lineTypeId?: string;
  opacity?: number;
  /** When true, sets the newly-created layer active. */
  setActive?: boolean;
}

export const createLayer: ToolDefinition<CreateLayerArgs, Layer> = {
  name: 'createLayer',
  description:
    'Create a new drawing layer. Returns the layer (including its generated id). ' +
    'Fails with a structured reason when a layer of the same name already exists.',
  inputSchema: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1 },
      color: { type: 'string', description: "Hex colour like '#ff8800'. Default '#cccccc'." },
      lineWeight: { type: 'number', minimum: 0 },
      lineTypeId: { type: 'string' },
      opacity: { type: 'number', minimum: 0, maximum: 1 },
      setActive: { type: 'boolean', default: false },
    },
    additionalProperties: false,
  },
  execute(args) {
    const trimmed = (args.name ?? '').trim();
    if (trimmed.length === 0) {
      return { ok: false, reason: 'name must be a non-empty string.' };
    }
    const store = useDrawingStore.getState();
    const collision = Object.values(store.document.layers).find(
      (l) => l.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (collision) {
      return { ok: false, reason: `Layer named '${trimmed}' already exists (id=${collision.id}).` };
    }
    const layer: Layer = {
      id: generateId(),
      name: trimmed,
      visible: true,
      locked: false,
      frozen: false,
      color: args.color ?? '#cccccc',
      lineWeight: args.lineWeight ?? 0.5,
      lineTypeId: args.lineTypeId ?? 'SOLID',
      opacity: args.opacity ?? 1,
      groupId: null,
      sortOrder: Object.keys(store.document.layers).length,
      isDefault: false,
      isProtected: false,
      autoAssignCodes: [],
    };
    store.addLayer(layer);
    if (args.setActive) store.setActiveLayer(layer.id);
    return { ok: true, result: layer };
  },
};

// ────────────────────────────────────────────────────────────
// Tool 5 — applyLayerStyle
// ────────────────────────────────────────────────────────────

export interface ApplyLayerStyleArgs {
  layerId: string;
  /** Subset of Layer fields that count as "style." */
  style: {
    color?: string;
    lineWeight?: number;
    lineTypeId?: string;
    opacity?: number;
    visible?: boolean;
    locked?: boolean;
    frozen?: boolean;
  };
}

export const applyLayerStyle: ToolDefinition<ApplyLayerStyleArgs, Layer> = {
  name: 'applyLayerStyle',
  description:
    'Update the style fields of an existing layer (colour / line weight / line type / opacity / ' +
    'visibility / locked / frozen). Returns the post-update layer. Fails when the layer is missing.',
  inputSchema: {
    type: 'object',
    required: ['layerId', 'style'],
    properties: {
      layerId: { type: 'string' },
      style: {
        type: 'object',
        additionalProperties: false,
        properties: {
          color: { type: 'string' },
          lineWeight: { type: 'number', minimum: 0 },
          lineTypeId: { type: 'string' },
          opacity: { type: 'number', minimum: 0, maximum: 1 },
          visible: { type: 'boolean' },
          locked: { type: 'boolean' },
          frozen: { type: 'boolean' },
        },
      },
    },
    additionalProperties: false,
  },
  execute(args) {
    const store = useDrawingStore.getState();
    const existing = store.document.layers[args.layerId];
    if (!existing) {
      return { ok: false, reason: `Layer '${args.layerId}' does not exist.` };
    }
    store.updateLayer(args.layerId, args.style);
    // Re-read to capture the merged shape.
    const updated = useDrawingStore.getState().document.layers[args.layerId];
    return { ok: true, result: updated };
  },
};

// ────────────────────────────────────────────────────────────
// Geometry-solver tools (slice B of CAD_POINTS_AND_AI)
//
// These return computed coordinates and metrics without
// mutating the drawing. They are the AI's deterministic
// "calculator": when the model needs the 4th corner of a
// nearly-rectangular pillar, or the intersection of two
// bearings, it should call one of these instead of guessing.
// The dialogue UI then renders the result as a ghost preview
// (via the cad:copilotPreview event) that the surveyor accepts
// or rejects before any feature is materialised.
// ────────────────────────────────────────────────────────────

interface SolverArgsThreePoints { adjacent1: Point2D; opposite: Point2D; adjacent2: Point2D }
const calcFourthCornerTool: ToolDefinition<SolverArgsThreePoints, Point2D> = {
  name: 'calcFourthCorner',
  description:
    'Calculate the fourth corner of a parallelogram given three corners. ' +
    'Use this when a building/pillar corner was not shot but the surveyor ' +
    'shot the other three. `opposite` is the corner diagonally across from ' +
    'the missing one; `adjacent1` and `adjacent2` are the other two corners. ' +
    'Returns the computed point; does not draw it. Combine with addPoint or ' +
    'render as a ghost preview for review.',
  inputSchema: {
    type: 'object',
    required: ['adjacent1', 'opposite', 'adjacent2'],
    properties: {
      adjacent1: pointSchema('First adjacent corner (shares an edge with the missing one).'),
      opposite: pointSchema('Diagonal corner (across from the missing one).'),
      adjacent2: pointSchema('Second adjacent corner (shares an edge with the missing one).'),
    },
    additionalProperties: false,
  },
  execute(args) {
    const a1 = validatePoint(args.adjacent1, 'adjacent1');
    if (!a1.ok) return a1;
    const op = validatePoint(args.opposite, 'opposite');
    if (!op.ok) return op;
    const a2 = validatePoint(args.adjacent2, 'adjacent2');
    if (!a2.ok) return a2;
    const r = calcFourthParallelogramCorner(a1.result, op.result, a2.result);
    if (!r.ok) return { ok: false, reason: r.reason };
    return { ok: true, result: r.point };
  },
};

interface SolverArgsBearingDistance { origin: Point2D; bearingDeg: number; distance: number }
const calcPointFromBearingDistanceTool: ToolDefinition<SolverArgsBearingDistance, Point2D> = {
  name: 'calcPointFromBearingDistance',
  description:
    'Compute a point at (origin + bearing × distance). Bearing is azimuth ' +
    'in degrees clockwise from North; distance is in the document units.',
  inputSchema: {
    type: 'object',
    required: ['origin', 'bearingDeg', 'distance'],
    properties: {
      origin: pointSchema('Starting point.'),
      bearingDeg: { type: 'number', description: 'Azimuth, 0=N clockwise.' },
      distance: { type: 'number', description: 'Distance from origin (non-negative).' },
    },
    additionalProperties: false,
  },
  execute(args) {
    const o = validatePoint(args.origin, 'origin');
    if (!o.ok) return o;
    const r = calcPointFromBearingDistance(o.result, args.bearingDeg, args.distance);
    if (!r.ok) return { ok: false, reason: r.reason };
    return { ok: true, result: r.point };
  },
};

interface SolverArgsTwoBearings { originA: Point2D; bearingADeg: number; originB: Point2D; bearingBDeg: number }
const calcPointFromTwoBearingsTool: ToolDefinition<SolverArgsTwoBearings, Point2D> = {
  name: 'calcPointFromTwoBearings',
  description:
    'Intersect two rays defined by (origin, azimuth) pairs. Returns the ' +
    'intersection point or fails if the rays are parallel.',
  inputSchema: {
    type: 'object',
    required: ['originA', 'bearingADeg', 'originB', 'bearingBDeg'],
    properties: {
      originA: pointSchema('First ray origin.'),
      bearingADeg: { type: 'number', description: 'Azimuth from originA, 0=N clockwise.' },
      originB: pointSchema('Second ray origin.'),
      bearingBDeg: { type: 'number', description: 'Azimuth from originB, 0=N clockwise.' },
    },
    additionalProperties: false,
  },
  execute(args) {
    const oa = validatePoint(args.originA, 'originA');
    if (!oa.ok) return oa;
    const ob = validatePoint(args.originB, 'originB');
    if (!ob.ok) return ob;
    const r = calcPointFromTwoBearings(oa.result, args.bearingADeg, ob.result, args.bearingBDeg);
    if (!r.ok) return { ok: false, reason: r.reason };
    return { ok: true, result: r.point };
  },
};

interface SolverArgsBearingLine { origin: Point2D; bearingDeg: number; lineStart: Point2D; lineEnd: Point2D }
const calcPointFromBearingAndLineTool: ToolDefinition<SolverArgsBearingLine, Point2D> = {
  name: 'calcPointFromBearingAndLine',
  description:
    'Intersect a ray (origin, azimuth) with a reference line. The reference ' +
    'line is treated as infinite; clamp at the caller if you need segment-only.',
  inputSchema: {
    type: 'object',
    required: ['origin', 'bearingDeg', 'lineStart', 'lineEnd'],
    properties: {
      origin: pointSchema('Ray origin.'),
      bearingDeg: { type: 'number', description: 'Azimuth from origin, 0=N clockwise.' },
      lineStart: pointSchema('Reference line start.'),
      lineEnd: pointSchema('Reference line end.'),
    },
    additionalProperties: false,
  },
  execute(args) {
    const o = validatePoint(args.origin, 'origin');
    if (!o.ok) return o;
    const ls = validatePoint(args.lineStart, 'lineStart');
    if (!ls.ok) return ls;
    const le = validatePoint(args.lineEnd, 'lineEnd');
    if (!le.ok) return le;
    const r = calcPointFromBearingAndLine(o.result, args.bearingDeg, ls.result, le.result);
    if (!r.ok) return { ok: false, reason: r.reason };
    return { ok: true, result: r.point };
  },
};

interface SolverArgsParallel { origin: Point2D; refStart: Point2D; refEnd: Point2D; perpendicularDistance: number; side: 'LEFT' | 'RIGHT'; alongDistance?: number }
const calcPointParallelToLineTool: ToolDefinition<SolverArgsParallel, Point2D> = {
  name: 'calcPointParallelToLine',
  description:
    'Drop a point on a line parallel to a reference line. Useful when the ' +
    'missing corner is on a wall parallel to a wall whose endpoints were ' +
    'shot. `perpendicularDistance` is the offset distance; `side` is LEFT ' +
    'or RIGHT relative to the reference-line direction (right-hand rule ' +
    'from refStart toward refEnd). Optional `alongDistance` slides the ' +
    'result down the parallel.',
  inputSchema: {
    type: 'object',
    required: ['origin', 'refStart', 'refEnd', 'perpendicularDistance', 'side'],
    properties: {
      origin: pointSchema('Anchor point the parallel passes through.'),
      refStart: pointSchema('Reference line start.'),
      refEnd: pointSchema('Reference line end.'),
      perpendicularDistance: { type: 'number', description: 'Offset distance from origin.' },
      side: { type: 'string', enum: ['LEFT', 'RIGHT'], description: 'Side relative to refStart→refEnd direction.' },
      alongDistance: { type: 'number', description: 'Optional shift along the parallel from origin.' },
    },
    additionalProperties: false,
  },
  execute(args) {
    const o = validatePoint(args.origin, 'origin');
    if (!o.ok) return o;
    const rs = validatePoint(args.refStart, 'refStart');
    if (!rs.ok) return rs;
    const re = validatePoint(args.refEnd, 'refEnd');
    if (!re.ok) return re;
    if (args.side !== 'LEFT' && args.side !== 'RIGHT') {
      return { ok: false, reason: "side must be 'LEFT' or 'RIGHT'." };
    }
    const r = calcPointParallelToLine(
      o.result, rs.result, re.result,
      args.perpendicularDistance, args.side, args.alongDistance ?? 0,
    );
    if (!r.ok) return { ok: false, reason: r.reason };
    return { ok: true, result: r.point };
  },
};

interface InverseTwoPointsResult {
  azimuth: number;
  distance: number;
  bearing: string;
  azimuthFormatted: string;
}
const inverseTwoPointsTool: ToolDefinition<{ from: Point2D; to: Point2D }, InverseTwoPointsResult> = {
  name: 'inverseTwoPoints',
  description:
    'Compute the bearing, azimuth, and distance between two points. Returns ' +
    'both raw numeric values and pre-formatted strings ("N 12°34\'56" E", ' +
    '"123°45\'67\\"") for the AI to quote back to the surveyor.',
  inputSchema: {
    type: 'object',
    required: ['from', 'to'],
    properties: {
      from: pointSchema('Start point.'),
      to: pointSchema('End point.'),
    },
    additionalProperties: false,
  },
  execute(args) {
    const f = validatePoint(args.from, 'from');
    if (!f.ok) return f;
    const t = validatePoint(args.to, 'to');
    if (!t.ok) return t;
    const inv = inverseBearingDistance(f.result, t.result);
    return {
      ok: true,
      result: {
        azimuth: inv.azimuth,
        distance: inv.distance,
        bearing: formatBearing(inv.azimuth),
        azimuthFormatted: formatAzimuth(inv.azimuth),
      },
    };
  },
};

const closureReportTool: ToolDefinition<{ vertices: Point2D[] }, VertexClosureResult> = {
  name: 'closureReport',
  description:
    'Run a misclosure report on a sequence of perimeter vertices. The ' +
    'implied closing edge runs from the last vertex back to the first. ' +
    'Returns linear error, error bearing, precision (1:N), and the ' +
    'closing-leg endpoints so the dialogue can render the gap on canvas.',
  inputSchema: {
    type: 'object',
    required: ['vertices'],
    properties: {
      vertices: {
        type: 'array',
        items: pointSchema('Perimeter vertex.'),
        minItems: 2,
        description: 'Open perimeter; closing edge implied (last → first).',
      },
    },
    additionalProperties: false,
  },
  execute(args) {
    if (!Array.isArray(args.vertices) || args.vertices.length < 2) {
      return { ok: false, reason: 'At least two vertices are required.' };
    }
    const checked: Point2D[] = [];
    for (let i = 0; i < args.vertices.length; i++) {
      const v = validatePoint(args.vertices[i], `vertices[${i}]`);
      if (!v.ok) return v;
      checked.push(v.result);
    }
    return { ok: true, result: vertexClosure(checked) };
  },
};

const bowditchAdjustTool: ToolDefinition<{ vertices: Point2D[] }, Point2D[]> = {
  name: 'bowditchAdjust',
  description:
    'Apply the Bowditch (compass-rule) adjustment to a sequence of ' +
    'perimeter vertices. Returns a new vertex array where the first ' +
    'vertex is anchored and the closure error has been distributed ' +
    'proportionally to cumulative edge length. The final vertex matches ' +
    'the first. The surveyor should preview the result as a ghost overlay ' +
    'before accepting.',
  inputSchema: {
    type: 'object',
    required: ['vertices'],
    properties: {
      vertices: {
        type: 'array',
        items: pointSchema('Perimeter vertex.'),
        minItems: 2,
      },
    },
    additionalProperties: false,
  },
  execute(args) {
    if (!Array.isArray(args.vertices) || args.vertices.length < 2) {
      return { ok: false, reason: 'At least two vertices are required.' };
    }
    const checked: Point2D[] = [];
    for (let i = 0; i < args.vertices.length; i++) {
      const v = validatePoint(args.vertices[i], `vertices[${i}]`);
      if (!v.ok) return v;
      checked.push(v.result);
    }
    return { ok: true, result: vertexBowditchAdjust(checked) };
  },
};

// ────────────────────────────────────────────────────────────
// Registry
// ────────────────────────────────────────────────────────────

/** All registered tools, keyed by name. The Claude adapter will
 *  walk this map to build the model's tool list; the COMMAND-
 *  mode palette will look up tools by name when the surveyor
 *  selects one. */
// ────────────────────────────────────────────────────────────
// C34 — the rest of the DRAW_* family
//
// The registry had three ways to create geometry: a point, a
// line, and a polyline/polygon through vertices. Everything
// else a surveyor draws — a rectangle, a circle, an arc, a
// text note — could only be reached by handing the AI a list of
// vertices and asking it to approximate.
//
// That is worse than it sounds. A circle emitted as 64 vertices
// is not a circle: it exports as a polyline, it cannot be
// snapped to a centre, and `computeFeatureArea` measures the
// inscribed polygon rather than the circle. The parametric
// geometry this codebase already stores (`geometry.circle`,
// `.ellipse`, `.arc`) exists precisely so that does not happen,
// and the AI had no way to produce it.
//
// C31 is what makes this cheap: adding a tool here reaches BOTH
// AI paths, because the chat prompt is generated from this
// object and `claude-proposer` derives its tool list from it.
// ────────────────────────────────────────────────────────────

export interface DrawRectangleArgs {
  corner: Point2D;
  opposite: Point2D;
  layerId?: string | null;
  properties?: Record<string, string | number | boolean>;
  provenance?: AIProvenance;
  sandbox?: boolean;
}

export const drawRectangle: ToolDefinition<DrawRectangleArgs, Feature> = {
  name: 'drawRectangle',
  description:
    'Draw an axis-aligned rectangle as a closed POLYGON from two opposite corners. ' +
    'Use this rather than four points through drawPolylineThrough — it guarantees square corners.',
  inputSchema: {
    type: 'object',
    required: ['corner', 'opposite'],
    properties: {
      corner: pointSchema('One corner.'),
      opposite: pointSchema('The diagonally opposite corner.'),
      layerId: { type: ['string', 'null'] },
      properties: { type: 'object', additionalProperties: true },
    },
    additionalProperties: false,
  },
  execute(args) {
    const a = validatePoint(args.corner, 'corner');
    if (!a.ok) return a;
    const b = validatePoint(args.opposite, 'opposite');
    if (!b.ok) return b;
    // A rectangle with no width or no height is a line the caller did not ask for. Refusing is
    // better than silently drawing a degenerate polygon that measures zero area.
    if (Math.abs(args.corner.x - args.opposite.x) < 1e-9) {
      return { ok: false, reason: 'The two corners share an easting — the rectangle has no width.' };
    }
    if (Math.abs(args.corner.y - args.opposite.y) < 1e-9) {
      return { ok: false, reason: 'The two corners share a northing — the rectangle has no height.' };
    }
    const layerResult = resolveLayerId(args.layerId, !!args.sandbox);
    if (!layerResult.ok) return layerResult;
    const { x: x1, y: y1 } = args.corner;
    const { x: x2, y: y2 } = args.opposite;
    return commitFeature(
      {
        id: generateId(),
        type: 'POLYGON',
        geometry: {
          type: 'POLYGON',
          vertices: [
            { x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 },
          ],
        },
        layerId: layerResult.result,
        style: defaultStyle(),
        properties: { ...(args.properties ?? {}) },
      },
      args.provenance,
    );
  },
};

export interface DrawCircleArgs {
  center: Point2D;
  radius: number;
  layerId?: string | null;
  properties?: Record<string, string | number | boolean>;
  provenance?: AIProvenance;
  sandbox?: boolean;
}

export const drawCircle: ToolDefinition<DrawCircleArgs, Feature> = {
  name: 'drawCircle',
  description:
    'Draw a true circle from a centre and radius (feet). Produces parametric circle geometry, ' +
    'not an approximating polyline, so it exports and measures as a circle.',
  inputSchema: {
    type: 'object',
    required: ['center', 'radius'],
    properties: {
      center: pointSchema('Centre of the circle.'),
      radius: { type: 'number', description: 'Radius in US Survey Feet. Must be greater than 0.' },
      layerId: { type: ['string', 'null'] },
      properties: { type: 'object', additionalProperties: true },
    },
    additionalProperties: false,
  },
  execute(args) {
    const c = validatePoint(args.center, 'center');
    if (!c.ok) return c;
    if (!Number.isFinite(args.radius) || args.radius <= 0) {
      return { ok: false, reason: 'radius must be a number greater than 0.' };
    }
    const layerResult = resolveLayerId(args.layerId, !!args.sandbox);
    if (!layerResult.ok) return layerResult;
    return commitFeature(
      {
        id: generateId(),
        type: 'POLYGON',
        // POLYGON carrying parametric `circle` data — the shape the renderer, the DXF writer and
        // `computeFeatureArea` all already understand. See `FeatureGeometry.circle`.
        geometry: {
          type: 'POLYGON',
          circle: { center: { x: args.center.x, y: args.center.y }, radius: args.radius },
        },
        layerId: layerResult.result,
        style: defaultStyle(),
        properties: { ...(args.properties ?? {}) },
      },
      args.provenance,
    );
  },
};

export interface DrawArcArgs {
  start: Point2D;
  through: Point2D;
  end: Point2D;
  layerId?: string | null;
  properties?: Record<string, string | number | boolean>;
  provenance?: AIProvenance;
  sandbox?: boolean;
}

export const drawArc: ToolDefinition<DrawArcArgs, Feature> = {
  name: 'drawArc',
  description:
    'Draw a circular arc through three points: start, a point ALONG the arc, and end. ' +
    'The middle point is on the curve, not the centre.',
  inputSchema: {
    type: 'object',
    required: ['start', 'through', 'end'],
    properties: {
      start: pointSchema('Where the arc begins.'),
      through: pointSchema('A point ON the arc between the ends — NOT the centre.'),
      end: pointSchema('Where the arc ends.'),
      layerId: { type: ['string', 'null'] },
      properties: { type: 'object', additionalProperties: true },
    },
    additionalProperties: false,
  },
  execute(args) {
    for (const [k, p] of [['start', args.start], ['through', args.through], ['end', args.end]] as const) {
      const v = validatePoint(p, k);
      if (!v.ok) return v;
    }
    const circle = circleThrough3Points(args.start, args.through, args.end);
    // Three collinear points have no circle. Saying so beats emitting an arc of infinite radius,
    // which renders as nothing and reads as the tool having silently failed.
    if (!circle) {
      return { ok: false, reason: 'Those three points are collinear — no arc passes through them.' };
    }
    const layerResult = resolveLayerId(args.layerId, !!args.sandbox);
    if (!layerResult.ok) return layerResult;
    const ang = (p: Point2D) => Math.atan2(p.y - circle.center.y, p.x - circle.center.x);
    const startAngle = ang(args.start);
    const endAngle = ang(args.end);
    const midAngle = ang(args.through);
    // Sweep direction is decided by which way round the circle the middle point actually lies —
    // measured, not assumed. Guessing it draws the major arc, which is the 300-foot error C29 hit
    // by reasoning about a convention instead of reading it.
    const TAU = Math.PI * 2;
    const norm = (a: number) => ((a % TAU) + TAU) % TAU;
    const ccwSweep = norm(midAngle - startAngle) <= norm(endAngle - startAngle);
    return commitFeature(
      {
        id: generateId(),
        type: 'ARC',
        geometry: {
          type: 'ARC',
          arc: {
            center: circle.center,
            radius: circle.radius,
            startAngle,
            endAngle,
            anticlockwise: ccwSweep,
          },
        },
        layerId: layerResult.result,
        style: defaultStyle(),
        properties: { ...(args.properties ?? {}) },
      },
      args.provenance,
    );
  },
};

export interface DrawTextArgs {
  at: Point2D;
  text: string;
  fontSize?: number;
  rotationDeg?: number;
  layerId?: string | null;
  properties?: Record<string, string | number | boolean>;
  provenance?: AIProvenance;
  sandbox?: boolean;
}

export const drawText: ToolDefinition<DrawTextArgs, Feature> = {
  name: 'drawText',
  description:
    'Place a text note on the drawing at a world-space point. Font size is points on paper.',
  inputSchema: {
    type: 'object',
    required: ['at', 'text'],
    properties: {
      at: pointSchema('Where the text is anchored.'),
      text: { type: 'string', description: 'The text to place.' },
      fontSize: { type: 'number', description: 'Points on paper. Defaults to 12.' },
      rotationDeg: { type: 'number', description: 'Rotation in degrees CCW. Defaults to 0.' },
      layerId: { type: ['string', 'null'] },
      properties: { type: 'object', additionalProperties: true },
    },
    additionalProperties: false,
  },
  execute(args) {
    const p = validatePoint(args.at, 'at');
    if (!p.ok) return p;
    // Empty text places an invisible feature the surveyor cannot see, cannot select by looking,
    // and will not know to delete.
    if (typeof args.text !== 'string' || args.text.trim().length === 0) {
      return { ok: false, reason: 'text must be a non-empty string.' };
    }
    const size = Number.isFinite(args.fontSize) ? Number(args.fontSize) : 12;
    if (size <= 0) return { ok: false, reason: 'fontSize must be greater than 0.' };
    const layerResult = resolveLayerId(args.layerId, !!args.sandbox);
    if (!layerResult.ok) return layerResult;
    return commitFeature(
      {
        id: generateId(),
        type: 'TEXT',
        geometry: {
          type: 'TEXT',
          point: { x: args.at.x, y: args.at.y },
          textContent: args.text,
          textRotation: ((Number(args.rotationDeg) || 0) * Math.PI) / 180,
        },
        layerId: layerResult.result,
        style: defaultStyle(),
        // The renderer and the PDF writer read the font off `properties` (C20), so that is where
        // it goes — not onto a style field they would ignore.
        properties: { fontSize: size, ...(args.properties ?? {}) },
      },
      args.provenance,
    );
  },
};

// ────────────────────────────────────────────────────────────
// C35 — the MODIFY family
//
// Until now every AI tool CREATED something. The AI could draw
// a fence and could not move it. "Do this to these" — the whole
// point of C32/C33's scope — had nothing on the other side of
// the sentence: the scope named features and the vocabulary
// could only add more.
//
// Two decisions run through all of these.
//
// **They take ids.** The store's existing operations act on the
// live selection, which is the wrong coupling for a tool: the
// AI would be acting on whatever the surveyor happened to have
// highlighted at execution time rather than on the scope the
// request named — the exact drift C32 spent a slice removing,
// reintroduced one layer down.
//
// **One undo entry per call.** An AI request that moves forty
// features must reverse in one press (C37). A per-feature entry
// would leave the surveyor pressing undo forty times and
// wondering when to stop.
// ────────────────────────────────────────────────────────────

/** Load the named features, refusing the whole call if any is missing or on a locked layer.
 *
 *  All-or-nothing on purpose: a partial modify is the worst outcome available here. Moving 38 of 40
 *  features leaves the drawing in a state nobody asked for, and the two that stayed behind are
 *  invisible against a background of 38 that moved. */
function loadModifiable(ids: unknown): ToolResult<Feature[]> {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, reason: 'ids must be a non-empty array of feature ids.' };
  }
  const store = useDrawingStore.getState();
  const out: Feature[] = [];
  for (const id of ids) {
    if (typeof id !== 'string') return { ok: false, reason: 'Every id must be a string.' };
    const f = store.document.features[id];
    if (!f) return { ok: false, reason: `Feature '${id}' does not exist.` };
    const layer = store.document.layers[f.layerId];
    if (layer?.locked) {
      return { ok: false, reason: `Feature '${id}' is on locked layer '${layer.name}'.` };
    }
    out.push(f);
  }
  return { ok: true, result: out };
}

/** Centroid of a feature set's transformable points — the default pivot for rotate and scale. */
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

/** Apply a point transform to every named feature, as ONE undo entry. */
function commitTransform(
  features: Feature[],
  fn: (p: Point2D) => Point2D,
  description: string,
  aiBatchId?: string,
): ToolResult<{ changed: number }> {
  const store = useDrawingStore.getState();
  const ops: Array<{ type: 'MODIFY_FEATURE'; data: { id: string; before: Feature; after: Feature } }> = [];
  for (const before of features) {
    const after = transformFeature(before, fn);
    store.updateFeature(before.id, { geometry: after.geometry });
    ops.push({ type: 'MODIFY_FEATURE', data: { id: before.id, before, after } });
  }
  // C37 — the batch id rides on the ENTRY, not on the features. Stamping AI provenance onto
  // geometry the surveyor drew would claim authorship the AI does not have: it moved the fence, it
  // did not draw it.
  const entry = makeBatchEntry(description, ops);
  useUndoStore.getState().pushUndo(aiBatchId ? { ...entry, aiBatchId } : entry);
  return { ok: true, result: { changed: features.length } };
}

export interface MoveFeaturesArgs {
  ids: string[];
  dx: number;
  dy: number;
  /** C37 — groups this call with the rest of one AI turn so the whole request reverses at once. */
  aiBatchId?: string;
}

export const moveFeatures: ToolDefinition<MoveFeaturesArgs, { changed: number }> = {
  name: 'moveFeatures',
  description:
    'Move the named features by a delta in world units (dx east, dy north). One undoable step.',
  inputSchema: {
    type: 'object',
    required: ['ids', 'dx', 'dy'],
    properties: {
      ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
      dx: { type: 'number', description: 'Easting delta, feet.' },
      dy: { type: 'number', description: 'Northing delta, feet.' },
    },
    additionalProperties: false,
  },
  execute(args) {
    const loaded = loadModifiable(args.ids);
    if (!loaded.ok) return loaded;
    if (!Number.isFinite(args.dx) || !Number.isFinite(args.dy)) {
      return { ok: false, reason: 'dx and dy must be finite numbers.' };
    }
    return commitTransform(
      loaded.result,
      (p) => translate(p, args.dx, args.dy),
      `AI move ${loaded.result.length} feature(s)`,
      args.aiBatchId,
    );
  },
};

export interface RotateFeaturesArgs {
  ids: string[];
  angleDeg: number;
  about?: Point2D;
  /** C37 — groups this call with the rest of one AI turn so the whole request reverses at once. */
  aiBatchId?: string;
}

export const rotateFeatures: ToolDefinition<RotateFeaturesArgs, { changed: number }> = {
  name: 'rotateFeatures',
  description:
    'Rotate the named features by an angle in degrees counter-clockwise, about a given point or ' +
    'about their combined centroid when none is given. One undoable step.',
  inputSchema: {
    type: 'object',
    required: ['ids', 'angleDeg'],
    properties: {
      ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
      angleDeg: { type: 'number', description: 'Degrees counter-clockwise.' },
      about: pointSchema('Pivot. Defaults to the centroid of the features.'),
    },
    additionalProperties: false,
  },
  execute(args) {
    const loaded = loadModifiable(args.ids);
    if (!loaded.ok) return loaded;
    if (!Number.isFinite(args.angleDeg)) {
      return { ok: false, reason: 'angleDeg must be a finite number.' };
    }
    if (args.about) {
      const v = validatePoint(args.about, 'about');
      if (!v.ok) return v;
    }
    const pivot = args.about ?? centroidOf(loaded.result);
    const rad = (args.angleDeg * Math.PI) / 180;
    return commitTransform(
      loaded.result,
      (p) => rotate(p, pivot, rad),
      `AI rotate ${loaded.result.length} feature(s)`,
      args.aiBatchId,
    );
  },
};

export interface ScaleFeaturesArgs {
  ids: string[];
  factor: number;
  about?: Point2D;
  /** C37 — groups this call with the rest of one AI turn so the whole request reverses at once. */
  aiBatchId?: string;
}

export const scaleFeatures: ToolDefinition<ScaleFeaturesArgs, { changed: number }> = {
  name: 'scaleFeatures',
  description:
    'Scale the named features uniformly by a factor, about a given point or their combined ' +
    'centroid. One undoable step.',
  inputSchema: {
    type: 'object',
    required: ['ids', 'factor'],
    properties: {
      ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
      factor: { type: 'number', description: 'Uniform scale factor. Must be greater than 0.' },
      about: pointSchema('Pivot. Defaults to the centroid of the features.'),
    },
    additionalProperties: false,
  },
  execute(args) {
    const loaded = loadModifiable(args.ids);
    if (!loaded.ok) return loaded;
    // Zero collapses the geometry to a point and a negative mirrors it while claiming to scale.
    // Both are recoverable only by undo, and neither is what "scale by" was asked to mean.
    if (!Number.isFinite(args.factor) || args.factor <= 0) {
      return { ok: false, reason: 'factor must be a number greater than 0.' };
    }
    if (args.about) {
      const v = validatePoint(args.about, 'about');
      if (!v.ok) return v;
    }
    const pivot = args.about ?? centroidOf(loaded.result);
    return commitTransform(
      loaded.result,
      (p) => scale(p, pivot, args.factor),
      `AI scale ${loaded.result.length} feature(s)`,
      args.aiBatchId,
    );
  },
};

export interface MirrorFeaturesArgs {
  ids: string[];
  axisStart: Point2D;
  axisEnd: Point2D;
  /** C37 — groups this call with the rest of one AI turn so the whole request reverses at once. */
  aiBatchId?: string;
}

export const mirrorFeatures: ToolDefinition<MirrorFeaturesArgs, { changed: number }> = {
  name: 'mirrorFeatures',
  description:
    'Mirror the named features across the line through two points. One undoable step.',
  inputSchema: {
    type: 'object',
    required: ['ids', 'axisStart', 'axisEnd'],
    properties: {
      ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
      axisStart: pointSchema('One point on the mirror line.'),
      axisEnd: pointSchema('Another point on the mirror line.'),
    },
    additionalProperties: false,
  },
  execute(args) {
    const loaded = loadModifiable(args.ids);
    if (!loaded.ok) return loaded;
    const a = validatePoint(args.axisStart, 'axisStart');
    if (!a.ok) return a;
    const b = validatePoint(args.axisEnd, 'axisEnd');
    if (!b.ok) return b;
    // Two identical points define no line. Mirroring across them divides by zero and scatters the
    // geometry to NaN — placed nowhere, and far harder to notice than a refusal.
    if (Math.hypot(args.axisEnd.x - args.axisStart.x, args.axisEnd.y - args.axisStart.y) < 1e-9) {
      return { ok: false, reason: 'axisStart and axisEnd are the same point — that is not a line.' };
    }
    return commitTransform(
      loaded.result,
      (p) => mirror(p, args.axisStart, args.axisEnd),
      `AI mirror ${loaded.result.length} feature(s)`,
      args.aiBatchId,
    );
  },
};

export interface DeleteFeaturesArgs {
  ids: string[];
  /** C37 — groups this call with the rest of one AI turn so the whole request reverses at once. */
  aiBatchId?: string;
}

export const deleteFeatures: ToolDefinition<DeleteFeaturesArgs, { deleted: number }> = {
  name: 'deleteFeatures',
  description:
    'Delete the named features. One undoable step. Prefer hiding when the surveyor may want them ' +
    'back.',
  inputSchema: {
    type: 'object',
    required: ['ids'],
    properties: { ids: { type: 'array', items: { type: 'string' }, minItems: 1 } },
    additionalProperties: false,
  },
  execute(args) {
    const loaded = loadModifiable(args.ids);
    if (!loaded.ok) return loaded;
    const store = useDrawingStore.getState();
    for (const f of loaded.result) store.removeFeature(f.id);
    const entry = makeBatchEntry(
      `AI delete ${loaded.result.length} feature(s)`,
      loaded.result.map((f) => ({ type: 'REMOVE_FEATURE' as const, data: f })),
    );
    // C37 — a delete leaves nothing behind to carry provenance. The removed features keep whatever
    // stamps they had, which say who drew them, not who deleted them; the batch id has to live on
    // the entry or the "undo that whole AI turn" walk has no way to see this step at all.
    useUndoStore
      .getState()
      .pushUndo(args.aiBatchId ? { ...entry, aiBatchId: args.aiBatchId } : entry);
    return { ok: true, result: { deleted: loaded.result.length } };
  },
};

// ────────────────────────────────────────────────────────────
// C36 — measurement, and the LIST command
//
// "AI fully integrated with all tools and measurements" was the
// ask. The registry could already inverse between two points,
// and that was the whole of it: the AI could not answer "how
// big is this parcel" or "how long is that fence" about
// geometry already on the drawing. It could only compute from
// numbers it was handed.
//
// These are READ-ONLY, which is a category the registry has not
// had. Nothing here writes, pushes undo, or needs a sandbox —
// and that is worth stating rather than leaving implied,
// because a measurement tool that quietly modified something
// would be the least expected failure in the whole registry.
// ────────────────────────────────────────────────────────────

export interface MeasureFeatureArgs {
  id: string;
}

export interface FeatureMeasurement {
  id: string;
  type: string;
  layer: string;
  /** Enclosed area, when the geometry is closed. Null for an open one — NOT zero, because zero is
   *  a legitimate measurement and "this has no area" is a different statement. */
  areaSquareFeet: number | null;
  areaAcres: number | null;
  /** Total length: a line's length, a polyline's run, a polygon's perimeter. */
  lengthFeet: number;
  vertexCount: number;
}

/** Total length of a feature's linework — the run of an open shape, the perimeter of a closed one. */
function featureLength(f: Feature): number {
  const g = f.geometry;
  if (g.type === 'LINE' && g.start && g.end) {
    return Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y);
  }
  if (g.circle) return 2 * Math.PI * g.circle.radius;
  if (g.arc) {
    const TAU = Math.PI * 2;
    const norm = (a: number) => ((a % TAU) + TAU) % TAU;
    const swept = g.arc.anticlockwise
      ? norm(g.arc.endAngle - g.arc.startAngle)
      : norm(g.arc.startAngle - g.arc.endAngle);
    return swept * g.arc.radius;
  }
  const verts = g.vertices ?? [];
  if (verts.length < 2) return 0;
  let total = 0;
  // A POLYGON's last edge closes the ring; a POLYLINE's does not. Measuring both the same way is
  // the difference between a perimeter and a perimeter minus one side, which on a five-sided tract
  // is a number that still looks plausible.
  const segs = g.type === 'POLYGON' ? verts.length : verts.length - 1;
  for (let i = 0; i < segs; i += 1) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

export const measureFeature: ToolDefinition<MeasureFeatureArgs, FeatureMeasurement> = {
  name: 'measureFeature',
  description:
    'Measure one feature already on the drawing: enclosed area in square feet and acres when it ' +
    'is closed, total length or perimeter, and vertex count. Read-only.',
  inputSchema: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', description: 'The feature to measure.' } },
    additionalProperties: false,
  },
  execute(args) {
    const store = useDrawingStore.getState();
    const f = typeof args.id === 'string' ? store.document.features[args.id] : undefined;
    if (!f) return { ok: false, reason: `Feature '${args.id}' does not exist.` };
    const area = computeFeatureArea(f);
    const closed = area.geometryKind !== 'NONE' && area.squareFeet > 0;
    return {
      ok: true,
      result: {
        id: f.id,
        type: f.type,
        layer: store.document.layers[f.layerId]?.name ?? f.layerId,
        areaSquareFeet: closed ? area.squareFeet : null,
        areaAcres: closed ? area.acres : null,
        lengthFeet: featureLength(f),
        vertexCount: f.geometry.vertices?.length ?? (f.geometry.start ? 2 : f.geometry.point ? 1 : 0),
      },
    };
  },
};

export interface MeasureTotalAreaArgs {
  ids: string[];
}

export const measureTotalArea: ToolDefinition<
  MeasureTotalAreaArgs,
  { squareFeet: number; acres: number; counted: number; skipped: string[] }
> = {
  name: 'measureTotalArea',
  description:
    'Total enclosed area of several closed features, in square feet and acres. Open features are ' +
    'reported as skipped rather than counted as zero. Read-only.',
  inputSchema: {
    type: 'object',
    required: ['ids'],
    properties: { ids: { type: 'array', items: { type: 'string' }, minItems: 1 } },
    additionalProperties: false,
  },
  execute(args) {
    if (!Array.isArray(args.ids) || args.ids.length === 0) {
      return { ok: false, reason: 'ids must be a non-empty array of feature ids.' };
    }
    const store = useDrawingStore.getState();
    let squareFeet = 0;
    let counted = 0;
    const skipped: string[] = [];
    for (const id of args.ids) {
      const f = typeof id === 'string' ? store.document.features[id] : undefined;
      if (!f) return { ok: false, reason: `Feature '${String(id)}' does not exist.` };
      const area = computeFeatureArea(f);
      // Skipped, not counted as zero. A total that silently absorbs three open polylines is a
      // number the surveyor cannot reconcile against the drawing, and it is off in the safe-looking
      // direction — smaller, and still plausible.
      if (area.geometryKind === 'NONE' || area.squareFeet <= 0) { skipped.push(f.id); continue; }
      squareFeet += area.squareFeet;
      counted += 1;
    }
    return {
      ok: true,
      result: { squareFeet, acres: squareFeet / 43560, counted, skipped },
    };
  },
};

export interface DescribeFeatureArgs {
  id: string;
}

export const describeFeature: ToolDefinition<DescribeFeatureArgs, Record<string, unknown>> = {
  name: 'describeFeature',
  description:
    'Everything known about one feature: type, layer, style, survey attributes, measurements, and ' +
    'how it was derived if it was calculated. The AI equivalent of the LIST command. Read-only.',
  inputSchema: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string' } },
    additionalProperties: false,
  },
  execute(args) {
    const store = useDrawingStore.getState();
    const f = typeof args.id === 'string' ? store.document.features[args.id] : undefined;
    if (!f) return { ok: false, reason: `Feature '${args.id}' does not exist.` };
    const measured = measureFeature.execute({ id: f.id });
    return {
      ok: true,
      result: {
        id: f.id,
        type: f.type,
        geometryType: f.geometry.type,
        layer: store.document.layers[f.layerId]?.name ?? f.layerId,
        hidden: f.hidden === true,
        pointNumber: pointNumberOf(f),
        code: pointCodeOf(f),
        description: pointDescriptionOf(f),
        measurement: measured.ok ? measured.result : null,
        // C30's derivation, surfaced to the AI. A calculated point that cannot say what it was
        // derived from is indistinguishable from one somebody typed — and that distinction is
        // exactly what a surveyor asks the AI about when checking a plat.
        derivation: readDerivation(f.properties),
        properties: f.properties,
      },
    };
  },
};

export const toolRegistry = {
  addPoint,
  drawLineBetween,
  drawPolylineThrough,
  // C34 — the rest of the DRAW_* family. Parametric where the geometry is parametric.
  drawRectangle,
  drawCircle,
  drawArc,
  drawText,
  createLayer,
  applyLayerStyle,
  // C35 — the MODIFY family. Id-based, one undo entry each.
  moveFeatures,
  rotateFeatures,
  scaleFeatures,
  mirrorFeatures,
  deleteFeatures,
  // C36 — read-only measurement over geometry already on the drawing, plus the LIST equivalent.
  measureFeature,
  measureTotalArea,
  describeFeature,
  // Geometry-solver tools (slice B):
  calcFourthCorner: calcFourthCornerTool,
  calcPointFromBearingDistance: calcPointFromBearingDistanceTool,
  calcPointFromTwoBearings: calcPointFromTwoBearingsTool,
  calcPointFromBearingAndLine: calcPointFromBearingAndLineTool,
  calcPointParallelToLine: calcPointParallelToLineTool,
  inverseTwoPoints: inverseTwoPointsTool,
  closureReport: closureReportTool,
  bowditchAdjust: bowditchAdjustTool,
} as const;

export type ToolName = keyof typeof toolRegistry;

/**
 * Names of tools that materialise a feature in the drawing — the
 * original five. These are the only tool names that may appear in
 * an AIProposal: accepting a proposal mutates the document, so
 * solver tools (which only compute coordinates) flow through the
 * dialogue UI directly rather than through the proposal queue.
 *
 * See docs/planning/in-progress/CAD_POINTS_AND_AI.md slice B.
 */
export type ProposalToolName =
  | 'addPoint'
  | 'drawLineBetween'
  | 'drawPolylineThrough'
  | 'createLayer'
  | 'applyLayerStyle';

/** Names of pure-calculation tools (no mutation; for solver UIs). */
export type SolverToolName = Exclude<ToolName, ProposalToolName>;

export const SOLVER_TOOL_NAMES = [
  'calcFourthCorner',
  'calcPointFromBearingDistance',
  'calcPointFromTwoBearings',
  'calcPointFromBearingAndLine',
  'calcPointParallelToLine',
  'inverseTwoPoints',
  'closureReport',
  'bowditchAdjust',
] as const satisfies readonly SolverToolName[];

export function isSolverTool(name: string): name is SolverToolName {
  return (SOLVER_TOOL_NAMES as readonly string[]).includes(name);
}

// ────────────────────────────────────────────────────────────
// Inline JSON-schema helpers (kept local; not exported)
// ────────────────────────────────────────────────────────────

function pointSchema(description: string): object {
  return {
    type: 'object',
    description,
    required: ['x', 'y'],
    properties: {
      x: { type: 'number' },
      y: { type: 'number' },
    },
    additionalProperties: false,
  };
}

function validatePoint(p: unknown, name: string): ToolResult<Point2D> {
  if (!p || typeof p !== 'object') {
    return { ok: false, reason: `${name} must be a {x, y} object.` };
  }
  const { x, y } = p as { x?: unknown; y?: unknown };
  if (typeof x !== 'number' || !Number.isFinite(x)) {
    return { ok: false, reason: `${name}.x must be a finite number.` };
  }
  if (typeof y !== 'number' || !Number.isFinite(y)) {
    return { ok: false, reason: `${name}.y must be a finite number.` };
  }
  return { ok: true, result: { x, y } };
}

function pointsEqual(a: Point2D, b: Point2D): boolean {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
}
