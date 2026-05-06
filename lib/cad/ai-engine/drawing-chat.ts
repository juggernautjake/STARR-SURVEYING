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

const DEFAULT_MODEL =
  process.env.CAD_AI_MODEL ?? 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = 1024;
const REQUEST_TIMEOUT_MS = 45_000;

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

export interface DrawingChatMessage {
  id:        string;
  role:      'USER' | 'AI';
  content:   string;
  timestamp: string;
  action?:   DrawingChatAction;
}

export interface DrawingChatRequest {
  doc:     DrawingDocument;
  history: DrawingChatMessage[];
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

  const lastIndex = req.history.length - 1;
  const userMessage =
    lastIndex >= 0 && req.history[lastIndex].role === 'USER'
      ? req.history[lastIndex].content
      : '';
  const priorTurns = req.history
    .slice(0, lastIndex)
    .map((m) => `${m.role === 'USER' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');
  const snapshot = buildSnapshot(req.doc);

  const userBody = [
    'DRAWING SNAPSHOT:',
    '```json',
    JSON.stringify(snapshot, null, 2),
    '```',
    '',
    priorTurns ? `PRIOR CHAT:\n${priorTurns}\n` : '',
    `USER: ${userMessage}`,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userBody }],
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
