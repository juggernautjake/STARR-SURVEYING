// __tests__/admin/hub-w6-quick-actions-audit.test.ts
//
// Slice W6 — audit the quick-actions catalog. Every `link` entry
// must point at a real admin route. Locks the contract so future
// catalog additions don't drift past the registry.

import { describe, it, expect } from 'vitest';
import {
  findBrokenQuickActionHrefs,
  hrefPath,
} from '@/lib/hub/quick-actions-validator';
import { QUICK_ACTIONS_CATALOG } from '@/lib/hub/quick-actions-catalog';
import { ADMIN_ROUTES } from '@/lib/admin/route-registry';

describe('hrefPath (pure)', () => {
  it('strips the query string', () => {
    expect(hrefPath('/admin/me?tab=hours')).toBe('/admin/me');
  });
  it('strips the fragment', () => {
    expect(hrefPath('/admin/work#crew')).toBe('/admin/work');
  });
  it('returns the raw href when there is no query or fragment', () => {
    expect(hrefPath('/admin/cad')).toBe('/admin/cad');
  });
});

describe('findBrokenQuickActionHrefs (pure)', () => {
  it("returns an empty list when every link's path lives in the registry", () => {
    expect(findBrokenQuickActionHrefs(
      [{ id: 'a', label: 'A', description: '', iconName: 'X', kind: 'link', href: '/admin/cad', allowedRoles: [] }],
      [{ href: '/admin/cad' }],
    )).toEqual([]);
  });

  it('flags a link whose href is missing from the registry', () => {
    expect(findBrokenQuickActionHrefs(
      [{ id: 'a', label: 'A', description: '', iconName: 'X', kind: 'link', href: '/admin/typo', allowedRoles: [] }],
      [{ href: '/admin/cad' }],
    )).toEqual([{ id: 'a', href: '/admin/typo', reason: 'not-in-registry' }]);
  });

  it("skips `action` kinds — only `link` kinds need a registry match", () => {
    expect(findBrokenQuickActionHrefs(
      [{ id: 'a', label: 'A', description: '', iconName: 'X', kind: 'action', actionId: 'a', allowedRoles: [] }],
      [],
    )).toEqual([]);
  });

  it('matches a link with a query string via the path portion', () => {
    expect(findBrokenQuickActionHrefs(
      [{ id: 'a', label: 'A', description: '', iconName: 'X', kind: 'link', href: '/admin/me?tab=hours', allowedRoles: [] }],
      [{ href: '/admin/me' }],
    )).toEqual([]);
  });
});

describe("the live catalog routes to real registry entries (W6)", () => {
  it('every link in QUICK_ACTIONS_CATALOG resolves against ADMIN_ROUTES', () => {
    const broken = findBrokenQuickActionHrefs(QUICK_ACTIONS_CATALOG, ADMIN_ROUTES);
    expect(broken).toEqual([]);
  });

  it("the clock-in-out tile is a real action handled by the widget (quick-actions-wiring-2026-06-22)", () => {
    // W6 originally converted this from a placeholder action to a link
    // at /admin/me?tab=hours, but that tab was archived and the link
    // went nowhere useful. quick-actions-wiring-2026-06-22 flipped it
    // back to a real action whose handler in the widget opens the same
    // ClockInModal / ClockOutModal the top-bar pill uses.
    const entry = QUICK_ACTIONS_CATALOG.find((a) => a.id === 'clock-in-out');
    expect(entry).toBeDefined();
    expect(entry!.kind).toBe('action');
    expect(entry!.actionId).toBe('clock-in-out');
  });

  it("the capture-receipt tile routes to the web upload page (quick-actions-wiring-2026-06-22)", () => {
    const entry = QUICK_ACTIONS_CATALOG.find((a) => a.id === 'capture-receipt');
    expect(entry).toBeDefined();
    expect(entry!.kind).toBe('link');
    expect(entry!.href).toBe('/admin/receipts/new');
  });
});
