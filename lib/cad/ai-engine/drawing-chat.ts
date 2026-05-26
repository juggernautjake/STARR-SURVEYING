// lib/cad/ai-engine/drawing-chat.ts
//
// Phase 7 §4 — persistent drawing-level chat handler. Sister
// to the §30.4 element-level chat: same pattern, broader
// context. Sends a focused snapshot of the active document to
// Claude and returns the assistant reply plus an optional
// structured `DrawingChatAction` the orchestrator can execute.
//
// Action coverage matches the spec's whole-drawing actions:
//   * NO_ACTION             — answer-only.
//   * REGENERATE_PIPELINE   — re-run the AI pipeline with the
//                              chat instruction folded into
//                              `userPrompt`. Equivalent to the
//                              §28.5 re-run path but anchored
//                              on chat instead of clarifying
//                              questions.
//   * UPDATE_TITLE_BLOCK    — patch one or more title-block
//                              fields (firmName, surveyorName,
//                              clientName, projectName, etc.).
//   * UPDATE_SETTING        — patch one or more drawing-level
//                              settings (drawingScale,
//                              paperSize, paperOrientation,
//                              codeDisplayMode).
//   * REDRAW_LAYER          — re-run the partial pipeline for
//                              one layer's features (queued
//                              today; partial-recompute path
//                              lands later).
//
// Shares `MissingApiKeyError` with the deed parser so callers
// can degrade to "chat offline" without a 500.

import Anthropic from '@anthropic-ai/sdk';

import type { DrawingDocument } from '../types';
import { MissingApiKeyError } from './claude-deed-parser';
import { pointNumberOf, pointCodeOf, pointDescriptionOf } from '../feature-fields';
import { inverseBearingDistance, formatBearing } from '../geometry/bearing';

const DEFAULT_MODEL =
  process.env.CAD_AI_MODEL ?? 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = 1024;
const REQUEST_TIMEOUT_MS = 45_000;
// Keep the most recent turns so a long conversation doesn't grow the
// request without bound. 40 messages ≈ 20 user/assistant exchanges.
const MAX_HISTORY_MESSAGES = 40;

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type DrawingChatActionType =
  | 'NO_ACTION'
  | 'REGENERATE_PIPELINE'
  | 'UPDATE_TITLE_BLOCK'
  | 'UPDATE_SETTING'
  | 'REDRAW_LAYER'
  | 'EDIT_DRAWING';

/** A coordinate the model emits, in survey northing/easting (matching the
 *  selection digest the model is shown). The client converts to world. */
export interface ChatCoord {
  northing: number;
  easting:  number;
}

/** Create (or recolor) a named layer the AI can draw onto. */
export interface ChatLayerSpec {
  name:   string;
  color?: string;   // hex
}

export type ChatShape =
  | 'POINT' | 'LINE' | 'POLYLINE' | 'POLYGON'
  | 'SPLINE' | 'CIRCLE' | 'ELLIPSE' | 'ARC' | 'TEXT';

/** A new feature the model wants to create. */
export interface ChatFeatureSpec {
  shape:        ChatShape;
  /** Coordinates whose meaning depends on shape:
   *  POINT [pt]; LINE [a,b]; POLYLINE/POLYGON/SPLINE [verts…];
   *  ARC [start,mid,end]; CIRCLE [center] (+radius) or [center,edge];
   *  ELLIPSE [center] (+radiusX/Y). */
  points:       ChatCoord[];
  text?:        string;       // TEXT content (placed at points[0])
  closed?:      boolean;      // SPLINE / POLYLINE → close the loop smoothly
  radius?:      number;       // CIRCLE (feet)
  radiusX?:     number;       // ELLIPSE (feet)
  radiusY?:     number;       // ELLIPSE (feet)
  rotationDeg?: number;       // ELLIPSE orientation (CCW)
  layerName?:   string;
  color?:       string;       // hex stroke color
  fill?:        string;       // hex area fill (closed shapes)
  opacity?:     number;       // 0–1
  lineWeight?:  number;       // mm
  lineType?:    string;       // line-type id (e.g. DASHED, FENCE_BARBED_WIRE)
  symbol?:      string;       // symbol id to render at a POINT (e.g. UTIL_POLE)
  pointNumber?: string;       // POINT only
  elevation?:   number;       // POINT Z (feet)
  code?:        string;
  description?: string;
}

/** Edit an existing feature: replace its vertices and/or restyle it. */
export interface ChatModifySpec {
  id:          string;
  points?:     ChatCoord[];   // new geometry vertices (optional)
  color?:      string;
  fill?:       string;
  opacity?:    number;
  lineWeight?: number;
  lineType?:   string;
  symbol?:     string;
  layerName?:  string;        // move the feature to this layer (auto-created)
  // Survey attribute edits (POINT):
  pointNumber?: string;
  code?:        string;
  description?: string;
  elevation?:   number;
}

/** Fit an exact best-fit shape to a point set (computed client-side for
 *  precision). Source points come from `fromIds` features and/or explicit
 *  `points`. */
export interface ChatFitSpec {
  shape:        'RECTANGLE' | 'CIRCLE' | 'LINE' | 'CURVE';
  fromIds?:     string[];
  points?:      ChatCoord[];
  closed?:      boolean;      // CURVE → smooth closed loop
  layerName?:   string;
  color?:       string;
  opacity?:     number;
  lineWeight?:  number;
  deleteSource?: boolean;     // remove fromIds after fitting
}

/** Translate / rotate / scale a set of features (or the live selection). */
export interface ChatTransformSpec {
  ids:        string[] | 'SELECTION';
  translate?: { north: number; east: number };  // feet
  rotateDeg?: number;                            // CCW degrees
  scale?:     number;                            // uniform factor
  about?:     'CENTROID' | ChatCoord;            // pivot, default CENTROID
}

