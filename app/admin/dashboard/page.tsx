// app/admin/dashboard/page.tsx
'use client';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

export default function AdminDashboardPage() {
  const { data: session } = useSession();
  if (!session?.user) return null;
  const role = session.user.role || 'employee';
  const firstName = session.user.name?.split(' ')[0] || 'there';

  const quickLinks = [
    { href: '/admin/learn', icon: '🎓', label: 'Learning Hub' },
    { href: '/admin/learn/modules', icon: '📚', label: 'Modules' },
    { href: '/admin/learn/flashcards', icon: '🃏', label: 'Flashcards' },
    { href: '/admin/learn/exam-prep', icon: '📝', label: 'Exam Prep' },
    { href: '/admin/learn/knowledge-base', icon: '🔍', label: 'Knowledge Base' },
    { href: '/admin/learn/search', icon: '🔎', label: 'Search' },
    ...(role === 'admin' ? [
      { href: '/admin/learn/manage', icon: '✏️', label: 'Manage Content' },
      { href: '/admin/jobs', icon: '📋', label: 'All Jobs' },
      { href: '/admin/employees', icon: '👥', label: 'Employees' },
      { href: '/admin/leads', icon: '📨', label: 'Leads' },
    ] : [
      { href: '/admin/my-jobs', icon: '🗂️', label: 'My Jobs' },
      { href: '/admin/my-pay', icon: '💵', label: 'My Pay' },
      { href: '/admin/my-notes', icon: '📒', label: 'My Notes' },
    ]),
  ];

  return (
    <>
      <div className="admin-dashboard__welcome">
        <h2 className="admin-dashboard__welcome-title">Welcome back, {firstName}! 👋</h2>
        <p className="admin-dashboard__welcome-sub">
          {role === 'admin' ? 'Full admin access to Starr Surveying backend.' : 'Access your jobs, learning materials, and personal workspace.'}
        </p>
      </div>
      <div className="admin-dashboard__cards">
        <div className="admin-card admin-card--accent-blue"><div className="admin-card__label">Learning</div><div className="admin-card__value">—</div><div className="admin-card__footer">Start a module to track progress</div></div>
        <div className="admin-card admin-card--accent-red"><div className="admin-card__label">My Jobs</div><div className="admin-card__value">—</div><div className="admin-card__footer">No jobs assigned yet</div></div>
        <div className="admin-card admin-card--accent-amber"><div className="admin-card__label">Flashcards</div><div className="admin-card__value">—</div><div className="admin-card__footer">Cards studied today</div></div>
        <div className="admin-card admin-card--accent-green"><div className="admin-card__label">Knowledge Base</div><div className="admin-card__value">—</div><div className="admin-card__footer">Articles available</div></div>
      </div>
      <div className="admin-dashboard__section">
        <h3 className="admin-dashboard__section-title">Quick Links</h3>
        <div className="admin-dashboard__quick-links">
          {quickLinks.map((l) => <Link key={l.href} href={l.href} className="admin-dashboard__quick-link"><span>{l.icon}</span>{l.label}</Link>)}
        </div>
      </div>
    </>
  );
}
