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

import React, { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFeatureToggles } from '@/lib/admin/use-feature-toggles';
import {
  resolveTab, visibleTabs, portalHref, defaultTabFor,
  type PortalSpec, type PortalTab, type Viewer,
} from './tabs';
import { siblingTabs, tabMoveTarget } from './tab-keyboard';

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
  /**
   * `onKeyDown` for a tab button — the keyboard half of `role="tablist"`.
   *
   * Lives here because every portal that declares the role owes the behaviour, and measuring it on
   * 2026-08-31 found **three of seventeen implementing none of it** while the other fourteen each
   * hand-rolled the same eight lines, none with Home/End. See `./tab-keyboard.ts`.
   *
   * Spread it onto the button; it needs nothing else:
   *
   *     <button role="tab" tabIndex={isActive ? 0 : -1} onKeyDown={tabKeyDown}>
   */
  tabKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
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

  const tabKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    const el = e.currentTarget;
    // The bar is asked for its own tabs rather than an id convention being assumed. The seventeen
    // portals do not share one — several put no id on their tabs at all — and an id lookup that
    // drifts focuses NOTHING, which looks exactly like arrow keys never having been wired.
    const els = siblingTabs(el);
    const ids = els.map((n) => n.getAttribute('data-tab-id') ?? '');
    const here = el.getAttribute('data-tab-id') ?? '';

    const targetId = tabMoveTarget(e.key, ids, here);
    if (targetId === null) return;  // Tab, Enter, Space and everything else still behave normally.
    e.preventDefault();

    select(targetId);
    // Focus FOLLOWS selection. Without it the ring stays on the tab you left and a screen reader
    // announces a tab you are no longer on, which is worse than no arrow support at all.
    els[ids.indexOf(targetId)]?.focus();
  }, [select]);

  return { active, tabs, select, navigate, hrefFor, tabKeyDown };
}

/** Re-exported so a portal imports one module. */
export { defaultTabFor, type PortalSpec, type PortalTab, type Viewer };
