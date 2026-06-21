// lib/research/apply-policy.ts
//
// §9.5 + §9.9 (guardrails) of
// docs/planning/in-progress/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md.
//
// Pure policy + state-transition helpers that decide what happens
// to a §9.4 change proposal:
//
//   - Auto-apply (only when the RESEARCH_SELF_HEAL_AUTOAPPLY flag is
//     on, confidence ≥ threshold, and the proposal's canary re-test
//     passed)
//   - Queue for human review
//   - Reject outright (canary failed, or confidence too low to even
//     surface to a reviewer)
//
// Applying a proposal must be reversible per §9.9 — the helpers
// here both snapshot prior config + field_map onto the proposal and
// produce a swap-back action for rollback.

/** Subset of `research_adapter_change_proposals` row the decision
 *  function reads. */
export interface ProposalInput {
  /** 0..1, set by the §9.4 agent. */
  confidence: number;
  /** Did the proposed config pass the canary re-test? `null` means
   *  "not yet tested" — the policy treats this as "do not apply
   *  yet". */
  canary_test_passed: boolean | null;
}

/** Operator-controlled policy. In production this is loaded from
 *  environment + research_self_heal_settings (a future tiny seed),
 *  but the policy logic itself is pure so it's testable in
 *  isolation. */
export interface ApplyPolicy {
  /** Feature flag — must be true for any auto-apply. Without it
   *  every successful proposal lands in the review queue, full
   *  stop. */
  autoapply_enabled: boolean;
  /** Lower bound on `proposal.confidence` for auto-apply. 0..1. */
  autoapply_confidence_threshold: number;
  /** Lower bound on confidence for the proposal to even reach the
   *  human reviewer. Below this we reject outright. */
  reviewer_confidence_threshold: number;
  /** When true, a proposal whose canary re-test failed is rejected
   *  immediately. (False would let the reviewer see + manually
   *  apply a failed proposal — an explicit override.) */
  require_canary_pass: boolean;
}

/** Default safe-by-default policy: nothing auto-applies, every
 *  reasonably-confident proposal goes to a reviewer, no canary-
 *  failed proposal slips through. The §9.5 spec is explicit that
 *  the default state must be review-required. */
export const DEFAULT_APPLY_POLICY: ApplyPolicy = {
  autoapply_enabled: false,
  autoapply_confidence_threshold: 0.9,
  reviewer_confidence_threshold: 0.5,
  require_canary_pass: true,
};

export type ApplyAction = 'auto_apply' | 'queue_for_review' | 'reject';

export interface ApplyDecision {
  action: ApplyAction;
  /** Plain-text rationale for the §9.8 dashboard + audit trail. */
  rationale: string;
}

/** Pure. Given a proposal + the active policy, decide what happens
 *  next. */
export function decideApplyAction(
  proposal: ProposalInput,
  policy: ApplyPolicy = DEFAULT_APPLY_POLICY,
): ApplyDecision {
  const conf = clamp01(proposal.confidence);

  if (policy.require_canary_pass && proposal.canary_test_passed === false) {
    return {
      action: 'reject',
      rationale: 'canary re-test FAILED on the proposed config; not surfacing for review',
    };
  }

  if (conf < policy.reviewer_confidence_threshold) {
    return {
      action: 'reject',
      rationale: `confidence ${formatPct(conf)} is below the reviewer threshold ${formatPct(policy.reviewer_confidence_threshold)}`,
    };
  }

  if (proposal.canary_test_passed === null) {
    // Canary not yet tested — never auto-apply, even when confident.
    return {
      action: 'queue_for_review',
      rationale: 'canary re-test not yet run; queued for review',
    };
  }

  if (!policy.autoapply_enabled) {
    return {
      action: 'queue_for_review',
      rationale: 'RESEARCH_SELF_HEAL_AUTOAPPLY flag is OFF; queued for review',
    };
  }

  if (conf < policy.autoapply_confidence_threshold) {
    return {
      action: 'queue_for_review',
      rationale: `confidence ${formatPct(conf)} is below the auto-apply threshold ${formatPct(policy.autoapply_confidence_threshold)}`,
    };
  }

  return {
    action: 'auto_apply',
    rationale: `flag on + canary passed + confidence ${formatPct(conf)} ≥ ${formatPct(policy.autoapply_confidence_threshold)}`,
  };
}

// ── State-transition helpers ─────────────────────────────────────

/** Subset of `research_site_adapters` the apply/rollback helpers
 *  read or write. */
export interface AdapterRowSnapshot {
  config: Record<string, unknown>;
  field_map: Record<string, unknown>;
}

/** Subset of `research_adapter_change_proposals` rows these helpers
 *  produce / consume. */
export interface ProposalSnapshot {
  prior_config: Record<string, unknown>;
  prior_field_map: Record<string, unknown>;
  proposed_config: Record<string, unknown>;
  proposed_field_map: Record<string, unknown>;
}

/** Pure. Produce the next-state adapter snapshot after applying a
 *  proposal. The caller writes this back to the
 *  research_site_adapters row + flips the proposal status to
 *  `applied`. The proposal's prior_config + prior_field_map are
 *  captured BEFORE the swap so rollback is trivial. */
export function applyProposalToAdapter(
  current: AdapterRowSnapshot,
  proposal: ProposalSnapshot,
): { next: AdapterRowSnapshot; snapshot_for_rollback: AdapterRowSnapshot } {
  const next: AdapterRowSnapshot = {
    config: deepClone(proposal.proposed_config),
    field_map: deepClone(proposal.proposed_field_map),
  };
  const snapshot_for_rollback: AdapterRowSnapshot = {
    config: deepClone(current.config),
    field_map: deepClone(current.field_map),
  };
  return { next, snapshot_for_rollback };
}

/** Pure. Roll an applied proposal back to its captured prior state.
 *  The caller writes the result to research_site_adapters + flips
 *  the proposal status to `superseded`. */
export function rollbackProposal(proposal: ProposalSnapshot): AdapterRowSnapshot {
  return {
    config: deepClone(proposal.prior_config),
    field_map: deepClone(proposal.prior_field_map),
  };
}

// ── Internals ────────────────────────────────────────────────────

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function formatPct(n: number): string {
  return `${Math.round(clamp01(n) * 100)}%`;
}

function deepClone<T>(v: T): T {
  // structuredClone would be cleaner but isn't universally on the
  // server tooling we run vitest against; JSON round-trip is fine
  // for the jsonb-shaped snapshots this module handles.
  return JSON.parse(JSON.stringify(v)) as T;
}
