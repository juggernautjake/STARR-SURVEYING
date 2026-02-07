// app/admin/components/AdminSidebar.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

interface AdminSidebarProps {
  role: 'admin' | 'employee';
  userName: string;
  userImage?: string;
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem { href: string; label: string; icon: string; adminOnly?: boolean; }
interface NavSection { label: string; items: NavItem[]; collapsible: boolean; }

const STORAGE_KEY = 'starr-sidebar-collapsed';

export default function AdminSidebar({ role, userName, userImage, isOpen, onClose }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const sections: NavSection[] = [
    { label: 'Main', collapsible: false, items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: '📊' },
      { href: '/admin/assignments', label: 'Assignments', icon: '📋' },
      { href: '/admin/schedule', label: 'My Schedule', icon: '📅' },
    ]},
    { label: 'Learning', collapsible: true, items: [
      { href: '/admin/learn', label: 'Learning Hub', icon: '🎓' },
      { href: '/admin/learn/modules', label: 'Modules', icon: '📚' },
      { href: '/admin/learn/knowledge-base', label: 'Knowledge Base', icon: '🔍' },
      { href: '/admin/learn/flashcards', label: 'Flashcards', icon: '🃏' },
      { href: '/admin/learn/exam-prep', label: 'Exam Prep', icon: '📝' },
      { href: '/admin/learn/quiz-history', label: 'Quiz History', icon: '📊' },
      { href: '/admin/learn/fieldbook', label: 'My Fieldbook', icon: '📓' },
      { href: '/admin/learn/search', label: 'Search', icon: '🔎' },
      { href: '/admin/learn/manage', label: 'Manage Content', icon: '✏️', adminOnly: true },
    ]},
    { label: 'Work', collapsible: true, items: [
      { href: '/admin/jobs', label: 'All Jobs', icon: '📋', adminOnly: true },
      { href: '/admin/my-jobs', label: 'My Jobs', icon: '🗂️' },
      { href: '/admin/my-hours', label: 'My Hours', icon: '⏱️' },
      { href: '/admin/jobs/new', label: 'New Job', icon: '➕', adminOnly: true },
      { href: '/admin/jobs/import', label: 'Import Jobs', icon: '📥', adminOnly: true },
      { href: '/admin/leads', label: 'Leads', icon: '📨', adminOnly: true },
      { href: '/admin/hours-approval', label: 'Hours Approval', icon: '✅', adminOnly: true },
    ]},
    { label: 'People', collapsible: true, items: [
      { href: '/admin/employees', label: 'Employees', icon: '👥', adminOnly: true },
      { href: '/admin/payroll', label: 'Payroll', icon: '💰', adminOnly: true },
      { href: '/admin/my-pay', label: 'My Pay', icon: '💵' },
      { href: '/admin/payout-log', label: 'Payout History', icon: '📒' },
    ]},
    { label: 'Communication', collapsible: true, items: [
      { href: '/admin/messages', label: 'Messages', icon: '💬' },
      { href: '/admin/messages/contacts', label: 'Team Directory', icon: '📇' },
    ]},
    { label: 'Notes & Files', collapsible: true, items: [
      { href: '/admin/notes', label: 'Company Notes', icon: '📝', adminOnly: true },
      { href: '/admin/my-notes', label: 'My Notes', icon: '📒' },
      { href: '/admin/my-files', label: 'My Files', icon: '📁' },
    ]},
    { label: 'Account', collapsible: true, items: [
      { href: '/admin/profile', label: 'My Profile', icon: '👤' },
      { href: '/admin/settings', label: 'Settings', icon: '⚙️', adminOnly: true },
      { href: '/admin/error-log', label: 'Error Log', icon: '🐛', adminOnly: true },
    ]},
  ];

  // Load collapsed state from localStorage
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

  const isActive = (href: string): boolean => {
    if (href === '/admin/dashboard') return pathname === '/admin/dashboard';
    if (href === '/admin/learn') return pathname === '/admin/learn';
    if (href === '/admin/jobs') return pathname === '/admin/jobs';
    if (href === '/admin/messages') return pathname === '/admin/messages';
    return pathname.startsWith(href);
  };

  // Auto-expand section containing the active page
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
            <span className="admin-sidebar__brand-sub">Admin Panel</span>
          </div>
        </div>
        <nav className="admin-sidebar__nav">
          {sections.map((section) => {
            const items = section.items.filter((i) => !i.adminOnly || role === 'admin');
            if (!items.length) return null;

            const isCollapsible = section.collapsible;
            const isExpanded = !isCollapsible || !collapsed[section.label] || isSectionActive(section);

            return (
              <div key={section.label} className="admin-sidebar__section">
                <div
                  className={`admin-sidebar__section-label ${isCollapsible ? 'admin-sidebar__section-label--collapsible' : ''}`}
                  onClick={isCollapsible ? () => toggleSection(section.label) : undefined}
                  role={isCollapsible ? 'button' : undefined}
                  tabIndex={isCollapsible ? 0 : undefined}
                  onKeyDown={isCollapsible ? (e) => { if (e.key === 'Enter') toggleSection(section.label); } : undefined}
                >
                  {isCollapsible && (
                    <span className={`admin-sidebar__section-arrow ${isExpanded ? 'admin-sidebar__section-arrow--expanded' : ''}`}>
                      &#9656;
                    </span>
                  )}
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
              <div className="admin-sidebar__user-role">{role}</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
