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

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Star, HelpCircle, ChevronLeft } from 'lucide-react';

import {
  breadcrumbTrail,
  parentCrumb,
  findRoute,
} from '@/lib/admin/route-registry';
import {
  MAX_PINNED_ROUTES,
  useAdminNavStore,
} from '@/lib/admin/nav-store';
import { useToast } from '../Toast';

import HelpDrawer from './HelpDrawer';
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
  const [helpOpen, setHelpOpen] = useState(false);

  const { crumbs, parent } = useMemo(() => {
    if (HIDE_ON_PATHS.has(pathname)) return { crumbs: [], parent: null };
    return {
      crumbs: breadcrumbTrail(pathname),
      parent: parentCrumb(pathname),
    };
  }, [pathname]);

  if (crumbs.length === 0) return null;

  // Only registered routes are pinnable (the pin store keys off the
  // registry); detail/[id] pages render the trail + back arrow but no star.
  const route = findRoute(pathname);
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
      <div className="admin-page-header__nav">
        {parent ? (
          <Link
            href={parent.href}
            className="admin-page-header__back"
            aria-label={`Back to ${parent.label}`}
            title={`Back to ${parent.label}`}
          >
            <ChevronLeft size={16} strokeWidth={2} />
            <span className="admin-page-header__back-label">{parent.label}</span>
          </Link>
        ) : null}
        <ol className="admin-page-header__trail">
          {crumbs.map((crumb, i) => (
            <li key={crumb.href} className="admin-page-header__crumb-item">
              {i > 0 ? (
                <span className="admin-page-header__sep" aria-hidden="true">›</span>
              ) : null}
              {crumb.isCurrent ? (
                <span
                  className="admin-page-header__crumb admin-page-header__crumb--active"
                  aria-current="page"
                >
                  {crumb.label}
                </span>
              ) : (
                <Link href={crumb.href} className="admin-page-header__crumb">
                  {crumb.label}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <button
          type="button"
          className="admin-page-header__star"
          onClick={() => setHelpOpen(true)}
          aria-label="Open help for this page"
          title="Help for this page (§13.7)"
        >
          <HelpCircle size={14} strokeWidth={1.75} />
        </button>
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
      </div>
      <HelpDrawer
        open={helpOpen}
        pathname={pathname}
        workspaceHref={crumbs[0].href}
        workspaceLabel={crumbs[0].label}
        routeLabel={route?.label ?? crumbs[crumbs.length - 1].label}
        onClose={() => setHelpOpen(false)}
      />
    </nav>
  );
}
