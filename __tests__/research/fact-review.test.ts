// Accepted, rejected, corrected, or nobody has looked (research plan R23).
//
// `extracted_data_points` has carried a confidence score since seed 090 and no human verdict at all.
// So a value read correctly off a deed and a value the model invented look identical to the next
// reader and to every downstream stage — the boundary computation, the drawing, the packet. A
// reviewer who spotted a wrong bearing had nowhere to put that knowledge.
//
// R17 made it visible whether a fact has EVIDENCE. This is the other axis: whether a person has
// LOOKED. They are independent — a quoted fact can still be misread, and an unevidenced one can be
// confirmed by a surveyor who knows the property — so they are two states, not one scale.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  goldenCandidates,
  reviewMeta,
  reviewProgress,
  validateReview,
  type ReviewableFact,
} from '@/lib/research/fact-review';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const fact = (over: Partial<ReviewableFact> = {}): ReviewableFact => ({
  id: 'dp-1',
  raw_value: 'N 45°12\'30" E',
  display_value: 'N 45°12\'30" E',
  ...over,
});

describe('the four states', () => {
  it('says plainly when nobody has looked', () => {
    const m = reviewMeta(fact());
    expect(m.status).toBe('unreviewed');
    expect(m.needsReview).toBe(true);
    expect(m.detail).toContain('Nobody has checked');
  });

  it('keeps an unchecked fact usable, but visibly unchecked', () => {
    // Refusing to compute anything until every fact is hand-checked would make the pipeline useless.
    expect(reviewMeta(fact()).usable).toBe(true);
    expect(reviewMeta(fact()).label).toBe('unchecked');
  });

  it('drops a rejected fact out of the computation', () => {
    // It must not quietly continue as its original value.
    const m = reviewMeta(fact({ review_status: 'rejected', reviewed_by: 'jacob@…' }));
    expect(m.effectiveValue).toBeNull();
    expect(m.usable).toBe(false);
  });

  it('says a rejected fact is kept rather than deleted', () => {
    // The extraction error is the record R9's self-healing checks need most.
    expect(reviewMeta(fact({ review_status: 'rejected' })).detail).toContain('kept rather than deleted');
  });

  it('uses the correction downstream while showing both values', () => {
    const m = reviewMeta(fact({
      review_status: 'corrected',
      corrected_value: 'N 45°12\'50" E',
      reviewed_by: 'jacob@…',
      reviewed_at: '2026-08-02T00:00:00.000Z',
    }));
    expect(m.effectiveValue).toBe('N 45°12\'50" E');
    expect(m.detail).toContain('the extraction read');
    expect(m.detail).toContain('the document says');
    expect(m.usable).toBe(true);
  });
});

describe('a correction needs something to correct to', () => {
  it('rejects a correction with no value', () => {
    // Otherwise it silently degrades to "unchanged" everywhere downstream.
    expect(validateReview('corrected', null)).toContain('needs the corrected value');
    expect(validateReview('corrected', '   ')).not.toBeNull();
  });

  it('rejects a value supplied with the wrong status', () => {
    expect(validateReview('accepted', 'something')).toContain('Set the status to corrected');
  });

  it('accepts the valid combinations', () => {
    expect(validateReview('accepted', null)).toBeNull();
    expect(validateReview('rejected', null)).toBeNull();
    expect(validateReview('corrected', '210.5')).toBeNull();
    expect(validateReview('unreviewed', null)).toBeNull();
  });

  it('rejects a status that is not one', () => {
    expect(validateReview('approved' as never, null)).toContain('is not a review status');
  });
});

describe('how much has actually been checked', () => {
  it('counts and says what remains', () => {
    const p = reviewProgress([
      fact({ id: 'a', review_status: 'accepted' }),
      fact({ id: 'b', review_status: 'corrected', corrected_value: 'x' }),
      fact({ id: 'c' }),
    ]);
    expect(p.headline).toContain('2 of 3 facts checked');
    expect(p.headline).toContain('1 still unchecked');
  });

  it('warns that the unchecked ones deserve the same scrutiny when checks found errors', () => {
    const p = reviewProgress([
      fact({ id: 'a', review_status: 'rejected' }),
      fact({ id: 'b' }),
    ]);
    expect(p.headline).toContain('deserve the same scrutiny');
  });

  it('does not report an empty set as fully reviewed', () => {
    // A fraction of 1 would read as "everything checked".
    const p = reviewProgress([]);
    expect(p.fractionReviewed).toBeNull();
    expect(p.headline).toContain('nothing to review');
  });

  it('says so when everything has been checked', () => {
    expect(reviewProgress([fact({ review_status: 'accepted' })]).headline).toContain('All 1 facts have been checked');
  });
});

describe('corrections are golden records, not throwaway fixes', () => {
  it('pairs what was extracted with what it should have been', () => {
    // A correction is a test case the business paid a surveyor to produce.
    const g = goldenCandidates([
      fact({ id: 'a', display_value: '210.0', review_status: 'corrected', corrected_value: '210.5', reviewed_by: 'j@x' }),
      fact({ id: 'b', review_status: 'accepted' }),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ dataPointId: 'a', extracted: '210.0', shouldBe: '210.5', reviewedBy: 'j@x' });
  });

  it('ignores a "corrected" row with no value', () => {
    expect(goldenCandidates([fact({ review_status: 'corrected' })])).toHaveLength(0);
  });
});

describe('the storage contract', () => {
  const seed = read('seeds/534_data_point_review.sql');

  it('never overwrites the original extraction', () => {
    // Once a correction overwrites raw_value, "what did the extraction actually say" stops being
    // answerable — and that is the question worth asking on the next property.
    expect(seed).toContain('corrected_value TEXT');
    expect(seed).not.toMatch(/UPDATE[\s\S]*SET raw_value/i);

    const route = read('app/api/admin/research/[projectId]/data-points/[dpId]/route.ts');
    const patch = route.slice(route.indexOf('export const PATCH'));
    expect(patch).not.toContain('raw_value:');
  });

  it('will not store a correction with nothing to correct to', () => {
    expect(seed).toContain("CHECK (review_status <> 'corrected' OR corrected_value IS NOT NULL)");
  });

  it('indexes what still needs checking', () => {
    expect(seed).toMatch(/CREATE INDEX[\s\S]*WHERE review_status = 'unreviewed'/);
  });

  it('clears the reviewer when a review is cleared', () => {
    // Otherwise the row claims a reviewer for a verdict that no longer exists.
    const route = read('app/api/admin/research/[projectId]/data-points/[dpId]/route.ts');
    expect(route).toContain("reviewed_by: status === 'unreviewed' ? null");
  });
});

describe('the surface', () => {
  const panel = read('app/admin/research/components/DataPointsPanel.tsx');

  it('offers accept, reject and correct on every fact', () => {
    expect(panel).toContain('Accept');
    expect(panel).toContain('Reject');
    expect(panel).toContain('Correct…');
  });

  it('keeps review distinct from evidence and confidence', () => {
    // Three questions, three chips.
    expect(panel).toContain('research-review__dp-review');
    expect(panel).toContain('research-review__dp-evidence');
    expect(panel).toContain('research-review__dp-confidence');
  });

  it('does not lose the reviewer’s place on every click', () => {
    // Fifty facts is a long list to be scrolled back to the top of.
    expect(panel).toContain('setGrouped(prev =>');
    expect(panel).toContain('x.id === data_point.id ? data_point : x');
  });

  it('tells the reviewer the original is kept', () => {
    expect(panel).toContain('The original extraction is kept');
  });

  it('shows how much has been checked', () => {
    expect(panel).toContain('progress.headline');
  });
});
