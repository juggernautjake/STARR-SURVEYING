// app/admin/components/AdminLayoutClient.tsx
'use client';

import { SessionProvider, useSession } from 'next-auth/react';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import AdminSidebar from './AdminSidebar';
import AdminTopBar from './AdminTopBar';
import Fieldbook from './Fieldbook';

import '../styles/AdminLayout.css';
import '../styles/AdminLearn.css';

const PAGE_TITLES: Record<string, string> = {
  '/admin/dashboard': 'Dashboard',
  '/admin/learn': 'Learning Hub',
  '/admin/learn/modules': 'Learning Modules',
  '/admin/learn/knowledge-base': 'Knowledge Base',
  '/admin/learn/flashcards': 'Flashcards',
  '/admin/learn/flashcards/create': 'Create Flashcards',
  '/admin/learn/exam-prep': 'Exam Prep',
  '/admin/learn/exam-prep/sit': 'SIT Exam Prep',
  '/admin/learn/exam-prep/rpls': 'RPLS Exam Prep',
  '/admin/learn/search': 'Search',
  '/admin/learn/manage': 'Manage Content',
  '/admin/profile': 'My Profile',
  '/admin/jobs': 'Job Tracker',
  '/admin/my-jobs': 'My Jobs',
  '/admin/employees': 'Employees',
  '/admin/payroll': 'Payroll',
  '/admin/my-pay': 'My Pay',
  '/admin/notes': 'Company Notes',
  '/admin/my-notes': 'My Notes',
  '/admin/my-files': 'My Files',
  '/admin/leads': 'Leads',
  '/admin/settings': 'Settings',
};

function getTitle(p: string): string {
  if (PAGE_TITLES[p]) return PAGE_TITLES[p];
  if (p.includes('/quiz')) return 'Quiz';
  if (p.includes('/test')) return 'Module Test';
  if (p.includes('/learn/modules/')) return 'Module';
  if (p.includes('/learn/knowledge-base/')) return 'Article';
  if (p.includes('/learn/flashcards/')) return 'Study Deck';
  return 'Admin';
}

function Inner({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (pathname === '/admin/login') return <>{children}</>;

  if (status === 'loading') return (
    <div className="admin-layout" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: '#6B7280' }}>
        <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>⏳</div>
        <p style={{ fontFamily: 'Inter,sans-serif', fontSize: '.9rem' }}>Loading...</p>
      </div>
    </div>
  );

  if (!session?.user) return <>{children}</>;

  const role = session.user.role || 'employee';

  return (
    <div className="admin-layout">
      <AdminSidebar role={role} userName={session.user.name || 'User'} userImage={session.user.image || undefined} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="admin-layout__main">
        <AdminTopBar title={getTitle(pathname)} role={role} onMenuToggle={() => setSidebarOpen((p) => !p)} />
        <div className="admin-layout__content">{children}</div>
      </div>
      <Fieldbook />
    </div>
  );
}

export default function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  return <SessionProvider><Inner>{children}</Inner></SessionProvider>;
}
