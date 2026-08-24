// __tests__/design/dossier.test.ts — what a page IS, derived from what a walk saw.
//
// Phase D of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// The deriver's whole value is that a reader can trust it. A dossier that quietly invents a
// function, or that describes forty rows of one table as forty elements, is worse than no dossier:
// it is a confident answer nobody can tell is wrong without going and looking at the page. So most
// of what is asserted here is about restraint — what must NOT appear, and what must be said plainly
// when the evidence supports nothing.

import { describe, it, expect } from 'vitest';
import {
  deriveDossier, mergeDossier, dossierState, derivedAgeDays, placedElements,
  type RouteObservation,
} from '@/lib/design/dossier';
import { ENTRIES } from '@/lib/design/catalogue';
import { createDocument, addElement, type DesignElement } from '@/lib/design/document';

const NOW = '2026-08-23T12:00:00.000Z';

function observation(patch: Partial<RouteObservation> = {}): RouteObservation {
  return {
    route: '/admin/jobs',
    title: 'Jobs',
    headings: ['Jobs'],
    controls: [],
    regions: [],
    requests: [],
    ...patch,
  };
}

describe('the element inventory is the page, not the DOM', () => {
  it('groups repeated elements instead of listing every instance', () => {
    // Forty job cards is one element of the page repeated forty times. Listing forty would make
    // the inventory for /admin/jobs three hundred rows long and read by nobody.
    const derived = deriveDossier(observation({
      regions: Array.from({ length: 40 }, () => ({
        tag: 'div', classes: ['job-card'], kind: 'card' as const, label: 'J-2026-0001',
      })),
    }), ENTRIES, { now: NOW });

    const cards = derived.elements.filter((e) => e.selector === '.job-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].count).toBe(40);
  });

  it('treats a modifier as the same element in another state', () => {
    const derived = deriveDossier(observation({
      controls: [
        { tag: 'button', classes: ['jobs-page__btn'], text: 'New job', kind: 'button' },
        { tag: 'button', classes: ['jobs-page__btn', 'jobs-page__btn--primary'], text: 'Save', kind: 'button' },
      ],
    }), ENTRIES, { now: NOW });

    expect(derived.elements.filter((e) => e.selector === '.jobs-page__btn')).toHaveLength(1);
  });

  it('keeps the first sample rather than the last', () => {
    // Otherwise the label of a repeated element changes every time the page's data does, and a
    // dossier that reads differently on every derive is one nobody can review.
    const derived = deriveDossier(observation({
      regions: [
        { tag: 'div', classes: ['job-card'], kind: 'card', label: 'First' },
        { tag: 'div', classes: ['job-card'], kind: 'card', label: 'Second' },
      ],
    }), ENTRIES, { now: NOW });
    expect(derived.elements.find((e) => e.selector === '.job-card')?.sample).toBe('First');
  });

  it('marks the load-bearing elements required and nothing else', () => {
    const derived = deriveDossier(observation({
      regions: [
        { tag: 'table', classes: ['jobs-table'], kind: 'table', count: 12 },
        { tag: 'div', classes: ['jobs-page__legend'], kind: 'surface' },
      ],
      controls: [
        { tag: 'button', classes: ['jobs-page__btn'], text: 'New job', kind: 'button' },
        { tag: 'button', classes: ['jobs-page__help'], text: 'Help', kind: 'button' },
      ],
    }), ENTRIES, { now: NOW });

    const required = derived.elements.filter((e) => e.required).map((e) => e.selector);
    expect(required).toContain('.jobs-table');
    expect(required).toContain('.jobs-page__btn');   // the page's creation flow
    expect(required).not.toContain('.jobs-page__help');
    expect(required).not.toContain('.jobs-page__legend');
  });

  it('sorts the required elements first', () => {
    const derived = deriveDossier(observation({
      regions: [
        { tag: 'div', classes: ['jobs-page__legend'], kind: 'surface' },
        { tag: 'table', classes: ['jobs-table'], kind: 'table', count: 3 },
      ],
    }), ENTRIES, { now: NOW });
    expect(derived.elements[0].required).toBe(true);
  });
});

describe('functions are inferred from evidence, and carry it', () => {
  it('reads a write as the page writing something', () => {
    const derived = deriveDossier(observation({
      regions: [{ tag: 'form', classes: ['job-form'], kind: 'form', count: 6 }],
      requests: [
        { method: 'GET', path: '/api/admin/jobs' },
        { method: 'POST', path: '/api/admin/jobs' },
        { method: 'DELETE', path: '/api/admin/jobs/abc' },
      ],
    }), ENTRIES, { now: NOW });

    const kinds = derived.functions.map((f) => f.kind);
    expect(kinds).toContain('create');
    expect(kinds).toContain('delete');
    const del = derived.functions.find((f) => f.kind === 'delete')!;
    expect(del.evidence.join(' ')).toContain('DELETE');
  });

  it('says plainly when the evidence supports nothing specific', () => {
    // The alternative is inventing a purpose, which is the failure mode that makes a whole
    // inventory untrustworthy — one confident fiction and every other entry becomes suspect.
    const derived = deriveDossier(observation({ headings: ['Settings'] }), ENTRIES, { now: NOW });
    expect(derived.functions).toHaveLength(1);
    expect(derived.functions[0].id).toBe('unclassified');
    expect(derived.functions[0].detail).toMatch(/worth a sentence from a person/i);
  });

  it('never claims a function it has no evidence for', () => {
    const derived = deriveDossier(observation({
      regions: [{ tag: 'table', classes: ['jobs-table'], kind: 'table', count: 4 }],
      requests: [{ method: 'GET', path: '/api/admin/jobs' }],
    }), ENTRIES, { now: NOW });
    expect(derived.functions.map((f) => f.kind)).not.toContain('delete');
    expect(derived.functions.map((f) => f.kind)).not.toContain('create');
  });
});

describe('endpoints are folded to the endpoint, not the record', () => {
  it('collapses ids so two rows of the same call are one', () => {
    const derived = deriveDossier(observation({
      requests: [
        { method: 'GET', path: '/api/admin/jobs/8f2b1c9d-1111-4a2b-9c3d-4e5f60718293' },
        { method: 'GET', path: '/api/admin/jobs/7a1b2c3d-2222-4a2b-9c3d-4e5f60718293' },
        { method: 'GET', path: '/api/admin/jobs/42' },
      ],
    }), ENTRIES, { now: NOW });

    expect(derived.endpoints).toHaveLength(1);
    expect(derived.endpoints[0]).toMatchObject({ method: 'GET', path: '/api/admin/jobs/:id', count: 3 });
  });
});

describe('the two halves stay apart', () => {
  it('merges without either side being able to erase the other', () => {
    const merged = mergeDossier(
      '/admin/jobs',
      { purpose: 'The list every job passes through.', summary: null, audience: null, authoredBy: 'a@b.c', authoredAt: NOW },
      { elements: [], functions: [], endpoints: [], elementCount: 0, derivedAt: '', derivedFrom: null },
    );
    expect(merged.purpose).toBe('The list every job passes through.');
    expect(merged.elementCount).toBe(0);
  });

  it('names the four states a page can be in', () => {
    expect(dossierState({ purpose: null, summary: null, elementCount: 0 })).toBe('none');
    expect(dossierState({ purpose: null, summary: null, elementCount: 12 })).toBe('derived-only');
    expect(dossierState({ purpose: 'x', summary: null, elementCount: 0 })).toBe('authored-only');
    expect(dossierState({ purpose: 'x', summary: null, elementCount: 12 })).toBe('complete');
  });

  it('reports the age of the measurement rather than a boolean', () => {
    // "Derived" is not one state: this morning and March are both derived, and treating them the
    // same is how an inventory quietly becomes fiction.
    const now = new Date('2026-08-23T00:00:00.000Z');
    expect(derivedAgeDays('2026-08-13T00:00:00.000Z', now)).toBe(10);
    expect(derivedAgeDays(null, now)).toBeNull();
    expect(derivedAgeDays('not a date', now)).toBeNull();
  });
});

describe('what the canvas already holds', () => {
  const dossierElements = [
    { selector: '.admin-btn', label: 'Save', tag: 'button', kind: 'button' as const, purpose: '', required: true, count: 1, catalogId: 'button.admin' },
    { selector: '.jobs-table', label: 'Jobs', tag: 'table', kind: 'table' as const, purpose: '', required: true, count: 1, catalogId: null },
  ];

  function docWith(elements: Array<Partial<DesignElement>>) {
    const doc = createDocument({ id: 'd', name: 'n', route: '/admin/jobs', now: NOW });
    let view = doc.views.desktop;
    elements.forEach((patch, i) => {
      view = addElement(view, {
        id: `el-${i}`, kind: 'catalogue', slots: {}, style: {}, x: 0, y: 0, w: 10, h: 10, ...patch,
      } as Omit<DesignElement, 'z'>);
    });
    return { ...doc, views: { ...doc.views, desktop: view } };
  }

  it('matches a placed catalogue entry', () => {
    const found = placedElements(docWith([{ catalogId: 'button.admin' }]), dossierElements);
    expect([...found]).toEqual(['.admin-btn']);
  });

  it('matches a traced element by its class signature', () => {
    const found = placedElements(docWith([{ kind: 'text', importedFrom: 'jobs-table jobs-table--dense' }]), dossierElements);
    expect([...found]).toEqual(['.jobs-table']);
  });

  it('claims nothing for an empty canvas', () => {
    // The one thing detection must never do is tick a box nobody earned.
    expect([...placedElements(docWith([]), dossierElements)]).toEqual([]);
  });
});
