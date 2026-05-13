'use client';
// app/admin/components/nav/AdminPageHeader.tsx
//
// Breadcrumb trail + star (pin) button above every V2 admin page
// (admin-nav redesign Phase 3 slice 3d + Phase 4 slice 4a §5.6). The
// star toggles the current route in `pinnedRoutes`; ToastProvider
// confirms the action. The ? help button lands in Phase 6.
//
// Skipped on routes that already render their own header chrome
// (CAD's custom title bar lives in the route itself; the Hub greeting
// is the title of /admin/me). Per §5.6 those pages keep their custom
// header and embed the star button directly when they want one.

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Star } from 'lucide-react';

import {
  WORKSPACES,
  findRoute,
  workspaceOf,
} from '@/lib/admin/route-registry';
import {
  MAX_PINNED_ROUTES,
  useAdminNavStore,
} from '@/lib/admin/nav-store';
import { useToast } from '../Toast';

import './AdminPageHeader.css';

const HIDE_ON_PATHS = new Set<string>([
  '/admin/me',     // Hub greeting is its own title
  '/admin/cad',    // CAD has a custom title bar
]);

export default function AdminPageHeader() {
  const pathname = usePathname() || '/admin/me';
  const pinnedRoutes = useAdminNavStore((s) => s.pinnedRoutes);
  const togglePin = useAdminNavStore((s) => s.togglePin);
  const { addToast } = useToast();

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
  const isPinned = pinnedRoutes.includes(pathname);
  const pinDisabled = !route || (!isPinned && pinnedRoutes.length >= MAX_PINNED_ROUTES);

  function handleTogglePin() {
    if (!route) return;
    if (!isPinned && pinnedRoutes.length >= MAX_PINNED_ROUTES) {
      addToast(`You can only pin ${MAX_PINNED_ROUTES} pages — unpin one first.`, 'warning');
      return;
    }
    const nowPinned = togglePin(pathname);
    addToast(
      nowPinned ? `Pinned ${route.label}` : `Unpinned ${route.label}`,
      'success',
    );
  }

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
      <button
        type="button"
        className={`admin-page-header__star${isPinned ? ' admin-page-header__star--active' : ''}`}
        onClick={handleTogglePin}
        disabled={pinDisabled}
        aria-pressed={isPinned}
        aria-label={isPinned ? `Unpin ${route?.label ?? 'this page'}` : `Pin ${route?.label ?? 'this page'}`}
        title={isPinned ? 'Unpin from your nav' : `Pin to your nav (max ${MAX_PINNED_ROUTES})`}
      >
        <Star size={14} fill={isPinned ? 'currentColor' : 'transparent'} strokeWidth={1.75} />
      </button>
    </nav>
  );
}
