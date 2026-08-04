// app/admin/components/AdminSidebar.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import type { UserRole } from '@/lib/auth-roles';
import { RouteIcon } from '@/lib/admin/route-icons';
import {
  accessibleRoutes,
  WORKSPACES,
  WORKSPACE_ORDER,
} from '@/lib/admin/route-registry';
import { ChevronRight } from 'lucide-react';

interface AdminSidebarProps {
  role: UserRole;
  roles: UserRole[];
  userName: string;
  userEmail: string;
  userImage?: string;
  /** Staff at the firm. Passed in rather than derived from `userEmail` here (audit item 8h): the
   *  drawer and the desktop rail must answer this the same way, and they only can if neither of them
   *  computes it. `AdminLayoutClient` reads it from the session, which resolved it at sign-in. */
  isCompanyUser: boolean;
  isOpen: boolean;
  onClose: () => void;
}

// No `roles` / `internalOnly` here any more: gating happens once, in `accessibleRoutes`, off the
// registry entry. Two places to express "who may see this" is how the desktop rail and this drawer
// came to disagree about 32 routes in the first place (§1.3).
interface NavItem {
  href: string;
  label: string;
  icon: string;
}
interface NavSection { label: string; items: NavItem[]; }

const STORAGE_KEY = 'starr-sidebar-collapsed';

const ROLE_DISPLAY: Record<UserRole, string> = {
  admin: 'Admin',
  developer: 'Developer',
  teacher: 'Teacher',
  student: 'Student',
  researcher: 'Researcher',
  drawer: 'Drawer',
  field_crew: 'Field Crew',
  employee: 'Employee',
  guest: 'Guest',
  tech_support: 'Tech Support',
  equipment_manager: 'Equipment Manager',
};

const BRAND_LABELS: Record<string, string> = {
  admin: 'Admin Panel',
  developer: 'Developer Panel',
  teacher: 'Teacher Panel',
  tech_support: 'Support Panel',
  researcher: 'Research Portal',
  drawer: 'CAD Portal',
  field_crew: 'Field Portal',
  student: 'Learning Portal',
  employee: 'Employee Portal',
  guest: 'Learning Portal',
};

// The role groups that used to live here (WORK_ROLES, RESEARCH_ROLES, EQUIPMENT_ROLES, …) moved to
// lib/admin/route-registry.ts, which is now the only place that decides who sees which route.

