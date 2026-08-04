// FINANCE_TAX_AND_INTAKE Slice F3b — the tax summary is on screen, not just in a module.
//
// F1, F2 and F3 shipped as pure, well-tested modules with no callers, which is this repo's single
// most frequent defect: a correct module nothing reaches. This pins the first one to a surface a
// bookkeeper actually opens.
//
// Asserted against the raw source and in CALL shape, for the reason recorded in
// receipt-bulk-is-wired.test.ts: comment-stripping broke twice there in opposite directions and both
// times accused working code.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { taxSummaryFor } from '@/lib/finance/tax-summary';

const page = fs.readFileSync(path.join(process.cwd(), 'app/admin/receipts/page.tsx'), 'utf8');

describe('the receipts queue shows the tax consequence', () => {
  it('calls the shared summary rather than re-deriving one inline', () => {
    // A second implementation of "what does this mean at tax time" is how the two come to disagree,
    // and the screen is the copy people would believe.
    expect(page).toContain("from '@/lib/finance/tax-summary'");
    expect(page).toContain('taxSummaryFor({');
  });

  it('feeds it the fields that exist on the row today', () => {
    expect(page).toContain('promoted_to_equipment_id');
    expect(page).toContain('tax_deductible_flag');
  });
});

describe('what it says with only today\'s fields', () => {
  // The card role (F1) and recovery state (F2) arrive with seeds 572/573. Until then the summary
  // must answer the questions it CAN without assuming the answers to the others — in particular it
  // must not assume company money.
  it('reports a promoted receipt as a capital asset', () => {
    expect(taxSummaryFor({ promotedToAsset: true, deductibleFlag: 'full' }).summary)
      .toMatch(/capital asset/i);
  });

  it('reports a deductible receipt plainly', () => {
    expect(taxSummaryFor({ deductibleFlag: 'full', category: 'Field supplies' }).summary)
      .toMatch(/deductible business expense/i);
  });

  it('flags an uncategorised receipt instead of guessing', () => {
    const s = taxSummaryFor({ deductibleFlag: null });
    expect(s.needsAttention).toBe(true);
    expect(s.summary).toMatch(/not categorised/i);
  });

  it('never claims a card role it has not been given', () => {
    // With no card passed, the summary must not mention whose money it was — that question is
    // simply unanswered until the registry is populated.
    const s = taxSummaryFor({ deductibleFlag: 'full' });
    expect(s.summary).not.toMatch(/company card|personal card|reimbursement/i);
  });
});
