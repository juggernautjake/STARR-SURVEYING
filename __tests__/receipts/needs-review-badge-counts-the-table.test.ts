// __tests__/receipts/needs-review-badge-counts-the-table.test.ts
//
// ── THE BUG ──────────────────────────────────────────────────────────────────────────────────────
//
// The receipts queue has a "Needs review" tab with a count on it. The count was computed as:
//
//     needs_review: needsReviewView ? receiptRows.filter(needsReview).length : 0
//
// — that is, zero unless you were ALREADY on the Needs-review tab. The badge whose only purpose is
// to send somebody to that tab told the truth only after they had gone there for another reason.
//
// Found on production 2026-08-13: nine receipts were waiting behind a badge reading "Needs review 0",
// eight of them flagged as paid on a card that is not on file. Nothing was broken in the data, the
// query or the flags — the number on the screen was just a different question's answer.
//
// ── WHY THIS IS A SOURCE SCAN ────────────────────────────────────────────────────────────────────
//
// The defect is not in a pure function; it is in which SQL the route runs, and it produced a
// perfectly valid HTTP 200 with a wrong integer. What is worth pinning is the shape of the fix: the
// count comes from a count over the TABLE with the same predicate as the view, and it is not gated
// on which tab is open.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const SRC = fs.readFileSync('app/api/admin/receipts/route.ts', 'utf8');

describe('the needs-review badge', () => {
  it('is not gated on the needs-review view being the active one', () => {
    // The exact shape of the bug. If this pattern comes back, the badge reads 0 on every other tab.
    expect(SRC).not.toMatch(/needs_review:\s*needsReviewView\s*\?/);
  });

  it('is counted with an exact head count rather than by measuring the returned page', () => {
    // The page is capped at `limit` (default 100), so counting it would under-report a real backlog
    // even on the tab where the old code was correct.
    expect(SRC).toMatch(/count:\s*'exact',\s*head:\s*true/);
  });

  it('uses one predicate for both the view and the count', () => {
    // Two copies of a four-clause `or` is how the badge and the list start disagreeing — which is a
    // subtler version of the same defect, and harder to notice because both numbers look plausible.
    expect(SRC).toMatch(/NEEDS_REVIEW_PREDICATE/);
    const uses = SRC.match(/NEEDS_REVIEW_PREDICATE/g) ?? [];
    expect(uses.length, 'declared once, used by the view and by the count').toBeGreaterThanOrEqual(3);
  });

  it('applies the same scoping filters to the count as to the list', () => {
    // Otherwise filtering to one submitter shows that submitter's rows under the firm's whole
    // backlog — a badge that belongs to a different population than the list beneath it.
    const countBlock = SRC.slice(SRC.indexOf('needsReviewTotal'), SRC.indexOf('Aggregate counters'));
    for (const filter of ['job_id', 'user_id', 'deleted_at', 'created_at']) {
      expect(countBlock, `the count must be scoped by ${filter}`).toContain(filter);
    }
  });

  it('falls back to the page count rather than to zero when the count query fails', () => {
    // Zero is the one wrong answer: it is indistinguishable from "nothing needs review", which is
    // the state this badge exists to disprove.
    expect(SRC).toMatch(/needsReviewTotal\s*\n?\s*\?\?/);
  });
});
