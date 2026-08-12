// __tests__/finance/receipt-needs-review.test.ts
//
// R7's "Needs review" tab is answered in two places — a PostgREST filter in
// `app/api/admin/receipts/route.ts` picks the rows, and `needsReview()` counts them for the tab.
// If those two ever disagree, the failure is quiet and corrosive: a tab reading "3" over a list of
// five, or over an empty list, teaches a bookkeeper that the filter is unreliable, and the next
// step is going back to reading every receipt by hand.
//
// So the function is pinned here, case by case, with the emphasis on the boundaries that are easy
// to get wrong rather than the happy path.

import { describe, it, expect } from 'vitest';

import { needsReview } from '@/app/admin/receipts/receipt-types';

type Row = Parameters<typeof needsReview>[0];

const clean: Row = {
  extraction_status: 'done',
  dedup_match_id: null,
  ai_extras: { review_flags: [] },
};

describe('needsReview', () => {
  it('leaves an ordinary, cleanly-read receipt alone', () => {
    // The common case, and the one that matters most: if this returned true the tab would contain
    // every receipt the firm has ever filed, which is the same as having no tab.
    expect(needsReview(clean)).toBe(false);
  });

  it('catches a receipt the AI could not read', () => {
    expect(needsReview({ ...clean, extraction_status: 'failed' })).toBe(true);
  });

  it('catches a possible duplicate', () => {
    expect(needsReview({ ...clean, dedup_match_id: 'other-receipt-id' })).toBe(true);
  });

  it('catches a receipt the AI flagged', () => {
    expect(
      needsReview({ ...clean, ai_extras: { review_flags: ['Subtotal + tax does not equal total'] } }),
    ).toBe(true);
  });

  // ── The boundaries ────────────────────────────────────────────────────────────────────────────

  it('does NOT treat "not looked at yet" as "needs review"', () => {
    // The distinction the whole view rests on. `queued` means nobody has read it; `failed` means
    // somebody tried and could not. Folding the first into this tab would bury the receipts that
    // genuinely need a decision under every receipt uploaded in the last five minutes.
    expect(needsReview({ ...clean, extraction_status: 'queued', ai_extras: null })).toBe(false);
    expect(needsReview({ ...clean, extraction_status: 'running', ai_extras: null })).toBe(false);
    expect(needsReview({ ...clean, extraction_status: null, ai_extras: null })).toBe(false);
  });

  it('treats an empty flag array the same as no flags', () => {
    // The extractor is told an empty array is the common, correct answer for a clean receipt, so
    // this is the shape most extracted rows carry.
    expect(needsReview({ ...clean, ai_extras: { review_flags: [] } })).toBe(false);
  });

  it('survives an ai_extras with no review_flags key at all', () => {
    // Rows written before seed 580, and any future extractor that omits the key, must not crash the
    // queue or silently land in the tab.
    expect(needsReview({ ...clean, ai_extras: {} })).toBe(false);
  });

  it('matches the SQL predicate the API filters with', () => {
    // Documented here because the two live in different files and different languages.
    //
    // PostgREST renders `ai_extras->>review_flags=neq.[]` as `(ai_extras->>'review_flags') <> '[]'`.
    // Verified against production SQL on 2026-08-11 with a four-case VALUES table:
    //
    //   ai_extras NULL                        → text NULL   → NULL  → not matched
    //   {"review_flags":[]}                   → text '[]'   → false → not matched
    //   {"review_flags":["Totals wrong"]}     → text '[...]'→ true  → matched
    //   {"summary":"x"} (key absent)          → text NULL   → NULL  → not matched
    //
    // Each line below is the same verdict, reached by the TypeScript half.
    expect(needsReview({ ...clean, ai_extras: null })).toBe(false);
    expect(needsReview({ ...clean, ai_extras: { review_flags: [] } })).toBe(false);
    expect(needsReview({ ...clean, ai_extras: { review_flags: ['Totals wrong'] } })).toBe(true);
    expect(needsReview({ ...clean, ai_extras: {} })).toBe(false);
  });
});
