// __tests__/design/checklist.test.ts — what a page has to have, and what "done" is allowed to mean.
//
// Phase C of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// The checklist exists so that "this design is finished" is a claim with evidence behind it. Two
// properties do all the work, and both are asserted here:
//
//   · **The floor stays short.** A checklist where everything is required is one nobody finishes,
//     and one nobody finishes is one nobody reads.
//   · **Nothing ticks itself.** Detection is shown beside the box and never in it. The first time a
//     checklist is confidently wrong about something being done, every other tick becomes suspect.

import { describe, it, expect } from 'vitest';
import {
  generateChecklist, joinChecklist, progressOf, progressSummary, idFor,
  type ChecklistItem, type ChecklistState,
} from '@/lib/design/checklist';
import { mergeDossier, type DossierElement, type PageDossier } from '@/lib/design/dossier';
import { createDocument, addElement, type DesignElement } from '@/lib/design/document';

const NOW = '2026-08-23T12:00:00.000Z';

function element(patch: Partial<DossierElement>): DossierElement {
  return {
    selector: '.jobs-table',
    label: 'Jobs',
    tag: 'table',
    kind: 'table',
    purpose: 'The records themselves.',
    required: true,
    count: 1,
    catalogId: null,
    ...patch,
  };
}

function dossier(elements: DossierElement[], functions: PageDossier['functions'] = []): PageDossier {
  return mergeDossier('/admin/jobs', null, {
    elements, functions, endpoints: [], elementCount: elements.length, derivedAt: NOW, derivedFrom: null,
  });
}

describe('generation', () => {
  it('tiers by the dossier’s own judgement', () => {
    const items = generateChecklist(dossier([
      element({ selector: '.jobs-table', required: true }),
      element({ selector: '.jobs-page__legend', required: false, kind: 'surface', catalogId: 'card.admin' }),
    ]));

    expect(items.find((i) => i.elementRef === '.jobs-table')?.tier).toBe('required');
    expect(items.find((i) => i.elementRef === 'card.admin')?.tier).toBe('recommended');
  });

  it('drops one-off decorations nothing recognises', () => {
    // An element seen once, matching no catalogue entry and not required is almost always a wrapper
    // the trace happened to keep. Asking somebody to tick it is asking them to stop reading.
    const items = generateChecklist(dossier([
      element({ selector: '.jobs-page__spacer', required: false, kind: 'surface', catalogId: null, count: 1 }),
    ]));
    expect(items.some((i) => i.elementRef === '.jobs-page__spacer')).toBe(false);
  });

  it('keeps the required tier short even on a busy page', () => {
    const items = generateChecklist(dossier(
      Array.from({ length: 30 }, (_, i) => element({
        selector: `.thing-${i}`, required: i < 3, kind: i < 3 ? 'table' : 'button', catalogId: 'button.admin',
      })),
    ));
    const required = items.filter((i) => i.tier === 'required');
    // Three from the page plus the two universal must-haves (a mobile layout, a heading).
    expect(required.length).toBeLessThanOrEqual(6);
  });

  it('always asks for a mobile layout', () => {
    // Half this app is used outdoors on a handset. A desktop-only design is not a design of this
    // product, which is why this one universal item is required rather than recommended.
    const items = generateChecklist(dossier([]));
    expect(items.some((i) => i.tier === 'required' && /mobile layout/i.test(i.label))).toBe(true);
  });

  it('asks for somewhere to perform a function the elements did not cover', () => {
    const items = generateChecklist(dossier([], [
      { id: 'create', kind: 'create', label: 'Creates a record', detail: 'POST /api/admin/jobs.', evidence: ['POST /api/admin/jobs'] },
    ]));
    const fromFunction = items.find((i) => i.label.startsWith('Somewhere to'));
    expect(fromFunction).toBeTruthy();
    expect(fromFunction!.tier).toBe('required');
  });

  it('gives an item the same id every time, so regenerating does not lose the ticks', () => {
    // A checklist that forgets what you ticked whenever the page is re-measured punishes you for
    // keeping the measurement current, and then nobody re-measures.
    const a = generateChecklist(dossier([element({})]));
    const b = generateChecklist(dossier([element({})]));
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
    expect(idFor('/admin/jobs', '.jobs-table')).toBe(idFor('/admin/jobs', '.jobs-table'));
  });

  it('marks every generated item as generated', () => {
    // The row is the authority for this, never the text: a person has to be able to tell what the
    // system inferred from what somebody decided, or they cannot trust either.
    expect(generateChecklist(dossier([element({})])).every((i) => i.generated)).toBe(true);
  });
});

