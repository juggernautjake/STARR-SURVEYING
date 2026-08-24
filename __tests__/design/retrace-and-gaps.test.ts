// __tests__/design/retrace-and-gaps.test.ts — what a re-trace says, and what a page is still missing.
//
// Phases P3, N3 and T3 of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// Three small pure surfaces, each of which is the difference between a feature that helps and one
// that quietly misleads:
//
//   · a re-trace that replaces the record of a page and does not say what changed
//   · a work queue that cannot be filtered to the work
//   · a designer theme that reaches the portal missing half its colours

import { describe, it, expect } from 'vitest';
import { diffDefaults } from '@/lib/design/conformance';
import { joinPages } from '@/lib/design/pages';
import { paletteFromTokens } from '@/lib/design/portal-themes';
import { createDocument, addElement, type DesignDocument, type DesignElement } from '@/lib/design/document';

const NOW = '2026-08-23T12:00:00.000Z';

function doc(elements: Array<Partial<DesignElement>>): DesignDocument {
  const base = createDocument({ id: 'd', name: 'n', route: '/admin/jobs', now: NOW });
  let view = base.views.desktop;
  elements.forEach((patch, i) => {
    view = addElement(view, {
      id: `el-${i}`, kind: 'catalogue', slots: {}, style: {}, x: 0, y: 0, w: 100, h: 40, ...patch,
    } as Omit<DesignElement, 'z'>);
  });
  return { ...base, views: { ...base.views, desktop: view } };
}

describe('a re-trace says what moved', () => {
  it('says nothing on a first trace, because nothing changed', () => {
    // 130 rows of "0 added, 0 removed" would bury the routes that did move.
    expect(diffDefaults(null, doc([{ importedFrom: 'jobs-table' }]))).toEqual([]);
  });

  it('names what the page gained and what it lost', () => {
    const before = doc([{ importedFrom: 'jobs-table' }, { importedFrom: 'jobs-page__legend' }]);
    const after = doc([{ importedFrom: 'jobs-table' }, { importedFrom: 'jobs-page__filters' }]);
    const desktop = diffDefaults(before, after).find((c) => c.view === 'desktop')!;

    expect(desktop.added).toEqual(['.jobs-page__filters']);
    expect(desktop.removed).toEqual(['.jobs-page__legend']);
  });

  it('reports a real move with the distance, and ignores a nudge', () => {
    const before = doc([{ importedFrom: 'jobs-table', y: 100 }, { importedFrom: 'jobs-page__btn', y: 40 }]);
    const after = doc([{ importedFrom: 'jobs-table', y: 400 }, { importedFrom: 'jobs-page__btn', y: 46 }]);
    const desktop = diffDefaults(before, after).find((c) => c.view === 'desktop')!;

    expect(desktop.moved).toEqual([{ signature: '.jobs-table', by: 300 }]);
  });

  it('counts both views, because a phone layout changes on its own', () => {
    const changes = diffDefaults(doc([]), doc([{ importedFrom: 'jobs-table' }]));
    expect(changes.map((c) => c.view)).toEqual(['desktop', 'mobile']);
  });
});

describe('the page list knows what each page is missing', () => {
  const route = '/admin/jobs';

  it('names every gap on an untouched page', () => {
    const row = joinPages([], [], []).find((p) => p.route === route)!;
    expect(row.gaps).toContain('no-default');
    expect(row.gaps).toContain('no-dossier');
    expect(row.gaps).toContain('no-design');
  });

  it('does not complain twice about a page with nothing designed', () => {
    // "No design of record" on a page with no designs at all is the same complaint in different
    // words, and a work queue that says everything twice is one people stop reading.
    const row = joinPages([], [], []).find((p) => p.route === route)!;
    expect(row.gaps).not.toContain('no-active');
  });

  it('asks for a design of record once designs exist', () => {
    const row = joinPages(
      [],
      [{ id: 'd1', name: 'A draft', route, status: 'draft', locked: false }],
      [],
    ).find((p) => p.route === route)!;
    expect(row.gaps).toContain('no-active');
    expect(row.gaps).not.toContain('no-design');
  });

  it('clears the gaps a page has actually filled', () => {
    const row = joinPages(
      [],
      [
        { id: 'd0', name: 'as served', route, status: 'default', locked: true },
        { id: 'd1', name: 'the record', route, status: 'active', locked: false },
      ],
      [{ route, purpose: 'The list every job passes through.', summary: 'Long form.', elementCount: 42 }],
    ).find((p) => p.route === route)!;

    expect(row.gaps).toEqual([]);
    expect(row.dossier).toMatchObject({ state: 'complete', elementCount: 42 });
  });
});

describe('a designer theme arrives in the portal with all fourteen colours', () => {
  it('fills the gaps from the theme’s own colours, not from a light default', () => {
    // A dark theme that never named a border must not get a pale grey that only works on white.
    const palette = paletteFromTokens({
      '--theme-bg-page': '#0B1020',
      '--theme-bg-surface': '#131A2E',
      '--theme-fg-primary': '#E8ECF6',
      '--theme-accent': '#7AA2F7',
    });
    expect(palette.border).toBe('#131A2E');
    expect(palette.bgElevated).toBe('#131A2E');
    expect(palette.fgSecondary).toBe('#E8ECF6');
  });

  it('reads the catalogue’s own token names when the theme tokens are absent', () => {
    const palette = paletteFromTokens({
      '--color-bg-app': '#FFFFFF',
      '--color-text-primary': '#111111',
      '--color-brand-navy': '#1D3095',
    });
    expect(palette.bgPage).toBe('#FFFFFF');
    expect(palette.fgPrimary).toBe('#111111');
    expect(palette.accent).toBe('#1D3095');
  });

  it('never returns an empty value for any of the fourteen', () => {
    const palette = paletteFromTokens({});
    expect(Object.values(palette).every((v) => typeof v === 'string' && v.length > 0)).toBe(true);
    expect(Object.keys(palette)).toHaveLength(14);
  });
});
