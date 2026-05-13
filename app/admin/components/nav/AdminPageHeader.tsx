'use client';
// app/admin/components/nav/AdminPageHeader.tsx
//
// Breadcrumb trail above every V2 admin page (admin-nav redesign
// Phase 3 slice 3d §5.6). Resolves the active workspace + page via the
// route registry. The star (pinning) + ? (help) buttons land with the
// pinning store in Phase 4 and the help drawer in Phase 6 — slice 3d
// ships just the breadcrumb, which is the navigationally useful part.
//
// Skipped on routes that already render their own header chrome
// (CAD's custom title bar lives in the route itself; the Hub greeting
// is the title of /admin/me). Per §5.6 those pages keep their custom
// header and embed the future star button directly.

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  WORKSPACES,
  findRoute,
  workspaceOf,
} from '@/lib/admin/route-registry';

import './AdminPageHeader.css';

const HIDE_ON_PATHS = new Set<string>([
  '/admin/me',     // Hub greeting is its own title
  '/admin/cad',    // CAD has a custom title bar
]);

export default function AdminPageHeader() {
  const pathname = usePathname() || '/admin/me';

  const trail = useMemo(() => {
    if (HIDE_ON_PATHS.has(pathname)) return null;
    const workspace = workspaceOf(pathname);
    if (!workspace) return null;

    const workspaceMeta = WORKSPACES[workspace];
    const route = findRoute(pathname);

    return {
      workspace: workspaceMeta,
      route,
    };
  }, [pathname]);

  if (!trail) return null;

  const { workspace, route } = trail;

  return (
    <nav className="admin-page-header" aria-label="Breadcrumb">
      <ol className="admin-page-header__trail">
        <li>
          <Link href={workspace.href} className="admin-page-header__crumb">
            {workspace.label}
          </Link>
        </li>
        {route ? (
          <>
            <li className="admin-page-header__sep" aria-hidden="true">›</li>
            <li>
              <span className="admin-page-header__crumb admin-page-header__crumb--active" aria-current="page">
                {route.label}
              </span>
            </li>
          </>
        ) : null}
      </ol>
    </nav>
  );
}
