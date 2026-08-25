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

// C5: the queue is a TAB of the Receipts portal now — same component, new path.
const page = fs.readFileSync(path.join(process.cwd(), 'app/admin/receipts/_tabs/QueueTab.tsx'), 'utf8');

describe('the receipts queue shows the tax consequence', () => {
  it('calls the shared summary rather than re-deriving one inline', () => {
    // A second implementation of "what does this mean at tax time" is how the two come to disagree,
    // and the screen is the copy people would believe.
    //
    // F7c moved the call one step further out: the page used to build the summary in an IIFE inside
    // its JSX, which is why F3b/F7a shipped unverifiable — nothing could invoke it without a real
    // receipt row in a browser. It now calls `receiptTaxLine(row)`, and the field mapping that used
    // to be visible here is asserted directly in `receipt-tax-line.test.ts`, against fixtures.
    //
    // The INTENT of this assertion is unchanged and deliberately not weakened: the page must not
    // carry its own copy of the rule. It is now checked by the absence of one rather than the
    // presence of a call.
    expect(page).toContain("from '@/lib/finance/tax-summary'");
    expect(page).toContain('receiptTaxLine(row)');
    expect(page, 'the page is deriving the summary itself again').not.toContain('taxSummaryFor({');
  });

  it('feeds it the row, so every field the summary reads travels with it', () => {
    // Was: assert the page mentions `promoted_to_equipment_id` and `tax_deductible_flag`. Passing
    // the whole row makes that check impossible AND unnecessary — the mapping moved into
    // `receiptTaxLine`, where `receipt-tax-line.test.ts` pins each field to the sentence it changes,
    // which is a stronger check than a substring in a 700-line page.
    expect(page).toMatch(/receiptTaxLine\(\s*row\s*\)/);
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
