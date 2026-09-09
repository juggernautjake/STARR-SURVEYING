'use client';
// app/admin/components/nav/IconRail.tsx
//
// 48 px icon rail — admin-nav redesign Phase 3 slice 3b (§5.3). Six
// workspace icons + brand logo + palette opener. Active workspace is
// highlighted via `workspaceOf` on the current pathname. Tooltips use
// the native `title` attribute for slice 3b; the §5.1 200 ms-delayed
// fly-out lands in slice 3c.
//
// Mounted by `AdminLayoutClient` when `adminNavV2Enabled === true`.
// The legacy AdminSidebar still renders when the flag is off so users
// can fall back during the rollout window.

import { useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Briefcase,
  Building2,
  Compass,
  GraduationCap,
  Home,
  Search,
  Star,
  Truck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import {
  findRoute,
  workspaceOf,
  WORKSPACES,
  type AdminRoute,
  type Workspace,
} from '@/lib/admin/route-registry';
import { iconForName } from '@/lib/admin/route-icons';
import { useAdminNavStore } from '@/lib/admin/nav-store';
import { trackNavEvent } from '@/lib/admin/nav-telemetry';
import { railOrderFor } from '@/lib/admin/personas';
import type { UserRole } from '@/lib/auth-roles';

import WorkspaceFlyout from './WorkspaceFlyout';
import './IconRail.css';

const ICON_FOR_WORKSPACE: Record<Workspace, LucideIcon> = {
  hub: Home,
  work: Briefcase,
  equipment: Truck,
  'research-cad': Compass,
  knowledge: GraduationCap,
  // Money became its own workspace in platform audit item 7 (§2.2).
  money: Wallet,
  office: Building2,
};

export default function IconRail() {
  const pathname = usePathname() || '/admin/me';
  const { data: session } = useSession();
  const openPalette = useAdminNavStore((s) => s.openPalette);
  const pinnedRoutes = useAdminNavStore((s) => s.pinnedRoutes);
  const personaOverride = useAdminNavStore((s) => s.personaOverride);

  const activeWorkspace = useMemo(() => workspaceOf(pathname), [pathname]);

  const roles: UserRole[] = useMemo(
    () => (session?.user?.roles ?? (session?.user?.role ? [session.user.role] : [])) as UserRole[],
    [session?.user?.roles, session?.user?.role],
  );

  const workspaceOrder = useMemo(
    () => railOrderFor({ roles, override: personaOverride }),
    [roles, personaOverride],
  );

  const pinnedEntries = useMemo(
    () => pinnedRoutes
      .map((href) => findRoute(href))
      .filter((r): r is NonNullable<typeof r> => !!r),
    [pinnedRoutes],
  );

  return (
    <aside className="admin-rail" role="navigation" aria-label="Primary">
      <Link
        className="admin-rail__brand"
        href="/admin/me"
        title="Hub (⌘1)"
        aria-label="Hub"
      >
        <Image
          src="/logos/Starr_Surveying_Red_White_Blue_Star_With_Surveyor.png"
          alt=""
          width={32}
          height={32}
          className="admin-rail__brand-logo"
        />
      </Link>
      <nav className="admin-rail__workspaces">
        {workspaceOrder.map((id) => (
          <WorkspaceFlyout
            key={id}
            workspace={id}
            icon={ICON_FOR_WORKSPACE[id]}
            isActive={activeWorkspace === id}
          />
        ))}
      </nav>
      {pinnedEntries.length > 0 ? (
        <nav className="admin-rail__pinned" aria-label="Pinned pages">
          {pinnedEntries.map((route) => (
            <PinnedRailLink key={route.href} route={route} isActive={pathname === route.href} />
          ))}
        </nav>
      ) : null}
      <div className="admin-rail__tools">
        <button
          type="button"
          className="admin-rail__icon admin-rail__icon--button"
          title="Search (⌘K)"
          aria-label="Open command palette"
          onClick={() => {
            openPalette();
            trackNavEvent('nav.cmdk.open', { trigger: 'button' });
          }}
        >
          <Search size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}

/**
 * A pinned page in the rail.
 *
 * ── THE STARS ALL LOOKED THE SAME (owner, 2026-09-09) ────────────────────────────────────────
 *
 * Every pinned page rendered as an identical star, so with two or more pins nothing on the rail
 * said which was which — only the browser's native `title`, which takes a second to appear and
 * is easy never to see. A pin now shows the PAGE'S OWN icon with a small star badge, and an
 * immediate tooltip on hover or keyboard focus naming the page and its workspace.
 */
function PinnedRailLink({ route, isActive }: { route: AdminRoute; isActive: boolean }) {
  const Icon = iconForName(route.iconName);
  const workspace = WORKSPACES[route.workspace]?.label;
  const tipId = `pin-tip-${route.href.replace(/[^a-z0-9]/gi, '-')}`;
  return (
    <Link
      href={route.href}
      aria-label={`Pinned: ${route.label}`}
      aria-describedby={tipId}
      aria-current={isActive ? 'page' : undefined}
      className={`admin-rail__icon admin-rail__icon--pin${isActive ? ' admin-rail__icon--active' : ''}`}
    >
      <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      <Star size={9} fill="currentColor" strokeWidth={0} aria-hidden="true" className="admin-rail__pin-badge" />
      <span role="tooltip" id={tipId} className="admin-rail__tip">
        <strong>{route.label}</strong>
        {workspace ? <span>{workspace}</span> : null}
      </span>
    </Link>
  );
}
