// __tests__/design/import.test.ts — tracing a real page back into a design.
//
// Matching is where an import goes quietly wrong. A wrong match is worse than no match, because an
// unmatched element is visibly a question mark whereas a `.admin-btn--danger` labelled "Button" is
// a confident lie that gets built. Most of this file is about that distinction.

import { describe, it, expect } from 'vitest';
import { matchCatalogue, elementsFromCapture, documentFromCapture, type CapturedNode } from '@/lib/design/import';
import type { CatalogueEntry } from '@/lib/design/catalogue/types';

function entry(id: string, classes: string[], label = id): CatalogueEntry {
  return {
    id, label, category: 'button', classes, keywords: [], slots: [{ name: 'label', default: 'Save' }],
    size: { default: { w: 160, h: 40 }, min: { w: 40, h: 24 } }, source: [],
  } as never;
}

const ENTRIES = [
  entry('button.admin', ['admin-btn'], 'Button'),
  entry('button.admin-primary', ['admin-btn', 'admin-btn--primary'], 'Primary button'),
  entry('button.admin-danger', ['admin-btn', 'admin-btn--danger'], 'Danger button'),
  entry('card.basic', ['admin-card'], 'Card'),
];

function node(patch: Partial<CapturedNode> = {}): CapturedNode {
  return {
    tag: 'button', classes: ['admin-btn'], text: 'Save changes',
    rect: { x: 40, y: 80, w: 160, h: 40 },
    styles: {}, depth: 5,
    ...patch,
  };
}

describe('matching a node to the catalogue', () => {
  it('matches a plain element to its plain entry', () => {
    expect(matchCatalogue(node(), ENTRIES)?.entry.id).toBe('button.admin');
  });

  it('prefers the MOST SPECIFIC entry, not the first that overlaps', () => {
    // The failure this prevents: a danger button imported as a plain button, then rebuilt as one.
    const danger = node({ classes: ['admin-btn', 'admin-btn--danger'] });
    expect(matchCatalogue(danger, ENTRIES)?.entry.id).toBe('button.admin-danger');
  });

  it('requires EVERY class the entry names, not merely an overlap', () => {
    // A node wearing only the variant class is not that entry — the base class is part of what the
    // entry says it is, and a looser rule matches every variant against every other.
    const orphanVariant = node({ classes: ['admin-btn--primary'] });
    expect(matchCatalogue(orphanVariant, ENTRIES)?.entry.id).toBeUndefined();
  });

  it('returns nothing rather than a bad guess for an unknown element', () => {
    expect(matchCatalogue(node({ classes: ['jobs-page__weird-thing'] }), ENTRIES)).toBeNull();
  });

  it('tolerates extra classes the catalogue does not know about', () => {
    const withExtras = node({ classes: ['admin-btn', 'admin-btn--primary', 'is-loading', 'mt-2'] });
    expect(matchCatalogue(withExtras, ENTRIES)?.entry.id).toBe('button.admin-primary');
  });

  it('matches a COMPOSITE entry on its root, not on every class its markup uses', () => {
    // The bug this pins, found by running the sweep over 133 real routes: an entry like the empty
    // state declares every class across its markup — ['admin-empty', 'admin-empty__icon',
    // 'admin-empty__title', 'admin-empty__desc'] — and those live on four DIFFERENT nodes. Demanding
    // all four on one node made the entry unmatchable, and `div.admin-empty` was reported as an
    // uncatalogued element on six routes with its own catalogue entry sitting right there.
    const composite = {
      ...entry('feedback.empty', ['admin-empty', 'admin-empty__icon', 'admin-empty__title'], 'Empty state'),
      html: '<div class="admin-empty"><div class="admin-empty__icon">{{icon}}</div></div>',
    } as CatalogueEntry;
    const onPage = node({ tag: 'div', classes: ['admin-empty'] });
    expect(matchCatalogue(onPage, [composite])?.entry.id).toBe('feedback.empty');
  });

  it('falls back to the declared classes when the markup has none to read', () => {
    const noHtml = { ...entry('x.y', ['thing']), html: '' } as CatalogueEntry;
    expect(matchCatalogue(node({ classes: ['thing'] }), [noHtml])?.entry.id).toBe('x.y');
  });
});

describe('telling a gap from a part of something known', () => {
  const idFor = (i: number) => `el-${i + 1}`;

  it('marks an unknown element with a catalogued ancestor as a PART, not a gap', () => {
    // `.admin-page-header__crumb` lives inside the catalogued `.admin-page-header__crumbs`.
    // Curating it would add an entry for a piece of an entry.
    const trail = entry('nav.breadcrumb', ['admin-page-header__crumbs'], 'Breadcrumb');
    const crumb = node({
      tag: 'a', classes: ['admin-page-header__crumb'], text: 'Work',
      ancestorClasses: ['admin-page-header__crumbs', 'admin-page-header'],
    });
    const { unmatched } = elementsFromCapture([crumb], [trail], idFor);
    expect(unmatched[0].insideKnown).toBe(true);
  });

  it('marks one with no catalogued ancestor as a genuine gap', () => {
    const orphan = node({
      tag: 'h2', classes: ['learn__title'], text: 'Modules',
      ancestorClasses: ['learn__page', 'wrapper'],
    });
    const { unmatched } = elementsFromCapture([orphan], ENTRIES, idFor);
    expect(unmatched[0].insideKnown).toBe(false);
  });
});

