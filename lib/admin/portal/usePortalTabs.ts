'use client';

// lib/admin/portal/usePortalTabs.ts — the tab strip, bound to the URL.
//
// C2 of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// Everything decidable without a router lives in `./tabs.ts` and is tested there. This is the thin
// part: read the query string, write the query string, and hand the caller the answer.
//
// ── WHY THE TAB IS IN THE URL AT ALL ────────────────────────────────────────────────────────────
//
// Both examples this was extracted from say it in almost the same words, three months apart:
//
//     "a reload keeps you where you were, the browser's back button steps between tabs the way
//      people expect, and — the one that matters most — a tab is a link somebody can send. 'Look at
//      the upload log' should be a URL, not four instructions."
//
// It is also what makes a consolidation's redirects honest. Forwarding `/admin/billing/invoices` to
// a portal that held its tab in `useState` could only ever land on the overview, which looks exactly
// like the invoices having gone missing.

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFeatureToggles } from '@/lib/admin/use-feature-toggles';
import {
  resolveTab, visibleTabs, portalHref, defaultTabFor,
  type PortalSpec, type PortalTab, type Viewer,
} from './tabs';

export interface PortalTabsResult {
  /** The tab showing now. `null` only when this viewer can see no tab at all. */
  active: string | null;
  /** The tabs to draw, already filtered by role, bundle and the firm's toggles. */
  tabs: PortalTab[];
  /** Switch tabs, keeping whatever else is in the query string. */
  select: (tabId: string) => void;
  /** Rewrite the query string wholesale — for a portal with a second parameter of its own. */
  navigate: (tabId: string, others: Record<string, string>) => void;
  /** An `href` for a tab, so a strip can be real links rather than buttons. */
  hrefFor: (tabId: string) => string;
}

export function usePortalTabs(
  spec: PortalSpec,
  viewer: Viewer,
  /**
   * The other query parameters this portal owns, as they are RIGHT NOW.
   *
   * Marketing passes its date range; billing passes nothing. The shell cannot infer this — see the
   * long note in `tabs.ts` — and guessing by copying every parameter through would carry a stale
   * `?invoice=inv_123` from one tab onto another, where it means nothing and confuses whatever
   * reads it.
   */
  others: Record<string, string> = {},
): PortalTabsResult {
  const router = useRouter();
  const params = useSearchParams();
  const toggles = useFeatureToggles();

  const tabs = useMemo(() => visibleTabs(spec, viewer, toggles), [spec, viewer, toggles]);
  const active = useMemo(
    () => resolveTab(spec, params.get('tab'), viewer, toggles),
    [spec, params, viewer, toggles],
  );

  const navigate = useCallback((tabId: string, next: Record<string, string>) => {
    // `replace`, not `push`, and `scroll: false`. Flicking between four tabs should not bury the
    // page you arrived from under four history entries, and it should not jump you to the top of a
    // page you are already reading. Both examples independently arrived at this.
    router.replace(portalHref(spec, tabId, viewer, next), { scroll: false });
  }, [router, spec, viewer]);

  const select = useCallback((tabId: string) => navigate(tabId, others), [navigate, others]);

  const hrefFor = useCallback(
    (tabId: string) => portalHref(spec, tabId, viewer, others),
    [spec, viewer, others],
  );

  return { active, tabs, select, navigate, hrefFor };
}

/** Re-exported so a portal imports one module. */
export { defaultTabFor, type PortalSpec, type PortalTab, type Viewer };