export interface DrawingChatAction {
  type:        DrawingChatActionType;
  description: string;
  /** UPDATE_TITLE_BLOCK / UPDATE_SETTING — flat key/value
   *  patches the orchestrator applies via
   *  `useDrawingStore.updateSettings`. Stringified — coerced
   *  to numbers / booleans on apply. */
  patch?:      Record<string, string>;
  /** REDRAW_LAYER — name of the layer to recompute. */
  layerName?:  string;
  /** REGENERATE_PIPELINE — instruction folded into
   *  `userPrompt` for the next pipeline run. Falls back to
   *  the assistant's reply text when omitted. */
  instruction?: string;
  /** EDIT_DRAWING — programmatic geometry edits the client applies
   *  directly (as one undoable batch). Any combination may be set. */
  add?:         ChatFeatureSpec[];
  deleteIds?:   string[];
  modify?:      ChatModifySpec[];
  transform?:   ChatTransformSpec;
  fit?:         ChatFitSpec[];
  createLayers?: ChatLayerSpec[];
  hideIds?:     string[];
  unhideIds?:   string[];
}

export interface DrawingChatAttachment {
  name:      string;
  mediaType: string;
  /** base64 data URL, e.g. `data:image/png;base64,...`. */
  dataUrl:   string;
}

export interface DrawingChatMessage {
  id:          string;
  role:        'USER' | 'AI';
  content:     string;
  timestamp:   string;
  action?:     DrawingChatAction;
  /** Images/files the surveyor attached to this turn for the model to analyze. */
  attachments?: DrawingChatAttachment[];
}

export interface DrawingChatRequest {
  doc:     DrawingDocument;
  history: DrawingChatMessage[];
  /** IDs of the features the user currently has selected on the canvas,
   *  so questions like "what are these points?" resolve to the actual
   *  selection. */
  selectedIds?: string[];
  /** Name of the active (default) layer new geometry lands on when no
   *  layerName is given. */
  activeLayerName?: string;
  signal?: AbortSignal;
}

export interface DrawingChatResponse {
  reply:     string;
  action:    DrawingChatAction | null;
  raw:       string;
  model:     string;
  latencyMs: number;
}

// ────────────────────────────────────────────────────────────
// System prompt
// ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert Texas land surveyor AI assistant. The user is reviewing a survey drawing and asking a question or requesting a change at the whole-drawing level.

You receive:
* A snapshot of the active drawing — feature counts by type,
  layer table, title-block values, scale + paper size, sealing
  status, the point codes in use, and a "linework" catalog of
  non-point features (id, type, layer, center, length/area) so you
  can target shapes by id even when they aren't selected.
* The CURRENT SELECTION — the exact features the user has
  highlighted on the canvas (with point numbers, codes,
  descriptions, and northing/easting). When the user says
  "these", "the selected points", "this point", or asks to
  edit/measure/describe what they've picked, answer about the
  features in CURRENT SELECTION. If they ask about the selection
  but it is empty, say so and ask them to select something.

Respond with EXACTLY ONE JSON object on a single line, no prose, no markdown fence:

{
  "reply": "<full sentences, plain text>",
  "action": null | {
    "type": "NO_ACTION" | "EDIT_DRAWING" | "REGENERATE_PIPELINE" | "UPDATE_TITLE_BLOCK" | "UPDATE_SETTING" | "REDRAW_LAYER",
    "description": "<one-line summary>",
    "patch": { "<field>": "<newValue>", ... },
    "layerName": "<layer name>",
    "instruction": "<re-run prompt>",
    "add": [ { "shape": "POINT|LINE|POLYLINE|POLYGON|SPLINE|CIRCLE|ELLIPSE|ARC|TEXT", "points": [ { "northing": <n>, "easting": <e> }, ... ], "text": "<TEXT content, placed at points[0]>", "closed": <bool, SPLINE/POLYLINE>, "radius": <ft, CIRCLE>, "radiusX": <ft, ELLIPSE>, "radiusY": <ft, ELLIPSE>, "rotationDeg": <ELLIPSE>, "color": "<#hex>", "fill": "<#hex area fill, closed shapes>", "opacity": <0-1>, "lineWeight": <mm>, "lineType": "<DASHED|DOTTED|CENTER|FENCE_BARBED_WIRE|…>", "layerName": "<optional>", "pointNumber": "<POINT only>", "elevation": "<POINT Z, ft>", "code": "<optional>", "description": "<optional>" } ],
    "deleteIds": [ "<featureId>", ... ],
    "modify": [ { "id": "<featureId>", "points": [ { "northing": <n>, "easting": <e> }, ... ], "color": "<#hex>", "fill": "<#hex>", "opacity": <0-1>, "lineWeight": <mm>, "lineType": "<id>", "symbol": "<id>", "layerName": "<move to layer>", "pointNumber": "<renumber>", "code": "<recode>", "description": "<redesc>", "elevation": <ft> } ],
    "transform": { "ids": "SELECTION" | ["<featureId>", ...], "translate": { "north": <ft>, "east": <ft> }, "rotateDeg": <deg CCW>, "scale": <factor>, "about": "CENTROID" | { "northing": <n>, "easting": <e> } },
    "fit": [ { "shape": "RECTANGLE|CIRCLE|LINE|CURVE", "fromIds": ["<featureId>", ...], "points": [ { "northing": <n>, "easting": <e> }, ... ], "closed": <bool, CURVE>, "color": "<#hex>", "opacity": <0-1>, "lineWeight": <mm>, "layerName": "<optional>", "deleteSource": <bool> } ],
    "createLayers": [ { "name": "<layer>", "color": "<#hex optional>" } ],
    "hideIds": [ "<featureId>", ... ], "unhideIds": [ "<featureId>", ... ]
  }
}

