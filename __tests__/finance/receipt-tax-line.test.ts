// __tests__/finance/receipt-tax-line.test.ts
//
// F7c — the tax line a bookkeeper actually reads, verified without a receipt to expand.
//
// F3b and F7a shipped and were recorded in the plan as **unverified**: the summary renders only
// inside an expanded receipt row, and no environment available to this program has receipt data. That
// was the honest thing to write at the time, but it left a real gap — and the gap was self-inflicted,
// because the logic was an arrow function invoked inside JSX in the middle of a 700-line client page.
// Nothing could call it.
//
// `receiptTaxLine()` is the same three lines, moved somewhere a fixture can reach. No data was
// invented to satisfy a check: a fixture row is not a claim about production, and every assertion
// below is about the mapping and the wording, both of which are properties of the code.
//
// ── WHAT THESE TESTS PROTECT THAT `taxSummaryFor`'s OWN TESTS CANNOT ────────────────────────────
//
// Those prove the sentences. Nothing proved the PAGE hands over the right three fields. Passing
// `category_source` where `category` belongs, or dropping `promoted_to_equipment_id`, yields a wrong
// verdict that still reads perfectly — the exact failure this summary exists to prevent, speaking in
// the summary's own voice.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { receiptTaxLine, taxSummaryFor, explainBasis } from '@/lib/finance/tax-summary';

describe('F7c — receiptTaxLine', () => {
  it('returns the verdict and the rule behind it, in that order', () => {
    const line = receiptTaxLine({ tax_deductible_flag: 'full', category: 'fuel' });
    const [verdict, why] = line.split('\n');
    expect(verdict.length).toBeGreaterThan(0);
    expect(why, 'the explanation must be labelled so it reads as a rule, not more verdict')
      .toMatch(/^Decided by:/);
  });

  it('agrees with taxSummaryFor rather than re-deriving anything', () => {
    // If this ever diverges, the page is showing a sentence the finance module did not produce.
    const row = { tax_deductible_flag: 'partial_50', category: 'meals' };
    const t = taxSummaryFor({ promotedToAsset: false, deductibleFlag: 'partial_50', category: 'meals' });
    expect(receiptTaxLine(row)).toBe(`${t.summary}\n${explainBasis(t.basis)}`);
  });

  describe('the field mapping — the part no other test covers', () => {
    it('reads promoted_to_equipment_id as "this is a capital asset"', () => {
      // Presence, not truthiness of a boolean column: the row carries an id or null. A capital asset
      // is depreciated rather than deducted, and it is excluded from the Schedule C total so the
      // dollars cannot land twice — getting this wrong double-counts real money.
      const asset = receiptTaxLine({
        promoted_to_equipment_id: 'eq-1',
        tax_deductible_flag: 'full',
        category: 'equipment',
      });
      expect(asset).toMatch(/capital asset/i);

      const notAsset = receiptTaxLine({
        promoted_to_equipment_id: null,
        tax_deductible_flag: 'full',
        category: 'equipment',
      });
      expect(notAsset).not.toMatch(/capital asset/i);
    });

    it('reads tax_deductible_flag, so an override on the row changes the sentence', () => {
      const full = receiptTaxLine({ tax_deductible_flag: 'full', category: 'supplies' });
      const none = receiptTaxLine({ tax_deductible_flag: 'none', category: 'supplies' });
      expect(full).not.toBe(none);
    });

    it('reads category', () => {
      const meals = receiptTaxLine({ tax_deductible_flag: null, category: 'meals' });
      const fuel = receiptTaxLine({ tax_deductible_flag: null, category: 'fuel' });
      expect(meals).not.toBe(fuel);
    });
  });

  describe('a row with nothing filled in', () => {
    it('still produces a labelled two-line answer rather than blank or a crash', () => {
      // The state every receipt is in between upload and extraction. An empty panel would read as
      // "no tax consequence", which is a claim; the summary must answer what it can.
      const line = receiptTaxLine({});
      expect(line.split('\n')).toHaveLength(2);
      expect(line.split('\n')[1]).toMatch(/^Decided by:/);
    });

    it('does not assume company money when no card is known', () => {
      // Card role arrives with seed 572. Until then the summary answers what it can rather than
      // asserting whose money it was — the assumption would be invisible and wrong about half the
      // time on a business that also spends from personal cards.
      const line = receiptTaxLine({ tax_deductible_flag: 'full', category: 'fuel' });
      expect(line).not.toMatch(/company card|our card/i);
    });
  });

  it('the page renders this function rather than its own copy', () => {
    // The reason it was extracted. An inline IIFE here is what made F3b/F7a unverifiable, and a
    // second copy in the page would drift from the one under test above.
    const page = readFileSync(
      join(__dirname, '..', '..', 'app', 'admin', 'receipts', 'page.tsx'),
      'utf8',
    );
    expect(page).toContain('receiptTaxLine(row)');
    expect(page, 'the page grew its own copy of the summary again').not.toMatch(/taxSummaryFor\(/);
  });
});

