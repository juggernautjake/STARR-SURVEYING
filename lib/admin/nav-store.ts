// lib/admin/nav-store.ts
//
// Zustand store for the admin nav redesign — Cmd+K palette UI state +
// the persisted recents list. Pinning, rail collapse state, and persona
// override land in later phases (§5.5); this slice only ships what the
// palette needs. Spec: docs/planning/in-progress/ADMIN_NAVIGATION_REDESIGN.md §5.5.
//
// Separate from `lib/cad/store/ui-store.ts` because the admin shell and
// the CAD editor have unrelated concerns + different persist keys.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const MAX_RECENT_ROUTES = 50;

interface AdminNavStore {
  paletteOpen: boolean;
  /** Most-recently-visited first. Capped at MAX_RECENT_ROUTES; the
   *  capped list survives reloads. Used as both the Hub's Recent column
   *  source (top 6) and the empty-query palette's Recent section. */
  recentRoutes: string[];
  /** Phase 3 — when true, AdminLayoutClient shows the new IconRail
   *  instead of AdminSidebar. Default off; flipped to true by default
   *  in Phase 5 after the PR-cycle grace. Persisted so a user can
   *  opt-in for early review. */
  adminNavV2Enabled: boolean;

  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;

  /** Records a route visit. Deduplicates so a re-visit moves the entry
   *  to the front; trims to MAX_RECENT_ROUTES. */
  pushRecent: (href: string) => void;
  clearRecents: () => void;

  setNavV2: (enabled: boolean) => void;
}

export const useAdminNavStore = create<AdminNavStore>()(
  persist(
    (set) => ({
      paletteOpen: false,
      recentRoutes: [],
      adminNavV2Enabled: false,

      openPalette: () => set({ paletteOpen: true }),
      closePalette: () => set({ paletteOpen: false }),
      togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),

      pushRecent: (href) =>
        set((s) => {
          if (!href || !href.startsWith('/admin/')) return s;
          const without = s.recentRoutes.filter((r) => r !== href);
          const next = [href, ...without].slice(0, MAX_RECENT_ROUTES);
          return { recentRoutes: next };
        }),

      clearRecents: () => set({ recentRoutes: [] }),

      setNavV2: (enabled) => set({ adminNavV2Enabled: !!enabled }),
    }),
    {
      name: 'starr-admin-nav',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        recentRoutes: s.recentRoutes,
        adminNavV2Enabled: s.adminNavV2Enabled,
      }),
    },
  ),
);