Action selection rules:
* NO_ACTION — pure Q&A, no drawing change required.
* EDIT_DRAWING — DIRECTLY build or change geometry. Use this to create
  points/lines/polylines/polygons, delete features, replace a feature's
  vertices, or translate/rotate/scale features. ALL coordinates you emit
  are survey northing/easting in feet — the SAME values shown in the
  snapshot and CURRENT SELECTION (do not invent a different frame). You
  may combine "add", "deleteIds", "modify", and "transform" in one action;
  the client applies them as a single undoable step.
  - To turn the selected points into best-fit squares: read the selected
    points' northing/easting from CURRENT SELECTION, compute each square's
    center, side length, and rotation, emit the 4 corner coordinates per
    square as an "add" POLYGON, and (if the points should be replaced) list
    their ids in "deleteIds". Keep position, size, and orientation faithful
    to the shot points.
  - A POLYGON is auto-closed; list its corners once (do not repeat the
    first point). Use the selected features' layer unless told otherwise.
  - SPLINE fits a smooth best-fit curve through its points; set
    "closed": true to smoothly reconnect the last point to the first
    (e.g. a pond/lake outline or a round figure). CIRCLE takes a center
    point + "radius"; ELLIPSE a center + "radiusX"/"radiusY" (+rotationDeg);
    ARC takes [start, mid, end] points.
  - You know every selected feature's coordinates from CURRENT SELECTION;
    derive midpoints, endpoints, centers, spacing, and angles from those
    numbers to place and orient new geometry. Build composite objects
    (houses, fences, roads, boundaries, or arbitrary stylized art) by
    emitting many shapes in one "add" array, using "color"/"opacity"/
    "lineWeight" for styling and "transform" to rotate/scale/move groups.
  - "fit" computes an EXACT best-fit shape from a point set on the client
    (precise, not eyeballed): RECTANGLE = minimum-area bounding rectangle
    (recovers true orientation of a rotated square), CIRCLE = least-squares
    circle, LINE = total-least-squares line, CURVE = smooth best-fit spline
    through the points in order ("closed": true for a pond/lake loop).
    PREFER "fit" with the selected point ids in "fromIds" for "make a best-fit
    square/rectangle/circle/line/curve from these points"; set
    "deleteSource": true to replace the shots.
  - "fill" gives a closed shape (polygon/circle/ellipse/closed spline) a
    solid area color — use it for filled/stylized art and shaded regions;
    combine with "opacity" for translucency and layers for z-order.
  - "symbol" renders a glyph at a POINT (e.g. UTIL_POLE, GENERIC_DOT,
    VEG_TREE_DECID, monument symbols MON_*). Use for poles/trees/monuments.
  - TEXT places a label at points[0] (use "rotationDeg" to angle it). To label
    a bearing/distance/area, COMPUTE the value from CURRENT SELECTION coords
    (azimuth = atan2(Δeast, Δnorth); distance = hypot; area = shoelace) and
    place the formatted string as a TEXT at the segment midpoint / centroid.
  - "lineType" sets a line style on a created/modified feature. Common ids:
    SOLID, DASHED, DOTTED, DASH_DOT, CENTER, PHANTOM, LONG_DASH;
    fences FENCE_BARBED_WIRE / FENCE_CHAIN_LINK / FENCE_WOOD_PRIVACY;
    UTIL_POLE_LINE; pattern DASH_X / DASH_CIRCLE. Use a fence line type for
    fence lines, dashed for easements/setbacks, etc.
  - Layers: set "layerName" on add/fit to place geometry on a layer; if the
    layer doesn't exist it is created automatically. Use "createLayers" to
    pre-create named/colored layers (e.g. STRUCTURES, FENCE, ROW, BOUNDARY).
  - hideIds / unhideIds hide or show features non-destructively (declutter
    or isolate) — prefer over deleteIds when the surveyor may want them back.
  - Prefer EDIT_DRAWING over REGENERATE_PIPELINE for surgical edits to
    specific selected features.
* REGENERATE_PIPELINE — re-run the full AI pipeline with the
  user's instruction folded into the user prompt. Populate
  "instruction" with a concise paraphrase of the change.
* UPDATE_TITLE_BLOCK — change one or more title-block fields.
  Allowed fields: firmName, surveyorName, surveyorLicense,
  projectName, projectNumber, clientName, surveyDate, notes,
  scaleLabel, sheetNumber, totalSheets, surveyType. Populate
  "patch" with the new values (stringified).
* UPDATE_SETTING — change one or more drawing-level settings.
  Allowed fields: drawingScale, paperSize, paperOrientation,
  codeDisplayMode, drawingRotationDeg. Populate "patch"
  similarly.
* REDRAW_LAYER — recompute the geometry for one layer's
  features. Populate "layerName" with the canonical layer
  name shown in the snapshot.

Output rules:
* JSON only. No prose outside the object.
* "reply" is always present.
* Omit fields that don't apply (don't ship empty strings).
* If the request is unclear or the data isn't enough to act,
  use NO_ACTION and ask a clarifying question in "reply".`;

// Condensed digest of docs/ai-reference/* injected into every prompt so the
// model computes the way the app does instead of hallucinating procedures.
// Keep terse; the full references live in docs/ai-reference/.
const REFERENCE_DIGEST = `REFERENCE (authoritative — follow exactly):
* Coordinates: emit survey northing/easting in feet (same frame as the
  snapshot/selection). World is x=easting, y=northing; the client converts.
* Angles in actions: degrees CCW. Azimuth is clockwise from north =
  atan2(Δeasting, Δnorthing) normalized 0–360.
