// __tests__/hub/widget-catalog-filter.test.ts
//
// Slice 100 — pure catalog-filter helpers behind the Add-Widget modal.
//
// React-side behaviour (focus, Esc-to-close, click-to-add) lives in
// the Playwright suite.

import { describe, it, expect } from 'vitest';
import React from 'react';

import {
  filterCatalog,
  groupByCategory,
  isBundleAllowed,
  isRoleAllowed,
  scoreEntry,
} from '@/lib/hub/widget-catalog-filter';
import type { WidgetDefinition, WidgetProps } from '@/lib/hub/widget-registry';

function w(
  id: string,
  partial: Partial<WidgetDefinition> = {},
): WidgetDefinition {
  return {
    id,
    label: partial.label ?? id,
    description: partial.description ?? `${id} desc`,
    category: partial.category ?? 'personal',
    iconName: partial.iconName ?? 'Star',
    defaultSize: partial.defaultSize ?? { w: 4, h: 2 },
    minSize: partial.minSize ?? { w: 3, h: 1 },
    maxSize: partial.maxSize ?? { w: 12, h: 4 },
    defaultContent: partial.defaultContent ?? {},
    allowedRoles: partial.allowedRoles ?? [],
    requiresBundle: partial.requiresBundle,
    Widget: partial.Widget ?? (function Stub(_: WidgetProps) { return React.createElement('div'); }),
    SettingsForm: partial.SettingsForm,
  };
}

describe('isRoleAllowed', () => {
  it('universal widgets (empty allowedRoles) match any user', () => {
    expect(isRoleAllowed(w('a'), [])).toBe(true);
    expect(isRoleAllowed(w('a'), ['student'])).toBe(true);
  });

  it('returns false when no role in user matches', () => {
    expect(isRoleAllowed(w('b', { allowedRoles: ['admin'] }), ['student'])).toBe(false);
  });

  it('returns true when any role intersects', () => {
    expect(
      isRoleAllowed(w('b', { allowedRoles: ['admin', 'field_crew'] }), ['student', 'field_crew']),
    ).toBe(true);
  });
});

describe('isBundleAllowed', () => {
  it('returns true when granted=null (gate skipped)', () => {
    expect(isBundleAllowed(w('a', { requiresBundle: 'office' }), null)).toBe(true);
  });

  it('returns true when widget has no requirement', () => {
    expect(isBundleAllowed(w('a'), new Set())).toBe(true);
  });

  it('returns true when required bundle is in granted set', () => {
    expect(
      isBundleAllowed(w('a', { requiresBundle: 'office' }), new Set(['office'])),
    ).toBe(true);
  });

  it('returns false when required bundle is missing', () => {
    expect(
      isBundleAllowed(w('a', { requiresBundle: 'office' }), new Set(['field'])),
    ).toBe(false);
  });
});

describe('scoreEntry', () => {
  const widget = w('quick-actions', {
    label: 'Quick Actions',
    description: 'Shortcuts to your most-used flows',
    category: 'personal',
  });

  it('exact label match wins (score 100)', () => {
    expect(scoreEntry(widget, 'quick actions')).toBe(100);
  });

  it('exact id match scores 90', () => {
    expect(scoreEntry(widget, 'quick-actions')).toBe(90);
  });

  it('label prefix scores 80', () => {
    expect(scoreEntry(widget, 'quick')).toBe(80);
  });

  it('label substring scores 60', () => {
    expect(scoreEntry(widget, 'actions')).toBe(60);
  });

  it('description substring scores 30', () => {
    expect(scoreEntry(widget, 'shortcuts')).toBe(30);
  });

  it('category substring scores 20', () => {
    expect(scoreEntry(widget, 'personal')).toBe(20);
  });

  it('no match returns 0', () => {
    expect(scoreEntry(widget, 'zzzzzz')).toBe(0);
  });

  it('empty term returns 1 (everything is a match)', () => {
    expect(scoreEntry(widget, '')).toBe(1);
  });
});

describe('filterCatalog', () => {
  const universal = w('pinned-pages', { category: 'personal' });
  const adminOnly = w('approvals', { category: 'office', allowedRoles: ['admin'] });
  const cadGated = w('cad-status', { category: 'cad', requiresBundle: 'office' });
  const catalog = [universal, adminOnly, cadGated];

  it('filters out role-gated widgets when the user lacks the role', () => {
    const out = filterCatalog(catalog, { roles: ['student'], activeBundles: null });
    expect(out.map((w) => w.id)).toEqual(['pinned-pages', 'cad-status']);
  });

  it('admin sees role-gated widgets too', () => {
    const out = filterCatalog(catalog, { roles: ['admin'], activeBundles: null });
    expect(out.map((w) => w.id)).toEqual(['pinned-pages', 'approvals', 'cad-status']);
  });

  it('enforces bundle gate when activeBundles is provided', () => {
    const out = filterCatalog(catalog, { roles: ['admin'], activeBundles: ['field'] });
    expect(out.map((w) => w.id)).toEqual(['pinned-pages', 'approvals']);
  });

  it('null activeBundles skips the bundle gate', () => {
    const out = filterCatalog(catalog, { roles: ['admin'], activeBundles: null });
    expect(out.map((w) => w.id)).toContain('cad-status');
  });

  it('search filters to scoring matches only', () => {
    const out = filterCatalog(catalog, { roles: ['admin'], activeBundles: null, search: 'pin' });
    expect(out.map((w) => w.id)).toEqual(['pinned-pages']);
  });

  it('search results are sorted by score (best first)', () => {
    const a = w('a', { label: 'Quick Actions' });
    const b = w('b', { label: 'Actions report', description: 'reports your actions' });
    const out = filterCatalog([a, b], { roles: [], activeBundles: null, search: 'actions' });
    expect(out.map((x) => x.id)).toEqual(['b', 'a']);
    // 'Actions report' starts with 'actions' (prefix=80) vs 'Quick Actions' which contains (60).
  });

  it('category filter narrows to one category', () => {
    const out = filterCatalog(catalog, { roles: ['admin'], activeBundles: null, category: 'office' });
    expect(out.map((w) => w.id)).toEqual(['approvals']);
  });

  it('category="all" is equivalent to no filter', () => {
    const all = filterCatalog(catalog, { roles: ['admin'], activeBundles: null, category: 'all' });
    const none = filterCatalog(catalog, { roles: ['admin'], activeBundles: null });
    expect(all.map((w) => w.id)).toEqual(none.map((w) => w.id));
  });

  it('preserves catalog order when no search term', () => {
    const out = filterCatalog(catalog, { roles: ['admin'], activeBundles: null });
    expect(out.map((w) => w.id)).toEqual(['pinned-pages', 'approvals', 'cad-status']);
  });
});

describe('groupByCategory', () => {
  it('buckets widgets by their declared category', () => {
    const list = [w('a', { category: 'personal' }), w('b', { category: 'personal' }), w('c', { category: 'work' })];
    const grouped = groupByCategory(list);
    expect(grouped.get('personal')?.map((x) => x.id)).toEqual(['a', 'b']);
    expect(grouped.get('work')?.map((x) => x.id)).toEqual(['c']);
    expect(grouped.has('research')).toBe(false);
  });

  it('preserves insertion order within a bucket', () => {
    const a = w('a', { category: 'personal' });
    const b = w('b', { category: 'personal' });
    const grouped = groupByCategory([b, a]);
    expect(grouped.get('personal')?.map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('empty list returns empty map', () => {
    expect(groupByCategory([]).size).toBe(0);
  });
});
