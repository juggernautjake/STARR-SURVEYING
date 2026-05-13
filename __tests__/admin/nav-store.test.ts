// __tests__/admin/nav-store.test.ts
//
// Phase 1 slice 1b — locks the recents LRU + cap + non-admin-href
// rejection. The palette UI consumes this store; tests guard the data
// behavior so the modal can stay focused on UX.
//
// Spec: docs/planning/in-progress/ADMIN_NAVIGATION_REDESIGN.md §5.5 + §12.

import { beforeEach, describe, expect, it } from 'vitest';

import { MAX_RECENT_ROUTES, useAdminNavStore } from '@/lib/admin/nav-store';

function reset() {
  useAdminNavStore.setState({ paletteOpen: false, recentRoutes: [] });
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
