'use client';
// app/admin/components/nav/WorkspaceLanding.tsx
//
// Shared layout for the new workspace landing pages (admin-nav redesign
// Phase 3 slice 3a) at /admin/work, /admin/office, /admin/research-cad.
// /admin/equipment + /admin/learn are existing landings; the rail
// links them directly. /admin/me is the Hub.
//
// Phase 3 ships these landings as a directory of the workspace's
// routes so the Hub's "Workspaces" column no longer 404s. Phase 4
// adds widgets on top (at-a-glance counts, queue snippets).

import Link from 'next/link';
import { useSession } from 'next-auth/react';

import {
  WORKSPACES,
  accessibleRoutes,
  type Workspace,
} from '@/lib/admin/route-registry';
import type { UserRole } from '@/lib/auth';

import './WorkspaceLanding.css';

interface WorkspaceLandingProps {
  workspace: Workspace;
}

export default function WorkspaceLanding({ workspace }: WorkspaceLandingProps) {
  const { data: session } = useSession();
  const meta = WORKSPACES[workspace];

  const roles: UserRole[] =
    (session?.user?.roles ?? (session?.user?.role ? [session.user.role] : [])) as UserRole[];
  const isCompanyUser = !!session?.user?.email?.toLowerCase().endsWith('@starr-surveying.com');

  // Show the workspace's own routes. The landing page itself is in the
  // registry too (so the Hub's Workspaces column links to it) — filter
  // it out of the card grid so we don't list "Office" inside Office.
  const routes = accessibleRoutes({ roles, isCompanyUser })
    .filter((r) => r.workspace === workspace)
    .filter((r) => r.href !== meta.href)
    .filter((r) => r.showInRail !== false);

  return (
    <div className="ws-landing">
      <header className="ws-landing__header">
        <h1 className="ws-landing__title">{meta.label}</h1>
        <span className="ws-landing__shortcut">{meta.shortcut}</span>
      </header>
      <p className="ws-landing__subtitle">
        {routes.length} {routes.length === 1 ? 'page' : 'pages'} in this workspace. Phase 4 adds at-a-glance widgets here; for now this lists every accessible page.
      </p>
      {routes.length === 0 ? (
        <p className="ws-landing__empty">
          No pages in this workspace are accessible with your current
          role + access. Ask an admin if this looks wrong.
        </p>
      ) : (
        <div className="ws-landing__grid">
          {routes.map((route) => (
            <Link key={route.href} href={route.href} className="ws-landing__card">
              <span className="ws-landing__card-label">{route.label}</span>
              {route.description ? (
                <span className="ws-landing__card-meta">{route.description}</span>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
