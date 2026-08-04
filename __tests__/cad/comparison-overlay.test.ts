// __tests__/cad/comparison-overlay.test.ts
//
// CAD_AUDIT Slice S9c — the prior survey, on the canvas, as a locked reference layer.
//
// S9b compares two readings and reports: "course 7 differs by 0.4 ft once the basis is accounted
// for." A surveyor reading that wants to know WHERE, and a list cannot answer it. S9c draws the
// other record beside theirs.
//
// ── THE PROPERTIES THAT MAKE IT SAFE, RATHER THAN THE FACT THAT IT DRAWS ────────────────────────
//
// Drawing is the easy half and is covered by the import path this reuses. What is asserted here is
// everything that stops a reference figure becoming part of the survey by accident:
//
//   * every feature lands on ONE layer, not spread across the research layers the import normally
//     uses — so the surveyor can hide the whole reference with one click;
//   * that layer is LOCKED, because a reference that can be dragged will eventually be edited and
//     then believed, and here the wrong line is somebody else's survey;
//   * it is visually distinct, so it never reads as your own work;
//   * and the id is derived from the source name, so comparing two different records produces two
//     layers rather than one silently overwritten.

import { describe, it, expect } from 'vitest';
import {
  comparisonOverlay,
  comparisonLayerId,
  COMPARISON_COLOR,
} from '@/lib/cad/compare/comparison-overlay';
import type { SurveyReadingLike } from '@/lib/cad/import/from-survey-reading';

/** A closed square, the smallest reading that produces both a boundary and a monument.
 *
 *  Deliberately NOT cast. The first version of this fixture used `traverses: [...]` with a `closed`
 *  flag — a shape that does not exist — and an `as unknown as SurveyReadingLike` cast let it compile.
 *  It produced zero features, and only the "draws something" guard caught it. That is the same
 *  lesson as the `as never` removed from the D&D roll-publish path earlier today: a cast on a fixture
 *  disables the one check that would have said the shape was wrong. */
const reading = (): SurveyReadingLike => ({
  traverse: {
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
    unusable: [],
  },
  located: [{ x: 0, y: 0, label: 'POB', status: 'FOUND' }],
});

describe('S9c — the comparison overlay', () => {
  it('draws something', () => {
    // Guards every assertion below: an overlay with no features would satisfy all of them.
    const o = comparisonOverlay(reading(), 'prior-survey.json', 5);
    expect(o.features.length).toBeGreaterThan(0);
  });

  it('puts every feature on the single comparison layer', () => {
    // The import normally spreads geometry across RESEARCH_BOUNDARY and RESEARCH_MONUMENTS, which is
    // right for a drawing you are building and wrong for a reference you want to hide at once.
    const o = comparisonOverlay(reading(), 'prior-survey.json', 5);
    const layers = new Set(o.features.map((f) => f.layerId));
    expect([...layers]).toEqual([o.layer.id]);
  });

  it('locks the layer', () => {
    // The property this slice most needs to be true. A reference figure that can be dragged is one
    // that will be moved by accident and then trusted.
    expect(comparisonOverlay(reading(), 'x.json', 1).layer.locked).toBe(true);
  });

  it('is visually distinct from the surveyor’s own work', () => {
    const o = comparisonOverlay(reading(), 'x.json', 1);
    expect(o.layer.color).toBe(COMPARISON_COLOR);
    expect(o.layer.lineTypeId).toBe('DASHED');
    // Per-feature too: a feature carrying its own colour overrides the layer's, and the import sets
    // one for the boundary — so without this the reference would draw in the boundary's colour.
    expect(o.features.every((f) => f.style.color === COMPARISON_COLOR)).toBe(true);
    expect(o.features.every((f) => f.style.lineTypeId === 'DASHED')).toBe(true);
  });

  it('names the layer after the record, so the panel says which one is on screen', () => {
    const o = comparisonOverlay(reading(), 'Smith 1998 resurvey.json', 3);
    expect(o.layer.name).toContain('Smith 1998 resurvey.json');
  });

  it('gives two different records two different layers', () => {
    // Otherwise the second comparison silently replaces the first, and a surveyor comparing three
    // records against theirs would see only the last.
    expect(comparisonLayerId('deed-1974.json')).not.toBe(comparisonLayerId('plat-1998.json'));
  });

  it('gives the SAME record the same layer, so re-comparing replaces rather than doubles', () => {
    // The caller relies on this to clear the previous features. If the id drifted, running the same
    // comparison twice would stack an identical figure and every course would look doubled.
    expect(comparisonLayerId('deed-1974.json')).toBe(comparisonLayerId('deed-1974.json'));
  });

  it('produces a usable id from an awkward filename', () => {
    const id = comparisonLayerId('  résumé of survey (final) v2.json ');
    expect(id.startsWith('COMPARE-')).toBe(true);
    expect(id).not.toMatch(/[^A-Z0-9-]/);
  });

  it('carries forward what the reference could NOT show', () => {
    // Same rule as the import it reuses: a reading that carried something undrawable says so rather
    // than omitting it silently. On a reference figure that matters more, not less — a course
    // missing from the overlay would read as a course the other survey did not have.
    const o = comparisonOverlay(reading(), 'x.json', 1);
    expect(Array.isArray(o.notDrawn)).toBe(true);
    expect(typeof o.closed).toBe('boolean');
  });
});
