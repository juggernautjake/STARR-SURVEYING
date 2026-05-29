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

// Side-effect import: every shipped widget calls defineWidget at module
// evaluation. Mounting this once at the canvas entry point means the
// registry is populated before WidgetGrid asks for a widget by type.
import '@/lib/hub/widgets/register-all';

export interface HubMeClientProps {
  layout: HubLayoutRow;
  roles: UserRole[];
  activeBundles?: BundleId[] | null;
}

export default function HubMeClient({ layout, roles, activeBundles = null }: HubMeClientProps) {
  const hydrate = useHubStore((s) => s.hydrate);

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

  return (
    <HubProviders
      initialTheme={layout.theme}
      initialCustomTheme={layout.customTheme}
      initialDensity={layout.density}
      initialFontScale={layout.fontScale}
    >
      <HubCanvas roles={roles} activeBundles={activeBundles} />
    </HubProviders>
  );
}
