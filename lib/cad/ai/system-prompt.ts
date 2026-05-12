// lib/cad/ai/system-prompt.ts
//
// Phase 6 §32.13 Slice 6 — system-prompt builder for the
// proposal-emitting Claude call. The prompt is a stable string
// that the API caches via `cache_control: { type: 'ephemeral' }`
// so subsequent proposals during the same project session
// don't re-pay the prefill cost.
//
// Inputs we expose to Claude:
//   - The current layer catalog (id / name / colour).
//   - The active layer (so "drop a point" lands on the right
//     surface by default).
//   - The active mode + sandbox + threshold so the model knows
//     how aggressive to be.
//   - A short tool catalogue (just names + descriptions; full
//     JSON schemas come through the tool_use API).
//
// What we deliberately do NOT include yet:
//   - Per-project code dictionary (Phase 6 §3 already builds
//     one; we'll fold it in once the slice tying surveyors'
//     code lists to the AI lands).
//   - Reference-document OCR catalog (§32.6 — reads from a
//     future tool the AI calls on demand).

import { toolRegistry, type ToolName } from './tool-registry';

export interface ProjectContext {
  /** Surveyor-visible layers; one entry per non-hidden layer.
   *  Ordered roughly the way they appear in the layer panel. */
  layers: Array<{ id: string; name: string; color: string }>;
  /** Layer that gets writes when a tool args omit `layerId`. */
  activeLayerId: string;
  /** Active mode (drives how confident the prompt is in its
   *  instructions to call vs. propose). */
  mode: 'AUTO' | 'COPILOT' | 'COMMAND' | 'MANUAL';
  /** Whether the surveyor wants writes routed to DRAFT__ layers
   *  by default. AUTO/COPILOT honour this; COMMAND callers may
   *  override per call. */
  sandboxDefault: boolean;
  /** Threshold below which AUTO escalates to COPILOT for that
   *  single step. Exposed so the model can self-flag low
   *  confidence rather than guess. */
  autoApproveThreshold: number;
  /** §32.4 — code resolutions the surveyor has already
   *  answered (code → layerId). Threaded into the system
   *  prompt so the model uses prior answers instead of asking
   *  again. Optional + defaults to {}. */
  codeResolutions?: Record<string, { layerId: string; answeredAt: number }>;
  /** §32.6 — reference documents the surveyor has uploaded.
   *  Empty array (or undefined) signals "running blind"; the
   *  framework already dampens confidence × 0.85 in that case,
   *  but we surface the catalogue here so Claude can cite the
   *  uploaded docs by name in its reasoning. */
  referenceDocs?: Array<{ name: string; kind: 'DEED' | 'PLAT' | 'SKETCH' | 'PRIOR_DRAWING' | 'OTHER' }>;
}

/** Build the system prompt string. Pure — no side effects, so
 *  the result is hashable for prompt-cache keys. */
export function buildSystemPrompt(ctx: ProjectContext): string {
  const layerLines = ctx.layers
    .map((l) => `  - ${l.name} (id=${l.id}, color=${l.color})`)
    .join('\n');

  const toolLines = (Object.keys(toolRegistry) as ToolName[])
    .map((name) => `  - ${name}: ${toolRegistry[name].description.split('.')[0]}.`)
    .join('\n');

  const resolutionEntries = Object.entries(ctx.codeResolutions ?? {})
    .map(([code, { layerId }]) => `  - ${code} → layer ${layerId}`)
    .join('\n');

  const refDocs = ctx.referenceDocs ?? [];
  const referenceLines = refDocs
    .map((d) => `  - ${d.kind}: ${d.name}`)
    .join('\n');

  return [
    'You are STARR CAD\'s drawing assistant for licensed Texas land surveyors.',
    'You help build technical survey drawings by calling typed tools. You never',
    'invent geometry — every change you make must go through a tool call.',
    '',
    `Current mode: ${ctx.mode}`,
    `Sandbox routing (writes to DRAFT__<layer> when on): ${ctx.sandboxDefault ? 'ON' : 'OFF'}`,
    `Auto-approve confidence threshold: ${ctx.autoApproveThreshold}`,
    '',
    'Available layers:',
    layerLines || '  (none — call createLayer first)',
    '',
    `Active layer (used when a tool arg omits layerId): ${ctx.activeLayerId}`,
    '',
    'Previously-resolved point codes (surveyor already decided — re-use without re-asking):',
    resolutionEntries.length > 0 ? resolutionEntries : '  (none)',
    '',
    refDocs.length > 0
      ? 'Reference documents uploaded (cite by name in your reasoning):'
      : 'Reference documents: NONE uploaded — confidence is dampened ×0.85 (§32.6). Be more cautious and surface caveats in plain text.',
    refDocs.length > 0 ? referenceLines : '',
    '',
    'Available tools (full JSON schemas come through the tool_use API):',
    toolLines,
    '',
    'Operating rules:',
    '  1. Every proposal must be a tool call. If you cannot decide, ask',
    '     for clarification in plain text rather than guessing.',
    '  2. When your confidence is below the threshold, say so in plain',
    '     text BEFORE the tool call so the COPILOT card surfaces the',
    '     caveat to the surveyor.',
    '  3. Layer names are case-insensitive but persisted as the surveyor',
    '     typed them. Use existing layers when one fits.',
    '  4. Coordinates are US Survey Feet. Angles are decimal degrees,',
    '     0 = North, clockwise (matches the bearing parser in the dialog).',
    '  5. Prefer drawPolylineThrough for ordered point chains; use',
    '     drawLineBetween only when exactly two endpoints are involved.',
    '  6. Never delete or overwrite the surveyor\'s existing features —',
    '     additions only. Edits route through future tools (Slice 11+).',
  ].join('\n');
}

/**
 * Stable hash of a system prompt — used both as the prompt-cache
 * key and as `aiPromptHash` on the resulting provenance stamps.
 * Tiny FNV-1a 32-bit hash; cryptographic strength isn't needed
 * here (collisions just mean the cache misses, never a correctness
 * issue).
 */
export function hashPrompt(prompt: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < prompt.length; i++) {
    h ^= prompt.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `fnv1a-${(h >>> 0).toString(16).padStart(8, '0')}`;
}
