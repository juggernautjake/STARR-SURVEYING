// lib/research/self-heal-apply-evaluator.ts
//
// Slice 4 of research-self-heal-slice-1-manual-sweep-2026-06-22.md.
//
// Pure decision layer that runs every PENDING proposal through the
// existing `apply-policy.decideApplyAction` helper and groups the
// outcomes so the API route can:
//   1. Auto-apply any proposal that hits all three gates
//      (autoapply_enabled + confidence ≥ threshold + canary re-test
//      passed).
//   2. Auto-reject any proposal that fails canary re-test or has
//      confidence below the reviewer threshold.
//   3. Leave the rest queued for human review.
//
// Today (slice 3), every `proposed`-status row carries confidence=0
// because the AI fix generator hasn't landed yet. The evaluator
// FILTERS those out before scoring — they're explicit "human triage
// only" rows. When a future slice plugs in an AI generator that
// produces confidence > 0 proposals, the same evaluator picks them
// up automatically.

import { decideApplyAction, type ApplyDecision, type ApplyPolicy, type ProposalInput } from './apply-policy';

export interface EvaluableProposal extends ProposalInput {
  id: string;
}

export interface EvaluatedProposal {
  id: string;
  decision: ApplyDecision;
  /** Useful breadcrumb for the audit row written next to the proposal. */
  decided_at: string;
}

/** Pure. Score every proposal that has a real confidence value
 *  (>0). Slice-3 confidence=0 proposals are dropped — those rows
 *  stay queued for the human review queue rather than getting
 *  rejected by the low-confidence gate. */
export function evaluateProposalsForApply(
  proposals: EvaluableProposal[],
  policy: ApplyPolicy,
  now: Date = new Date(),
): EvaluatedProposal[] {
  return proposals
    .filter((p) => Number.isFinite(p.confidence) && p.confidence > 0)
    .map((p) => ({
      id: p.id,
      decision: decideApplyAction(p, policy),
      decided_at: now.toISOString(),
    }));
}

/** Pure. Convenience tally for the dashboard / API response. */
export interface EvaluatedTally {
  auto_apply: number;
  queue_for_review: number;
  reject: number;
  skipped_low_confidence: number;
}

export function tallyEvaluations(
  scored: EvaluatedProposal[],
  totalProposals: number,
): EvaluatedTally {
  let autoApply = 0, queue = 0, reject = 0;
  for (const e of scored) {
    if (e.decision.action === 'auto_apply') autoApply++;
    else if (e.decision.action === 'queue_for_review') queue++;
    else reject++;
  }
  // Anything not scored was filtered out because confidence ≤ 0 —
  // call that out explicitly so the dashboard can show "12 awaiting
  // human triage" without lying about apply-policy's verdict.
  const skippedLowConfidence = totalProposals - scored.length;
  return {
    auto_apply: autoApply,
    queue_for_review: queue,
    reject,
    skipped_low_confidence: Math.max(0, skippedLowConfidence),
  };
}

/** Pure helper mapping a settings-table row → apply-policy. The DB
 *  layer hands us snake_case numerics; this returns the typed
 *  policy structure consumed by `decideApplyAction`. */
export interface SelfHealSettingsRow {
  autoapply_enabled: boolean;
  autoapply_confidence_threshold: number | string;
  reviewer_confidence_threshold: number | string;
  require_canary_pass: boolean;
}

export function policyFromSettings(row: SelfHealSettingsRow | null): ApplyPolicy {
  if (!row) {
    return {
      autoapply_enabled: false,
      autoapply_confidence_threshold: 0.9,
      reviewer_confidence_threshold: 0.5,
      require_canary_pass: true,
    };
  }
  return {
    autoapply_enabled: !!row.autoapply_enabled,
    autoapply_confidence_threshold: Number(row.autoapply_confidence_threshold) || 0.9,
    reviewer_confidence_threshold: Number(row.reviewer_confidence_threshold) || 0.5,
    require_canary_pass: !!row.require_canary_pass,
  };
}
