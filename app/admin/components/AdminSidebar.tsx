// app/admin/components/AdminSidebar.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import type { UserRole } from '@/lib/auth';

interface AdminSidebarProps {
  role: UserRole;
  roles: UserRole[];
  userName: string;
  userEmail: string;
  userImage?: string;
  isOpen: boolean;
  onClose: () => void;
}

// roles: which roles can see this item. If omitted, all authenticated users see it.
// internalOnly: if true, only company-domain (@starr-surveying.com) users see it.
interface NavItem {
  href: string;
  label: string;
  icon: string;
  roles?: UserRole[];
  internalOnly?: boolean;
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

// ── Shorthand role groups for readability ──
// These match the access matrix in docs/USER_ROLES_AND_ACCESS_CONTROL.md
const WORK_ROLES: UserRole[] = ['admin', 'developer', 'field_crew'];
const RESEARCH_ROLES: UserRole[] = ['admin', 'developer', 'researcher', 'drawer'];
const CONTENT_MGMT_ROLES: UserRole[] = ['admin', 'developer', 'teacher'];
const INTERNAL_COMM_ROLES: UserRole[] = ['admin', 'developer', 'teacher', 'researcher', 'drawer', 'field_crew', 'tech_support'];
const PAY_ROLES: UserRole[] = ['admin', 'developer', 'field_crew'];
// Phase F10.6 — Equipment sidebar group. The §4.6 access matrix:
// dispatchers (admin / developer / tech_support) AND the
// equipment_manager hat. The equipment_manager role lives almost
// entirely inside this nav group; gating on this constant keeps
// the Catalogue / Templates / future-Today / future-Timeline /
// etc. links visible to whoever holds that hat without leaking
// admin-wide nav.
const EQUIPMENT_ROLES: UserRole[] = ['admin', 'developer', 'tech_support', 'equipment_manager'];

export default function AdminSidebar({ role, roles, userName, userEmail, userImage, isOpen, onClose }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isCompanyUser = userEmail.toLowerCase().endsWith('@starr-surveying.com');

  const notableRoles = roles.filter(r => r !== 'employee' && r !== 'guest');
  const roleDisplay = notableRoles.length > 0
    ? notableRoles.map(r => ROLE_DISPLAY[r]).join(' + ')
    : ROLE_DISPLAY[role];

  // ── Navigation structure ──
  // Each item's `roles` array defines who sees it. Admin always sees everything
  // (enforced in canAccess). Items without `roles` are visible to all users.
  // Items with `internalOnly` require @starr-surveying.com domain.
  const sections: NavSection[] = [
    { label: 'Main', items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: '📊' },
      { href: '/admin/assignments', label: 'Assignments', icon: '📋', roles: [...WORK_ROLES, 'tech_support'], internalOnly: true },
      { href: '/admin/schedule', label: 'My Schedule', icon: '📅', roles: [...WORK_ROLES, 'tech_support'], internalOnly: true },
    ]},

    { label: 'Learning', items: [
      { href: '/admin/learn', label: 'Learning Hub', icon: '🎓' },
      { href: '/admin/learn/roadmap', label: 'My Roadmap', icon: '🗺️' },
      { href: '/admin/learn/modules', label: 'Modules', icon: '📚' },
      { href: '/admin/learn/knowledge-base', label: 'Knowledge Base', icon: '🔍' },
      { href: '/admin/learn/flashcards', label: 'Flashcards', icon: '🃏' },
      { href: '/admin/learn/exam-prep', label: 'Exam Prep', icon: '📝' },
      { href: '/admin/learn/quiz-history', label: 'Quiz History', icon: '📊' },
      { href: '/admin/learn/fieldbook', label: 'My Fieldbook', icon: '📓' },
      { href: '/admin/learn/search', label: 'Search', icon: '🔎' },
      { href: '/admin/learn/students', label: 'Student Progress', icon: '👨‍🎓', roles: [...CONTENT_MGMT_ROLES, 'tech_support'] },
      { href: '/admin/learn/manage', label: 'Manage Content', icon: '✏️', roles: [...CONTENT_MGMT_ROLES, 'tech_support'] },
    ]},

