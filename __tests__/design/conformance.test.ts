// __tests__/design/conformance.test.ts — the design against the page, and the trace against both.
//
// Phases R3 + P4 of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// The failure this is built against is a report that is beautiful and fiction. Pair elements by
// index and one inserted banner makes every subsequent pair wrong, so the report says the whole page
// moved — which is indistinguishable from a page that really did move, and destroys the value of
// every future run. So the pairing rule is what most of these tests are about.

import { describe, it, expect } from 'vitest';
import { conformanceOf, traceIsFaithful, conformanceSummary } from '@/lib/design/conformance';
import { createDocument, addElement, type DesignDocument, type DesignElement } from '@/lib/design/document';
import type { CapturedNode } from '@/lib/design/import';
import { ENTRIES } from '@/lib/design/catalogue';

const NOW = '2026-08-23T12:00:00.000Z';

function design(elements: Array<Partial<DesignElement>>): DesignDocument {
  const doc = createDocument({ id: 'd', name: 'Jobs', route: '/admin/jobs', now: NOW });
  let view = doc.views.desktop;
  elements.forEach((patch, i) => {
    view = addElement(view, {
      id: `el-${i}`, kind: 'catalogue', slots: {}, style: {},
      x: 0, y: 0, w: 100, h: 40, ...patch,
    } as Omit<DesignElement, 'z'>);
  });
  return { ...doc, views: { ...doc.views, desktop: view } };
}

function node(classes: string[], rect: { x: number; y: number; w: number; h: number }, text = ''): CapturedNode {
  return { tag: 'div', classes, text, rect, styles: {}, depth: 3 };
}

describe('pairing', () => {
  it('matches by what an element IS, not by its position in the list', () => {
    // A banner inserted at the top of the page must not report every element below it as wrong.
    const doc = design([
      { importedFrom: 'jobs-table', x: 0, y: 100, w: 800, h: 400 },
      { importedFrom: 'jobs-page__btn', x: 0, y: 40, w: 120, h: 40 },
    ]);
    const report = conformanceOf(doc, 'desktop', [
      node(['banner'], { x: 0, y: 0, w: 800, h: 32 }),
      node(['jobs-page__btn'], { x: 0, y: 40, w: 120, h: 40 }),
      node(['jobs-table'], { x: 0, y: 100, w: 800, h: 400 }),
    ], ENTRIES);

    expect(report.findings.filter((f) => f.kind === 'moved')).toHaveLength(0);
    expect(report.matched).toBe(2);
    expect(report.score).toBe(100);
  });

  it('reports an element the page does not have as missing', () => {
    const report = conformanceOf(
      design([{ importedFrom: 'jobs-filters', x: 0, y: 0, w: 400, h: 48 }]),
      'desktop', [], ENTRIES,
    );
    expect(report.findings.map((f) => f.kind)).toEqual(['missing']);
    expect(report.score).toBe(0);
  });

  it('reports a page element the design never mentions as extra, and does not score it', () => {
    // A page with everything the design asks for plus a help link is conformant-with-an-addition.
    // Scoring it down would make deleting a useful control the way to raise the number.
    const report = conformanceOf(
      design([{ importedFrom: 'jobs-table', x: 0, y: 0, w: 800, h: 400 }]),
      'desktop',
      [node(['jobs-table'], { x: 0, y: 0, w: 800, h: 400 }), node(['help-link'], { x: 0, y: 500, w: 80, h: 20 })],
      ENTRIES,
    );
    expect(report.score).toBe(100);
    expect(report.findings.filter((f) => f.kind === 'extra')).toHaveLength(1);
  });

  it('pairs the nearest instance when a page has several of the same thing', () => {
    const doc = design([
      { importedFrom: 'job-card', x: 0, y: 0, w: 200, h: 100 },
      { importedFrom: 'job-card', x: 0, y: 400, w: 200, h: 100 },
    ]);
    const report = conformanceOf(doc, 'desktop', [
      node(['job-card'], { x: 0, y: 400, w: 200, h: 100 }),
      node(['job-card'], { x: 0, y: 0, w: 200, h: 100 }),
    ], ENTRIES);
    expect(report.findings.filter((f) => f.kind === 'moved')).toHaveLength(0);
  });

  it('ignores the designer’s own marks', () => {
    // Shapes, arrows and sticky notes answer to nothing on the page. Reporting them as missing
    // would report the tool as a defect.
    const report = conformanceOf(
      design([{ kind: 'shape', shape: 'arrow', x: 0, y: 0, w: 40, h: 40 }]),
      'desktop', [], ENTRIES,
    );
    expect(report.findings).toHaveLength(0);
  });

  it('does not count a hidden or annotation element against the page', () => {
    const report = conformanceOf(
      design([{ importedFrom: 'jobs-table', hidden: true }, { importedFrom: 'jobs-filters', annotation: true }]),
      'desktop', [], ENTRIES,
    );
    expect(report.designElements).toBe(0);
    expect(report.findings).toHaveLength(0);
  });
});

describe('movement and size', () => {
  it('reports a real move with the distance', () => {
    const report = conformanceOf(
      design([{ importedFrom: 'jobs-table', x: 0, y: 0, w: 800, h: 400 }]),
      'desktop', [node(['jobs-table'], { x: 0, y: 120, w: 800, h: 400 })], ENTRIES,
    );
    const moved = report.findings.find((f) => f.kind === 'moved')!;
    expect(moved.delta).toBe(120);
    expect(moved.note).toContain('+120');
  });

  it('tolerates a few pixels, because a page is not a pixel grid', () => {
    const report = conformanceOf(
      design([{ importedFrom: 'jobs-table', x: 0, y: 0, w: 800, h: 400 }]),
      'desktop', [node(['jobs-table'], { x: 4, y: 6, w: 806, h: 404 })], ENTRIES,
    );
    expect(report.findings).toHaveLength(0);
  });
});