describe('joining to a design', () => {
  const items: ChecklistItem[] = [
    { id: 'a', route: '/admin/jobs', stateKey: '', tier: 'required', label: 'A table', detail: null, elementRef: 'table.admin', sort: 1, generated: true, createdBy: null },
    { id: 'b', route: '/admin/jobs', stateKey: '', tier: 'recommended', label: 'An empty state', detail: null, elementRef: 'feedback.empty', sort: 2, generated: true, createdBy: null },
    { id: 'c', route: '/admin/jobs', stateKey: '', tier: 'custom', label: 'Mine', detail: null, elementRef: null, sort: 3, generated: false, createdBy: 'a@b.c' },
  ];

  function docWith(catalogIds: string[]) {
    const doc = createDocument({ id: 'd', name: 'n', route: '/admin/jobs', now: NOW });
    let view = doc.views.desktop;
    catalogIds.forEach((catalogId, i) => {
      view = addElement(view, {
        id: `el-${i}`, kind: 'catalogue', catalogId, slots: {}, style: {}, x: 0, y: 0, w: 10, h: 10,
      } as Omit<DesignElement, 'z'>);
    });
    return { ...doc, views: { ...doc.views, desktop: view } };
  }

  it('detects what is on the canvas without ticking it', () => {
    const rows = joinChecklist(items, [], docWith(['table.admin']), []);
    const table = rows.find((r) => r.id === 'a')!;
    expect(table.detected).toBe(true);
    expect(table.checked).toBe(false);
  });

  it('keeps state per design — an unticked design stays unticked', () => {
    const state: ChecklistState[] = [{ itemId: 'a', checked: true, note: null, checkedBy: 'a@b.c', checkedAt: NOW }];
    expect(joinChecklist(items, state, null, []).find((r) => r.id === 'a')?.checked).toBe(true);
    expect(joinChecklist(items, [], null, []).find((r) => r.id === 'a')?.checked).toBe(false);
  });

  it('sorts must-haves first', () => {
    expect(joinChecklist(items, [], null, []).map((r) => r.tier)).toEqual(['required', 'recommended', 'custom']);
  });
});

describe('progress reports two numbers, because they are two claims', () => {
  const rows = joinChecklist(
    [
      { id: 'a', route: '/r', stateKey: '', tier: 'required', label: 'A', detail: null, elementRef: null, sort: 1, generated: true, createdBy: null },
      { id: 'b', route: '/r', stateKey: '', tier: 'required', label: 'B', detail: null, elementRef: null, sort: 2, generated: true, createdBy: null },
      { id: 'c', route: '/r', stateKey: '', tier: 'recommended', label: 'C', detail: null, elementRef: null, sort: 3, generated: true, createdBy: null },
    ],
    [{ itemId: 'c', checked: true, note: null, checkedBy: null, checkedAt: null }],
    null,
    [],
  );

  it('does not call a design two-thirds finished when the floor is untouched', () => {
    const p = progressOf(rows);
    expect(p.required).toEqual({ done: 0, total: 2 });
    expect(p.floorMet).toBe(false);
    expect(progressSummary(p)).toMatch(/^0\/2 must-have/);
  });

  it('never reports a met floor for a page with no required items', () => {
    // An empty required list is not an achievement. Reporting `true` there would let "complete"
    // mean "never measured", which is exactly the claim this whole phase exists to prevent.
    const empty = joinChecklist([], [], null, []);
    expect(progressOf(empty).floorMet).toBe(false);
  });
});
