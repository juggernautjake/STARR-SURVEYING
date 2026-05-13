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
import {
  Briefcase,
  Building2,
  Compass,
  GraduationCap,
  Home,
  Search,
  Truck,
  type LucideIcon,
} from 'lucide-react';

import {
  WORKSPACE_ORDER,
  workspaceOf,
  type Workspace,
} from '@/lib/admin/route-registry';
import { useAdminNavStore } from '@/lib/admin/nav-store';

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
  const openPalette = useAdminNavStore((s) => s.openPalette);

  const activeWorkspace = useMemo(() => workspaceOf(pathname), [pathname]);

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
        {WORKSPACE_ORDER.map((id) => (
          <WorkspaceFlyout
            key={id}
            workspace={id}
            icon={ICON_FOR_WORKSPACE[id]}
            isActive={activeWorkspace === id}
          />
        ))}
      </nav>
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
