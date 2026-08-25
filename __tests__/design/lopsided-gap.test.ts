// __tests__/design/lopsided-gap.test.ts — the gap that says a record is WRONG, not missing.
//
// The studio reported five gaps and every one was about absence: no default, no dossier, no design,
// no active, stale default. So five records that held a fraction of their page — one with 21
// elements against 598 — showed as complete. The row said default, locked, recently traced, and
// every one of those was true.
//
// The rule lives in `lib/design/lopsided.ts` because the TRACER already had it inline. Two copies of
// one threshold is the shape this plan has spent a day removing.

import { describe, it, expect } from 'vitest';
import { isLopsided, lopsidedRatio, LOPSIDED_RATIO, LOPSIDED_FLOOR } from '@/lib/design/lopsided';
import { GAP_LABEL, GAP_MEANING, joinPages, lifecycleOf, type PageGap } from '@/lib/design/pages';

describe('isLopsided', () => {
  it('catches the five that were actually wrong', () => {
    // Measured, not invented — these are the real records and their real counts.
    expect(isLopsided(21, 598)).toBe(true);    // learn · card-bank      28.5x
    expect(isLopsided(19, 251)).toBe(true);    // research · data-sources 13.2x
    expect(isLopsided(28, 282)).toBe(true);    // marketing · connection-uploads 10.1x
    expect(isLopsided(22, 105)).toBe(true);    // hours · field-team       4.8x
    expect(isLopsided(29, 91)).toBe(true);     // finances · job-profitability 3.1x
  });

  it('and leaves honest responsive layout alone', () => {
    // A page really does differ between 1440 and 390. These are real repaired records.
    expect(isLopsided(598, 598)).toBe(false);
    expect(isLopsided(283, 282)).toBe(false);
    expect(isLopsided(66, 58)).toBe(false);    // finances · overview — a genuine 14% difference
    expect(isLopsided(92, 91)).toBe(false);
    expect(isLopsided(116, 116)).toBe(false);
  });

  it('says nothing when a viewport is empty — that is a different fault', () => {
    // "Nothing captured at all" has its own fix, and raising both would put one record in two
    // queues — the same reason no-default and stale-default are never both reported.
    expect(isLopsided(0, 500)).toBe(false);
    expect(isLopsided(500, 0)).toBe(false);
    expect(isLopsided(0, 0)).toBe(false);
  });

  it('and holds its floor, so a two-element page is not a catastrophe', () => {
    expect(isLopsided(1, 9)).toBe(false);              // 9x, but below the floor
    expect(isLopsided(2, 7)).toBe(false);
    expect(isLopsided(LOPSIDED_FLOOR, 1)).toBe(true);  // at the floor, a 10x split is real
  });

  it('reports the ratio only when it is a defect', () => {
    expect(lopsidedRatio(21, 598)).toBeCloseTo(598 / 21, 5);
    expect(lopsidedRatio(92, 91)).toBe(0);
    expect(LOPSIDED_RATIO).toBe(3);
  });
});

describe('the gap reaches the page list', () => {
  it('is a gap with a label and a meaning, like every other', () => {
    const gap: PageGap = 'lopsided-default';
    expect(GAP_LABEL[gap]).toBeTruthy();
    // The meaning has to say what to DO. A chip nobody can act on is decoration.
    expect(GAP_MEANING[gap]).toMatch(/re-trace/i);
  });

  it('and the lifecycle carries the counts it is judged on', () => {
    // Dropped, this needed a second query per row for data the summary already has.
    const life = lifecycleOf([
      { id: 'a', name: 'x', status: 'default', counts: { desktop: 21, mobile: 598 } },
    ]);
    expect(life.default?.counts).toEqual({ desktop: 21, mobile: 598 });
  });

  it('and a caller with no counts is answered false rather than guessed at', () => {
    const life = lifecycleOf([{ id: 'a', name: 'x', status: 'default' }]);
    expect(life.default?.counts).toEqual({ desktop: 0, mobile: 0 });
    expect(isLopsided(0, 0)).toBe(false);
  });

  // ── THE TEST THAT WOULD HAVE CAUGHT IT, AND THE ONE ABOVE THAT DID NOT ────────────────────────
  //
  // Every assertion above passed while the gap could not fire on a single page in the product.
  // `joinPages` built its design list as `{ id, name, status, locked }` and dropped `counts`, so
  // `lifecycleOf` was handed nothing and answered 0/0 — which `isLopsided` correctly calls false.
  //
  // The unit was right, the rule was right, the wiring was missing, and testing `lifecycleOf` with
  // hand-made counts could never see it. **"Authored but not wired" is this repository's most common
  // defect and I shipped one, in the slice arguing against exactly this.** So the gap is now
  // asserted through the REAL assembly, from the shape the API actually passes.
  it('fires through joinPages, on the shape the API really passes', () => {
    const rows = joinPages(
      [],
      [{
        id: 'd1', name: 'as served', route: '/admin/learn', status: 'default', locked: true,
        counts: { desktop: 21, mobile: 598 },
      }],
    );
    const learn = rows.find((r) => r.route === '/admin/learn');
    expect(learn, '/admin/learn should be in the generated inventory').toBeTruthy();
    expect(learn!.gaps).toContain('lopsided-default');
  });

  it('and does not fire through joinPages when the record is sound', () => {
    const rows = joinPages(
      [],
      [{
        id: 'd1', name: 'as served', route: '/admin/learn', status: 'default', locked: true,
        counts: { desktop: 598, mobile: 598 },
      }],
    );
    expect(rows.find((r) => r.route === '/admin/learn')!.gaps).not.toContain('lopsided-default');
  });
});
