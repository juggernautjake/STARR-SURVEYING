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

/** Resolve the layer id to write to. Falls back to the active
 *  layer; emits a clear reason when neither is usable. */
function resolveLayerId(layerId: string | null | undefined): ToolResult<string> {
  const store = useDrawingStore.getState();
  if (layerId) {
    const layer = store.document.layers[layerId];
    if (!layer) return { ok: false, reason: `Layer '${layerId}' does not exist.` };
    if (layer.locked) return { ok: false, reason: `Layer '${layer.name}' is locked.` };
    return { ok: true, result: layerId };
  }
  const active = store.activeLayerId;
  if (!active) return { ok: false, reason: 'No layer specified and no active layer set.' };
  const layer = store.document.layers[active];
  if (!layer) return { ok: false, reason: `Active layer '${active}' is missing from the document.` };
  if (layer.locked) return { ok: false, reason: `Active layer '${layer.name}' is locked.` };
  return { ok: true, result: active };
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
    const layerResult = resolveLayerId(args.layerId);
    if (!layerResult.ok) return layerResult;
    const feature: Feature = {
      id: generateId(),
      type: 'POINT',
      geometry: { type: 'POINT', point: { x: args.x, y: args.y } },
      layerId: layerResult.result,
      style: defaultStyle(),
      properties: {
        ...(args.code ? { code: args.code } : {}),
        ...(args.properties ?? {}),
      },
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
    const layerResult = resolveLayerId(args.layerId);
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
    const layerResult = resolveLayerId(args.layerId);
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
} as const;

export type ToolName = keyof typeof toolRegistry;

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
