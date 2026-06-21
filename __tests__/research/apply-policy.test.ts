// __tests__/research/apply-policy.test.ts
//
// §9.5 + §9.9 of
// docs/planning/completed/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md.
//
// Locks the safe-by-default behavior so a future "let's auto-apply
// everything" change has to land deliberately AND update these
// assertions.

import { describe, it, expect } from 'vitest';
import {
  applyProposalToAdapter,
  decideApplyAction,
  DEFAULT_APPLY_POLICY,
  rollbackProposal,
  type ApplyPolicy,
} from '@/lib/research/apply-policy';

const policyOn: ApplyPolicy = {
  ...DEFAULT_APPLY_POLICY,
  autoapply_enabled: true,
};

describe('decideApplyAction — default policy is safe', () => {
  it('default policy never auto-applies, even on a perfect proposal', () => {
    const d = decideApplyAction(
      { confidence: 1.0, canary_test_passed: true },
      DEFAULT_APPLY_POLICY,
    );
    expect(d.action).toBe('queue_for_review');
    expect(d.rationale).toMatch(/AUTOAPPLY flag is OFF/);
  });

  it('default policy rejects canary-failed proposals (require_canary_pass=true)', () => {
    const d = decideApplyAction(
      { confidence: 0.99, canary_test_passed: false },
      DEFAULT_APPLY_POLICY,
    );
    expect(d.action).toBe('reject');
    expect(d.rationale).toMatch(/canary re-test FAILED/);
  });

  it('default policy rejects low-confidence proposals before review', () => {
    const d = decideApplyAction(
      { confidence: 0.3, canary_test_passed: true },
      DEFAULT_APPLY_POLICY,
    );
    expect(d.action).toBe('reject');
    expect(d.rationale).toMatch(/below the reviewer threshold/);
  });

  it('default policy queues canary-pending proposals for review', () => {
    const d = decideApplyAction(
      { confidence: 0.95, canary_test_passed: null },
      DEFAULT_APPLY_POLICY,
    );
    expect(d.action).toBe('queue_for_review');
    expect(d.rationale).toMatch(/canary re-test not yet run/);
  });
});

describe('decideApplyAction — flag-on policy', () => {
  it('auto-applies when confident + canary passed + flag on', () => {
    const d = decideApplyAction(
      { confidence: 0.95, canary_test_passed: true },
      policyOn,
    );
    expect(d.action).toBe('auto_apply');
  });

  it('queues for review when below auto-apply threshold even with the flag on', () => {
    const d = decideApplyAction(
      { confidence: 0.75, canary_test_passed: true },
      policyOn,
    );
    expect(d.action).toBe('queue_for_review');
    expect(d.rationale).toMatch(/below the auto-apply threshold/);
  });

  it('NEVER auto-applies a canary-pending proposal even with the flag on', () => {
    const d = decideApplyAction(
      { confidence: 1, canary_test_passed: null },
      policyOn,
    );
    expect(d.action).toBe('queue_for_review');
  });

  it('NEVER auto-applies a canary-failed proposal even with the flag on', () => {
    const d = decideApplyAction(
      { confidence: 1, canary_test_passed: false },
      policyOn,
    );
    expect(d.action).toBe('reject');
  });
});

describe('decideApplyAction — manual-review override (require_canary_pass=false)', () => {
  const lenient: ApplyPolicy = {
    ...DEFAULT_APPLY_POLICY,
    require_canary_pass: false,
  };

  it('surfaces a canary-failed proposal to the reviewer when require_canary_pass=false', () => {
    const d = decideApplyAction(
      { confidence: 0.95, canary_test_passed: false },
      lenient,
    );
    expect(d.action).toBe('queue_for_review');
  });
});

describe('decideApplyAction — input sanitization', () => {
  it('clamps confidence outside [0,1] before deciding', () => {
    expect(
      decideApplyAction({ confidence: -0.5, canary_test_passed: true }, policyOn).action,
    ).toBe('reject');
    expect(
      decideApplyAction({ confidence: 1.5, canary_test_passed: true }, policyOn).action,
    ).toBe('auto_apply');
  });

  it('treats NaN confidence as 0 (rejection path)', () => {
    expect(
      decideApplyAction({ confidence: Number.NaN, canary_test_passed: true }, policyOn).action,
    ).toBe('reject');
  });
});

describe('applyProposalToAdapter', () => {
  const current = { config: { a: 1 }, field_map: { mappings: [] } };
  const proposal = {
    prior_config: { a: 1 },
    prior_field_map: { mappings: [] },
    proposed_config: { a: 2, b: 3 },
    proposed_field_map: { mappings: [{ from_path: 'x', to_path: 'y' }] },
  };

  it('returns the next adapter state matching the proposal', () => {
    const { next } = applyProposalToAdapter(current, proposal);
    expect(next.config).toEqual(proposal.proposed_config);
    expect(next.field_map).toEqual(proposal.proposed_field_map);
  });

  it('snapshots the current adapter state for rollback', () => {
    const { snapshot_for_rollback } = applyProposalToAdapter(current, proposal);
    expect(snapshot_for_rollback.config).toEqual(current.config);
    expect(snapshot_for_rollback.field_map).toEqual(current.field_map);
  });

  it('does not mutate the inputs', () => {
    const cBefore = JSON.parse(JSON.stringify(current));
    const pBefore = JSON.parse(JSON.stringify(proposal));
    applyProposalToAdapter(current, proposal);
    expect(current).toEqual(cBefore);
    expect(proposal).toEqual(pBefore);
  });
});

describe('rollbackProposal', () => {
  it('returns the prior state captured on the proposal', () => {
    const proposal = {
      prior_config: { a: 'before' },
      prior_field_map: { mappings: ['before-map'] },
      proposed_config: { a: 'after' },
      proposed_field_map: { mappings: ['after-map'] },
    };
    const rolled = rollbackProposal(proposal);
    expect(rolled.config).toEqual({ a: 'before' });
    expect(rolled.field_map).toEqual({ mappings: ['before-map'] });
  });

  it('returns deep clones so the caller can mutate freely', () => {
    const proposal = {
      prior_config: { nested: { x: 1 } },
      prior_field_map: {},
      proposed_config: {},
      proposed_field_map: {},
    };
    const rolled = rollbackProposal(proposal);
    (rolled.config.nested as { x: number }).x = 99;
    expect((proposal.prior_config.nested as { x: number }).x).toBe(1);
  });
});

describe('DEFAULT_APPLY_POLICY — locked safe-by-default values', () => {
  it('is review-required out of the box', () => {
    expect(DEFAULT_APPLY_POLICY.autoapply_enabled).toBe(false);
    expect(DEFAULT_APPLY_POLICY.require_canary_pass).toBe(true);
    expect(DEFAULT_APPLY_POLICY.autoapply_confidence_threshold).toBeGreaterThanOrEqual(0.85);
    expect(DEFAULT_APPLY_POLICY.reviewer_confidence_threshold).toBeGreaterThanOrEqual(0.4);
    expect(DEFAULT_APPLY_POLICY.reviewer_confidence_threshold).toBeLessThan(
      DEFAULT_APPLY_POLICY.autoapply_confidence_threshold,
    );
  });
});