* Distance = hypot(Δe, Δn). Polygon area = ½|Σ(xi·y(i+1) − x(i+1)·yi)|.
* Curve (R, Δ rad): L=R·Δ, C=2R·sin(Δ/2), T=R·tan(Δ/2).
* Best-fit: square/rectangle from corner shots → use fit RECTANGLE
  (min-area bounding rect; keeps rotation). Circle → fit CIRCLE. Line →
  fit LINE. Smooth loop (pond) → SPLINE closed:true.
* To turn selected points into a shape, prefer "fit" with their ids in
  fromIds (+deleteSource:true to replace the shots). fit shapes:
  RECTANGLE/CIRCLE/LINE/CURVE.
* Styling on add/modify: color (stroke), fill (area, closed shapes),
  opacity, lineWeight (mm), lineType (DASHED/FENCE_*/…), symbol (glyph at a
  POINT: UTIL_POLE/VEG_TREE_DECID/MON_*). Layers: layerName auto-creates;
  createLayers pre-makes named/colored layers (STRUCTURES/FENCE/ROW/…).
* You also get a "linework" catalog in the snapshot — target unselected
  shapes by their id. The snapshot's "activeLayer" is the default layer
  (omit layerName to use it) and "extents" is the NE bounding box of the
  drawing — size/place new geometry relative to it. CURRENT SELECTION items
  carry each feature's color/fill/lineType/opacity so you can match them.
* Never move existing shots unless asked; keep new geometry on a sensible
  layer and reuse the existing point-code scheme.`;

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

export async function handleDrawingChat(
  req: DrawingChatRequest,
  options: { model?: string } = {}
): Promise<DrawingChatResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();

  const client = new Anthropic({ apiKey });
  const startTime = Date.now();
  const model = options.model ?? DEFAULT_MODEL;

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(
    () => timeoutController.abort(),
    REQUEST_TIMEOUT_MS
  );
  if (req.signal) {
    req.signal.addEventListener('abort', () => timeoutController.abort());
  }

  // The live drawing snapshot rides in the system prompt so it reflects the
  // current document on every turn without bloating the conversation history.
  const snapshot = buildSnapshot(req.doc, req.activeLayerName);
  const selection = buildSelectionDigest(req.doc, req.selectedIds ?? []);
  const system = [
    SYSTEM_PROMPT,
    '',
    REFERENCE_DIGEST,
    '',
    'CURRENT DRAWING SNAPSHOT (always reflects the live document; earlier',
    'turns in the conversation may describe an older state):',
    '```json',
    JSON.stringify(snapshot, null, 2),
    '```',
    '',
    'CURRENT SELECTION (the features the user has selected on the canvas',
    'right now — when they say "these", "the selected points", "this", etc.,',
    'they mean exactly these; if empty, nothing is selected):',
    '```json',
    JSON.stringify(selection, null, 2),
    '```',
  ].join('\n');

  // Send the conversation as a real multi-turn message array (windowed to
  // the most recent turns) so the model retains earlier context instead of
  // receiving everything flattened into one prompt.
  const messages = buildMessages(req.history);

  try {
    const response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system,
      messages,
    });
    clearTimeout(timeoutId);
    const block = response.content[0];
    if (!block || block.type !== 'text') {
      throw new Error('Claude returned a non-text content block.');
    }
    const raw = block.text.trim();
    const parsed = safeParseJson(raw);
    if (!parsed || typeof parsed.reply !== 'string') {
      // Fall back: return the raw text as the reply with no
      // structured action so the surveyor still sees Claude's
      // answer instead of a hard error.
      return {
        reply: raw,
        action: null,
        raw,
        model,
        latencyMs: Date.now() - startTime,
      };
    }
    const action = parseAction(parsed.action);
    return {
      reply: parsed.reply,
      action,
      raw,
      model,
      latencyMs: Date.now() - startTime,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/**
 * Build the Anthropic message array from the chat transcript: window to the
 * most recent turns, map roles, and drop any leading assistant turn so the
 * array starts with a user message (the API requires user-first, alternating
 * roles). The transcript already alternates user/AI, so no merging is needed.
 */
function buildMessages(
  history: DrawingChatMessage[]
): Anthropic.MessageParam[] {
  let windowed = history.slice(-MAX_HISTORY_MESSAGES);
  while (windowed.length > 0 && windowed[0].role === 'AI') {
    windowed = windowed.slice(1);
  }
  const messages: Anthropic.MessageParam[] = windowed
    .filter((m) => m.content.trim().length > 0 || (m.attachments?.length ?? 0) > 0)
    .map((m) => {
      const role = m.role === 'USER' ? ('user' as const) : ('assistant' as const);
      // Attach image blocks (vision) for user turns that carry images.
      const images = (m.attachments ?? []).filter((a) => a.mediaType.startsWith('image/'));
      if (role === 'user' && images.length > 0) {
        const blocks: Anthropic.ContentBlockParam[] = images
          .map((a) => parseDataUrl(a.dataUrl))
          .filter((p): p is { mediaType: string; data: string } => p !== null)
          .map((p) => ({
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: p.mediaType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
              data: p.data,
            },
          }));
        blocks.push({ type: 'text', text: m.content || '(see attached image)' });
        return { role, content: blocks };
      }
      return { role, content: m.content };
    });
  // Defensive fallback: never send an empty conversation.
  if (messages.length === 0) {
    return [{ role: 'user', content: '(no message)' }];
  }
  return messages;
}

/** Split a `data:<media>;base64,<data>` URL into its parts, or null. */
function parseDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  return { mediaType: m[1], data: m[2] };
}

const ACTION_TYPES: ReadonlyArray<DrawingChatActionType> = [
  'NO_ACTION',
  'REGENERATE_PIPELINE',
  'UPDATE_TITLE_BLOCK',
  'UPDATE_SETTING',
  'REDRAW_LAYER',
  'EDIT_DRAWING',
];

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function parseCoords(raw: unknown): ChatCoord[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatCoord[] = [];
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue;
    const o = c as Record<string, unknown>;
    const n = num(o.northing);
    const e = num(o.easting);
    if (n === null || e === null) continue;
    out.push({ northing: n, easting: e });
  }
  return out;
}

