// lib/cad/ai-engine/deliberation.ts
//
// Phase 6 §28 — AI deliberation period + clarifying questions.
//
// Runs after Stage 6 confidence scoring + offset resolution +
// online enrichment. Walks the §28.2 nine-step checklist with
// the data the synchronous pipeline can hand it (deterministic
// signals only — Claude-assisted holistic analysis lands in a
// follow-up slice).
//
// Output is the §28.3 DeliberationResult, including:
//   * overallConfidence — weighted average across element
//     scores (Stage 6 already produced one per feature),
//   * questions partitioned into BLOCKING vs OPTIONAL,
//   * shouldShowDialog flag — false when confidence ≥ 90 AND
//     there are zero blocking questions (the §28.1 short-
//     circuit rule).
//
// Pure function. No I/O. Re-runs cheaply on each pipeline pass
// so the caller can show fresh questions after the user
// answers a previous round.

import { generateId } from '../types';

import type {
  ClarifyingQuestion,
  ClassificationResult,
  ConfidenceScore,
  DeliberationResult,
  Discrepancy,
  EnrichmentData,
  ReconciliationResult,
} from './types';
import type { OffsetResolutionDetail } from './offset-resolver';
import type { Feature } from '../types';

// ────────────────────────────────────────────────────────────
// Inputs
// ────────────────────────────────────────────────────────────

export interface DeliberationInputs {
  features:        Feature[];
  classified:      ClassificationResult[];
  reconciliation:  ReconciliationResult | null;
  offsetDetail:    OffsetResolutionDetail | null;
  enrichment:      EnrichmentData | null;
  /** featureId → confidence score (Stage 6 output). */
  scores:          Map<string, ConfidenceScore>;
  /** Computed boundary acreage (caller-side; pipeline already
   *  knows the closed polygons). When omitted, the area-mismatch
   *  check is skipped. */
  computedAcres?:  number | null;
}

// ────────────────────────────────────────────────────────────
// Public entry
// ────────────────────────────────────────────────────────────

const CONFIDENCE_GATE = 90;
const AREA_MISMATCH_PCT = 2;
const BEARING_QUESTION_THRESHOLD_SECONDS = 7200; // 2°
const DISTANCE_QUESTION_THRESHOLD_FEET = 1.0;

/**
 * Run the deliberation checklist against a finished pipeline
 * pass. Synchronous; safe to call inside `runAIPipeline`.
 */
export function runDeliberation(
  inputs: DeliberationInputs
): DeliberationResult {
  const startedAt = Date.now();
  const questions: ClarifyingQuestion[] = [];

  // 1. Cross-reference field data with deed.
  questions.push(...buildDeedQuestions(inputs.reconciliation));

  // 3. Validate offset resolution.
  questions.push(...buildOffsetQuestions(inputs.offsetDetail));

  // 4. Code pattern analysis.
  questions.push(...buildCodeQuestions(inputs.classified));

  // 6. Feature attribute collection.
  questions.push(...buildFeatureAttributeQuestions(inputs.features));

  // 2 + 9. Area mismatch (parcel vs computed).
  questions.push(
    ...buildAreaQuestions(inputs.enrichment, inputs.computedAcres ?? null)
  );

  // 5. Feature completeness — unclosed boundary signal.
  // (Reconciliation closure quality covers most of this; we
  // intentionally leave the extra check for follow-up slices
  // where the polygon-closure flag is surfaced explicitly.)

  const overallConfidence = aggregateConfidence(inputs.scores);
  const blocking = questions.filter((q) => q.priority === 'BLOCKING');
  const optional = questions.filter((q) => q.priority !== 'BLOCKING');
  const shouldShowDialog =
    blocking.length > 0 || overallConfidence < CONFIDENCE_GATE;

  return {
    overallConfidence,
    questions,
    blockingQuestions: blocking,
    optionalQuestions: optional,
    shouldShowDialog,
    deliberationMs: Date.now() - startedAt,
    completedAt: new Date().toISOString(),
  };
}

