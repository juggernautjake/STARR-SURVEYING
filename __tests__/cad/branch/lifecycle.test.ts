// __tests__/cad/branch/lifecycle.test.ts
//
// cad-branching — the branch state machine + review helpers.

import { describe, it, expect } from 'vitest';
import {
  nextBranchStatus,
  parentDriftedSinceFork,
  BRANCH_ACTION_ROLE,
  BRANCH_STATUS_LABELS,
  type BranchStatus,
  type BranchAction,
} from '@/lib/cad/branch/types';

describe('nextBranchStatus — valid transitions', () => {
  it('submit: draft/rejected → in_review', () => {
    expect(nextBranchStatus('draft', 'submit')).toBe('in_review');
    expect(nextBranchStatus('rejected', 'submit')).toBe('in_review');
  });
  it('withdraw: in_review → draft', () => {
    expect(nextBranchStatus('in_review', 'withdraw')).toBe('draft');
  });
  it('accept: in_review → accepted', () => {
    expect(nextBranchStatus('in_review', 'accept')).toBe('accepted');
  });
  it('reject: in_review → rejected', () => {
    expect(nextBranchStatus('in_review', 'reject')).toBe('rejected');
  });
});

describe('nextBranchStatus — invalid transitions return null', () => {
  const cases: Array<[BranchStatus, BranchAction]> = [
    ['accepted', 'submit'],
    ['accepted', 'accept'],
    ['draft', 'accept'],
    ['draft', 'reject'],
    ['draft', 'withdraw'],
    ['in_review', 'submit'],
    ['rejected', 'accept'],
  ];
  it.each(cases)('%s + %s → null', (status, action) => {
    expect(nextBranchStatus(status, action)).toBeNull();
  });
});

describe('BRANCH_ACTION_ROLE — who may do what', () => {
  it('author submits/withdraws; owner accepts/rejects', () => {
    expect(BRANCH_ACTION_ROLE.submit).toBe('author');
    expect(BRANCH_ACTION_ROLE.withdraw).toBe('author');
    expect(BRANCH_ACTION_ROLE.accept).toBe('owner');
    expect(BRANCH_ACTION_ROLE.reject).toBe('owner');
  });
});

describe('parentDriftedSinceFork', () => {
  it('true when the parent was edited after the fork', () => {
    expect(parentDriftedSinceFork('2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z')).toBe(true);
  });
  it('false when the parent is unchanged or older', () => {
    expect(parentDriftedSinceFork('2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z')).toBe(false);
    expect(parentDriftedSinceFork('2026-01-02T00:00:00Z', '2026-01-01T00:00:00Z')).toBe(false);
  });
  it('false on missing / unparseable stamps', () => {
    expect(parentDriftedSinceFork(null, '2026-01-02T00:00:00Z')).toBe(false);
    expect(parentDriftedSinceFork('2026-01-01T00:00:00Z', undefined)).toBe(false);
    expect(parentDriftedSinceFork('nonsense', 'also-bad')).toBe(false);
  });
});

describe('status labels are exhaustive', () => {
  it('covers every status', () => {
    (['draft', 'in_review', 'accepted', 'rejected'] as BranchStatus[]).forEach((s) => {
      expect(BRANCH_STATUS_LABELS[s]).toBeTruthy();
    });
  });
});