type EditFields = Pick<DrawingChatAction, 'add' | 'deleteIds' | 'modify' | 'transform' | 'fit' | 'createLayers' | 'hideIds' | 'unhideIds'>;
function parseEditFields(a: Record<string, unknown>): EditFields {
  const out: EditFields = {};
  const strArr = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
  const hideIds = strArr(a.hideIds); if (hideIds.length) out.hideIds = hideIds;
  const unhideIds = strArr(a.unhideIds); if (unhideIds.length) out.unhideIds = unhideIds;

  if (Array.isArray(a.createLayers)) {
    const layers: ChatLayerSpec[] = [];
    for (const l of a.createLayers) {
      if (!l || typeof l !== 'object') continue;
      const o = l as Record<string, unknown>;
      if (typeof o.name !== 'string' || o.name.trim().length === 0) continue;
      layers.push({ name: o.name.trim(), ...(typeof o.color === 'string' ? { color: o.color } : {}) });
    }
    if (layers.length > 0) out.createLayers = layers;
  }

  const SHAPES = ['POINT', 'LINE', 'POLYLINE', 'POLYGON', 'SPLINE', 'CIRCLE', 'ELLIPSE', 'ARC', 'TEXT'];
  if (Array.isArray(a.add)) {
    const add: ChatFeatureSpec[] = [];
    for (const s of a.add) {
      if (!s || typeof s !== 'object') continue;
      const o = s as Record<string, unknown>;
      const shape = o.shape;
      if (typeof shape !== 'string' || !SHAPES.includes(shape)) continue;
      const points = parseCoords(o.points);
      if (points.length === 0) continue;
      const radius = num(o.radius);
      const radiusX = num(o.radiusX);
      const radiusY = num(o.radiusY);
      const rotationDeg = num(o.rotationDeg);
      const opacity = num(o.opacity);
      const lineWeight = num(o.lineWeight);
      const elevation = num(o.elevation);
      add.push({
        shape: shape as ChatShape,
        points,
        ...(o.closed === true ? { closed: true } : {}),
        ...(radius !== null ? { radius } : {}),
        ...(radiusX !== null ? { radiusX } : {}),
        ...(radiusY !== null ? { radiusY } : {}),
        ...(rotationDeg !== null ? { rotationDeg } : {}),
        ...(opacity !== null ? { opacity } : {}),
        ...(lineWeight !== null ? { lineWeight } : {}),
        ...(typeof o.lineType === 'string' ? { lineType: o.lineType } : {}),
        ...(typeof o.symbol === 'string' ? { symbol: o.symbol } : {}),
        ...(typeof o.fill === 'string' ? { fill: o.fill } : {}),
        ...(typeof o.text === 'string' ? { text: o.text } : {}),
        ...(typeof o.layerName === 'string' ? { layerName: o.layerName } : {}),
        ...(typeof o.color === 'string' ? { color: o.color } : {}),
        ...(typeof o.pointNumber === 'string' ? { pointNumber: o.pointNumber } : {}),
        ...(elevation !== null ? { elevation } : {}),
        ...(typeof o.code === 'string' ? { code: o.code } : {}),
        ...(typeof o.description === 'string' ? { description: o.description } : {}),
      });
    }
    if (add.length > 0) out.add = add;
  }

  if (Array.isArray(a.deleteIds)) {
    const ids = a.deleteIds.filter((x): x is string => typeof x === 'string' && x.length > 0);
    if (ids.length > 0) out.deleteIds = ids;
  }

  if (Array.isArray(a.modify)) {
    const modify: ChatModifySpec[] = [];
    for (const m of a.modify) {
      if (!m || typeof m !== 'object') continue;
      const o = m as Record<string, unknown>;
      if (typeof o.id !== 'string') continue;
      const points = parseCoords(o.points);
      const opacity = num(o.opacity);
      const lineWeight = num(o.lineWeight);
      const elevation = num(o.elevation);
      const hasStyle = typeof o.color === 'string' || typeof o.fill === 'string' || opacity !== null || lineWeight !== null || typeof o.lineType === 'string' || typeof o.symbol === 'string';
      const hasLayer = typeof o.layerName === 'string' && o.layerName.length > 0;
      const hasAttr = typeof o.pointNumber === 'string' || typeof o.code === 'string' || typeof o.description === 'string' || elevation !== null;
      if (points.length === 0 && !hasStyle && !hasLayer && !hasAttr) continue;
      modify.push({
        id: o.id,
        ...(points.length > 0 ? { points } : {}),
        ...(typeof o.color === 'string' ? { color: o.color } : {}),
        ...(typeof o.fill === 'string' ? { fill: o.fill } : {}),
        ...(opacity !== null ? { opacity } : {}),
        ...(lineWeight !== null ? { lineWeight } : {}),
        ...(typeof o.lineType === 'string' ? { lineType: o.lineType } : {}),
        ...(typeof o.symbol === 'string' ? { symbol: o.symbol } : {}),
        ...(hasLayer ? { layerName: o.layerName as string } : {}),
        ...(typeof o.pointNumber === 'string' ? { pointNumber: o.pointNumber } : {}),
        ...(typeof o.code === 'string' ? { code: o.code } : {}),
        ...(typeof o.description === 'string' ? { description: o.description } : {}),
        ...(elevation !== null ? { elevation } : {}),
      });
    }
    if (modify.length > 0) out.modify = modify;
  }

  if (a.transform && typeof a.transform === 'object') {
    const o = a.transform as Record<string, unknown>;
    const ids = o.ids === 'SELECTION'
      ? 'SELECTION' as const
      : Array.isArray(o.ids)
        ? o.ids.filter((x): x is string => typeof x === 'string')
        : null;
    if (ids && (ids === 'SELECTION' || ids.length > 0)) {
      const t: ChatTransformSpec = { ids };
      if (o.translate && typeof o.translate === 'object') {
        const tr = o.translate as Record<string, unknown>;
        const n = num(tr.north); const e = num(tr.east);
        if (n !== null || e !== null) t.translate = { north: n ?? 0, east: e ?? 0 };
      }
      const rot = num(o.rotateDeg); if (rot !== null) t.rotateDeg = rot;
      const sc = num(o.scale); if (sc !== null && sc > 0) t.scale = sc;
      if (o.about === 'CENTROID') t.about = 'CENTROID';
      else if (o.about && typeof o.about === 'object') {
        const ab = o.about as Record<string, unknown>;
        const n = num(ab.northing); const e = num(ab.easting);
        if (n !== null && e !== null) t.about = { northing: n, easting: e };
      }
      out.transform = t;
    }
  }

  if (Array.isArray(a.fit)) {
    const fit: ChatFitSpec[] = [];
    for (const s of a.fit) {
      if (!s || typeof s !== 'object') continue;
      const o = s as Record<string, unknown>;
      if (o.shape !== 'RECTANGLE' && o.shape !== 'CIRCLE' && o.shape !== 'LINE' && o.shape !== 'CURVE') continue;
      const fromIds = Array.isArray(o.fromIds) ? o.fromIds.filter((x): x is string => typeof x === 'string') : undefined;
      const points = parseCoords(o.points);
      if ((!fromIds || fromIds.length === 0) && points.length === 0) continue;
      const opacity = num(o.opacity);
      const lineWeight = num(o.lineWeight);
      fit.push({
        shape: o.shape,
        ...(fromIds && fromIds.length > 0 ? { fromIds } : {}),
        ...(points.length > 0 ? { points } : {}),
        ...(o.closed === true ? { closed: true } : {}),
        ...(typeof o.layerName === 'string' ? { layerName: o.layerName } : {}),
        ...(typeof o.color === 'string' ? { color: o.color } : {}),
        ...(opacity !== null ? { opacity } : {}),
        ...(lineWeight !== null ? { lineWeight } : {}),
        ...(o.deleteSource === true ? { deleteSource: true } : {}),
      });
    }
    if (fit.length > 0) out.fit = fit;
  }

  return out;
}

