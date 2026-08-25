'use client';

// lib/design/CompositionSlot.tsx — a portal renders its composition, or itself.
//
// W4 of docs/planning/in-progress/DESIGN_STUDIO_SERVES_PAGES_2026-08-24.md.
//
// Owner: *"I also need a way to totally design pages and set them as the page for the different
// routes."* This is that, for the half of a page where it can honestly be done.
//
//     <CompositionSlot route="/admin/receipts" state="queue">
//       …the hand-built panel…
//     </CompositionSlot>
//
// ── THE CHILDREN ARE NOT A LOADING STATE ────────────────────────────────────────────────────────
//
// They are the PAGE. This component's default behaviour — before the fetch, if the fetch fails, if
// nothing is active, forever on every route nobody has designed — is to render them untouched. A
// composition replaces them only once one has actually arrived and parsed.
//
// That ordering is the safety property the plan names: *"a composition that fails to load must leave
// the page working."* Written the other way round — a spinner first, children as the error case —
// every portal in the product would flash empty on a slow connection and go blank on a bad row.
//
// ── AND WHY IT DOES NOT BLOCK ───────────────────────────────────────────────────────────────────
//
// No suspense, no await before first paint. The page renders as written, immediately, and swaps only
// if there is something to swap to. A portal that waited on this lookup would be slower than the
// page it replaced for the 100% of routes that have no composition.

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import '@/lib/hub/widgets/register-all';
import WidgetGrid from '@/lib/hub/components/WidgetGrid';
import { allWidgets } from '@/lib/hub/widget-registry';
import { viewToGrid, visibleWidgets, type PlacedWidget } from './widget-palette';
import { HUB_GRID_COLS } from '@/lib/hub/grid-model';
import type { DesignDocument } from './document';

interface Props {
  /** The route this slot is on. Must match what the studio stored — the registry path, not a URL. */
  route: string;
  /** Which state of it, when the portal has tabs. `''` is the route as a whole. */
  state?: string;
  /** The page as it is written. Rendered until — and unless — a composition replaces it. */
  children: React.ReactNode;
}

interface Loaded {
  id: string;
  name: string;
  views: DesignDocument['views'];
}

export default function CompositionSlot({ route, state = '', children }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const { data: session } = useSession();

  useEffect(() => {
    let cancelled = false;
    // Reset on a route or state change, or a tab switch would keep showing the previous tab's
    // composition until the new fetch landed — a page briefly showing another page's layout.
    setLoaded(null);

    (async () => {
      try {
        const res = await fetch(
          `/api/design/composition?route=${encodeURIComponent(route)}&state=${encodeURIComponent(state)}`,
          { cache: 'no-store' },
        );
        if (!res.ok) return;                       // the page is already correct; leave it alone
        const body = await res.json().catch(() => null);
        if (cancelled || !body?.composition?.views?.desktop) return;
        setLoaded(body.composition as Loaded);
      } catch {
        // Offline, aborted, a proxy in the way. The hand-built page is still on screen and still
        // works, which is the entire point of this catch being empty.
      }
    })();

    return () => { cancelled = true; };
  }, [route, state]);

  if (!loaded) return <>{children}</>;

  // Desktop only, deliberately: the hub grid reflows to the viewport by itself, and picking the
  // mobile view here would mean this component owning a breakpoint that `WidgetGrid` already owns.
  // Two things deciding one layout is how they disagree.
  const view = loaded.views.desktop;
  const envelopes = new Map(allWidgets().map((w) => [w.id, { minSize: w.minSize, maxSize: w.maxSize }]));
  const all: PlacedWidget[] = viewToGrid(view.elements, view.width, HUB_GRID_COLS, envelopes);

  // ── W5: THE VIEWER'S ROLES DECIDE WHAT RENDERS ───────────────────────────────────────────────
  //
  // The plan said this came free because widgets declare `allowedRoles`. They do, and NOTHING reads
  // it at render: the hub consults it only in the Add Widget modal, which is a correct gate for a
  // personal layout and no gate at all for one person's layout served to everybody. A firm
  // composition carrying the admin-only receipts widget rendered it in full for an account with no
  // roles, which is how this was found.
  const roles = (session?.user?.roles ?? []) as string[];
  const defs = new Map(allWidgets().map((w) => [w.id, { allowedRoles: w.allowedRoles }]));
  const widgets = visibleWidgets(all, roles, defs);

  // A composition that resolved but holds nothing is not a reason to show an empty page. Somebody
  // set the kind and has not placed anything yet, and the written page is still the better answer.
  if (widgets.length === 0) return <>{children}</>;

  return <WidgetGrid widgets={widgets} />;
}
