'use client';
// lib/admin/page-title.ts — the top bar's title, set by the page that knows it (owner, 2026-09-10).
//
// "In the header we have the title of the page … this one says 'Admin' … sometimes they are random
// and or generic in a way that is not helpful." The bar's title comes from a route map
// (AdminLayoutClient.getTitle), which can only ever say "Project Detail" for /admin/projects/<id>
// — it does not know the project. A page that does know calls `usePageTitle(...)` once its data
// has arrived, and the bar (and the browser tab) say "P-2026-0013 — ROUND ROCK HOUSING AUTHORITY"
// instead. Cleared when the page unmounts, so the next route starts from its own rule.

import { useEffect } from 'react';
import { create } from 'zustand';

interface PageTitleStore {
  title: string | null;
  setTitle: (title: string | null) => void;
}

export const usePageTitleStore = create<PageTitleStore>()((set) => ({
  title: null,
  setTitle: (title) => set({ title }),
}));

/** The brand half of the tab title, read from the layout's own metadata template on first use —
 *  not spelled here, so the firm's name stays in one place (the saas assumptions ratchet). */
let brandSuffix: string | null = null;
function tabTitle(t: string): string {
  if (brandSuffix === null && typeof document !== 'undefined') {
    const parts = document.title.split(' | ');
    // The LAST segment: the layout's own template already yields 'Admin | Starr … | Starr …'.
    brandSuffix = parts.length > 1 ? parts[parts.length - 1].trim() : '';
  }
  return brandSuffix ? `${t} | ${brandSuffix}` : t;
}

/** Set the top bar's title while this component is mounted. `null` keeps the route's own title. */
export function usePageTitle(title: string | null | undefined): void {
  const setTitle = usePageTitleStore((s) => s.setTitle);
  useEffect(() => {
    const t = title?.trim() || null;
    setTitle(t);
    if (t && typeof document !== 'undefined') document.title = tabTitle(t);
    return () => { setTitle(null); };
  }, [title, setTitle]);
}
