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
  type LucideIcon,
} from 'lucide-react';

import {
  findRoute,
  workspaceOf,
  type Workspace,
} from '@/lib/admin/route-registry';
import { useAdminNavStore } from '@/lib/admin/nav-store';
import { railOrderFor } from '@/lib/admin/personas';
import type { UserRole } from '@/lib/auth';

import WorkspaceFlyout from './WorkspaceFlyout';
import './IconRail.css';

const ICON_FOR_WORKSPACE: Record<Workspace, LucideIcon> = {
  hub: Home,
  work: Briefcase,
  equipment: Truck,
  'research-cad': Compass,
  knowledge: GraduationCap,
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
          {pinnedEntries.map((route) => {
            const isActive = pathname === route.href;
            return (
              <Link
                key={route.href}
                href={route.href}
                title={route.label}
                aria-label={`Pinned: ${route.label}`}
                aria-current={isActive ? 'page' : undefined}
                className={`admin-rail__icon admin-rail__icon--pin${isActive ? ' admin-rail__icon--active' : ''}`}
              >
                <Star size={18} fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
              </Link>
            );
          })}
        </nav>
      ) : null}
      <div className="admin-rail__tools">
        <button
          type="button"
          className="admin-rail__icon admin-rail__icon--button"
          title="Search (⌘K)"
          aria-label="Open command palette"
          onClick={openPalette}
        >
          <Search size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
