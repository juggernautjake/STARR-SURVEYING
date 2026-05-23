// lib/cad/ai/sketch-reconcile.ts
//
// CAD_POINTS_AND_AI slice F — hand-drawn sketch reconciliation.
//
// Takes a field-sketch image (PNG / JPEG / WebP) of a building
// outline + a list of collected survey points and asks Claude
// Vision to:
//
//   1. Identify the building perimeter in the sketch.
//   2. Read any written measurements next to the edges.
//   3. Match each corner in the sketch to its closest collected
//      point (when one exists) using the provided correspondences.
//   4. Suggest a closed vertex sequence representing the building
//      outline in survey coordinates.
//
// The result is a structured proposal the SketchReconcileDialog
// can render as a ghost POLYGON (via the existing
// `cad:copilotPreview` channel) and the surveyor can accept or
// reject. The Vision call is intentionally narrow — we ask for
// JSON, parse it strictly, and surface a clear error on
// malformed output so the user knows to retry with a clearer
// photo rather than getting silently wrong vertices.

import Anthropic from '@anthropic-ai/sdk';
import { MissingApiKeyError } from '../ai-engine/claude-deed-parser';
import type { Point2D } from '../types';

export interface SketchReconcileInput {
  /** Sketch image bytes — JPEG / PNG / WebP. */
  imageBase64: string;
  imageMediaType: 'image/png' | 'image/jpeg' | 'image/webp';
  /** Surveyed points the field crew collected, with name + coords. */
  collectedPoints: Array<{ name: string; x: number; y: number }>;
  /** Optional free-text context the surveyor wants the AI to know. */
  notes?: string;
}

export interface SketchReconcileResult {
  /** Vertices of the suggested closed building outline, in survey
   *  coordinates (x = East, y = North). First vertex is repeated
   *  by the consumer if it wants to draw the closing edge. */
  vertices: Point2D[];
  /** Optional bearing/distance labels extracted from the sketch
   *  for the surveyor's audit. */
  edgeLabels: Array<{ fromIndex: number; toIndex: number; label: string }>;
  /** Plain-English summary of how the AI interpreted the sketch. */
  narrative: string;
  /** 0–1; lower when the sketch is ambiguous or measurements
   *  contradict the collected points. */
  confidence: number;
}

const SYSTEM_PROMPT =
  'You are a land-surveying assistant analysing a field sketch of a building outline. ' +
  'The surveyor will provide an image of a hand-drawn sketch plus a list of survey points ' +
  'they collected on the corners they could shoot. Your job: ' +
  '(1) read any written measurements (distances, angles) on the sketch; ' +
  '(2) trace the building perimeter as a sequence of corners; ' +
  '(3) match each sketch corner to a collected point when one exists, using the closest ' +
  '    coordinate that fits the labelled edge distances; ' +
  '(4) propose coordinates for any corners that were not shot, using the labelled edge ' +
  '    measurements and the geometry of the matched corners; ' +
  '(5) return STRICTLY JSON with the shape { "vertices": [{x, y}, ...], "edgeLabels": ' +
  '    [{fromIndex, toIndex, label}, ...], "narrative": "...", "confidence": 0..1 }. ' +
  'Coordinates are in the same survey units as the collected points (typically US feet, ' +
  'x=East, y=North). When the sketch is illegible, return confidence < 0.4 and explain ' +
  'in the narrative what is unclear — do NOT invent measurements. Never wrap the JSON in ' +
  'Markdown fences; emit the JSON object as the entire response.';

const MODEL = 'claude-opus-4-7';
const MAX_TOKENS = 4096;

/**
 * Run a sketch-reconciliation pass. Throws `MissingApiKeyError`
 * if `ANTHROPIC_API_KEY` is unset (matches the proposer's
 * behaviour). Throws on malformed JSON so the API route can
 * return a 502 instead of silently misleading the surveyor.
 */
export async function reconcileSketch(input: SketchReconcileInput): Promise<SketchReconcileResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();
  const client = new Anthropic({ apiKey });

  const collectedList = input.collectedPoints
    .slice(0, 200) // hard cap so the prompt stays reasonable
    .map((p) => `  ${p.name}: x=${p.x.toFixed(3)}, y=${p.y.toFixed(3)}`)
    .join('\n');

  const text =
    `Collected survey points (x=East, y=North):\n${collectedList}\n\n` +
    (input.notes ? `Surveyor notes:\n${input.notes}\n\n` : '') +
    'Reconcile the sketch with these points. Return STRICTLY JSON.';

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: input.imageMediaType, data: input.imageBase64 } },
          { type: 'text', text },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Vision response contained no text block.');
  }
  return parseSketchResult(textBlock.text);
}

export function parseSketchResult(raw: string): SketchReconcileResult {
  // Strip ``` fences defensively in case the model ignores the
  // "no Markdown fences" instruction.
  let body = raw.trim();
  if (body.startsWith('```')) {
    body = body.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    throw new Error(`Vision response was not valid JSON: ${e instanceof Error ? e.message : 'unknown'}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Vision response was not a JSON object.');
  }
  const p = parsed as {
    vertices?: unknown;
    edgeLabels?: unknown;
    narrative?: unknown;
    confidence?: unknown;
  };
  if (!Array.isArray(p.vertices) || p.vertices.length < 3) {
    throw new Error('Vision response missing a vertices array of length ≥ 3.');
  }
  const vertices: Point2D[] = p.vertices.map((v, i) => {
    if (!v || typeof v !== 'object') throw new Error(`vertices[${i}] is not an object.`);
    const vv = v as { x?: unknown; y?: unknown };
    if (typeof vv.x !== 'number' || typeof vv.y !== 'number') {
      throw new Error(`vertices[${i}] must have numeric x and y.`);
    }
    return { x: vv.x, y: vv.y };
  });
  const edgeLabels = Array.isArray(p.edgeLabels)
    ? p.edgeLabels
        .filter((e): e is { fromIndex: number; toIndex: number; label: string } =>
          !!e && typeof e === 'object' &&
          typeof (e as { fromIndex?: unknown }).fromIndex === 'number' &&
          typeof (e as { toIndex?: unknown }).toIndex === 'number' &&
          typeof (e as { label?: unknown }).label === 'string')
    : [];
  return {
    vertices,
    edgeLabels,
    narrative: typeof p.narrative === 'string' ? p.narrative : '',
    confidence: typeof p.confidence === 'number'
      ? Math.max(0, Math.min(1, p.confidence))
      : 0.5,
  };
}