describe('deciding what survives the walk', () => {
  const idFor = (i: number) => `el-${i + 1}`;

  it('keeps anything the catalogue recognises', () => {
    const { elements } = elementsFromCapture([node()], ENTRIES, idFor);
    expect(elements).toHaveLength(1);
    expect(elements[0].catalogId).toBe('button.admin');
  });

  it('keeps an unrecognised leaf that carries words — that is the page\'s content', () => {
    const heading = node({ tag: 'h2', classes: ['page__title'], text: 'Open jobs' });
    const { elements, unmatched } = elementsFromCapture([heading], ENTRIES, idFor);
    expect(elements).toHaveLength(1);
    expect(elements[0].name).toBe('Open jobs');
    expect(unmatched[0].classes).toBe('page__title');
  });

  it('drops layout scaffolding, which is the part a mockup is redrawing', () => {
    const wrapper = node({ tag: 'div', classes: ['flex-row'], text: '' });
    const { elements, dropped } = elementsFromCapture([wrapper], ENTRIES, idFor);
    expect(elements).toEqual([]);
    expect(dropped).toBe(1);
  });

  it('drops a child that sits exactly on top of a kept parent', () => {
    // <button class="admin-btn"><span>Save</span></button> is ONE element. Two coincident boxes in
    // a canvas means the top one is the only one that can ever be selected.
    const button = node({ depth: 4 });
    const innerSpan = node({ tag: 'span', classes: [], text: 'Save changes', depth: 5 });
    const { elements } = elementsFromCapture([button, innerSpan], ENTRIES, idFor);
    expect(elements).toHaveLength(1);
    expect(elements[0].catalogId).toBe('button.admin');
  });

  it('keeps two of the same thing when they are in different places', () => {
    const a = node();
    const b = node({ rect: { x: 400, y: 80, w: 160, h: 40 } });
    expect(elementsFromCapture([a, b], ENTRIES, idFor).elements).toHaveLength(2);
  });
});

describe('the coverage report — the point of the exercise', () => {
  const idFor = (i: number) => `el-${i + 1}`;

  it('counts a repeated unknown class ONCE, with how many there were', () => {
    // Forty table cells with the same class are one missing entry. Forty lines would bury the
    // other gaps, which is how a report stops being read.
    const cells = Array.from({ length: 40 }, (_, i) => node({
      tag: 'td', classes: ['jobs-table__cell'], text: `row ${i}`,
      rect: { x: 40, y: 100 + i * 40, w: 200, h: 36 },
    }));
    const { unmatched } = elementsFromCapture(cells, ENTRIES, idFor);
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0].count).toBe(40);
  });

  it('says nothing about elements the catalogue DOES know', () => {
    expect(elementsFromCapture([node()], ENTRIES, idFor).unmatched).toEqual([]);
  });

  it('ranks the biggest gap first', () => {
    const nodes = [
      ...Array.from({ length: 5 }, (_, i) => node({ tag: 'span', classes: ['chip'], text: 'a', rect: { x: i * 60, y: 10, w: 50, h: 20 } })),
      node({ tag: 'span', classes: ['rare'], text: 'b', rect: { x: 0, y: 400, w: 50, h: 20 } }),
    ];
    expect(elementsFromCapture(nodes, ENTRIES, idFor).unmatched[0].classes).toBe('chip');
  });
});

describe('the whole document', () => {
  const base = {
    id: 'd-test-imp', name: 'Jobs as it is', route: '/admin/jobs',
    now: '2026-08-23T00:00:00.000Z', entries: ENTRIES,
  };

  it('builds the two views from their OWN captures', () => {
    // A responsive page really is two layouts. Importing the desktop capture into both would hand
    // over a mobile design that never existed on any screen.
    const { doc } = documentFromCapture({
      ...base,
      desktop: [node(), node({ rect: { x: 400, y: 80, w: 160, h: 40 } })],
      mobile: [node({ rect: { x: 16, y: 200, w: 358, h: 44 } })],
    });
    expect(doc.views.desktop.elements).toHaveLength(2);
    expect(doc.views.mobile.elements).toHaveLength(1);
    expect(doc.views.mobile.elements[0].x).toBe(16);
    expect(doc.views.desktop.width).toBe(1440);
    expect(doc.views.mobile.width).toBe(390);
  });

  it('merges the gaps across both views — a missing entry is missing once', () => {
    const unknown = node({ tag: 'span', classes: ['mystery'], text: 'x' });
    const { coverage } = documentFromCapture({ ...base, desktop: [unknown], mobile: [unknown] });
    expect(coverage.gaps).toHaveLength(1);
    expect(coverage.gaps[0].count).toBe(2);
  });

  it('records where each element was traced from', () => {
    const { doc } = documentFromCapture({ ...base, desktop: [node()], mobile: [] });
    expect(doc.views.desktop.elements[0].importedFrom).toBe('admin-btn');
  });

  it('gives every element a z so nothing is stacked ambiguously', () => {
    const { doc } = documentFromCapture({
      ...base,
      desktop: [node(), node({ rect: { x: 400, y: 80, w: 160, h: 40 } })],
      mobile: [],
    });
    expect(doc.views.desktop.elements.map((e) => e.z)).toEqual([1, 2]);
  });

  it('takes the element\'s words from the PAGE, not from the catalogue default', () => {
    const { doc } = documentFromCapture({
      ...base,
      desktop: [node({ text: 'Archive this job' })],
      mobile: [],
    });
    expect(doc.views.desktop.elements[0].slots.label).toBe('Archive this job');
  });

  it('drops a transparent background rather than carrying it forward as paint', () => {
    const { doc } = documentFromCapture({
      ...base,
      desktop: [node({ styles: { background: 'rgba(0, 0, 0, 0)', color: 'rgb(15, 20, 25)' } })],
      mobile: [],
    });
    expect(doc.views.desktop.elements[0].style.background).toBeUndefined();
    expect(doc.views.desktop.elements[0].style.color).toBe('rgb(15, 20, 25)');
  });
});