    { label: 'Work', items: [
      { href: '/admin/jobs', label: 'All Jobs', icon: '📋', roles: ['admin', 'developer', 'tech_support'], internalOnly: true },
      { href: '/admin/my-jobs', label: 'My Jobs', icon: '🗂️', roles: [...WORK_ROLES, 'researcher', 'tech_support'], internalOnly: true },
      { href: '/admin/my-hours', label: 'My Hours', icon: '⏱️', roles: [...WORK_ROLES, 'tech_support'], internalOnly: true },
      { href: '/admin/jobs/new', label: 'New Job', icon: '➕', roles: ['admin'], internalOnly: true },
      { href: '/admin/jobs/import', label: 'Import Jobs', icon: '📥', roles: ['admin'], internalOnly: true },
      { href: '/admin/leads', label: 'Leads', icon: '📨', roles: ['admin', 'developer', 'tech_support'], internalOnly: true },
      { href: '/admin/hours-approval', label: 'Hours Approval', icon: '✅', roles: ['admin', 'developer', 'tech_support'], internalOnly: true },
      { href: '/admin/team', label: 'Field Team', icon: '🛰️', roles: ['admin', 'developer', 'tech_support'], internalOnly: true },
      { href: '/admin/field-data', label: 'Field Data', icon: '📍', roles: ['admin', 'developer', 'tech_support'], internalOnly: true },
      { href: '/admin/timeline', label: 'Daily Timeline', icon: '🗺️', roles: ['admin', 'developer', 'tech_support'], internalOnly: true },
      { href: '/admin/mileage', label: 'Mileage', icon: '🚗', roles: ['admin', 'developer', 'tech_support'], internalOnly: true },
      { href: '/admin/finances', label: 'Finances', icon: '💼', roles: ['admin', 'developer', 'tech_support'], internalOnly: true },
      { href: '/admin/vehicles', label: 'Vehicles', icon: '🛻', roles: ['admin', 'developer', 'tech_support'], internalOnly: true },
    ]},

    // Equipment group — Phase F10.6 sidebar scaffold. Catalogue + templates
    // already shipped (F10.1 + F10.2); the F10.6-b..g panels add their own
    // entries to this section as they land. Role gate matches §4.6:
    // dispatchers (admin/developer/tech_support) get full access; the
    // equipment_manager role is the §4.6 hat that lives mostly in this
    // group so it appears here even when the user has no other admin role.
    { label: 'Equipment', items: [
      { href: '/admin/equipment/today', label: 'Today', icon: '📅', roles: EQUIPMENT_ROLES, internalOnly: true },
      { href: '/admin/equipment/timeline', label: 'Timeline', icon: '📊', roles: EQUIPMENT_ROLES, internalOnly: true },
      { href: '/admin/equipment/consumables', label: 'Consumables', icon: '🪣', roles: EQUIPMENT_ROLES, internalOnly: true },
      { href: '/admin/equipment', label: 'Catalogue', icon: '📦', roles: EQUIPMENT_ROLES, internalOnly: true },
      { href: '/admin/equipment/templates', label: 'Templates', icon: '📋', roles: EQUIPMENT_ROLES, internalOnly: true },
    ]},

    { label: 'Research', items: [
      { href: '/admin/research', label: 'Property Research', icon: '🔬', roles: [...RESEARCH_ROLES, 'field_crew', 'tech_support'], internalOnly: true },
      { href: '/admin/research/testing', label: 'Testing Lab', icon: '🧪', roles: ['admin', 'developer', 'tech_support'], internalOnly: true },
    ]},

    { label: 'CAD', items: [
      { href: '/admin/cad', label: 'CAD Editor', icon: '📐', roles: [...RESEARCH_ROLES, 'field_crew', 'tech_support'], internalOnly: true },
    ]},

    { label: 'Rewards & Pay', items: [
      { href: '/admin/rewards', label: 'Rewards & Store', icon: '🏆', roles: [...PAY_ROLES, 'tech_support'], internalOnly: true },
      { href: '/admin/pay-progression', label: 'Pay Progression', icon: '📈', roles: [...PAY_ROLES, 'tech_support'], internalOnly: true },
      { href: '/admin/rewards/how-it-works', label: 'How Rewards Work', icon: '💡', roles: [...PAY_ROLES, 'tech_support'], internalOnly: true },
      { href: '/admin/rewards/admin', label: 'Manage Rewards', icon: '⚙️', roles: ['admin', 'developer', 'tech_support'], internalOnly: true },
      { href: '/admin/my-pay', label: 'My Pay', icon: '💵', roles: [...PAY_ROLES, 'tech_support'], internalOnly: true },
      { href: '/admin/payout-log', label: 'Payout History', icon: '📒', roles: [...PAY_ROLES, 'tech_support'], internalOnly: true },
    ]},

