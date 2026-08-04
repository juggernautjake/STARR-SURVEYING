// FINANCE_TAX_AND_INTAKE Slice F2 — the pass-through case, without the lie.
//
// We pay a sanitarian, we bill the customer. The money moves twice and, when it works, nets to zero.
//
// The tempting model is a boolean — `is_pass_through` — and it is wrong in exactly the case that
// costs money: pay $450, bill $400, and the boolean says "nets to zero" while the job quietly lost
// $50. Over a year of small shortfalls that is a real number nobody ever sees, because every
// individual row looked like a wash. So recovery is arithmetic, never a flag.

import { describe, it, expect } from 'vitest';
import { computeRecovery, summarizeRecoveries, type CostRecovery } from '@/lib/finance/cost-recovery';

const cost = (costCents: number, links: CostRecovery['links'] = [], extra: Partial<CostRecovery> = {}): CostRecovery =>
  ({ costCents, links, ...extra });

describe('the case the boolean gets wrong', () => {
  it('does NOT call a partial recovery a no-net-gain event', () => {
    // Paid a sanitarian $450, billed $400. This is a $50 loss on the job, not a wash.
    const r = computeRecovery(cost(45000, [{ invoiceId: 'i1', invoiceNumber: 'INV-1042', amountCents: 40000 }]));
    expect(r.state).toBe('UNDER_RECOVERED');
    expect(r.isNoNetGain).toBe(false);
    expect(r.deltaCents).toBe(-5000);
    expect(r.needsAttention).toBe(true);
    expect(r.summary).toMatch(/absorbed \$50\.00/i);
  });

  it('calls an exact recovery no-net-gain, and only an exact one', () => {
    const r = computeRecovery(cost(45000, [{ invoiceId: 'i1', invoiceNumber: 'INV-1042', amountCents: 45000 }]));
    expect(r.state).toBe('NO_NET_GAIN');
    expect(r.isNoNetGain).toBe(true);
    expect(r.deltaCents).toBe(0);
    expect(r.needsAttention).toBe(false);
  });

  it('treats a single cent of difference as a difference', () => {
    // No tolerance band. A penny is small, but a rule that quietly absorbs pennies is a rule nobody
    // can tell from one that absorbs dollars.
    const r = computeRecovery(cost(45000, [{ invoiceId: 'i1', amountCents: 44999 }]));
    expect(r.state).toBe('UNDER_RECOVERED');
    expect(r.isNoNetGain).toBe(false);
  });

  it('calls over-billing margin, not a pass-through', () => {
    // Billing $500 for a $450 cost is $50 of income. Filing it as a wash understates income.
    const r = computeRecovery(cost(45000, [{ invoiceId: 'i1', amountCents: 50000 }]));
    expect(r.state).toBe('OVER_RECOVERED');
    expect(r.isNoNetGain).toBe(false);
    expect(r.deltaCents).toBe(5000);
    expect(r.summary).toMatch(/margin/i);
  });

  it('sets isNoNetGain for exactly one state', () => {
    // Whole-set property, so a state added later cannot quietly start counting as a wash.
    const cases: CostRecovery[] = [
      cost(45000, []),
      cost(45000, [{ invoiceId: 'i', amountCents: 45000 }]),
      cost(45000, [{ invoiceId: 'i', amountCents: 40000 }]),
      cost(45000, [{ invoiceId: 'i', amountCents: 50000 }]),
      cost(45000, [], { markedNotRecoverable: true }),
    ];
    expect(cases.filter((c) => computeRecovery(c).isNoNetGain)).toHaveLength(1);
  });
});

describe('costs that have not been billed on', () => {
  it('surfaces an unbilled cost as needing attention', () => {
    const r = computeRecovery(cost(45000));
    expect(r.state).toBe('NOT_RECOVERED');
    expect(r.recoveredCents).toBe(0);
    expect(r.deltaCents).toBe(-45000);
    expect(r.needsAttention).toBe(true);
    expect(r.summary).toMatch(/not yet billed/i);
  });

  it('treats a deliberately absorbed cost as a decision, not a gap', () => {
    const r = computeRecovery(cost(45000, [], { markedNotRecoverable: true }));
    expect(r.state).toBe('NOT_RECOVERABLE');
    expect(r.needsAttention).toBe(false);
    expect(r.isNoNetGain).toBe(false);
  });

  it('flags a cost marked absorbed that was nevertheless billed', () => {
    // A contradiction between what someone decided and what actually happened. Silently preferring
    // either one would hide it.
    const r = computeRecovery(cost(45000, [{ invoiceId: 'i1', amountCents: 45000 }], { markedNotRecoverable: true }));
    expect(r.state).toBe('NOT_RECOVERABLE');
    expect(r.needsAttention).toBe(true);
    expect(r.summary).toMatch(/resolve which is right/i);
  });
});

describe('links', () => {
  it('sums a cost split across several invoices', () => {
    // A shared plat fee across two lots is the ordinary case, not an edge case.
    const r = computeRecovery(cost(45000, [
      { invoiceId: 'i1', amountCents: 22500 },
      { invoiceId: 'i2', amountCents: 22500 },
    ]));
    expect(r.state).toBe('NO_NET_GAIN');
    expect(r.summary).toMatch(/across 2 invoices/);
  });

  it('excludes voided invoices from the total but keeps the record', () => {
    // An invoice raised and voided is a fact about what happened; dropping it would silently
    // re-open the cost with no trace of the attempt.
    const r = computeRecovery(cost(45000, [
      { invoiceId: 'i1', amountCents: 45000, voided: true },
      { invoiceId: 'i2', amountCents: 45000 },
    ]));
    expect(r.recoveredCents).toBe(45000);
    expect(r.state).toBe('NO_NET_GAIN');
  });

  it('re-opens a cost whose only recovery was voided', () => {
    const r = computeRecovery(cost(45000, [{ invoiceId: 'i1', amountCents: 45000, voided: true }]));
    expect(r.state).toBe('NOT_RECOVERED');
    expect(r.needsAttention).toBe(true);
  });
});

describe('rolling several up', () => {
  it('reports the shortfall separately from the net', () => {
    // The two answer different questions, and netting them is how a run of small unbilled costs
    // disappears behind margin earned elsewhere.
    const s = summarizeRecoveries([
      cost(45000, [{ invoiceId: 'a', amountCents: 40000 }]),   // −50.00
      cost(20000, [{ invoiceId: 'b', amountCents: 30000 }]),   // +100.00 margin
      cost(10000, []),                                          // −100.00 unbilled
    ]);
    expect(s.count).toBe(3);
    expect(s.costCents).toBe(75000);
    expect(s.recoveredCents).toBe(70000);
    expect(s.netCents).toBe(-5000);
    // Shortfall counts only the negatives: 5000 + 10000, never reduced by the 10000 of margin.
    expect(s.shortfallCents).toBe(15000);
    expect(s.needingAttention).toBe(2);
  });

  it('does not count a deliberately absorbed cost as a shortfall', () => {
    const s = summarizeRecoveries([cost(45000, [], { markedNotRecoverable: true })]);
    expect(s.shortfallCents).toBe(0);
    expect(s.needingAttention).toBe(0);
  });

  it('handles an empty period', () => {
    expect(summarizeRecoveries([])).toMatchObject({ count: 0, costCents: 0, netCents: 0, shortfallCents: 0 });
  });
});