// ────────────────────────────────────────────────────────────
// Step 1 — Deed discrepancy questions
// ────────────────────────────────────────────────────────────

function buildDeedQuestions(
  rec: ReconciliationResult | null
): ClarifyingQuestion[] {
  if (!rec) return [];
  const out: ClarifyingQuestion[] = [];
  for (const d of rec.discrepancies) {
    const q = discrepancyToQuestion(d);
    if (q) out.push(q);
  }
  return out;
}

function discrepancyToQuestion(d: Discrepancy): ClarifyingQuestion | null {
  switch (d.type) {
    case 'BEGINNING_MONUMENT_NOT_FOUND':
      return {
        id: generateId(),
        priority: 'BLOCKING',
        category: 'DEED_DISCREPANCY',
        question:
          'The deed names a Point of Beginning monument that ' +
          'wasn’t matched to any field point. Was the POB ' +
          'monument found in the field?',
        aiReasoning:
          `Deed POB description: "${d.recordValue}". No matching ` +
          'monument was located in the imported point set.',
        relatedIds: [],
        suggestedAnswer: null,
        answerType: 'CONFIRM',
        options: ['Yes — found', 'No — not found', 'Not sure'],
        userAnswer: null,
        skipped: false,
      };
    case 'BEARING_MISMATCH': {
      const diffSec = parseFloat(d.difference);
      if (
        !Number.isFinite(diffSec) ||
        diffSec < BEARING_QUESTION_THRESHOLD_SECONDS
      ) {
        return null;
      }
      return {
        id: generateId(),
        priority: d.severity === 'CRITICAL' ? 'BLOCKING' : 'HIGH',
        category: 'DEED_DISCREPANCY',
        question:
          `Field bearing on call ${(d.callIndex ?? 0) + 1} is off ` +
          `by ${(diffSec / 3600).toFixed(2)}° from the deed. ` +
          'Trust field, trust deed, or flag for surveyor review?',
        aiReasoning:
          `Field bearing: ${d.fieldValue}. Deed bearing: ` +
          `${d.recordValue}. Difference: ${d.difference} arc-seconds.`,
        relatedIds: [],
        suggestedAnswer: 'Trust field',
        answerType: 'SELECT',
        options: [
          'Trust field measurement',
          'Trust deed bearing',
          'Flag for surveyor review',
        ],
        userAnswer: null,
        skipped: false,
      };
    }
    case 'DISTANCE_MISMATCH': {
      const diff = parseFloat(d.difference);
      if (
        !Number.isFinite(diff) ||
        Math.abs(diff) < DISTANCE_QUESTION_THRESHOLD_FEET
      ) {
        return null;
      }
      return {
        id: generateId(),
        priority: d.severity === 'CRITICAL' ? 'BLOCKING' : 'MEDIUM',
        category: 'DEED_DISCREPANCY',
        question:
          `Field distance on call ${(d.callIndex ?? 0) + 1} is off ` +
          `by ${diff.toFixed(2)}′ from the deed. ` +
          'Trust field or trust deed?',
        aiReasoning:
          `Field: ${d.fieldValue}. Deed: ${d.recordValue}. ` +
          `Difference: ${d.difference} ft.`,
        relatedIds: [],
        suggestedAnswer: 'Trust field',
        answerType: 'SELECT',
        options: [
          'Trust field measurement',
          'Trust deed distance',
          'Flag for surveyor review',
        ],
        userAnswer: null,
        skipped: false,
      };
    }
    case 'CALL_COUNT_MISMATCH':
      return {
        id: generateId(),
        priority: 'HIGH',
        category: 'DEED_DISCREPANCY',
        question:
          'Field traverse and deed call counts don’t match. ' +
          'How should the extra leg(s) be handled?',
        aiReasoning: d.message,
        relatedIds: [],
        suggestedAnswer: null,
        answerType: 'SELECT',
        options: [
          'Treat extra field legs as additional detail',
          'Treat as data-entry error',
          'Flag for surveyor review',
        ],
        userAnswer: null,
        skipped: false,
      };
    case 'CLOSURE_POOR':
      return {
        id: generateId(),
        priority: 'HIGH',
        category: 'DEED_DISCREPANCY',
        question:
          'Field traverse closure is poorer than expected. ' +
          'Force closure, leave as-is, or flag for review?',
        aiReasoning: d.message,
        relatedIds: [],
        suggestedAnswer: 'Leave as-is and note',
        answerType: 'SELECT',
        options: [
          'Force closure to balance',
          'Leave as-is and note',
          'Flag for surveyor review',
        ],
        userAnswer: null,
        skipped: false,
      };
    default:
      return null;
  }
}

