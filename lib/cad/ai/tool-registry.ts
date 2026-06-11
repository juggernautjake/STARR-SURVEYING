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
} from '../store';
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
export const toolRegistry = {
  addPoint,
  drawLineBetween,
  drawPolylineThrough,
  createLayer,
  applyLayerStyle,
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
