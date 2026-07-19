// __tests__/dnd/campaign-approval.test.ts — DM approval + the combined system-scope × approval playability gate.
import { describe, it, expect } from 'vitest';
import {
  normalizeApproval, isApproved, awaitingReview, approvalLabel, campaignPlayability,
} from '@/lib/dnd/campaign-approval';
import type { SheetSlot } from '@/lib/dnd/system-variants';

const slot = (system: string): SheetSlot => ({ slotId: `s-${system}`, system, kind: 'vanilla', name: system, active: true });
const dnd = [slot('dnd5e-2024')];

describe('approval model', () => {
  it('defaults unknown/missing status to pending (never silently playable)', () => {
    expect(normalizeApproval(null).status).toBe('pending');
    expect(normalizeApproval({ status: 'bogus' }).status).toBe('pending');
    expect(normalizeApproval({ status: 'approved', reviewedByUserId: 'a1' })).toMatchObject({ status: 'approved', reviewedByUserId: 'a1' });
    expect(normalizeApproval({ status: 'rejected', reason: '  too strong  ' }).reason).toBe('too strong');
  });

  it('predicates + labels', () => {
    expect(isApproved({ status: 'approved' })).toBe(true);
    expect(awaitingReview(null)).toBe(true);
    expect(awaitingReview({ status: 'approved' })).toBe(false);
    expect(approvalLabel({ status: 'rejected' })).toMatch(/changes/i);
    expect(approvalLabel(null)).toMatch(/awaiting/i);
  });
});

describe('campaignPlayability (system scope × approval)', () => {
  it('playable only with a matching-system sheet AND approval', () => {
    expect(campaignPlayability(dnd, 'dnd5e-2024', { status: 'approved' })).toEqual({ playable: true, reason: null });
  });

  it('blocked with a clear reason when there is no matching-system sheet', () => {
    const r = campaignPlayability([slot('pathfinder2e')], 'dnd5e-2024', { status: 'approved' });
    expect(r.playable).toBe(false);
    expect(r.reason).toMatch(/no dnd5e-2024 sheet/i);
  });

  it('blocked while awaiting approval', () => {
    const r = campaignPlayability(dnd, 'dnd5e-2024', null);
    expect(r.playable).toBe(false);
    expect(r.reason).toMatch(/awaiting/i);
  });

  it('surfaces the DM’s rejection reason to the player', () => {
    const r = campaignPlayability(dnd, 'dnd5e-2024', { status: 'rejected', reason: 'drop the +5 sword' });
    expect(r.playable).toBe(false);
    expect(r.reason).toMatch(/requested changes: drop the \+5 sword/i);
  });
});