    { label: 'People', items: [
      { href: '/admin/employees', label: 'Employees', icon: '👥', roles: ['admin', 'developer', 'tech_support'], internalOnly: true },
      { href: '/admin/users', label: 'Manage Users', icon: '🔑', roles: ['admin', 'tech_support'] },
      { href: '/admin/payroll', label: 'Payroll', icon: '💰', roles: ['admin'], internalOnly: true },
      { href: '/admin/receipts', label: 'Receipts', icon: '🧾', roles: ['admin', 'developer', 'tech_support'], internalOnly: true },
    ]},

    { label: 'Communication', items: [
      { href: '/admin/messages', label: 'Messages', icon: '💬', roles: INTERNAL_COMM_ROLES, internalOnly: true },
      { href: '/admin/messages/contacts', label: 'Team Directory', icon: '📇', roles: INTERNAL_COMM_ROLES, internalOnly: true },
      { href: '/admin/discussions', label: 'Discussions', icon: '💬', roles: INTERNAL_COMM_ROLES, internalOnly: true },
    ]},

    { label: 'Notes & Files', items: [
      { href: '/admin/notes', label: 'Company Notes', icon: '📝', roles: ['admin', 'developer', 'tech_support'], internalOnly: true },
      { href: '/admin/my-notes', label: 'My Notes', icon: '📒' },
      { href: '/admin/my-files', label: 'My Files', icon: '📁' },
    ]},

    { label: 'Account', items: [
      { href: '/admin/profile', label: 'My Profile', icon: '👤' },
      { href: '/admin/settings', label: 'Settings', icon: '⚙️', roles: ['admin'] },
      { href: '/admin/error-log', label: 'Error Log', icon: '🐛', roles: ['admin', 'developer', 'tech_support'] },
    ]},
  ];

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setCollapsed(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const toggleSection = (label: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const canAccess = (item: NavItem): boolean => {
    if (item.internalOnly && !isCompanyUser) return false;
    if (!item.roles) return true;
    if (roles.includes('admin')) return true;
    return item.roles.some(r => roles.includes(r));
  };

  const isActive = (href: string): boolean => {
    if (href === '/admin/dashboard') return pathname === '/admin/dashboard';
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
          onClick={() => { router.push('/admin/dashboard'); onClose(); }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') { router.push('/admin/dashboard'); onClose(); } }}
        >
          <Image src="/logos/Starr_Surveying_Red_White_Blue_Star_With_Surveyor.png" alt="Starr Surveying" width={40} height={40} className="admin-sidebar__logo" />
          <div className="admin-sidebar__brand">
            <span className="admin-sidebar__brand-name">Starr Surveying</span>
            <span className="admin-sidebar__brand-sub">{BRAND_LABELS[role] || 'Employee Portal'}</span>
          </div>
        </div>
        <nav className="admin-sidebar__nav">
          {sections.map((section) => {
            const items = section.items.filter(canAccess);
            if (!items.length) return null;

            const sectionActive = isSectionActive(section);
            const isExpanded = !collapsed[section.label];

            return (
              <div key={section.label} className="admin-sidebar__section">
                <div
                  className={`admin-sidebar__section-label admin-sidebar__section-label--collapsible${sectionActive ? ' admin-sidebar__section-label--active' : ''}`}
                  onClick={() => toggleSection(section.label)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') toggleSection(section.label); }}
                >
                  <span className={`admin-sidebar__section-arrow ${isExpanded ? 'admin-sidebar__section-arrow--expanded' : ''}`}>
                    &#x276F;
                  </span>
                  {section.label}
                </div>
                {isExpanded && items.map((item) => (
                  <Link key={item.href} href={item.href} className={`admin-sidebar__link ${isActive(item.href) ? 'admin-sidebar__link--active' : ''}`} onClick={onClose}>
                    <span className="admin-sidebar__link-icon">{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
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
