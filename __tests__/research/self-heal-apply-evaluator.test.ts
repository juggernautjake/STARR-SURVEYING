import { describe, it, expect } from 'vitest';
import { DEFAULT_APPLY_POLICY } from '@/lib/research/apply-policy';
import {
  evaluateProposalsForApply,
  tallyEvaluations,
} from '@/lib/research/self-heal-apply-evaluator';

const fixedNow = new Date('2026-06-22T12:00:00Z');

describe('evaluateProposalsForApply', () => {
  it('drops slice-3 confidence=0 proposals (human triage only)', () => {
    const out = evaluateProposalsForApply([
      { id: 'p1', confidence: 0, canary_test_passed: null },
      { id: 'p2', confidence: 0, canary_test_passed: false },
    ], DEFAULT_APPLY_POLICY, fixedNow);
    expect(out).toHaveLength(0);
  });

  it('scores positive-confidence proposals via apply-policy', () => {
    const out = evaluateProposalsForApply([
      { id: 'low',   confidence: 0.3, canary_test_passed: true },
      { id: 'queue', confidence: 0.7, canary_test_passed: true },
      { id: 'high',  confidence: 0.95, canary_test_passed: true },
    ], DEFAULT_APPLY_POLICY, fixedNow);
    expect(out.find((e) => e.id === 'low')?.decision.action).toBe('reject');
    expect(out.find((e) => e.id === 'queue')?.decision.action).toBe('queue_for_review');
    // high-confidence + canary pass: still queued because the
    // default policy has autoapply_enabled=false.
    expect(out.find((e) => e.id === 'high')?.decision.action).toBe('queue_for_review');
  });

  it('auto-applies high-confidence + canary-pass when autoapply flag is ON', () => {
    const out = evaluateProposalsForApply([
      { id: 'a', confidence: 0.95, canary_test_passed: true },
    ], { ...DEFAULT_APPLY_POLICY, autoapply_enabled: true }, fixedNow);
    expect(out[0].decision.action).toBe('auto_apply');
  });

  it('rejects canary-failed proposals regardless of confidence', () => {
    const out = evaluateProposalsForApply([
      { id: 'a', confidence: 0.99, canary_test_passed: false },
    ], { ...DEFAULT_APPLY_POLICY, autoapply_enabled: true }, fixedNow);
    expect(out[0].decision.action).toBe('reject');
  });

  it('stamps decided_at on every result', () => {
    const out = evaluateProposalsForApply([
      { id: 'a', confidence: 0.8, canary_test_passed: true },
    ], DEFAULT_APPLY_POLICY, fixedNow);
    expect(out[0].decided_at).toBe('2026-06-22T12:00:00.000Z');
  });
});

describe('tallyEvaluations', () => {
  it('counts decisions + flags skipped low-confidence rows', () => {
    const totalProposals = 5;
    const scored = [
      { id: 'a', decision: { action: 'auto_apply' as const, rationale: '' }, decided_at: '' },
      { id: 'b', decision: { action: 'queue_for_review' as const, rationale: '' }, decided_at: '' },
      { id: 'c', decision: { action: 'queue_for_review' as const, rationale: '' }, decided_at: '' },
      { id: 'd', decision: { action: 'reject' as const, rationale: '' }, decided_at: '' },
    ];
    const t = tallyEvaluations(scored, totalProposals);
    expect(t.auto_apply).toBe(1);
    expect(t.queue_for_review).toBe(2);
    expect(t.reject).toBe(1);
    expect(t.skipped_low_confidence).toBe(1);
  });

  it('clamps skipped_low_confidence to 0 when scored ≥ total', () => {
    const t = tallyEvaluations([
      { id: 'a', decision: { action: 'auto_apply' as const, rationale: '' }, decided_at: '' },
      { id: 'b', decision: { action: 'reject' as const, rationale: '' }, decided_at: '' },
    ], 1);
    expect(t.skipped_low_confidence).toBe(0);
  });
});
