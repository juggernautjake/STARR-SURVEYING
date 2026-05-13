// __tests__/admin/nav-store.test.ts
//
// Phase 1 slice 1b — locks the recents LRU + cap + non-admin-href
// rejection. The palette UI consumes this store; tests guard the data
// behavior so the modal can stay focused on UX.
//
// Spec: docs/planning/completed/ADMIN_NAVIGATION_REDESIGN.md §5.5 + §12.

import { beforeEach, describe, expect, it } from 'vitest';

import {
  MAX_PINNED_ROUTES,
  MAX_RECENT_ROUTES,
  useAdminNavStore,
} from '@/lib/admin/nav-store';

function reset() {
  useAdminNavStore.setState({
    paletteOpen: false,
    recentRoutes: [],
    pinnedRoutes: [],
    adminNavV2Enabled: false,
  });
}

describe('admin nav-store — palette state', () => {
  beforeEach(reset);

  it('starts closed', () => {
    expect(useAdminNavStore.getState().paletteOpen).toBe(false);
  });

  it('openPalette + closePalette flip the flag', () => {
    useAdminNavStore.getState().openPalette();
    expect(useAdminNavStore.getState().paletteOpen).toBe(true);
    useAdminNavStore.getState().closePalette();
    expect(useAdminNavStore.getState().paletteOpen).toBe(false);
  });

  it('togglePalette inverts the flag', () => {
    useAdminNavStore.getState().togglePalette();
    expect(useAdminNavStore.getState().paletteOpen).toBe(true);
    useAdminNavStore.getState().togglePalette();
    expect(useAdminNavStore.getState().paletteOpen).toBe(false);
  });
});

describe('admin nav-store — recents (LRU)', () => {
  beforeEach(reset);

  it('pushRecent prepends a new entry', () => {
    useAdminNavStore.getState().pushRecent('/admin/jobs');
    expect(useAdminNavStore.getState().recentRoutes).toEqual(['/admin/jobs']);
  });

  it('pushRecent dedupes — re-visits move to the front', () => {
    const s = useAdminNavStore.getState();
    s.pushRecent('/admin/jobs');
    s.pushRecent('/admin/receipts');
    s.pushRecent('/admin/jobs'); // revisit
    expect(useAdminNavStore.getState().recentRoutes).toEqual([
      '/admin/jobs',
      '/admin/receipts',
    ]);
  });

  it('pushRecent caps at MAX_RECENT_ROUTES (50)', () => {
    const s = useAdminNavStore.getState();
    for (let i = 0; i < MAX_RECENT_ROUTES + 10; i += 1) {
      s.pushRecent(`/admin/route-${i}`);
    }
    const list = useAdminNavStore.getState().recentRoutes;
    expect(list).toHaveLength(MAX_RECENT_ROUTES);
    // Most-recent first: the last pushed entry sits at index 0.
    expect(list[0]).toBe(`/admin/route-${MAX_RECENT_ROUTES + 9}`);
  });

  it('pushRecent ignores non-admin hrefs', () => {
    const s = useAdminNavStore.getState();
    s.pushRecent('/marketing/about');
    s.pushRecent('');
    expect(useAdminNavStore.getState().recentRoutes).toEqual([]);
  });

  it('clearRecents empties the list', () => {
    const s = useAdminNavStore.getState();
    s.pushRecent('/admin/jobs');
    s.pushRecent('/admin/receipts');
    s.clearRecents();
    expect(useAdminNavStore.getState().recentRoutes).toEqual([]);
  });
});

describe('admin nav-store — pinning', () => {
  beforeEach(reset);

  it('pinRoute appends a new href in insertion order', () => {
    useAdminNavStore.getState().pinRoute('/admin/receipts');
    useAdminNavStore.getState().pinRoute('/admin/cad');
    expect(useAdminNavStore.getState().pinnedRoutes).toEqual([
      '/admin/receipts',
      '/admin/cad',
    ]);
  });

  it('pinRoute is a no-op when the href is already pinned', () => {
    const s = useAdminNavStore.getState();
    s.pinRoute('/admin/receipts');
    const changed = s.pinRoute('/admin/receipts');
    expect(changed).toBe(false);
    expect(useAdminNavStore.getState().pinnedRoutes).toEqual(['/admin/receipts']);
  });

  it('pinRoute caps at MAX_PINNED_ROUTES (5)', () => {
    const s = useAdminNavStore.getState();
    for (let i = 0; i < MAX_PINNED_ROUTES; i += 1) {
      s.pinRoute(`/admin/p-${i}`);
    }
    const extra = s.pinRoute('/admin/overflow');
    expect(extra).toBe(false);
    expect(useAdminNavStore.getState().pinnedRoutes).toHaveLength(MAX_PINNED_ROUTES);
    expect(useAdminNavStore.getState().pinnedRoutes).not.toContain('/admin/overflow');
  });

  it('pinRoute rejects non-admin hrefs', () => {
    const changed = useAdminNavStore.getState().pinRoute('/marketing/about');
    expect(changed).toBe(false);
    expect(useAdminNavStore.getState().pinnedRoutes).toEqual([]);
  });

  it('unpinRoute removes an existing pin', () => {
    const s = useAdminNavStore.getState();
    s.pinRoute('/admin/receipts');
    s.pinRoute('/admin/cad');
    const changed = s.unpinRoute('/admin/receipts');
    expect(changed).toBe(true);
    expect(useAdminNavStore.getState().pinnedRoutes).toEqual(['/admin/cad']);
  });

  it('togglePin flips state and reports the new value', () => {
    const s = useAdminNavStore.getState();
    expect(s.togglePin('/admin/receipts')).toBe(true);
    expect(useAdminNavStore.getState().pinnedRoutes).toContain('/admin/receipts');
    expect(s.togglePin('/admin/receipts')).toBe(false);
    expect(useAdminNavStore.getState().pinnedRoutes).not.toContain('/admin/receipts');
  });

  it('togglePin is a no-op at the cap (returns false; AdminPageHeader gates the cap-hit toast before calling)', () => {
    const s = useAdminNavStore.getState();
    for (let i = 0; i < MAX_PINNED_ROUTES; i += 1) {
      s.pinRoute(`/admin/p-${i}`);
    }
    const result = s.togglePin('/admin/extra');
    expect(result).toBe(false);
    expect(useAdminNavStore.getState().pinnedRoutes).not.toContain('/admin/extra');
  });
});
