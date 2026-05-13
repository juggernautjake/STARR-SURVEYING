// lib/admin/nav-store.ts
//
// Zustand store for the admin nav redesign — Cmd+K palette UI state +
// the persisted recents list. Pinning, rail collapse state, and persona
// override land in later phases (§5.5); this slice only ships what the
// palette needs. Spec: docs/planning/completed/ADMIN_NAVIGATION_REDESIGN.md §5.5.
//
// Separate from `lib/cad/store/ui-store.ts` because the admin shell and
// the CAD editor have unrelated concerns + different persist keys.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import type { Persona } from './personas';

export const MAX_RECENT_ROUTES = 50;
export const MAX_PINNED_ROUTES = 5;

interface AdminNavStore {
  paletteOpen: boolean;
  /** Most-recently-visited first. Capped at MAX_RECENT_ROUTES; the
   *  capped list survives reloads. Used as both the Hub's Recent column
   *  source (top 6) and the empty-query palette's Recent section. */
  recentRoutes: string[];
  /** Phase 4 — user-curated pinned page hrefs, capped at
   *  MAX_PINNED_ROUTES. Insertion order is preserved (newest at the
   *  end). Surfaces on the IconRail below the workspaces and as the
   *  Hub's Pinned column. */
  pinnedRoutes: string[];
  /** Phase 3 — when true, AdminLayoutClient shows the new IconRail
   *  instead of AdminSidebar. Default off; flipped to true by default
   *  in Phase 5 after the PR-cycle grace. Persisted so a user can
   *  opt-in for early review. */
  adminNavV2Enabled: boolean;
  /** Phase 4 — when set, the rail uses this persona's order instead
   *  of the one inferred from `session.user.roles`. Lets a multi-hat
   *  user lock the view they actually want. `null` ⇒ infer from
   *  roles. */
  personaOverride: Persona | null;

  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;

  /** Records a route visit. Deduplicates so a re-visit moves the entry
   *  to the front; trims to MAX_RECENT_ROUTES. */
  pushRecent: (href: string) => void;
  clearRecents: () => void;

  /** Adds the href to pinnedRoutes if not already pinned. No-op when
   *  the cap is hit. Returns true if anything changed. */
  pinRoute: (href: string) => boolean;
  unpinRoute: (href: string) => boolean;
  /** Returns the post-toggle pinned state (true = pinned). */
  togglePin: (href: string) => boolean;

  setNavV2: (enabled: boolean) => void;
  setPersonaOverride: (persona: Persona | null) => void;
}

export const useAdminNavStore = create<AdminNavStore>()(
  persist(
    (set, get) => ({
      paletteOpen: false,
      recentRoutes: [],
      pinnedRoutes: [],
      // Phase 5 cutover — V2 is the default. Existing users who
      // already opted in keep their stored true; new users land on
      // the rail by default. The HubGreeting still offers a "Revert
      // to old nav" toggle until AdminSidebar is deleted (gated on
      // the §8 Phase 5 PR-cycle grace period — see deferral note in
      // the planning doc).
      adminNavV2Enabled: true,
      personaOverride: null,

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

      pinRoute: (href) => {
        if (!href || !href.startsWith('/admin/')) return false;
        const state = get();
        if (state.pinnedRoutes.includes(href)) return false;
        if (state.pinnedRoutes.length >= MAX_PINNED_ROUTES) return false;
        set({ pinnedRoutes: [...state.pinnedRoutes, href] });
        return true;
      },

      unpinRoute: (href) => {
        const state = get();
        if (!state.pinnedRoutes.includes(href)) return false;
        set({ pinnedRoutes: state.pinnedRoutes.filter((r) => r !== href) });
        return true;
      },

      togglePin: (href) => {
        const state = get();
        if (state.pinnedRoutes.includes(href)) {
          set({ pinnedRoutes: state.pinnedRoutes.filter((r) => r !== href) });
          return false;
        }
        if (!href || !href.startsWith('/admin/')) return false;
        if (state.pinnedRoutes.length >= MAX_PINNED_ROUTES) return false;
        set({ pinnedRoutes: [...state.pinnedRoutes, href] });
        return true;
      },

      setNavV2: (enabled) => set({ adminNavV2Enabled: !!enabled }),

      setPersonaOverride: (persona) => set({ personaOverride: persona }),
    }),
    {
      name: 'starr-admin-nav',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        recentRoutes: s.recentRoutes,
        pinnedRoutes: s.pinnedRoutes,
        adminNavV2Enabled: s.adminNavV2Enabled,
        personaOverride: s.personaOverride,
      }),
    },
  ),
);
