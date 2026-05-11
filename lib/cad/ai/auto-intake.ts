// lib/cad/ai/auto-intake.ts
//
// Phase 6 §32.13 Slice 11 — project-intake prompt for AUTO runs.
//
// When the surveyor kicks off an AUTO run from a cold queue, the
// framework fabricates a structured "build the drawing" prompt
// summarising what's loaded (points + layers + reference docs +
// existing AI memory). The result is fed verbatim through
// `proposeFromPrompt`, so the surveyor sees the intake in the
// transcript like any other turn — and they can edit it before
// sending if they want a different scope.
//
// Pure string-builder — no React, no side effects, so tests can
// snapshot it.

import type { ProjectContext } from './system-prompt';

export interface AutoIntakeSnapshot {
  /** Number of POINT features currently in the drawing. */
  pointCount: number;
  /** Up to N unique point codes surfaced from feature.properties.code. */
  sampleCodes: string[];
  /** Total number of features (across every type). */
  totalFeatures: number;
}

/**
 * Build the intake prompt. The string is treated as a normal
 * USER message — the system prompt already carries the project
 * context (layers, mode, sandbox, threshold, reference docs,
 * code-resolution memory). We don't repeat that here; we just
 * tell the AI what we want it to do with the intake snapshot.
 */
export function buildAutoIntakePrompt(
  snapshot: AutoIntakeSnapshot,
  context: ProjectContext,
): string {
  const refsAvailable = (context.referenceDocs ?? []).length > 0;
  const memorySize = Object.keys(context.codeResolutions ?? {}).length;
  const codeSampleLine =
    snapshot.sampleCodes.length === 0
      ? '  (no point codes detected)'
      : `  codes: ${snapshot.sampleCodes.slice(0, 12).join(', ')}${snapshot.sampleCodes.length > 12 ? `, …(+${snapshot.sampleCodes.length - 12} more)` : ''}`;

  return [
    'AUTO RUN — Build the drawing from this project intake.',
    '',
    'Snapshot:',
    `  POINTs in document: ${snapshot.pointCount}`,
    `  Total features: ${snapshot.totalFeatures}`,
    `  Existing layers: ${context.layers.length}`,
    `  Reference documents uploaded: ${(context.referenceDocs ?? []).length}${refsAvailable ? '' : ' (running blind — confidence is dampened ×0.85)'}`,
    `  Saved code resolutions: ${memorySize}`,
    codeSampleLine,
    '',
    'Plan:',
    '  1. Parse every point code in the document. For codes that map to a saved',
    '     resolution, reuse it. For codes that map to an existing layer name',
    '     (case-insensitive), reuse that. Otherwise propose createLayer.',
    '  2. Group POINTs by code into POLYLINE / POLYGON chains when the code',
    '     pattern (suffix index, common prefix) suggests connectivity.',
    '  3. For nearly-closed polygons, call the intersect helpers to drop',
    '     missing corners.',
    '  4. Never modify or delete existing features. Additions only.',
    '  5. When a decision\'s confidence is below the auto-approve threshold',
    `     (${context.autoApproveThreshold}), say so in plain text BEFORE the`,
    '     tool call so the surveyor sees the caveat on the COPILOT card.',
    '  6. End with a SYSTEM-level narrative summarising what you built + what',
    '     you skipped + what you want the surveyor to review.',
  ].join('\n');
}

/** Walk a feature map and pull (a) the POINT count, (b) unique
 *  upper-cased point codes (in insertion order), (c) total
 *  features. Pure data-shaping; no store / DOM access. */
export function snapshotFromFeatures(features: Iterable<{
  geometry: { type: string };
  properties?: { code?: unknown };
}>): AutoIntakeSnapshot {
  const codes = new Set<string>();
  let pointCount = 0;
  let totalFeatures = 0;
  for (const f of features) {
    totalFeatures++;
    if (f.geometry.type === 'POINT') {
      pointCount++;
      const raw = f.properties?.code;
      if (typeof raw === 'string' && raw.length > 0) {
        codes.add(raw.toUpperCase());
      }
    }
  }
  return {
    pointCount,
    totalFeatures,
    sampleCodes: Array.from(codes),
  };
}
