// FINANCE_TAX_AND_INTAKE Slice F3 — one line saying what a row means at tax time.
//
// Every input is already known — category, tax_deductible_flag, card role (F1), recovery state (F2),
// capital-asset promotion — so this is a function of fields, not a question for a model. An
// AI-written summary could disagree with the fields it summarises, and a plausible sentence is
// exactly what stops someone checking.
//
// What these tests really defend is the ORDER OF PRECEDENCE. Several facts are true of the same row
// and they do not carry equal weight; getting the order wrong files a receipt under a rule that
// never applied to it.

import { describe, it, expect } from 'vitest';
import { taxSummaryFor, type TaxSummaryInput } from '@/lib/finance/tax-summary';

const company = { role: 'COMPANY' as const, holderName: null, label: 'Company Amex' };
const dadPersonal = { role: 'OWNER_PERSONAL' as const, holderName: 'Dad', label: "Dad's Chase" };
const clientCard = { role: 'CLIENT' as const, holderName: 'H. Meyer', label: "Customer's card" };

const input = (over: Partial<TaxSummaryInput> = {}): TaxSummaryInput => ({
  card: company, cardConfirmed: true, deductibleFlag: 'full', ...over,
});

describe('whose money it was outranks everything else', () => {
  it("does not call a client's purchase deductible, however the category reads", () => {
    // Both facts are true of the row. The card wins: the category of a purchase we did not pay for
    // is irrelevant, and this is the ordering mistake that files someone else's charge as ours.
    const s = taxSummaryFor(input({ card: clientCard, deductibleFlag: 'full', category: 'Field supplies' }));
    expect(s.summary).toMatch(/not our transaction/i);
    expect(s.summary).not.toMatch(/deductible business expense/i);
    expect(s.basis).toBe('card-role');
  });

  it('reports a personal card as money owed, not as an expense', () => {
    const s = taxSummaryFor(input({ card: dadPersonal, deductibleFlag: 'full' }));
    expect(s.summary).toMatch(/reimbursement owed to Dad/i);
    expect(s.summary).not.toMatch(/^Deductible/);
    expect(s.basis).toBe('card-role');
  });

  it('refuses to file on an unconfirmed card match', () => {
    // A last4 match is a suggestion. Filing on one is the exact mistake F1's matcher refuses to make,
    // and it would be undone here if this branch did not exist.
    const s = taxSummaryFor(input({ card: company, cardConfirmed: false }));
    expect(s.needsAttention).toBe(true);
    expect(s.basis).toBe('card-unconfirmed');
    expect(s.summary).toMatch(/not confirmed/i);
  });

  it('stops at an unknown cardholder rather than falling through to the category', () => {
    const s = taxSummaryFor(input({
      card: { role: 'UNKNOWN', holderName: null, label: null }, deductibleFlag: 'full',
    }));
    expect(s.needsAttention).toBe(true);
    expect(s.summary).not.toMatch(/deductible/i);
  });

  it('lets a company card fall through to the remaining questions', () => {
    // It is our money, so the other rules now apply. Without this the card role would swallow
    // every row.
    const s = taxSummaryFor(input({ card: company, deductibleFlag: 'partial_50' }));
    expect(s.basis).toBe('deductible-flag');
  });
});

describe('a capital asset is not a current-year deduction', () => {
  it('says so, and outranks the deductible flag', () => {
    const s = taxSummaryFor(input({ promotedToAsset: true, deductibleFlag: 'full' }));
    expect(s.summary).toMatch(/capital asset/i);
    expect(s.summary).toMatch(/not a current-year deduction/i);
    expect(s.basis).toBe('capital-asset');
  });
});

describe('recovered costs', () => {
  it('reports a fully recovered pass-through as no net gain', () => {
    const s = taxSummaryFor(input({
      recovery: { costCents: 45000, links: [{ invoiceId: 'i', invoiceNumber: 'INV-1042', amountCents: 45000 }] },
    }));
    expect(s.summary).toMatch(/no net gain/i);
    expect(s.summary).toMatch(/INV-1042/);
    expect(s.basis).toBe('recovery');
  });

  it('does not call a partial recovery a wash', () => {
    const s = taxSummaryFor(input({
      recovery: { costCents: 45000, links: [{ invoiceId: 'i', amountCents: 40000 }] },
    }));
    expect(s.summary).toMatch(/under-recovered/i);
    expect(s.needsAttention).toBe(true);
  });

  it('still treats an UNBILLED pass-through as a deductible expense today', () => {
    // Deliberate fall-through. A cost we have not yet billed on is still a business expense; it is
    // flagged for billing elsewhere, not withheld from the books.
    const s = taxSummaryFor(input({
      recovery: { costCents: 45000, links: [] }, deductibleFlag: 'full', category: 'Sanitarian fee',
    }));
    expect(s.basis).toBe('deductible-flag');
    expect(s.summary).toMatch(/deductible business expense/i);
  });
});

