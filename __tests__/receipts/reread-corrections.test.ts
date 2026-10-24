// __tests__/receipts/reread-corrections.test.ts — a closer reading corrects the old reader's values,
// and never a person's (2026-10-07).
import { describe, it, expect } from 'vitest';
import { planCorrections, humanEditedFields } from '@/lib/receipts/reread-corrections';

const taco = { vendor_name: 'Taco Bell', subtotal_cents: 2898, tax_cents: 238, total_cents: 3094, transaction_at: '2026-09-30T22:52:00Z' };

describe('correcting a receipt the old reader got wrong', () => {
  it('a confident re-read fixes the AI-set subtotal and tax, and records the change', () => {
    const p = planCorrections({ current: taco, read: { ...taco, subtotal_cents: 2858, tax_cents: 236 }, readStatus: 'agreed', declaredBySubmitter: false, humanEdited: new Set() });
    expect(p.set).toEqual({ subtotal_cents: 2858, tax_cents: 236 });
    expect(p.corrections.map((c) => c.field)).toEqual(['subtotal_cents', 'tax_cents']);
  });
  it('an unconfirmed re-read only fills blanks', () => {
    const p = planCorrections({ current: { ...taco, payment_last4: null }, read: { ...taco, subtotal_cents: 2858, payment_last4: '5054' }, readStatus: 'needs_review', declaredBySubmitter: false, humanEdited: new Set() });
    expect(p.set).toEqual({ payment_last4: '5054' });
  });
  it('never replaces what a person edited — it is not even a conflict unless it is the total or date', () => {
    const p = planCorrections({ current: { ...taco, vendor_name: 'Taco Bell Belton' }, read: { ...taco, vendor_name: 'Taco Bell' }, readStatus: 'agreed', declaredBySubmitter: false, humanEdited: new Set(['vendor_name']) });
    expect(p.set).toEqual({});
    expect(p.conflicts).toEqual([]);
  });
  it('a total the submitter typed that the paper contradicts is flagged, not overwritten', () => {
    const p = planCorrections({ current: { ...taco, total_cents: 3000 }, read: taco, readStatus: 'verified', declaredBySubmitter: true, humanEdited: new Set() });
    expect(p.set.total_cents).toBeUndefined();
    expect(p.conflicts[0].message).toMatch(/reads a total of \$30\.94, but \$30\.00 was entered/);
  });
  it('reads which fields a person changed from the edit log', () => {
    const log = { '2026-08-17T14:45:12Z': { by: 'jacob', changed: { vendor_name: { from: 'a', to: 'b' }, transaction_at: { from: 'x', to: 'y' } } } };
    expect([...humanEditedFields(log)].sort()).toEqual(['transaction_at', 'vendor_name']);
    expect(humanEditedFields(null).size).toBe(0);
  });
});
