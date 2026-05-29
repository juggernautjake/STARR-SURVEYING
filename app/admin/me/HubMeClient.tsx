'use client';
// app/admin/me/HubMeClient.tsx
//
// Client wrapper that calls `useHubStore.hydrate()` with the server-
// fetched layout on mount, registers every widget via the side-effect
// barrel, and renders `<HubProviders><HubCanvas /></HubProviders>`.
//
// The page itself stays a server component so first paint already has
// the saved layout (no client-side loading skeleton on initial load).
//
// Slice 187 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useEffect } from 'react';
import type { UserRole } from '@/lib/auth';
import type { BundleId } from '@/lib/saas/bundles';
import type { HubLayoutRow } from '@/lib/hub/types';

import HubProviders from '@/lib/hub/components/HubProviders';
import HubCanvas from '@/lib/hub/components/HubCanvas';
import { useHubStore } from '@/lib/hub/hub-store';
import { hydrateHubDataFromAggregator } from '@/lib/hub/use-hub-data';

// Side-effect import: every shipped widget calls defineWidget at module
// evaluation. Mounting this once at the canvas entry point means the
// registry is populated before WidgetGrid asks for a widget by type.
import '@/lib/hub/widgets/register-all';

export interface HubMeClientProps {
  layout: HubLayoutRow;
  roles: UserRole[];
  activeBundles?: BundleId[] | null;
  /** True when the layout is the persona-default seed (no saved row).
   *  Drives the Slice 196 welcome tip. */
  isSeeded?: boolean;
}

export default function HubMeClient({ layout, roles, activeBundles = null, isSeeded = false }: HubMeClientProps) {
  const hydrate = useHubStore((s) => s.hydrate);
  const enterEditMode = useHubStore((s) => s.enterEditMode);

  // Push the server-fetched layout into the store on mount. Subsequent
  // theme/density/font-scale changes from the picker flow through the
  // store directly + re-render HubProviders + the canvas in place.
  useEffect(() => {
    hydrate({
      widgets: layout.widgets,
      theme: layout.theme,
      customTheme: layout.customTheme,
      density: layout.density,
      fontScale: layout.fontScale,
      hubSettings: layout.hubSettings,
      activePersona: layout.activePersona,
    });
  }, [hydrate, layout]);

  // Slice 198 of hub-editor-performance-and-ux-2026-05-29.md —
  // collapse N parallel per-widget /api/* calls on first paint into
  // a single /api/admin/me/hub-data call. Each widget that's been
  // refactored to read from the hub-data store skips its own fetch
  // when the aggregator returns a payload for it.
  useEffect(() => {
    const widgetIds = Array.from(new Set(layout.widgets.map((w) => w.type)));
    if (widgetIds.length === 0) return;
    void hydrateHubDataFromAggregator(widgetIds);
  }, [layout.widgets]);

  // Slice 197 — honor `?edit=1` deep-links from the user-menu
  // "Customize Hub" entry. Read window.location.search directly so
  // the page doesn't need a Suspense boundary (Next.js 14+ requires
  // one for the useSearchParams hook). Strip the param after
  // triggering edit mode so a refresh doesn't re-fire.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('edit') !== '1') return;
    enterEditMode();
    params.delete('edit');
    const search = params.toString();
    const next = `${window.location.pathname}${search ? `?${search}` : ''}`;
    window.history.replaceState(null, '', next);
  }, [enterEditMode]);

  return (
    <HubProviders
      initialTheme={layout.theme}
      initialCustomTheme={layout.customTheme}
      initialDensity={layout.density}
      initialFontScale={layout.fontScale}
    >
      <HubCanvas roles={roles} activeBundles={activeBundles} isSeeded={isSeeded} />
    </HubProviders>
  );
}
