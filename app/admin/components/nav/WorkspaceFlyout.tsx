'use client';
// app/admin/components/nav/WorkspaceFlyout.tsx
//
// Hover fly-out for an IconRail workspace icon (admin-nav redesign
// Phase 3 slice 3c §5.1). Hovering an icon shows a submenu 200 ms
// after enter, listing the workspace's accessible pages so users can
// jump without expanding the rail. Mouse-out closes immediately.

import { useEffect, useMemo, useRef, useState } from 'react';
import { type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

import {
  WORKSPACES,
  accessibleRoutes,
  type Workspace,
} from '@/lib/admin/route-registry';
import type { UserRole } from '@/lib/auth';

const SHOW_DELAY_MS = 200;

interface WorkspaceFlyoutProps {
  workspace: Workspace;
  icon: LucideIcon;
  isActive: boolean;
}

export default function WorkspaceFlyout({
  workspace,
  icon: Icon,
  isActive,
}: WorkspaceFlyoutProps) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const meta = WORKSPACES[workspace];

  const roles: UserRole[] = useMemo(
    () =>
      (session?.user?.roles ??
        (session?.user?.role ? [session.user.role] : [])) as UserRole[],
    [session?.user?.roles, session?.user?.role],
  );
  const isCompanyUser = !!session?.user?.email?.toLowerCase().endsWith('@starr-surveying.com');

  const routes = useMemo(() => {
    return accessibleRoutes({ roles, isCompanyUser })
      .filter((r) => r.workspace === workspace)
      .filter((r) => r.href !== meta.href)
      .filter((r) => r.showInRail !== false);
  }, [roles, isCompanyUser, workspace, meta.href]);

  useEffect(() => {
    return () => {
      if (showTimer.current) clearTimeout(showTimer.current);
    };
  }, []);

  function scheduleShow() {
    if (showTimer.current) clearTimeout(showTimer.current);
    showTimer.current = setTimeout(() => setOpen(true), SHOW_DELAY_MS);
  }

  function dismiss() {
    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    setOpen(false);
  }

  return (
    <div
      className="admin-rail__flyout-anchor"
      onMouseEnter={scheduleShow}
      onMouseLeave={dismiss}
      onFocus={scheduleShow}
      onBlur={dismiss}
    >
      <Link
        href={meta.href}
        title={`${meta.label} (${meta.shortcut})`}
        aria-label={meta.label}
        aria-current={isActive ? 'page' : undefined}
        className={`admin-rail__icon${isActive ? ' admin-rail__icon--active' : ''}`}
      >
        <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
      </Link>
      {open && routes.length > 0 ? (
        <div
          className="admin-rail__flyout"
          role="menu"
          aria-label={`${meta.label} pages`}
        >
          <div className="admin-rail__flyout-header">
            <span className="admin-rail__flyout-title">{meta.label}</span>
            <span className="admin-rail__flyout-shortcut">{meta.shortcut}</span>
          </div>
          <ul className="admin-rail__flyout-list">
            <li>
              <Link href={meta.href} className="admin-rail__flyout-link" onClick={dismiss}>
                <span className="admin-rail__flyout-link-label">{meta.label} home</span>
                <span className="admin-rail__flyout-link-meta">Workspace landing</span>
              </Link>
            </li>
            {routes.map((route) => (
              <li key={route.href}>
                <Link
                  href={route.href}
                  className="admin-rail__flyout-link"
                  onClick={dismiss}
                  role="menuitem"
                >
                  <span className="admin-rail__flyout-link-label">{route.label}</span>
                  {route.description ? (
                    <span className="admin-rail__flyout-link-meta">{route.description}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