// ────────────────────────────────────────────────────────────
// Step 3 — Offset disambiguation
// ────────────────────────────────────────────────────────────

function buildOffsetQuestions(
  detail: OffsetResolutionDetail | null
): ClarifyingQuestion[] {
  if (!detail) return [];
  const out: ClarifyingQuestion[] = [];
  for (const shot of detail.ambiguousShots) {
    out.push({
      id: generateId(),
      priority: 'BLOCKING',
      category: 'OFFSET_DISAMBIGUATION',
      question:
        'An offset shot was detected but the parser couldn’t ' +
        'determine its reference bearing. Which way is the offset?',
      aiReasoning:
        `Offset point: ${shot.offsetPointId}. Resolution method: ` +
        `${shot.resolutionMethod}. Confidence: ${shot.confidence}.`,
      relatedIds: [shot.offsetPointId],
      suggestedAnswer: null,
      answerType: 'SELECT',
      options: [
        'Perpendicular left',
        'Perpendicular right',
        'Inline forward',
        'Inline backward',
        'Specify bearing',
        'Not an offset shot',
      ],
      userAnswer: null,
      skipped: false,
    });
  }
  for (const id of detail.unresolvedPointIds) {
    out.push({
      id: generateId(),
      priority: 'MEDIUM',
      category: 'OFFSET_DISAMBIGUATION',
      question:
        'This point looks offset (description / code mentions ' +
        '"off"), but no distance or direction was extracted. ' +
        'How should we treat it?',
      aiReasoning:
        `Point ${id} carries an "off" indicator without parseable ` +
        'offset metadata.',
      relatedIds: [id],
      suggestedAnswer: 'Treat as a normal shot',
      answerType: 'SELECT',
      options: [
        'Treat as a normal shot',
        'Specify offset distance + direction',
        'Exclude from drawing',
      ],
      userAnswer: null,
      skipped: false,
    });
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// Step 4 — Code ambiguity / typos
// ────────────────────────────────────────────────────────────

function buildCodeQuestions(
  classified: ClassificationResult[]
): ClarifyingQuestion[] {
  const out: ClarifyingQuestion[] = [];
  for (const c of classified) {
    if (c.flags.includes('UNRECOGNIZED_CODE')) {
      out.push({
        id: generateId(),
        priority: 'MEDIUM',
        category: 'CODE_AMBIGUITY',
        question:
          `Point ${c.point.pointName} uses code ` +
          `"${c.point.rawCode}" which isn’t in the code ` +
          'library. What feature does it represent?',
        aiReasoning:
          'No PointCodeDefinition matched the raw code; mapping to ' +
          'a feature category needs surveyor confirmation.',
        relatedIds: [c.point.id],
        suggestedAnswer: null,
        answerType: 'SELECT',
        options: [
          'Boundary control',
          'Property line',
          'Building',
          'Fence',
          'Utility',
          'Topography',
          'Other (specify)',
        ],
        userAnswer: null,
        skipped: false,
      });
    } else if (c.flags.includes('AMBIGUOUS_CODE')) {
      out.push({
        id: generateId(),
        priority: 'LOW',
        category: 'CODE_AMBIGUITY',
        question:
          `Point ${c.point.pointName} matches multiple code ` +
          'definitions. Which one was intended?',
        aiReasoning: c.flagMessages.join(' '),
        relatedIds: [c.point.id],
        suggestedAnswer: null,
        answerType: 'TEXT',
        options: null,
        userAnswer: null,
        skipped: false,
      });
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// Step 6 — Feature attribute collection (fence material, etc.)
// ────────────────────────────────────────────────────────────

const FENCE_PREFIXES = ['FN', 'FENCE'];
const BUILDING_PREFIXES = ['BL', 'BLDG', 'BUILDING'];

function buildFeatureAttributeQuestions(
  features: Feature[]
): ClarifyingQuestion[] {
  const out: ClarifyingQuestion[] = [];
  for (const f of features) {
    const aiLabel = String(f.properties?.aiLabel ?? '').toUpperCase();
    const codePrefix = String(f.properties?.codePrefix ?? '').toUpperCase();
    const haystack = `${aiLabel} ${codePrefix}`;
    if (FENCE_PREFIXES.some((p) => haystack.includes(p))) {
      if (!f.properties?.material) {
        out.push({
          id: generateId(),
          priority: 'LOW',
          category: 'FEATURE_ATTRIBUTE',
          question: `Fence "${f.properties?.aiLabel ?? f.id}" — what material?`,
          aiReasoning:
            'Fence detected by code prefix; material drives the ' +
            'right line-type symbol on the plat.',
          relatedIds: [f.id],
          suggestedAnswer: 'Chain Link',
          answerType: 'SELECT',
          options: [
            'Chain Link',
            'Wood',
            'Wire',
            'Barbed Wire',
            'Split Rail',
            'Other',
          ],
          userAnswer: null,
          skipped: false,
        });
      }
    } else if (BUILDING_PREFIXES.some((p) => haystack.includes(p))) {
      if (!f.properties?.material) {
        out.push({
          id: generateId(),
          priority: 'LOW',
          category: 'FEATURE_ATTRIBUTE',
          question:
            `Building "${f.properties?.aiLabel ?? f.id}" — primary material?`,
          aiReasoning:
            'Building detected by code prefix; material is required ' +
            'on most plats.',
          relatedIds: [f.id],
          suggestedAnswer: null,
          answerType: 'SELECT',
          options: ['Brick', 'Frame', 'Metal', 'Concrete', 'Mixed', 'Other'],
          userAnswer: null,
          skipped: false,
        });
      }
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// Step 2 / 9 — Area mismatch (parcel CAD vs computed)
// ────────────────────────────────────────────────────────────

function buildAreaQuestions(
  enrichment: EnrichmentData | null,
  computedAcres: number | null
): ClarifyingQuestion[] {
  if (!enrichment || !enrichment.acreage || !computedAcres) return [];
  const recorded = enrichment.acreage;
  const diffPct =
    Math.abs(computedAcres - recorded) / Math.max(recorded, 0.01);
  if (diffPct * 100 < AREA_MISMATCH_PCT) return [];
  return [
    {
      id: generateId(),
      priority: 'HIGH',
      category: 'AREA_MISMATCH',
      question:
        `Computed boundary area (${computedAcres.toFixed(2)} ac) ` +
        `differs from CAD/parcel acreage (${recorded.toFixed(2)} ac) ` +
        `by ${(diffPct * 100).toFixed(1)}%. Which value should drive ` +
        'the title block?',
      aiReasoning:
        `Threshold is ${AREA_MISMATCH_PCT}%. Difference exceeds ` +
        'tolerance — likely indicates a missing call, an extra leg, ' +
        'or a stale parcel record.',
      relatedIds: [],
      suggestedAnswer: 'Use computed area',
      answerType: 'SELECT',
      options: [
        'Use computed area',
        'Use parcel/CAD acreage',
        'Note the discrepancy and flag for surveyor',
      ],
      userAnswer: null,
      skipped: false,
    },
  ];
}

// ────────────────────────────────────────────────────────────
// Step 9 — Confidence aggregation
// ────────────────────────────────────────────────────────────

function aggregateConfidence(scores: Map<string, ConfidenceScore>): number {
  if (scores.size === 0) return 0;
  let sum = 0;
  for (const s of scores.values()) sum += s.score;
  return Math.round(sum / scores.size);
}