export default function AdminSidebar({ role, roles, userName, userEmail, userImage, isCompanyUser, isOpen, onClose }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const notableRoles = roles.filter(r => r !== 'employee' && r !== 'guest');
  const roleDisplay = notableRoles.length > 0
    ? notableRoles.map(r => ROLE_DISPLAY[r]).join(' + ')
    : ROLE_DISPLAY[role];

  // ── Navigation structure — DERIVED, not hand-maintained ──────────────────────────────────────
  //
  // This used to be ~180 lines of literal nav items, and platform audit §1.3 measured what that cost:
  // **32 routes were in the route registry and missing from here** — Invoicing, Contacts, Files,
  // Calendar, Support, Reports, Billing, Org Settings, Audit Log, Invites, Announcements. Every one of
  // them reachable on desktop and invisible on a phone, because two lists of the same thing drift the
  // moment anybody adds a page to one of them.
  //
  // The audit's prescribed fix was "delete AdminSidebar.tsx". That would have deleted mobile
  // navigation outright — this component is not merely the legacy desktop sidebar, it is also the
  // mobile drawer, and the only nav a phone has. What was actually wrong was the second SOURCE, not
  // the second SURFACE. So the surface stays and the list goes: sections are now derived from
  // `ADMIN_ROUTES`, grouped by workspace, in `WORKSPACE_ORDER`.
  //
  // `showInRail: false` routes are excluded, matching the icon rail. Those are the palette-only
  // entries (§1.4) — registering all 131 here would trade an incomplete drawer for an unscannable one.
  const sections: NavSection[] = useMemo(() => {
    const visible = accessibleRoutes({ roles, isCompanyUser })
      .filter((r) => r.showInRail !== false);

    return WORKSPACE_ORDER
      .map((ws) => ({
        label: WORKSPACES[ws].label,
        items: visible
          .filter((r) => r.workspace === ws)
          .map((r) => ({ href: r.href, label: r.label, icon: r.iconName })),
      }))
      .filter((section) => section.items.length > 0);
  }, [roles, isCompanyUser]);

  // ── Sections start CLOSED (owner request, 2026-08-04) ──────────────────────────────────────────
  //
  // Every section used to start open, so the menu opened as one long scroll of every destination in
  // the product — worst on a phone, where the sidebar is the whole screen and Hub, Work, Equipment,
  // Research & CAD and the rest stacked past the fold.
  //
  // The map records only what the user has EXPLICITLY set, and anything absent is closed. That
  // matters for the change to take effect at all: the old map stored "collapsed" flags, so a
  // returning user's saved `{}` — or a partial map — would otherwise still mean "everything open".
  // Missing now means closed, which is why the toggle below is written against the RESOLVED state
  // rather than flipping `!prev[label]` (that would leave a closed section closed on first click).
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setOpenSections(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  /** Closed unless the user opened it — except the section holding the page you are on, which opens
   *  so the menu can still answer "where am I". An explicit choice always wins over that. */
  const sectionIsOpen = (label: string, active: boolean): boolean =>
    label in openSections ? openSections[label] : active;

  const toggleSection = (label: string, active: boolean) => {
    setOpenSections((prev) => {
      const current = label in prev ? prev[label] : active;
      const next = { ...prev, [label]: !current };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };


  const isActive = (href: string): boolean => {
    if (href === '/admin/me') return pathname === '/admin/me';
    if (href === '/admin/learn') return pathname === '/admin/learn';
    if (href === '/admin/jobs') return pathname === '/admin/jobs';
    if (href === '/admin/messages') return pathname === '/admin/messages';
    if (href === '/admin/rewards') return pathname === '/admin/rewards';
    if (href === '/admin/research') return pathname === '/admin/research' || pathname.startsWith('/admin/research/');
    return pathname.startsWith(href);
  };

  const isSectionActive = (section: NavSection): boolean => {
    return section.items.some((i) => isActive(i.href));
  };

  const getInitials = (name: string) => {
    const words = (name || '').split(/\s+/).filter(w => /^[a-zA-Z]/.test(w));
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0][0].toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  };

  return (
    <>
      <div className={`admin-sidebar-overlay ${isOpen ? 'admin-sidebar-overlay--active' : ''}`} onClick={onClose} />
      <aside className={`admin-sidebar ${isOpen ? 'admin-sidebar--open' : ''}`}>
        <div
          className="admin-sidebar__header admin-sidebar__header--clickable"
          onClick={() => { router.push('/admin/me'); onClose(); }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') { router.push('/admin/me'); onClose(); } }}
        >
          <Image src="/logos/Starr_Surveying_Red_White_Blue_Star_With_Surveyor.png" alt="Starr Surveying" width={40} height={40} className="admin-sidebar__logo" />
          <div className="admin-sidebar__brand">
            <span className="admin-sidebar__brand-name">Starr Surveying</span>
            <span className="admin-sidebar__brand-sub">{BRAND_LABELS[role] || 'Employee Portal'}</span>
          </div>
        </div>
        <nav className="admin-sidebar__nav">
          {sections.map((section) => {
            const items = section.items;
            if (!items.length) return null;

            const sectionActive = isSectionActive(section);
            const isExpanded = sectionIsOpen(section.label, sectionActive);

            return (
              <div key={section.label} className="admin-sidebar__section">
                <div
                  className={`admin-sidebar__section-label admin-sidebar__section-label--collapsible${sectionActive ? ' admin-sidebar__section-label--active' : ''}`}
                  onClick={() => toggleSection(section.label, sectionActive)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onKeyDown={(e) => { if (e.key === 'Enter') toggleSection(section.label, sectionActive); }}
                >
                  <span className={`admin-sidebar__section-arrow ${isExpanded ? 'admin-sidebar__section-arrow--expanded' : ''}`}>
                    <ChevronRight size={13} strokeWidth={2.5} />
                  </span>
                  {section.label}
                </div>
                {/* Rendered ALWAYS, hidden when collapsed — not mounted conditionally.
                 *
                 * The first version of this used `{isExpanded && items.map(…)}`, which took the
                 * links out of the DOM entirely and broke `sidebar-render.test.tsx`: that guard
                 * exists because "authored but not wired" is this repo's signature defect, and it
                 * proves every registered route actually reaches the drawer's markup. A collapse
                 * that deletes the links makes the guard unable to tell "collapsed" from "lost".
                 *
                 * `hidden` is also the more correct control: it removes them from the accessibility
                 * tree and from find-in-page while collapsed, which is what an accordion should do,
                 * and it pairs with the `aria-expanded` on the header above. */}
                <div className="admin-sidebar__section-items" hidden={!isExpanded}>
                  {items.map((item) => (
                    <Link key={item.href} href={item.href} className={`admin-sidebar__link ${isActive(item.href) ? 'admin-sidebar__link--active' : ''}`} onClick={onClose}>
                      <span className="admin-sidebar__link-icon"><RouteIcon name={item.icon} size={18} /></span>
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="admin-sidebar__footer">
          <div className="admin-sidebar__user">
            {userImage ? <Image src={userImage} alt={userName} width={32} height={32} className="admin-sidebar__avatar" unoptimized /> :
             <div className="admin-sidebar__avatar-placeholder">{getInitials(userName)}</div>}
            <div className="admin-sidebar__user-info">
              <div className="admin-sidebar__user-name">{userName}</div>
              <div className="admin-sidebar__user-role">{roleDisplay}</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
