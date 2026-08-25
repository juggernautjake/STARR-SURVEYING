'use client';
// app/admin/components/RouteViewTelemetry.tsx
//
// C0 of docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md — record which admin routes are
// actually opened, so the consolidation plan can be argued from data instead of from the sidebar.
//
// Renders nothing. Mounted app-wide beside `RegisterAdminPWA` and `NotificationNudge`, which are the
// two existing precedents for "a client component in the admin layout that exists for its effect".
//
// ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────────────────────────
//
// No scroll depth, no dwell time, no click paths, no referrer. One row per route opened, carrying
// the route and who opened it — which is the whole question the plan needs answered, and stopping
// there means there is nothing here anybody would need to explain to their own staff.
//
// It is also OFF by default in development, because a developer reloading `/admin/jobs` forty times
// while working on it would drown the signal from the people the plan is about.

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { trackNavEvent } from '@/lib/admin/nav-telemetry';
import { normaliseRoutePath, isCountableRoute } from '@/lib/admin/route-usage';

export default function RouteViewTelemetry() {
  const pathname = usePathname();
  // The last route we recorded. React can run this effect twice for one navigation — Strict Mode
  // does it deliberately in development — and a re-render caused by anything else on the page would
  // otherwise post again. Counting one visit twice is worse than not counting it: it looks like
  // usage.
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || !isCountableRoute(pathname)) return;
    if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_ROUTE_TELEMETRY !== '1') return;

    const route = normaliseRoutePath(pathname);
    if (lastSent.current === route) return;
    lastSent.current = route;

    trackNavEvent('nav.route.view', { route });
  }, [pathname]);

  return null;
}