describe('a default makes a stronger claim than a design does', () => {
  const perfect = conformanceOf(
    design([{ importedFrom: 'jobs-table', x: 0, y: 0, w: 800, h: 400 }]),
    'desktop', [node(['jobs-table'], { x: 0, y: 0, w: 800, h: 400 })], ENTRIES,
  );

  it('passes a trace that still matches its page', () => {
    expect(traceIsFaithful(perfect).ok).toBe(true);
  });

  it('fails a trace that has lost an element', () => {
    const stale = conformanceOf(
      design([{ importedFrom: 'jobs-table' }, { importedFrom: 'jobs-filters' }]),
      'desktop', [node(['jobs-table'], { x: 0, y: 0, w: 100, h: 40 })], ENTRIES,
    );
    const verdict = traceIsFaithful(stale);
    expect(verdict.ok).toBe(false);
    expect(verdict.why).toMatch(/not on the page/i);
  });

  it('fails a trace that captured nothing at all', () => {
    // The exact failure the owner is worried about: a default that quietly holds a third of the
    // page, or none of it, sitting in the list looking finished.
    const empty = conformanceOf(design([]), 'desktop', [node(['jobs-table'], { x: 0, y: 0, w: 10, h: 10 })], ENTRIES);
    expect(traceIsFaithful(empty).ok).toBe(false);
    expect(traceIsFaithful(empty).why).toMatch(/captured nothing/i);
  });
});

describe('the summary a person reads', () => {
  it('leads with the score and names the three counts', () => {
    const report = conformanceOf(
      design([{ importedFrom: 'jobs-table' }, { importedFrom: 'jobs-filters' }]),
      'desktop', [node(['jobs-table'], { x: 0, y: 0, w: 100, h: 40 })], ENTRIES,
    );
    expect(conformanceSummary(report)).toMatch(/^\d+% — 1 missing/);
  });
});

// ── The two ways this check quietly measured the wrong thing ────────────────────────────────────
//
// Both were found by running it across the product and getting numbers that could not be true:
// pages traced from the live app minutes earlier came back at 7%, 6%, 0%. Neither was visible from
// any single case, and 250 passing tests did not touch either, so each gets one here.
describe('both sides answer to the same rule', () => {
  it('does not care which order the class attribute was written in', () => {
    // `class="team-page team-page__card"`. The page side picked the BEM child; the design side took
    // whichever class came first. Same element, two names, and a score that was really measuring
    // class-attribute order — /admin/team scored 7% against a trace of itself.
    const report = conformanceOf(
      design([{ importedFrom: 'team-page team-page__card', x: 0, y: 0, w: 300, h: 120 }]),
      'desktop',
      [{ tag: 'div', classes: ['team-page', 'team-page__card'], text: '', rect: { x: 0, y: 0, w: 300, h: 120 }, styles: {}, depth: 3 }],
      ENTRIES,
    );
    expect(report.findings.filter((f) => f.kind !== 'extra')).toEqual([]);
    expect(report.matched).toBe(1);
    expect(report.score).toBe(100);
  });

  it('matches a classless element by its tag, because the importer already records it that way', () => {
    // Half this product's markup carries no class. `import.ts` files those under their TAG, so the
    // design said `.span` and the page said nothing — 92 of /admin/team's 102 elements could not be
    // matched to anything, by construction.
    const report = conformanceOf(
      design([
        { importedFrom: 'h1', x: 0, y: 0, w: 400, h: 30 },
        { importedFrom: 'span', x: 0, y: 40, w: 80, h: 20 },
      ]),
      'desktop',
      [
        { tag: 'h1', classes: [], text: 'Field Team', rect: { x: 0, y: 0, w: 400, h: 30 }, styles: {}, depth: 3 },
        { tag: 'span', classes: [], text: '4', rect: { x: 0, y: 40, w: 80, h: 20 }, styles: {}, depth: 4 },
      ],
      ENTRIES,
    );
    expect(report.findings.filter((f) => f.kind === 'missing')).toEqual([]);
    expect(report.matched).toBe(2);
    expect(report.score).toBe(100);
  });

  it('still counts a classless element the page has lost', () => {
    // The fallback must not be so generous that it can never fail: three spans against two is one
    // missing, and that is the answer this check exists to give.
    const report = conformanceOf(
      design([
        { importedFrom: 'span', x: 0, y: 0, w: 80, h: 20 },
        { importedFrom: 'span', x: 0, y: 30, w: 80, h: 20 },
        { importedFrom: 'span', x: 0, y: 60, w: 80, h: 20 },
      ]),
      'desktop',
      [
        { tag: 'span', classes: [], text: '', rect: { x: 0, y: 0, w: 80, h: 20 }, styles: {}, depth: 3 },
        { tag: 'span', classes: [], text: '', rect: { x: 0, y: 30, w: 80, h: 20 }, styles: {}, depth: 3 },
      ],
      ENTRIES,
    );
    expect(report.findings.filter((f) => f.kind === 'missing')).toHaveLength(1);
  });

  it('prefers a class over a tag when the element has one', () => {
    // The tag is the fallback, not the rule: an element with classes must still be matched by them,
    // or every `<div>` on a page would answer to every other one.
    const report = conformanceOf(
      design([{ importedFrom: 'jobs-page__btn', x: 0, y: 0, w: 120, h: 40 }]),
      'desktop',
      [{ tag: 'div', classes: [], text: '', rect: { x: 0, y: 0, w: 120, h: 40 }, styles: {}, depth: 3 }],
      ENTRIES,
    );
    expect(report.findings.filter((f) => f.kind === 'missing')).toHaveLength(1);
  });
});
