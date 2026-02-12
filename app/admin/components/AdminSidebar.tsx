// app/admin/components/AdminSidebar.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
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

// roles: which roles can see this item. If omitted, all roles can see it.
// internalOnly: if true, only company-domain users can see this item.
interface NavItem {
  href: string;
  label: string;
  icon: string;
  roles?: UserRole[];
  internalOnly?: boolean;
}
interface NavSection { label: string; items: NavItem[]; }

const STORAGE_KEY = 'starr-sidebar-collapsed';

// Role display labels
const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  teacher: 'Teacher',
  employee: 'Employee',
};

// Brand subtitle per role
const BRAND_LABELS: Record<UserRole, string> = {
  admin: 'Admin Panel',
  teacher: 'Teacher Panel',
  employee: 'Learning Portal',
};

export default function AdminSidebar({ role, roles, userName, userEmail, userImage, isOpen, onClose }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isCompanyUser = userEmail.toLowerCase().endsWith('@starr-surveying.com');

  // Display label showing all roles
  const roleDisplay = roles.filter(r => r !== 'employee').length > 0
    ? roles.filter(r => r !== 'employee').map(r => ROLE_LABELS[r]).join(' + ')
    : ROLE_LABELS.employee;

  const sections: NavSection[] = [
    { label: 'Main', items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: '📊' },
      { href: '/admin/assignments', label: 'Assignments', icon: '📋', internalOnly: true },
      { href: '/admin/schedule', label: 'My Schedule', icon: '📅', internalOnly: true },
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
      { href: '/admin/learn/students', label: 'Student Progress', icon: '👨‍🎓', roles: ['admin', 'teacher'] },
      { href: '/admin/learn/manage', label: 'Manage Content', icon: '✏️', roles: ['admin', 'teacher'] },
    ]},
    { label: 'Work', items: [
      { href: '/admin/jobs', label: 'All Jobs', icon: '📋', roles: ['admin'], internalOnly: true },
      { href: '/admin/my-jobs', label: 'My Jobs', icon: '🗂️', internalOnly: true },
      { href: '/admin/my-hours', label: 'My Hours', icon: '⏱️', internalOnly: true },
      { href: '/admin/jobs/new', label: 'New Job', icon: '➕', roles: ['admin'], internalOnly: true },
      { href: '/admin/jobs/import', label: 'Import Jobs', icon: '📥', roles: ['admin'], internalOnly: true },
      { href: '/admin/leads', label: 'Leads', icon: '📨', roles: ['admin'], internalOnly: true },
      { href: '/admin/hours-approval', label: 'Hours Approval', icon: '✅', roles: ['admin'], internalOnly: true },
    ]},
    { label: 'Rewards & Pay', items: [
      { href: '/admin/rewards', label: 'Rewards & Store', icon: '🏆', internalOnly: true },
      { href: '/admin/pay-progression', label: 'Pay Progression', icon: '📈', internalOnly: true },
      { href: '/admin/rewards/how-it-works', label: 'How Rewards Work', icon: '💡', internalOnly: true },
      { href: '/admin/rewards/admin', label: 'Manage Rewards', icon: '⚙️', roles: ['admin'], internalOnly: true },
    ]},
    { label: 'People', items: [
      { href: '/admin/employees', label: 'Employees', icon: '👥', roles: ['admin'], internalOnly: true },
      { href: '/admin/users', label: 'Manage Users', icon: '🔑', roles: ['admin'] },
      { href: '/admin/payroll', label: 'Payroll', icon: '💰', roles: ['admin'], internalOnly: true },
      { href: '/admin/my-pay', label: 'My Pay', icon: '💵', internalOnly: true },
      { href: '/admin/payout-log', label: 'Payout History', icon: '📒', internalOnly: true },
    ]},
    { label: 'Communication', items: [
      { href: '/admin/messages', label: 'Messages', icon: '💬', internalOnly: true },
      { href: '/admin/messages/contacts', label: 'Team Directory', icon: '📇', internalOnly: true },
    ]},
    { label: 'Notes & Files', items: [
      { href: '/admin/notes', label: 'Company Notes', icon: '📝', roles: ['admin'], internalOnly: true },
      { href: '/admin/my-notes', label: 'My Notes', icon: '📒', internalOnly: true },
      { href: '/admin/my-files', label: 'My Files', icon: '📁', internalOnly: true },
    ]},
    { label: 'Account', items: [
      { href: '/admin/profile', label: 'My Profile', icon: '👤' },
      { href: '/admin/settings', label: 'Settings', icon: '⚙️', roles: ['admin'] },
      { href: '/admin/error-log', label: 'Error Log', icon: '🐛', roles: ['admin'] },
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

  /** Check if user's roles and domain are allowed for this nav item */
  const canAccess = (item: NavItem): boolean => {
    if (item.internalOnly && !isCompanyUser) return false;
    if (!item.roles) return true; // no restriction = everyone
    // Check if any of the user's roles match any of the item's required roles
    return item.roles.some(r => roles.includes(r));
  };

  const isActive = (href: string): boolean => {
    if (href === '/admin/dashboard') return pathname === '/admin/dashboard';
    if (href === '/admin/learn') return pathname === '/admin/learn';
    if (href === '/admin/jobs') return pathname === '/admin/jobs';
    if (href === '/admin/messages') return pathname === '/admin/messages';
    if (href === '/admin/rewards') return pathname === '/admin/rewards';
    return pathname.startsWith(href);
  };

  const isSectionActive = (section: NavSection): boolean => {
    return section.items.some((i) => isActive(i.href));
  };

  const getInitials = (name: string) => name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

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
          <img src="/logos/Starr_Surveying_Red_White_Blue_Star_With_Surveyor.png" alt="Starr Surveying" className="admin-sidebar__logo" />
          <div className="admin-sidebar__brand">
            <span className="admin-sidebar__brand-name">Starr Surveying</span>
            <span className="admin-sidebar__brand-sub">{BRAND_LABELS[role]}</span>
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
            {userImage ? <img src={userImage} alt={userName} className="admin-sidebar__avatar" /> :
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
