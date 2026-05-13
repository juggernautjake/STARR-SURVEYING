'use client';
// app/admin/me/components/HubPinnedRecent.tsx
//
// Hub panel 3 (§5.1) — three-column grid of Pinned / Recent /
// Workspaces. Recents come from `nav-store.recentRoutes` (live). Pins
// land in Phase 4; for slice 2a the Pinned column shows an empty
// state with a hint. Workspaces come from the `WORKSPACES` metadata.

import Link from 'next/link';

import {
  WORKSPACES,
  WORKSPACE_ORDER,
  findRoute,
} from '@/lib/admin/route-registry';
import { useAdminNavStore } from '@/lib/admin/nav-store';

const RECENT_LIMIT = 6;

export default function HubPinnedRecent() {
  const recentRoutes = useAdminNavStore((s) => s.recentRoutes);

  const recents = recentRoutes
    .map((href) => findRoute(href))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .slice(0, RECENT_LIMIT);

  return (
    <section className="hub-panel hub-columns">
      <div className="hub-columns__col">
        <h2 className="hub-columns__title">Pinned</h2>
        <p className="hub-columns__empty">
          You haven&apos;t pinned anything yet. Pinning lands with the
          page-header star in Phase 4 of the nav redesign.
        </p>
      </div>
      <div className="hub-columns__col">
        <h2 className="hub-columns__title">Recent</h2>
        {recents.length === 0 ? (
          <p className="hub-columns__empty">
            Pages you visit will show up here.
          </p>
        ) : (
          <ul className="hub-columns__list">
            {recents.map((route) => (
              <li key={route.href}>
                <Link href={route.href} className="hub-columns__item">
                  <span className="hub-columns__item-label">{route.label}</span>
                  <span className="hub-columns__item-meta">
                    {WORKSPACES[route.workspace].label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="hub-columns__col">
        <h2 className="hub-columns__title">Workspaces</h2>
        <ul className="hub-columns__list">
          {WORKSPACE_ORDER.map((id) => {
            const ws = WORKSPACES[id];
            return (
              <li key={id}>
                <Link href={ws.href} className="hub-columns__item">
                  <span className="hub-columns__item-label">{ws.label}</span>
                  <span className="hub-columns__item-meta">{ws.shortcut}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