export function parseAction(raw: unknown): DrawingChatAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const type = a.type;
  if (typeof type !== 'string') return null;
  if (!ACTION_TYPES.includes(type as DrawingChatActionType)) return null;
  const description =
    typeof a.description === 'string' ? a.description : '';
  const patch: Record<string, string> = {};
  if (a.patch && typeof a.patch === 'object') {
    for (const [k, v] of Object.entries(
      a.patch as Record<string, unknown>
    )) {
      if (typeof k !== 'string' || k.length === 0) continue;
      if (typeof v === 'string') patch[k] = v;
      else if (typeof v === 'number' || typeof v === 'boolean') {
        patch[k] = String(v);
      }
    }
  }
  return {
    type: type as DrawingChatActionType,
    description,
    ...(Object.keys(patch).length > 0 ? { patch } : {}),
    ...(typeof a.layerName === 'string' && a.layerName.length > 0
      ? { layerName: a.layerName }
      : {}),
    ...(typeof a.instruction === 'string' && a.instruction.length > 0
      ? { instruction: a.instruction }
      : {}),
    ...(type === 'EDIT_DRAWING' ? parseEditFields(a) : {}),
  };
}

function safeParseJson(raw: string): {
  reply?: unknown;
  action?: unknown;
} | null {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  try {
    return JSON.parse(stripped) as { reply?: unknown; action?: unknown };
  } catch {
    return null;
  }
}

interface DocSnapshot {
  id:               string;
  name:             string;
  paperSize:        string;
  paperOrientation: string;
  drawingScale:     number;
  codeDisplayMode:  string;
  sealed:           boolean;
  sealHash:         string | null;
  featureCounts:    Record<string, number>;
  layers:           { name: string; color: string; featureCount: number }[];
  /** Distinct point codes present in the drawing (capped), so the model can
   *  reuse the surveyor's coding scheme when building from coded points. */
  codesInUse:       string[];
  /** Active layer new geometry defaults to (when no layerName is given). */
  activeLayer:      string | null;
  /** NE bounding box of all visible features (null when empty) — lets the AI
   *  place/scale new geometry relative to the existing drawing. */
  extents:          { minNorthing: number; minEasting: number; maxNorthing: number; maxEasting: number } | null;
  /** Compact catalog of non-point linework (capped) so the AI can target
   *  features it didn't select, by id. */
  linework:         { id: string; type: string; layer: string; center: NE; lengthFt?: number; areaSqFt?: number }[];
  titleBlock:       Record<string, string>;
}

