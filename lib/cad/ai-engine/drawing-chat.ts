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
  | 'REDRAW_LAYER';

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
  status, and a digest of any prior chat turns.
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
    "type": "NO_ACTION" | "REGENERATE_PIPELINE" | "UPDATE_TITLE_BLOCK" | "UPDATE_SETTING" | "REDRAW_LAYER",
    "description": "<one-line summary>",
    "patch": { "<field>": "<newValue>", ... },
    "layerName": "<layer name>",
    "instruction": "<re-run prompt>"
  }
}

Action selection rules:
* NO_ACTION — pure Q&A, no drawing change required.
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
  const snapshot = buildSnapshot(req.doc);
  const selection = buildSelectionDigest(req.doc, req.selectedIds ?? []);
  const system = [
    SYSTEM_PROMPT,
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
];

function parseAction(raw: unknown): DrawingChatAction | null {
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
  titleBlock:       Record<string, string>;
}

function buildSnapshot(doc: DrawingDocument): DocSnapshot {
  const settings = doc.settings;
  const tb = settings.titleBlock;
  const layerNameById = new Map<string, string>();
  const layerColorById = new Map<string, string>();
  for (const l of Object.values(doc.layers)) {
    layerNameById.set(l.id, l.name);
    layerColorById.set(l.id, l.color);
  }
  const featureCounts: Record<string, number> = {};
  const layerFeatureCounts = new Map<string, number>();
  for (const f of Object.values(doc.features)) {
    if (f.hidden) continue;
    featureCounts[f.type] = (featureCounts[f.type] ?? 0) + 1;
    layerFeatureCounts.set(
      f.layerId,
      (layerFeatureCounts.get(f.layerId) ?? 0) + 1
    );
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

/** Max selected features to describe individually before summarising. */
const MAX_SELECTION_DETAIL = 150;

export interface SelectionItem {
  id:           string;
  type:         string;
  layer:        string;
  pointNumber?: string;
  code?:        string;
  description?: string;
  northing?:    number;
  easting?:     number;
  elevation?:   number;
  vertices?:    number;
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

    const anchor = g.point ?? g.start ?? g.vertices?.[0] ?? g.circle?.center ?? g.arc?.center;
    if (anchor) {
      item.northing = round(anchor.y + originN);
      item.easting = round(anchor.x + originE);
    }
    if (f.properties?.elevation != null) item.elevation = Number(f.properties.elevation);
    if (g.vertices) item.vertices = g.vertices.length;

    items.push(item);
  }

  return { count, byType, items, truncated: count > items.length };
}

function round(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}
