'use client';

// lib/hub/use-hub-badges.tsx
//
// ONE FETCH FOR EVERY WIDGET'S BADGE (owner request, 2026-08-05)
// ═════════════════════════════════════════════════════════════
//
// *"If they have that widget or quick action on their hub, it should have a notification icon."*
//
// Each widget renders in its own cell, so a naive "each widget fetches its own count" would fire one
// request per widget on every hub load — a dozen calls for one number split twelve ways. This is a
// single provider that fetches `/api/admin/hub/badges` ONCE and hands each widget its slice.
//
// ── WHY IT REFRESHES THE WAY IT DOES ────────────────────────────────────────────────────────────
//
// A badge that only loads once goes stale the moment an event arrives, and a badge that polls hard
// wastes requests on a page nobody is looking at. So: fetch on mount, again when the tab regains
// focus (the common "come back and check" moment), and on a slow 60s heartbeat while visible. Not
// while editing the hub — a badge over a drag handle is noise, and the counts do not change from
// dragging widgets around.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useHubStore } from './hub-store';

interface BadgeFeed {
  widgets: Record<string, number>;
  quickActions: Record<string, number>;
}

const EMPTY: BadgeFeed = { widgets: {}, quickActions: {} };
const HubBadgeContext = createContext<BadgeFeed>(EMPTY);

/** How often to re-check while the tab is visible. Deliberately slow — badges are a nudge, not a
 *  live ticker, and the focus refetch covers the "I just came back" case that matters most. */
const HEARTBEAT_MS = 60_000;

export function HubBadgeProvider({ children }: { children: React.ReactNode }) {
  const isEditMode = useHubStore((s) => s.isEditMode);
  const [feed, setFeed] = useState<BadgeFeed>(EMPTY);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/hub/badges');
      if (!res.ok) return; // A failed badge fetch leaves the last counts; it never blanks the hub.
      const body = await res.json();
      setFeed({ widgets: body.widgets ?? {}, quickActions: body.quickActions ?? {} });
    } catch {
      // Silent. A badge is a convenience; its fetch failing must not surface an error on the hub.
    }
  }, []);

  useEffect(() => {
    // Editing does not change the counts and a badge over a drag handle is clutter — pause both the
    // fetch and the heartbeat while the editor is open.
    if (isEditMode) return;

    load();
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(() => {
      // Do not poll a backgrounded tab.
      if (document.visibilityState === 'visible') load();
    }, HEARTBEAT_MS);

    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
  }, [isEditMode, load]);

  return <HubBadgeContext.Provider value={feed}>{children}</HubBadgeContext.Provider>;
}

/** The unread count for one widget type, or 0. Reads the shared feed — no fetch of its own. */
export function useWidgetBadge(widgetType: string): number {
  const feed = useContext(HubBadgeContext);
  return feed.widgets[widgetType] ?? 0;
}

/** The unread count for one quick-action id, or 0. */
export function useQuickActionBadge(actionId: string): number {
  const feed = useContext(HubBadgeContext);
  return feed.quickActions[actionId] ?? 0;
}

/** The whole quick-action badge map, for the Quick Actions widget which renders many at once. */
export function useQuickActionBadges(): Record<string, number> {
  const feed = useContext(HubBadgeContext);
  return useMemo(() => feed.quickActions, [feed.quickActions]);
}