export function buildSnapshot(doc: DrawingDocument, activeLayerName?: string): DocSnapshot {
  const settings = doc.settings;
  const tb = settings.titleBlock;
  const layerNameById = new Map<string, string>();
  const layerColorById = new Map<string, string>();
  for (const l of Object.values(doc.layers)) {
    layerNameById.set(l.id, l.name);
    layerColorById.set(l.id, l.color);
  }
  const originN = settings.displayPreferences?.originNorthing ?? 0;
  const originE = settings.displayPreferences?.originEasting ?? 0;
  const featureCounts: Record<string, number> = {};
  const layerFeatureCounts = new Map<string, number>();
  const codes = new Set<string>();
  const linework: DocSnapshot['linework'] = [];
  const MAX_LINEWORK = 60;
  let exMinX = Infinity, exMinY = Infinity, exMaxX = -Infinity, exMaxY = -Infinity;
  for (const f of Object.values(doc.features)) {
    if (f.hidden) continue;
    {
      const g = f.geometry;
      const pp: { x: number; y: number }[] = [];
      if (g.point) pp.push(g.point);
      if (g.start) pp.push(g.start);
      if (g.end) pp.push(g.end);
      if (g.vertices) pp.push(...g.vertices);
      if (g.circle) { pp.push({ x: g.circle.center.x - g.circle.radius, y: g.circle.center.y - g.circle.radius }, { x: g.circle.center.x + g.circle.radius, y: g.circle.center.y + g.circle.radius }); }
      if (g.arc) pp.push(g.arc.center);
      if (g.ellipse) pp.push(g.ellipse.center);
      if (g.spline) pp.push(...g.spline.controlPoints);
      for (const p of pp) { exMinX = Math.min(exMinX, p.x); exMinY = Math.min(exMinY, p.y); exMaxX = Math.max(exMaxX, p.x); exMaxY = Math.max(exMaxY, p.y); }
    }
    featureCounts[f.type] = (featureCounts[f.type] ?? 0) + 1;
    layerFeatureCounts.set(
      f.layerId,
      (layerFeatureCounts.get(f.layerId) ?? 0) + 1
    );
    const code = pointCodeOf(f);
    if (code && codes.size < 60) codes.add(code);

    // Catalog non-point linework so the AI can reference unselected shapes.
    if (f.type !== 'POINT' && f.type !== 'TEXT' && f.type !== 'IMAGE' && linework.length < MAX_LINEWORK) {
      const entry = lineworkEntry(f, originN, originE, layerNameById.get(f.layerId) ?? f.layerId);
      if (entry) linework.push(entry);
    }
  }
  const layers = Array.from(layerNameById.entries())
    .map(([id, name]) => ({
      name,
      color: layerColorById.get(id) ?? '#000000',
      featureCount: layerFeatureCounts.get(id) ?? 0,
    }))
    // Cull the 22 default layers that hold zero features so
    // Claude focuses on what's drawn.
    .filter((l) => l.featureCount > 0 || l.name === '0');
  return {
    id: doc.id,
    name: doc.name,
    paperSize: settings.paperSize,
    paperOrientation: settings.paperOrientation,
    drawingScale: settings.drawingScale,
    codeDisplayMode: settings.codeDisplayMode,
    sealed: !!settings.sealed,
    sealHash: settings.sealData?.signatureHash ?? null,
    featureCounts,
    layers,
    codesInUse: Array.from(codes),
    activeLayer: activeLayerName ?? null,
    extents: Number.isFinite(exMinX)
      ? { minNorthing: round(exMinY + originN), minEasting: round(exMinX + originE), maxNorthing: round(exMaxY + originN), maxEasting: round(exMaxX + originE) }
      : null,
    linework,
    titleBlock: {
      firmName: tb.firmName,
      surveyorName: tb.surveyorName,
      surveyorLicense: tb.surveyorLicense,
      projectName: tb.projectName,
      projectNumber: tb.projectNumber,
      clientName: tb.clientName,
      surveyDate: tb.surveyDate,
      scaleLabel: tb.scaleLabel,
      sheetNumber: tb.sheetNumber,
      totalSheets: tb.totalSheets,
      notes: tb.notes,
      surveyType: tb.surveyType ?? '',
    },
  };
}

/** Compact catalog entry for one non-point feature (for the snapshot). */
function lineworkEntry(
  f: DrawingDocument['features'][string],
  originN: number,
  originE: number,
  layer: string,
): DocSnapshot['linework'][number] | null {
  const g = f.geometry;
  const pts: { x: number; y: number }[] = [];
  if (g.start) pts.push(g.start);
  if (g.end) pts.push(g.end);
  if (g.vertices) pts.push(...g.vertices);
  if (g.circle) pts.push(g.circle.center);
  if (g.ellipse) pts.push(g.ellipse.center);
  if (g.arc) pts.push(g.arc.center);
  if (g.spline) pts.push(...g.spline.controlPoints);
  if (pts.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  const center: NE = { n: round((minY + maxY) / 2 + originN), e: round((minX + maxX) / 2 + originE) };
  const out: DocSnapshot['linework'][number] = { id: f.id, type: f.type, layer, center };
  if (g.type === 'LINE' && g.start && g.end) {
    out.lengthFt = round(Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y));
  } else if ((g.type === 'POLYLINE' || g.type === 'POLYGON') && g.vertices && g.vertices.length >= 2) {
    const vs = g.vertices;
    let len = 0;
    for (let i = 0; i < vs.length - 1; i += 1) len += Math.hypot(vs[i + 1].x - vs[i].x, vs[i + 1].y - vs[i].y);
    if (g.type === 'POLYGON' && vs.length >= 3) {
      len += Math.hypot(vs[0].x - vs[vs.length - 1].x, vs[0].y - vs[vs.length - 1].y);
      let a = 0;
      for (let i = 0; i < vs.length; i += 1) { const p = vs[i], q = vs[(i + 1) % vs.length]; a += p.x * q.y - q.x * p.y; }
      out.areaSqFt = round(Math.abs(a) / 2);
    }
    out.lengthFt = round(len);
  } else if (g.type === 'CIRCLE' && g.circle) {
    out.areaSqFt = round(Math.PI * g.circle.radius * g.circle.radius);
  }
  return out;
}

/** Max selected features to describe individually before summarising. */
const MAX_SELECTION_DETAIL = 150;

interface NE { n: number; e: number; }

