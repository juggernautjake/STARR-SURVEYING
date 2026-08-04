// __tests__/payroll/pay-decision.test.ts
//
// The approver's decision. The worked example throughout is the owner's own: an 8-hour day split
// 2 hours drafting / 6 hours field work, for the firm's party chief on an agreed $25.

import { describe, it, expect } from 'vitest';
import { buildPayDecision, defaultDecisionBlocks, describeDecision, type PayBlock } from '@/lib/payroll/pay-decision';
import type { ResolvedRate } from '@/lib/payroll/resolve-rate';

const block = (over: Partial<PayBlock> = {}): PayBlock => ({
  hours: 8,
  work_type: 'field_work',
  rate: 30.5,
  source: 'activity',
  label: 'Field work',
  explanation: '$30.50/hr — $20.00 field work + $10.00 party chief + $0.50 seniority.',
  ...over,
});

describe('buildPayDecision — the owner’s worked example', () => {
  it('splits a day across two rates and totals from the parts', () => {
    const result = buildPayDecision({
      submittedHours: 8,
      blocks: [
        block({ hours: 2, work_type: 'drawing', rate: 33.5, label: 'Drafting' }),
        block({ hours: 6, rate: 30.5 }),
      ],
      payoutNote: 'Two hours on the Smith plat, rest in the field.',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision.totalPay).toBe(250);      // 67.00 + 183.00
    expect(result.decision.totalHours).toBe(8);
    expect(result.decision.blendedRate).toBe(31.25);
    expect(result.decision.payoutNote).toBe('Two hours on the Smith plat, rest in the field.');
  });

  it('pays the whole day at the agreed base instead, when that is what the boss wants', () => {
    const result = buildPayDecision({
      submittedHours: 8,
      blocks: [block({ rate: 25, work_type: null, source: 'base', label: 'Base pay' })],
    });
    expect(result.ok && result.decision.totalPay).toBe(200);
  });

  it('pays a unique amount the boss types', () => {
    const result = buildPayDecision({
      submittedHours: 8,
      blocks: [block({ rate: 28, source: 'manual', label: 'Agreed for the day' })],
    });
    expect(result.ok && result.decision.totalPay).toBe(224);
  });

  it('holds part of a day undecided without paying it as zero', () => {
    const result = buildPayDecision({
      submittedHours: 8,
      blocks: [
        block({ hours: 6 }),
        block({ hours: 2, rate: null, source: 'unset', label: 'Still checking' }),
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision.totalPay).toBe(183);
    expect(result.decision.undecidedHours).toBe(2);
    // Blended over PAID hours. Dividing by 8 would understate what the firm owes and make an
    // undecided block look like a discount already granted.
    expect(result.decision.blendedRate).toBe(30.5);
  });
});

describe('buildPayDecision — what it refuses', () => {
  it('refuses a split that does not add up, and names both numbers', () => {
    const result = buildPayDecision({
      submittedHours: 8,
      blocks: [block({ hours: 2, work_type: 'drawing', rate: 33.5 }), block({ hours: 4 })],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('6');
    expect(result.error).toContain('8');
  });

  it('tolerates quarter-hour float noise rather than failing on it', () => {
    // 0.25-hour increments do not sum exactly in binary; refusing them would make the common case
    // impossible to save.
    const result = buildPayDecision({
      submittedHours: 7.75,
      blocks: [block({ hours: 0.25 }), block({ hours: 2.5 }), block({ hours: 5 })],
    });
    expect(result.ok).toBe(true);
  });

  it('refuses a negative rate', () => {
    const result = buildPayDecision({ submittedHours: 8, blocks: [block({ rate: -5 })] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('cannot be negative');
  });

  it('refuses an implausible rate as the typo it almost certainly is', () => {
    const result = buildPayDecision({ submittedHours: 8, blocks: [block({ rate: 3050 })] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('typo');
  });

  it('refuses an empty decision rather than writing a $0 payout that looks deliberate', () => {
    const result = buildPayDecision({ submittedHours: 8, blocks: [] });
    expect(result.ok).toBe(false);
  });

  it('refuses a block with no hours on it', () => {
    const result = buildPayDecision({ submittedHours: 8, blocks: [block({ hours: 8 }), block({ hours: 0 })] });
    expect(result.ok).toBe(false);
  });
});

describe('buildPayDecision — what it allows, because the owner is the authority', () => {
  it('allows $0.00 for a block somebody typed', () => {
    const result = buildPayDecision({
      submittedHours: 8,
      blocks: [block({ hours: 6 }), block({ hours: 2, rate: 0, source: 'manual', label: 'Not billable' })],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision.totalPay).toBe(183);
    // A typed zero is a decision, not an absence — it must not land in `undecidedHours`.
    expect(result.decision.undecidedHours).toBe(0);
  });

  it('allows a rate well outside the grade’s band', () => {
    // The band warns at the point of entry (`resolvePayRate.outOfBand`); it is not a gate here.
    expect(buildPayDecision({ submittedHours: 8, blocks: [block({ rate: 8 })] }).ok).toBe(true);
  });

  it('normalises a blank note to null instead of storing whitespace', () => {
    const result = buildPayDecision({ submittedHours: 8, blocks: [block()], payoutNote: '   ' });
    expect(result.ok && result.decision.payoutNote).toBeNull();
  });
});

describe('defaultDecisionBlocks', () => {
  it('opens on the rules’ own answer, so agreeing is one click', () => {
    const resolved: ResolvedRate = {
      rate: 30.5, source: 'activity', explanation: '$30.50/hr — …',
      breakdown: null, floorApplied: false, actingBonus: 0, outOfBand: null,
    };
    const blocks = defaultDecisionBlocks(8, resolved, 'Field work', 'field_work');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].rate).toBe(30.5);
    expect(buildPayDecision({ submittedHours: 8, blocks }).ok).toBe(true);
  });

  it('carries an unset rate through as unset rather than inventing one', () => {
    const resolved: ResolvedRate = {
      rate: null, source: 'unset', explanation: 'No rate set…',
      breakdown: null, floorApplied: false, actingBonus: 0, outOfBand: null,
    };
    expect(defaultDecisionBlocks(8, resolved, 'Hours', null)[0].rate).toBeNull();
  });
});

describe('describeDecision', () => {
  const decision = (totalPay: number) => ({
    blocks: [], totalHours: 8, totalPay, undecidedHours: 0, blendedRate: null, payoutNote: null,
  });

  it('says nothing when the decision matches the rules', () => {
    expect(describeDecision(decision(244), 244)).toBeNull();
  });

  it('states a shortfall plainly', () => {
    expect(describeDecision(decision(200), 244)).toContain('$44.00 less');
  });

  it('states an increase just as plainly', () => {
    expect(describeDecision(decision(280), 244)).toContain('$36.00 more');
  });

  it('explains a payout on hours that never had a rate', () => {
    expect(describeDecision(decision(200), null)).toContain('no rate had been set');
  });
});
