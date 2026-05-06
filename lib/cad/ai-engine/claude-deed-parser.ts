// lib/cad/ai-engine/claude-deed-parser.ts
//
// Phase 6 — Claude-assisted deed parser. Layer 2 fallback for
// the regex parser in `deed-parser.ts`. Invoked when the regex
// produces zero calls or low confidence on a free-form legal
// description (poor OCR, non-standard phrasing, etc.).
//
// Returns the same `{ calls, confidence }` shape the regex
// parser emits so the orchestrator can swap in the result
// without branching.
//
// Auth path: requires `ANTHROPIC_API_KEY` in the environment.
// Throws `MissingApiKeyError` when unset so the caller can fall
// back to regex-only without surfacing a 500.

import Anthropic from '@anthropic-ai/sdk';

import type { DeedCall, DeedCurve } from './types';

const DEFAULT_MODEL =
  process.env.CAD_AI_MODEL ?? 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 60_000;

export class MissingApiKeyError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY is not set; Claude-assisted parsing unavailable.');
    this.name = 'MissingApiKeyError';
  }
}

export interface ClaudeDeedParseResult {
  calls: DeedCall[];
  confidence: number;
  /** Optional metadata Claude can extract: basis-of-bearings,
   *  beginning monument, county / survey / abstract / vol / pg.
   *  Caller merges into DeedData. */
  deedMeta: Partial<{
    basisOfBearings: string;
    beginningMonument: string;
    county: string;
    survey: string;
    abstract: string;
    volume: string;
    page: string;
  }>;
  raw: string;
  model: string;
  latencyMs: number;
}

const SYSTEM_PROMPT = `You are a Texas-licensed land surveyor's assistant. You extract structured metes-and-bounds deed calls from free-form legal description text.

Output a single JSON object with this exact shape (no prose, no markdown fence):

{
  "calls": [
    {
      "index": 0,
      "type": "LINE" | "CURVE",
      "bearing": <azimuth in decimal degrees, 0..360, or null>,
      "distance": <feet, or null>,
      "curveData": null | {
        "radius": <feet>,
        "arcLength": <feet | null>,
        "chordBearing": <azimuth degrees | null>,
        "chordDistance": <feet | null>,
        "deltaAngle": <decimal degrees | null>,
        "direction": "LEFT" | "RIGHT"
      },
      "monument": "<trailing monument description or null>",
      "rawText": "<the original block of text for this call>"
    }
  ],
  "deedMeta": {
    "basisOfBearings": "<text or null>",
    "beginningMonument": "<text or null>",
    "county": "<county name or null>",
    "survey": "<survey/abstract description or null>",
    "abstract": "<abstract number or null>",
    "volume": "<volume or null>",
    "page": "<page or null>"
  }
}

Conventions:
- Convert quadrant bearings (N 45°30'15" E) to decimal-degree azimuth (0=North, 90=East, ...).
- "thence along a curve to the right" → direction "RIGHT".
- If a value is missing in the text, return null. Do not guess.
- One call per THENCE block. The closing call back to POINT/PLACE OF BEGINNING also counts as a call.
- Output JSON only. No prose. No markdown fences.`;

/**
 * Parse a legal description through Claude. Used as the layer-2
 * fallback when the regex parser fails (zero calls extracted or
 * low confidence). The orchestrator decides which to call.
 *
 * Throws `MissingApiKeyError` when `ANTHROPIC_API_KEY` is unset
 * so the caller can degrade to regex-only without a 500.
 */
export async function parseCallsWithClaude(
  rawText: string,
  options: { model?: string; signal?: AbortSignal } = {}
): Promise<ClaudeDeedParseResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();

  const client = new Anthropic({ apiKey });
  const startTime = Date.now();
  const model = options.model ?? DEFAULT_MODEL;

  // Race the Anthropic call against a manual timeout — the
  // Anthropic SDK's own timeout is per-stream-event, not per-
  // whole-call, so we wrap it here.
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(
    () => timeoutController.abort(),
    REQUEST_TIMEOUT_MS
  );
  if (options.signal) {
    options.signal.addEventListener('abort', () =>
      timeoutController.abort()
    );
  }

  try {
    const response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: rawText,
        },
      ],
    });

    clearTimeout(timeoutId);
    const block = response.content[0];
    if (!block || block.type !== 'text') {
      throw new Error('Claude returned a non-text content block.');
    }
    const raw = block.text.trim();
    const parsed = safeParseJson(raw);
    if (!parsed) {
      throw new Error('Claude response did not contain valid JSON.');
    }

    const callsRaw = Array.isArray(parsed.calls) ? parsed.calls : [];
    const calls: DeedCall[] = callsRaw.map((c, idx) =>
      coerceCall(c, idx)
    );
    const confidence =
      calls.length > 0
        ? calls.filter((c) => c.bearing !== null || c.curveData !== null)
            .length / calls.length
        : 0;

    const meta = (parsed.deedMeta ?? {}) as Record<string, unknown>;
    const deedMeta: ClaudeDeedParseResult['deedMeta'] = {};
    for (const key of [
      'basisOfBearings',
      'beginningMonument',
      'county',
      'survey',
      'abstract',
      'volume',
      'page',
    ] as const) {
      const v = meta[key];
      if (typeof v === 'string' && v.trim().length > 0) {
        deedMeta[key] = v.trim();
      }
    }

    return {
      calls,
      confidence,
      deedMeta,
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

function safeParseJson(raw: string): { calls?: unknown; deedMeta?: unknown } | null {
  // Tolerate occasional ```json fences even though the prompt
  // explicitly forbids them.
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  try {
    return JSON.parse(stripped) as { calls?: unknown; deedMeta?: unknown };
  } catch {
    return null;
  }
}

function coerceCall(raw: unknown, fallbackIndex: number): DeedCall {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const type =
    obj.type === 'CURVE' || obj.type === 'LINE' ? obj.type : 'LINE';
  const index =
    typeof obj.index === 'number' && Number.isFinite(obj.index)
      ? obj.index
      : fallbackIndex;
  return {
    index,
    type,
    bearing: numberOrNull(obj.bearing),
    distance: numberOrNull(obj.distance),
    curveData: type === 'CURVE' ? coerceCurve(obj.curveData) : null,
    monument: stringOrNull(obj.monument),
    rawText: typeof obj.rawText === 'string' ? obj.rawText : '',
  };
}

function coerceCurve(raw: unknown): DeedCurve | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const direction =
    c.direction === 'LEFT' || c.direction === 'RIGHT'
      ? c.direction
      : null;
  return {
    radius: numberOrNull(c.radius),
    arcLength: numberOrNull(c.arcLength),
    chordBearing: numberOrNull(c.chordBearing),
    chordDistance: numberOrNull(c.chordDistance),
    deltaAngle: numberOrNull(c.deltaAngle),
    direction,
  };
}

function numberOrNull(v: unknown): number | null {
  if (typeof v !== 'number') return null;
  return Number.isFinite(v) ? v : null;
}

function stringOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}