export interface SelectionItem {
  id:           string;
  type:         string;
  layer:        string;
  pointNumber?: string;
  code?:        string;
  description?: string;
  /** Style overrides on the feature (only present when set), so the AI can
   *  match/echo existing color/line style/fill. */
  color?:       string;
  fill?:        string;
  lineType?:    string;
  opacity?:     number;
  northing?:    number;
  easting?:     number;
  elevation?:   number;
  /** LINE endpoints + midpoint (derived, so the model can target them). */
  start?:       NE;
  end?:         NE;
  midpoint?:    NE;
  /** LINE bearing in the app's quadrant format (e.g. N45°00'00"E) and
   *  azimuth degrees — so labels match the software exactly. */
  bearing?:     string;
  azimuthDeg?:  number;
  /** CIRCLE/ELLIPSE/ARC center; CIRCLE/ARC radius. */
  center?:      NE;
  radius?:      number;
  /** POLYLINE/POLYGON vertices (capped) + centroid. */
  verts?:       NE[];
  centroid?:    NE;
  vertexCount?: number;
  /** Length of a line/polyline or perimeter of a polygon (feet). */
  lengthFt?:    number;
  /** Enclosed area for closed shapes (square feet). */
  areaSqFt?:    number;
}

export interface SelectionDigest {
  count:    number;
  byType:   Record<string, number>;
  /** Detailed per-feature info, capped at MAX_SELECTION_DETAIL. */
  items:    SelectionItem[];
  /** True when more features are selected than are detailed in `items`. */
  truncated: boolean;
}

export function buildSelectionDigest(
  doc: DrawingDocument,
  selectedIds: string[]
): SelectionDigest {
  const originN = doc.settings.displayPreferences?.originNorthing ?? 0;
  const originE = doc.settings.displayPreferences?.originEasting ?? 0;
  const byType: Record<string, number> = {};
  const items: SelectionItem[] = [];
  let count = 0;

  for (const id of selectedIds) {
    const f = doc.features[id];
    if (!f) continue;
    count += 1;
    byType[f.type] = (byType[f.type] ?? 0) + 1;
    if (items.length >= MAX_SELECTION_DETAIL) continue;

    const layer = doc.layers[f.layerId]?.name ?? f.layerId;
    const g = f.geometry;
    const item: SelectionItem = { id, type: f.type, layer };

    const num = pointNumberOf(f);
    if (num) item.pointNumber = num;
    const code = pointCodeOf(f);
    if (code) item.code = code;
    const desc = pointDescriptionOf(f);
    if (desc) item.description = desc;

    // Style overrides (only when explicitly set on the feature).
    const st = f.style;
    if (st?.color) item.color = st.color;
    if (st?.fillColor) item.fill = st.fillColor;
    if (st?.lineTypeId && st.lineTypeId !== 'SOLID') item.lineType = st.lineTypeId;
    if (typeof st?.opacity === 'number' && st.opacity < 1) item.opacity = round(st.opacity);

    const ne = (p: { x: number; y: number }): NE => ({
      n: round(p.y + originN),
      e: round(p.x + originE),
    });

    const anchor = g.point ?? g.start ?? g.vertices?.[0] ?? g.circle?.center ?? g.arc?.center;
    if (anchor) {
      item.northing = round(anchor.y + originN);
      item.easting = round(anchor.x + originE);
    }
    if (f.properties?.elevation != null) item.elevation = Number(f.properties.elevation);

    // Derived geometry so the model can target endpoints / midpoints /
    // centers / centroids without the user pre-selecting every vertex.
    if (g.type === 'LINE' && g.start && g.end) {
      item.start = ne(g.start);
      item.end = ne(g.end);
      item.midpoint = ne({ x: (g.start.x + g.end.x) / 2, y: (g.start.y + g.end.y) / 2 });
      const inv = inverseBearingDistance(g.start, g.end);
      item.lengthFt = round(inv.distance);
      item.bearing = formatBearing(inv.azimuth);
      item.azimuthDeg = round(inv.azimuth);
    } else if ((g.type === 'POLYLINE' || g.type === 'POLYGON') && g.vertices && g.vertices.length > 0) {
      const vs = g.vertices;
      item.vertexCount = vs.length;
      item.verts = vs.slice(0, 48).map(ne);
      const cx = vs.reduce((s, v) => s + v.x, 0) / vs.length;
      const cy = vs.reduce((s, v) => s + v.y, 0) / vs.length;
      item.centroid = ne({ x: cx, y: cy });
      const closed = g.type === 'POLYGON';
      let len = 0;
      for (let i = 0; i < vs.length - 1; i += 1) len += Math.hypot(vs[i + 1].x - vs[i].x, vs[i + 1].y - vs[i].y);
      if (closed && vs.length >= 3) {
        len += Math.hypot(vs[0].x - vs[vs.length - 1].x, vs[0].y - vs[vs.length - 1].y);
        let a = 0;
        for (let i = 0; i < vs.length; i += 1) {
          const p = vs[i], q = vs[(i + 1) % vs.length];
          a += p.x * q.y - q.x * p.y;
        }
        item.areaSqFt = round(Math.abs(a) / 2);
      }
      item.lengthFt = round(len);
    } else if (g.type === 'CIRCLE' && g.circle) {
      item.center = ne(g.circle.center);
      item.radius = round(g.circle.radius);
      item.areaSqFt = round(Math.PI * g.circle.radius * g.circle.radius);
    } else if (g.type === 'ELLIPSE' && g.ellipse) {
      item.center = ne(g.ellipse.center);
      item.areaSqFt = round(Math.PI * g.ellipse.radiusX * g.ellipse.radiusY);
    } else if (g.type === 'ARC' && g.arc) {
      item.center = ne(g.arc.center);
      item.radius = round(g.arc.radius);
    }

    items.push(item);
  }

  return { count, byType, items, truncated: count > items.length };
}

function round(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}