describe('the deductible flag, once the questions above are settled', () => {
  it('names the 50% limit explicitly', () => {
    // "Partial" without the number is the kind of thing that gets re-derived wrongly at filing time.
    const s = taxSummaryFor(input({ deductibleFlag: 'partial_50', category: 'Client lunch' }));
    expect(s.summary).toMatch(/50%/);
    expect(s.summary).toMatch(/Client lunch/);
  });

  it('handles none and review', () => {
    expect(taxSummaryFor(input({ deductibleFlag: 'none' })).summary).toMatch(/not deductible/i);
    const review = taxSummaryFor(input({ deductibleFlag: 'review' }));
    expect(review.needsAttention).toBe(true);
  });

  it('says a row is uncategorised rather than guessing a treatment', () => {
    const s = taxSummaryFor(input({ deductibleFlag: null, category: null }));
    expect(s.basis).toBe('unclassified');
    expect(s.needsAttention).toBe(true);
    expect(s.summary).toMatch(/not categorised/i);
  });
});

describe('the whole-file invariant', () => {
  it('always returns a non-empty line and a basis', () => {
    // Every path must produce something a person can read; an empty cell in a tax list is the one
    // outcome that teaches people to ignore the column.
    const cases: TaxSummaryInput[] = [
      {}, input(), input({ card: null }), input({ card: clientCard }),
      input({ promotedToAsset: true }), input({ deductibleFlag: 'review' }),
      input({ recovery: { costCents: 100, links: [] } }),
      input({ card: dadPersonal }),
    ];
    for (const c of cases) {
      const s = taxSummaryFor(c);
      expect(s.summary.trim().length, JSON.stringify(c)).toBeGreaterThan(8);
      expect(s.basis, JSON.stringify(c)).toBeTruthy();
    }
  });
});

// ── F7a: the screen explains its own verdict ────────────────────────────────────────────────────
//
// The owner asked for the finance tools to explain themselves. The most useful explanation is not a
// manual nobody opens — it is which rule fired on THIS row, shown next to the row. `basis` was
// already computed and thrown away at every call site.

describe('explainBasis', () => {
  it('covers every basis a summary can return', async () => {
    // Whole-set, so a basis added later cannot ship without an explanation and fall back to a
    // generic sentence that explains nothing.
    const { explainBasis } = await import('@/lib/finance/tax-summary');
    const cases: TaxSummaryInput[] = [
      input({ card: company, cardConfirmed: false }),
      input({ card: clientCard }),
      input({ promotedToAsset: true }),
      input({ recovery: { costCents: 100, links: [{ invoiceId: 'i', amountCents: 100 }] } }),
      input({ deductibleFlag: 'full' }),
      input({ deductibleFlag: null, category: null }),
    ];
    const seen = new Set<string>();
    for (const c of cases) {
      const t = taxSummaryFor(c);
      seen.add(t.basis);
      const why = explainBasis(t.basis);
      expect(why.length, t.basis).toBeGreaterThan(20);
      expect(why, t.basis).toMatch(/^Decided by:/);
    }
    expect(seen.size).toBe(6);
  });

  it('explains the precedence that is genuinely surprising', async () => {
    // A "fully deductible" category can correctly read "not our transaction". Without the reason,
    // the reader's only options are to trust the sentence or go and read the source.
    const { explainBasis } = await import('@/lib/finance/tax-summary');
    const t = taxSummaryFor(input({ card: clientCard, deductibleFlag: 'full' }));
    expect(explainBasis(t.basis)).toMatch(/outranks the category/i);
  });

  it('says a suggestion is a suggestion', async () => {
    const { explainBasis } = await import('@/lib/finance/tax-summary');
    const t = taxSummaryFor(input({ card: company, cardConfirmed: false }));
    expect(explainBasis(t.basis)).toMatch(/four digits are not an identifier/i);
  });
});
