// lib/cad/ai/provenance.ts
//
// Phase 6 §32.7 — AI provenance stamps. Every feature produced
// by a tool-registry call gets five properties stamped onto its
// `properties` channel so:
//
//   1. Surveyor can audit any AI feature via the right-click
//      "Why did AI draw this?" menu (§32.7).
//   2. The replay command (§32.7 / Slice 12) can rebuild the
//      same drawing from a fresh points file by grouping
//      features by aiBatchId and replaying them in order.
//   3. The confidence-escalation logic (Slice 8) can read
//      aiConfidence directly off the feature.
//
// `feature.properties` is `Record<string, string | number |
// boolean>` so the array-valued `aiSourcePoints` is stored as
// a JSON string and decoded on read.

/**
 * Five-field provenance payload stamped on every AI-generated
 * feature. Strings (rather than enums) for forward-compat with
 * future skill names.
 */
export interface AIProvenance {
  /**
   * Tag describing which AI pipeline / tool produced the
   * feature. Convention:
   *   - 'CODE_PARSE'        — point classification (Stage 1).
   *   - 'FEATURE_ASSEMBLY'  — Stage 2 assembly.
   *   - 'DEED_RECONCILE'    — Stage 3 reconciliation.
   *   - 'BEST_FIT_CORNER'   — §31 AI corner.
   *   - 'COMMAND_<verb>'    — surveyor's COMMAND-mode call,
   *     e.g. `COMMAND_addPoint`.
   *   - 'AUTO_<verb>' / 'COPILOT_<verb>' — same but routed
   *     through AUTO / COPILOT modes.
   */
  aiOrigin: string;
  /** Confidence the model assigned to this feature (0–1). */
  aiConfidence: number;
  /** SHA-256 (or any stable hash) of the prompt that produced
   *  the feature. Lets the replay command dedupe identical
   *  re-runs. */
  aiPromptHash: string;
  /** Feature ids the AI cited as supporting evidence (typically
   *  POINT ids the feature was assembled from). Empty array
   *  when the feature has no point ancestry. */
  aiSourcePoints: string[];
  /** UUID grouping every feature produced in one AI turn (one
   *  AUTO run, one COPILOT proposal, one COMMAND task). */
  aiBatchId: string;
}

/** Property keys we own. Anything outside this set is left
 *  untouched by stamp / read / strip. */
export const AI_PROVENANCE_KEYS = [
  'aiOrigin',
  'aiConfidence',
  'aiPromptHash',
  'aiSourcePoints',
  'aiBatchId',
] as const;

type FeatureProperties = Record<string, string | number | boolean>;

/**
 * Stamp the five provenance fields onto a properties bag. The
 * `aiSourcePoints` array is JSON-encoded since `properties`
 * can only hold primitives.
 */
export function stampProvenance(
  properties: FeatureProperties,
  provenance: AIProvenance,
): FeatureProperties {
  return {
    ...properties,
    aiOrigin: provenance.aiOrigin,
    aiConfidence: provenance.aiConfidence,
    aiPromptHash: provenance.aiPromptHash,
    aiSourcePoints: JSON.stringify(provenance.aiSourcePoints ?? []),
    aiBatchId: provenance.aiBatchId,
  };
}

/**
 * Inverse of {@link stampProvenance}. Returns null when the
 * required `aiOrigin` stamp is missing — `aiOrigin` is the
 * canonical "is this an AI feature?" flag, so a feature
 * without it is treated as fully manual.
 */
export function readProvenance(
  properties: FeatureProperties | null | undefined,
): AIProvenance | null {
  if (!properties) return null;
  const origin = properties.aiOrigin;
  if (typeof origin !== 'string' || origin.length === 0) return null;

  const confidenceRaw = properties.aiConfidence;
  const confidence =
    typeof confidenceRaw === 'number' && Number.isFinite(confidenceRaw)
      ? confidenceRaw
      : 0;

  const promptHash =
    typeof properties.aiPromptHash === 'string' ? properties.aiPromptHash : '';
  const batchId =
    typeof properties.aiBatchId === 'string' ? properties.aiBatchId : '';

  const sourcePointsRaw = properties.aiSourcePoints;
  let sourcePoints: string[] = [];
  if (typeof sourcePointsRaw === 'string' && sourcePointsRaw.length > 0) {
    try {
      const parsed: unknown = JSON.parse(sourcePointsRaw);
      if (Array.isArray(parsed)) {
        sourcePoints = parsed.filter((s): s is string => typeof s === 'string');
      }
    } catch {
      // Corrupt stamp — degrade gracefully to "no source points
      // known." Better than crashing the explanation popup.
      sourcePoints = [];
    }
  }

  return {
    aiOrigin: origin,
    aiConfidence: confidence,
    aiPromptHash: promptHash,
    aiSourcePoints: sourcePoints,
    aiBatchId: batchId,
  };
}

/**
 * True when the property bag carries at least the canonical
 * `aiOrigin` stamp. Used by the right-click menu to decide
 * whether to render the "Why did AI draw this?" entry.
 */
export function hasProvenance(
  properties: FeatureProperties | null | undefined,
): boolean {
  return (
    !!properties &&
    typeof properties.aiOrigin === 'string' &&
    properties.aiOrigin.length > 0
  );
}
