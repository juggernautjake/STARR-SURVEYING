'use client';
// app/admin/components/nav/WorkspaceFlyout.tsx
//
// Hover fly-out for an IconRail workspace icon (admin-nav redesign
// Phase 3 slice 3c §5.1). Hovering an icon shows a submenu 200 ms
// after enter, listing the workspace's accessible pages so users can
// jump without expanding the rail.
//
// nav-flyout-hover-fix 2026-05-30 — close on a short grace delay (not
// instantly) so the pointer can cross the small gap between the icon
// and the menu without it snapping shut. Paired with the CSS bridge
// (`.admin-rail__flyout::before`) that fills the gap so a straight
// horizontal move stays inside the hoverable area entirely.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

import {
  WORKSPACES,
  accessibleRoutes,
  type Workspace,
} from '@/lib/admin/route-registry';
import { isInternalUser } from '@/lib/saas/internal-user';
import { trackNavEvent } from '@/lib/admin/nav-telemetry';
import type { UserRole } from '@/lib/auth-roles';

const SHOW_DELAY_MS = 200;
// Grace period before the fly-out closes after the pointer leaves the
// anchor. Long enough to traverse the icon→menu gap, short enough that
// the menu doesn't linger once the user has truly moved on.
const HIDE_DELAY_MS = 220;

interface WorkspaceFlyoutProps {
  workspace: Workspace;
  icon: LucideIcon;
  isActive: boolean;
}

/** Breathing room between the fly-out and the edge of the window. */
const VIEWPORT_MARGIN = 12;
/** Below this, opening downward is not worth it — flip and use the space above instead. */
const MIN_DOWNWARD_PX = 260;

export default function WorkspaceFlyout({
  workspace,
  icon: Icon,
  isActive,
}: WorkspaceFlyoutProps) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  // nav-flyout-scroll 2026-08-06 — how tall this menu may be, and which way it opens. Measured
  // rather than guessed in CSS: the space below the seventh rail icon is nothing like the space
  // below the first, and Money's 25 routes overflow either way.
  const [placement, setPlacement] = useState<{ maxHeight: number; up: boolean }>({
    maxHeight: 0,
    up: false,
  });

  const meta = WORKSPACES[workspace];

  const roles: UserRole[] = useMemo(
    () =>
      (session?.user?.roles ??
        (session?.user?.role ? [session.user.role] : [])) as UserRole[],
    [session?.user?.roles, session?.user?.role],
  );
  const isCompanyUser = isInternalUser(session);

  const routes = useMemo(() => {
    return accessibleRoutes({ roles, isCompanyUser })
      .filter((r) => r.workspace === workspace)
      .filter((r) => r.href !== meta.href)
      .filter((r) => r.showInRail !== false);
  }, [roles, isCompanyUser, workspace, meta.href]);

  useEffect(() => {
    return () => {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  // Measure once per open, and again if the window resizes while it is open. The menu is anchored
  // to the icon's top edge, so "room below" is measured from there; when that is too small we
  // anchor to the icon's bottom edge and grow upward instead.
  useEffect(() => {
    if (!open) return;

    const measure = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const below = window.innerHeight - rect.top - VIEWPORT_MARGIN;
      const above = rect.bottom - VIEWPORT_MARGIN;
      const up = below < MIN_DOWNWARD_PX && above > below;
      setPlacement({ maxHeight: Math.max(160, Math.floor(up ? above : below)), up });
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  // Pointer (re)entered the anchor OR the menu — cancel any pending
  // close + arm the open timer if we're not already open.
  function scheduleShow() {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (open) return;
    if (showTimer.current) clearTimeout(showTimer.current);
    showTimer.current = setTimeout(() => setOpen(true), SHOW_DELAY_MS);
  }

  // Pointer left the anchor (and the menu). Cancel a pending open, then
  // close after a short grace period so crossing the icon→menu gap
  // doesn't snap it shut. Re-entering before the timer fires cancels it.
  function scheduleHide() {
    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setOpen(false), HIDE_DELAY_MS);
  }

  // Immediate close — used when a menu link is clicked (navigation is
  // happening, no reason to linger).
  function dismiss() {
    if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null; }
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    setOpen(false);
  }

  return (
    <div
      ref={anchorRef}
      className="admin-rail__flyout-anchor"
      onMouseEnter={scheduleShow}
      onMouseLeave={scheduleHide}
      onFocus={scheduleShow}
      onBlur={scheduleHide}
    >
      <Link
        href={meta.href}
        title={`${meta.label} (${meta.shortcut})`}
        aria-label={meta.label}
        aria-current={isActive ? 'page' : undefined}
        data-workspace={workspace}
        className={`admin-rail__icon admin-rail__icon--workspace${isActive ? ' admin-rail__icon--active' : ''}`}
        onClick={() => trackNavEvent('nav.workspace.click', { workspace, href: meta.href })}
      >
        <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
      </Link>
      {open && routes.length > 0 ? (
        <div
          className={`admin-rail__flyout${placement.up ? ' admin-rail__flyout--up' : ''}`}
          role="menu"
          aria-label={`${meta.label} pages`}
          data-testid={`flyout-${workspace}`}
          style={placement.maxHeight ? ({ ['--flyout-max-h' as string]: `${placement.maxHeight}px` } as React.CSSProperties) : undefined}
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
