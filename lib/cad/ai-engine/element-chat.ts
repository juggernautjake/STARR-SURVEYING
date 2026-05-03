// lib/cad/ai-engine/element-chat.ts
//
// Phase 6 §30.4 — element-level chat handler. Sends a focused
// element-context envelope to Claude, returns the assistant
// reply + an optional structured `ElementChatAction` the
// orchestrator can execute (REDRAW_ELEMENT / REDRAW_GROUP /
// REDRAW_FULL / UPDATE_ATTRIBUTE / NO_ACTION).
//
// This slice ships the request → reply round-trip + action
// parsing. Action *execution* (geometry recompute, full-pipeline
// re-run, attribute apply) lands in a follow-up slice once the
// store-side regenerate paths are wired.
//
// Shares the `MissingApiKeyError` pattern with claude-deed-
// parser so callers can surface "ANTHROPIC_API_KEY not set"
// without a 500.

import Anthropic from '@anthropic-ai/sdk';

import type { Feature } from '../types';
import type {
  ElementChatAction,
  ElementChatMessage,
  ElementExplanation,
} from './types';
import { MissingApiKeyError } from './claude-deed-parser';

const DEFAULT_MODEL =
  process.env.CAD_AI_MODEL ?? 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = 1024;
const REQUEST_TIMEOUT_MS = 45_000;

export interface ElementChatRequest {
  feature: Feature;
  explanation: ElementExplanation;
  /** Whole conversation so far, including the new user message
   *  as the final entry. The handler forwards it verbatim so
   *  Claude can see the running context. */
  history: ElementChatMessage[];
  /** Optional caller-side AbortSignal. */
  signal?: AbortSignal;
}

export interface ElementChatResponse {
  reply: string;
  action: ElementChatAction | null;
  raw: string;
  model: string;
  latencyMs: number;
}

const SYSTEM_PROMPT = `You are an expert Texas land surveyor AI assistant. The user is reviewing a single element on an in-progress survey drawing and is asking a question or requesting a change to that element.

You will receive:
* The full Feature object (geometry + properties)
* The current ElementExplanation (summary, reasoning, data used,
  assumptions, alternatives, confidence breakdown)
* The chat transcript so far (oldest → newest)

Respond with EXACTLY ONE JSON object on a single line, no prose, no markdown fence:

{
  "reply": "<your reply text — full sentences, plain text>",
  "action": null | {
    "type": "REDRAW_ELEMENT" | "REDRAW_GROUP" | "REDRAW_FULL" | "UPDATE_ATTRIBUTE" | "NO_ACTION",
    "description": "<short human-readable change summary>",
    "affectedIds": ["<featureId>", ...]
  }
}

Action selection rules:
* NO_ACTION — answer-only; no drawing change required.
* UPDATE_ATTRIBUTE — change a non-geometric attribute on this
  feature (layer, label, material, condition). affectedIds must
  contain only this feature's id.
* REDRAW_ELEMENT — re-run geometry computation for this single
  feature (no other features change). affectedIds = [this feature id].
* REDRAW_GROUP — re-run for every feature on the same layer or
  category. affectedIds may be omitted; the orchestrator computes
  the group from the layerId.
* REDRAW_FULL — re-run the full 6-stage AI pipeline. affectedIds
  may be omitted.

Output rules:
* JSON only. Do not include any text outside the JSON object.
* "reply" must always be present.
* Use plain double quotes; escape internal quotes.
* If the user's request is unclear, set action=NO_ACTION and
  ask a clarifying question in "reply".`;

/**
 * Send the chat envelope to Claude and parse the structured
 * response. Throws `MissingApiKeyError` when ANTHROPIC_API_KEY
 * is unset so the caller can degrade gracefully.
 */
export async function handleElementChat(
  req: ElementChatRequest,
  options: { model?: string } = {}
): Promise<ElementChatResponse> {
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

  // Pull the latest user message off the history; everything
  // before it becomes prior context for Claude.
  const lastIndex = req.history.length - 1;
  const userMessage =
    lastIndex >= 0 && req.history[lastIndex].role === 'USER'
      ? req.history[lastIndex].content
      : '';
  const priorTurns = req.history
    .slice(0, lastIndex)
    .map((m) => `${m.role === 'USER' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  const elementContext = JSON.stringify(
    {
      feature: req.feature,
      explanation: req.explanation,
    },
    null,
    2
  );

  const userBody = [
    'ELEMENT CONTEXT:',
    '```json',
    elementContext,
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
      // Fallback: treat the entire response as the reply with no
      // structured action so the surveyor still sees Claude's
      // text instead of a hard error.
      return {
        reply: raw,
        action: null,
        raw,
        model,
        latencyMs: Date.now() - startTime,
      };
    }
    const action = parseAction(parsed.action, req.feature.id);
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

const ACTION_TYPES: ReadonlyArray<ElementChatAction['type']> = [
  'REDRAW_ELEMENT',
  'REDRAW_GROUP',
  'REDRAW_FULL',
  'UPDATE_ATTRIBUTE',
  'NO_ACTION',
];

function parseAction(
  raw: unknown,
  defaultFeatureId: string
): ElementChatAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const type = a.type;
  if (typeof type !== 'string') return null;
  if (!ACTION_TYPES.includes(type as ElementChatAction['type'])) {
    return null;
  }
  const description =
    typeof a.description === 'string' ? a.description : '';
  const affectedRaw = Array.isArray(a.affectedIds) ? a.affectedIds : [];
  const affectedIds = affectedRaw
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .slice(0, 100);
  return {
    type: type as ElementChatAction['type'],
    description,
    affectedIds:
      affectedIds.length > 0 ? affectedIds : [defaultFeatureId],
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
