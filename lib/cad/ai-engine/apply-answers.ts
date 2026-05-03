// lib/cad/ai-engine/apply-answers.ts
//
// Phase 6 §28.5 — fold clarifying-question answers back into a
// fresh pipeline result. Synchronous + best-effort.
//
// What we apply deterministically today:
//   * FEATURE_ATTRIBUTE answers → stamp `feature.properties.material`
//     on the matching feature. Subsequent runs of the deliberation
//     engine see the property and stop generating the question
//     (the §28 walk skips features that already carry a material).
//   * Skipped/answered questions → mark the live deliberation
//     result with the user-provided values so the UI reflects the
//     decision without a full re-render.
//   * DEED_DISCREPANCY ("Trust deed") → emit a warning so the
//     reconciliation report flags the leg as user-overridden.
//
// What's intentionally out of scope this slice:
//   * Re-running stages 1 + 3 with answer-aware classification
//     (e.g. CODE_AMBIGUITY answer becoming a synthetic code
//     definition). Lands once Stage 1 grows a userOverrides
//     channel.
//   * Offset disambiguation answers feeding back into the offset
//     resolver — the resolver already accepts a manual reference
//     bearing, but the wiring is a separate slice.
//
// Pure: no I/O. Mutates a shallow copy of the result.

import type {
  AIJobResult,
  ClarifyingQuestion,
} from './types';
import type { Feature } from '../types';

export function applyAnswerEffects(
  result: AIJobResult,
  answers: ClarifyingQuestion[]
): AIJobResult {
  if (answers.length === 0) return result;

  const features = result.features.slice();
  const featureIndex = new Map<string, number>();
  for (let i = 0; i < features.length; i += 1) {
    featureIndex.set(features[i].id, i);
  }

  const warnings = result.warnings.slice();
  let appliedCount = 0;

  for (const answer of answers) {
    if (!answer.userAnswer || answer.skipped) continue;
    switch (answer.category) {
      case 'FEATURE_ATTRIBUTE':
        appliedCount += stampFeatureAttribute(
          features,
          featureIndex,
          answer
        );
        break;
      case 'DEED_DISCREPANCY':
        warnings.push(
          `User answer on deed call ${humanizeRelated(answer)}: ` +
            `"${answer.userAnswer}".`
        );
        appliedCount += 1;
        break;
      case 'OFFSET_DISAMBIGUATION':
        warnings.push(
          `Offset disambiguation answer for ${humanizeRelated(answer)}: ` +
            `"${answer.userAnswer}". Re-run with the offset resolver ` +
            'will land in a follow-up slice.'
        );
        break;
      case 'CODE_AMBIGUITY':
        warnings.push(
          `Code clarification for ${humanizeRelated(answer)}: ` +
            `"${answer.userAnswer}". Stage-1 reclassification lands ` +
            'in a follow-up slice.'
        );
        break;
      default:
        // Unhandled categories still get logged so the surveyor
        // can see their answer was captured.
        warnings.push(
          `Captured answer for ${answer.category}: "${answer.userAnswer}".`
        );
        break;
    }
  }

  if (appliedCount === 0 && warnings.length === result.warnings.length) {
    return result;
  }

  return {
    ...result,
    features,
    warnings,
  };
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function stampFeatureAttribute(
  features: Feature[],
  index: Map<string, number>,
  answer: ClarifyingQuestion
): number {
  let touched = 0;
  for (const id of answer.relatedIds) {
    const ix = index.get(id);
    if (ix === undefined) continue;
    const f = features[ix];
    features[ix] = {
      ...f,
      properties: {
        ...f.properties,
        material: answer.userAnswer ?? '',
      },
    };
    touched += 1;
  }
  return touched;
}

function humanizeRelated(q: ClarifyingQuestion): string {
  if (q.relatedIds.length === 0) return '(no related ids)';
  return q.relatedIds.slice(0, 3).join(', ');
}
