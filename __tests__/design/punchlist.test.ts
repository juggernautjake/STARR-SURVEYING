// __tests__/design/punchlist.test.ts — the owner's complaint, as a list you can work through.
//
// Owner: *"I still find tons of repetitive elements and poorly formatted elements that need to be
// fixed, or are simply non-functional at all."*
//
// The thing being protected here is that a flag survives as a ROW — with the element it is on and
// the selector that element was traced from. A flag that degrades into prose in the middle of a
// mockup is a flag nobody finds again, which is where the complaint came from in the first place.

import { describe, it, expect } from 'vitest';
import {
  FLAG_KINDS, toggleFlag, setFlagNote, punchListFrom, punchListMarkdown, flagsOf,
} from '@/lib/design/punchlist';
import { createDocument, addElement, type DesignDocument, type DesignElement } from '@/lib/design/document';

const NOW = '2026-08-23T00:00:00.000Z';

function element(patch: Partial<DesignElement> = {}): Omit<DesignElement, 'z'> {
  return {
    id: 'el-1', kind: 'catalogue', catalogId: 'button.admin', slots: {}, style: {},
    x: 40, y: 40, w: 160, h: 40, name: 'Search button',
    ...patch,
  } as Omit<DesignElement, 'z'>;
}

function docWith(desktop: Array<Partial<DesignElement>>, mobile: Array<Partial<DesignElement>> = []): DesignDocument {
  const doc = createDocument({ id: 'd', name: 'Jobs', route: '/admin/jobs', now: NOW });
  let d = doc.views.desktop;
  desktop.forEach((p, i) => { d = addElement(d, element({ id: `el-d${i + 1}`, ...p })); });
  let m = doc.views.mobile;
  mobile.forEach((p, i) => { m = addElement(m, element({ id: `el-m${i + 1}`, ...p })); });
  return { ...doc, views: { desktop: d, mobile: m } };
}

describe('the four kinds', () => {
  it('offers exactly four, ordered from defect to taste', () => {
    // Four people will actually use beats twelve nobody can choose between. The order is the order
    // they appear in the inspector and in the export, and it is not alphabetical on purpose.
    expect(FLAG_KINDS.map((k) => k.kind)).toEqual(['broken', 'non-functional', 'duplicate', 'ugly']);
  });

  it('gives each one a plain-language meaning, because the labels alone are ambiguous', () => {
    // "Broken" and "does nothing" are not the same fix, and somebody has to be able to tell.
    expect(FLAG_KINDS.every((k) => k.means.length > 0)).toBe(true);
  });
});

describe('flagging an element', () => {
  it('adds a kind, and toggling the same kind removes it', () => {
    const el = element() as DesignElement;
    const on = toggleFlag(el, 'broken');
    expect(on).toEqual([{ kind: 'broken' }]);
    expect(toggleFlag({ ...el, flags: on }, 'broken')).toEqual([]);
  });

  it('holds more than one, because an element can be both a duplicate and ugly', () => {
    const el = element() as DesignElement;
    const flags = toggleFlag({ ...el, flags: toggleFlag(el, 'duplicate') }, 'ugly');
    expect(flags.map((f) => f.kind)).toEqual(['duplicate', 'ugly']);
  });

  it('keeps a note against the kind it was written for', () => {
    const el = { ...element(), flags: [{ kind: 'broken' as const }, { kind: 'ugly' as const }] } as DesignElement;
    const flags = setFlagNote(el, 'ugly', '  the label wraps at 390px  ');
    expect(flags.find((f) => f.kind === 'ugly')?.note).toBe('the label wraps at 390px');
    expect(flags.find((f) => f.kind === 'broken')?.note).toBeUndefined();
  });

  it('clears a note rather than storing an empty string', () => {
    const el = { ...element(), flags: [{ kind: 'broken' as const, note: 'x' }] } as DesignElement;
    expect(setFlagNote(el, 'broken', '   ').find((f) => f.kind === 'broken')?.note).toBeUndefined();
  });

  it('treats an element that has never been flagged as having no flags', () => {
    expect(flagsOf(element() as DesignElement)).toEqual([]);
  });
});

describe('the list', () => {
  it('is empty when nothing was flagged', () => {
    expect(punchListFrom(docWith([{}, {}]))).toEqual([]);
  });

  it('collects flags from BOTH views — a defect on the phone layout is still a defect', () => {
    const rows = punchListFrom(docWith(
      [{ flags: [{ kind: 'broken' }] }],
      [{ flags: [{ kind: 'ugly' }] }],
    ));
    expect(rows.map((r) => r.view)).toEqual(['broken', 'ugly'].map((k) => (k === 'broken' ? 'desktop' : 'mobile')));
  });

  it('groups by KIND, not by view — the question is "what is broken"', () => {
    const rows = punchListFrom(docWith([
      { id: 'el-d1', flags: [{ kind: 'ugly' }] },
      { id: 'el-d2', flags: [{ kind: 'broken' }] },
    ]));
    expect(rows.map((r) => r.kind)).toEqual(['broken', 'ugly']);
  });

  it('carries the selector the element was traced from — the findable part', () => {
    const rows = punchListFrom(docWith([
      { importedFrom: 'jobs-page__search-btn', flags: [{ kind: 'non-functional', note: 'does nothing' }] },
    ]));
    expect(rows[0].selector).toBe('jobs-page__search-btn');
    expect(rows[0].route).toBe('/admin/jobs');
    expect(rows[0].note).toBe('does nothing');
  });

  it('still lists a drawn element that was never imported', () => {
    const rows = punchListFrom(docWith([{ flags: [{ kind: 'broken' }] }]));
    expect(rows).toHaveLength(1);
    expect(rows[0].selector).toBeUndefined();
    expect(rows[0].name).toBe('Search button');
  });

  it('produces one row per flag when an element carries two', () => {
    const rows = punchListFrom(docWith([{ flags: [{ kind: 'duplicate' }, { kind: 'ugly' }] }]));
    expect(rows).toHaveLength(2);
  });
});

describe('the exported document', () => {
  it('is empty for an empty list, rather than a file that says nothing', () => {
    const doc = docWith([{}]);
    expect(punchListMarkdown(doc, punchListFrom(doc))).toBe('');
  });

  it('writes checkboxes, because this one is worked through rather than read once', () => {
    const doc = docWith([{ importedFrom: 'jobs-page__search-btn', flags: [{ kind: 'broken', note: 'searches the wrong field' }] }]);
    const md = punchListMarkdown(doc, punchListFrom(doc));
    expect(md).toContain('- [ ]');
    expect(md).toContain('`.jobs-page__search-btn`');
    expect(md).toContain('searches the wrong field');
    expect(md).toContain('/admin/jobs');
  });

  it('only writes the headings for kinds that have something under them', () => {
    const doc = docWith([{ flags: [{ kind: 'ugly' }] }]);
    const md = punchListMarkdown(doc, punchListFrom(doc));
    expect(md).toContain('Looks wrong');
    expect(md).not.toContain('Duplicate');
  });

  it('says which view each row came from', () => {
    const doc = docWith([], [{ flags: [{ kind: 'broken' }] }]);
    expect(punchListMarkdown(doc, punchListFrom(doc))).toContain('(mobile)');
  });
});
