// app/admin/components/AdminLayoutClient.tsx
'use client';

import { SessionProvider, useSession } from 'next-auth/react';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import AdminSidebar from './AdminSidebar';
import AdminTopBar from './AdminTopBar';
import Fieldbook from './Fieldbook';
import DiscussionThreadButton from './DiscussionThreadButton';
import FloatingMessenger from './FloatingMessenger';
import FloatingActionMenu from './FloatingActionMenu';
import ErrorProvider from './error/ErrorProvider';
import ErrorBoundary from './error/ErrorBoundary';
import { ToastProvider } from './Toast';
import CommandPaletteProvider from './nav/CommandPaletteProvider';
import IconRail from './nav/IconRail';
import AdminPageHeader from './nav/AdminPageHeader';
import { useAdminNavStore } from '@/lib/admin/nav-store';
import { shouldBypassAdminChrome } from '@/lib/admin/chrome-bypass';
import { useCadReturnPathTracker } from '@/lib/admin/cad-return-path';
import { CalculatorProvider } from './calculator/CalculatorProvider';
import CalculatorFab from './calculator/CalculatorFab';

// Layout-global CSS only. Route-specific stylesheets are imported from
// the corresponding route segment layout (e.g. app/admin/research/layout.tsx)
// or page (e.g. app/admin/users/page.tsx) so each admin route only loads
// the CSS it actually needs. See PR 1 (Phase 0.5 cleanup) for the rationale
// and docs/planning/in-progress/CSS_CLEANUP_REPORT.md for the dead-class
// audit follow-up.
import '../styles/AdminLayout.css';
import '../styles/AdminResponsive.css';
// AdminFieldWork.css stays here because the Fieldbook is rendered by this
// layout via FloatingActionMenu and is reachable from every admin page.
import '../styles/AdminFieldWork.css';

const PAGE_TITLES: Record<string, string> = {
  '/admin/me': 'Hub',
  '/admin/work': 'Work',
  '/admin/office': 'Office',
  '/admin/research-cad': 'Research & CAD',
  '/admin/announcements': "What's new",
  '/admin/billing/upgrade': 'Upgrade required',
  '/admin/support': 'Support',
  '/admin/audit': 'Audit log',
  '/admin/billing': 'Billing',
  '/admin/billing/invoices': 'Invoices',
  '/admin/dashboard': 'Dashboard',
  '/admin/learn': 'Learning Hub',
  '/admin/learn/roadmap': 'My Roadmap',
  '/admin/learn/modules': 'Learning Modules',
  '/admin/learn/knowledge-base': 'Knowledge Base',
  '/admin/learn/flashcards': 'Flashcards',
  '/admin/learn/flashcards/create': 'Create Flashcards',
  '/admin/learn/flashcard-bank': 'Flashcard Bank',
  '/admin/learn/exam-prep': 'Exam Prep',
  '/admin/learn/exam-prep/sit': 'FS Exam Prep',
  '/admin/learn/exam-prep/sit/mock-exam': 'FS Mock Exam',
  '/admin/learn/exam-prep/rpls': 'RPLS Exam Prep',
  '/admin/learn/search': 'Search',
  '/admin/learn/quiz-history': 'Quiz History',
  '/admin/learn/students': 'Student Progress',
  '/admin/learn/manage': 'Manage Content',
  '/admin/learn/manage/question-builder': 'Question Builder',
  '/admin/learn/manage/media': 'Media Library',
  '/admin/learn/practice': 'Practice Session',
  '/admin/profile': 'My Profile',
  '/admin/jobs': 'All Jobs',
  '/admin/jobs/new': 'New Job',
  '/admin/jobs/import': 'Import Jobs',
  '/admin/my-jobs': 'My Jobs',
  '/admin/employees': 'Employees',
  '/admin/users': 'Manage Users',
  '/admin/employees/manage': 'Manage Employee',
  '/admin/payroll': 'Payroll',
  '/admin/my-pay': 'My Pay',
  '/admin/payout-log': 'Payout History',
  '/admin/notes': 'Company Notes',
  '/admin/my-notes': 'My Notes',
  '/admin/my-files': 'My Files',
  '/admin/leads': 'Leads',
  '/admin/settings': 'Settings',
  '/admin/messages': 'Messages',
  '/admin/messages/new': 'New Message',
  '/admin/messages/contacts': 'Team Directory',
  '/admin/messages/settings': 'Message Settings',
  '/admin/rewards': 'Rewards & Store',
  '/admin/rewards/how-it-works': 'How Rewards Work',
  '/admin/rewards/store': 'Company Store',
  '/admin/rewards/admin': 'Manage Rewards',
  '/admin/pay-progression': 'Pay Progression',
  '/admin/error-log': 'Error Log',
  '/admin/assignments': 'Assignments',
  '/admin/schedule': 'My Schedule',
  '/admin/my-hours': 'My Hours',
  '/admin/hours-approval': 'Hours Approval',
  '/admin/time-off': 'Time Off',
  '/admin/discussions': 'Discussion Threads',
  '/admin/learn/fieldbook': 'My Fieldbook',
  '/admin/research': 'Property Research',
  '/admin/research/new': 'New Research Project',
  // Office workspace pages added to route-registry in Slice 56
  '/admin/invites': 'Invites',
  '/admin/payouts': 'Payouts',
  '/admin/reports': 'Reports',
  '/admin/org-settings': 'Org Settings',
  '/admin/orgs': 'Organizations',
  // Work + equipment + finances landings — also previously falling back to "Admin"
  '/admin/equipment': 'Equipment',
  '/admin/equipment/inventory': 'Inventory',
  '/admin/equipment/consumables': 'Consumables',
  '/admin/equipment/maintenance': 'Maintenance',
  '/admin/equipment/timeline': 'Equipment Timeline',
  '/admin/equipment/fleet-valuation': 'Fleet Valuation',
  '/admin/equipment/overrides': 'Equipment Overrides',
  '/admin/equipment/templates': 'Equipment Templates',
  '/admin/equipment/today': "Today's Equipment",
  '/admin/equipment/import': 'Import Equipment',
  '/admin/field-data': 'Field Data',
  '/admin/finances': 'Finances',
  '/admin/mileage': 'Mileage',
  '/admin/team': 'Field Team',
  '/admin/timeline': 'Activity Timeline',
  '/admin/vehicles': 'Vehicles',
  // Remaining one-off pages caught by the title-map audit in Slice 65.
  '/admin/billing/plan-history': 'Plan History',
  '/admin/cad': 'CAD Drawings',
  '/admin/equipment/templates/cleanup-queue': 'Templates Cleanup Queue',
  '/admin/equipment/templates/new': 'New Equipment Template',
  '/admin/personnel/crew-calendar': 'Crew Calendar',
  '/admin/receipts': 'Receipts',
  '/admin/research/billing': 'Research Billing',
  '/admin/research/coverage': 'Research Coverage',
  '/admin/research/library': 'Research Library',
  '/admin/research/pipeline': 'Research Pipeline',
  '/admin/research/testing': 'Research Testing',
  '/admin/support/new': 'New Support Ticket',
};

function getTitle(p: string): string {
  if (PAGE_TITLES[p]) return PAGE_TITLES[p];
  if (p.includes('/exam-prep/sit/module/')) return 'FS Module Study';
  if (p.includes('/lesson-builder/')) return 'Lesson Builder';
  if (p.includes('/quiz')) return 'Quiz';
  if (p.includes('/test')) return 'Module Test';
  if (p.includes('/learn/modules/')) return 'Module';
  if (p.includes('/learn/manage/article-editor/')) return 'Article Editor';
  if (p.includes('/learn/articles/')) return 'Article';
  if (p.includes('/learn/knowledge-base/')) return 'Article';
  if (p.includes('/learn/flashcards/')) return 'Study Deck';
  if (p.includes('/learn/students/')) return 'Student Detail';
  if (p.startsWith('/admin/messages/') && !PAGE_TITLES[p]) return 'Conversation';
  if (p.startsWith('/admin/jobs/') && !PAGE_TITLES[p]) return 'Job Detail';
  if (p.startsWith('/admin/payroll/') && !PAGE_TITLES[p]) return 'Employee Pay Detail';
  if (p.startsWith('/admin/discussions/') && !PAGE_TITLES[p]) return 'Discussion Thread';
  if (p.startsWith('/admin/research/') && !PAGE_TITLES[p]) return 'Research Project';
  return 'Admin';
}

function Inner({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navV2 = useAdminNavStore((s) => s.adminNavV2Enabled);
  // cad-exit-return-path 2026-05-30 — record the prior admin path
  // whenever the user navigates INTO /admin/cad, so the CAD Exit
  // button can return there instead of always defaulting to
  // /admin/research-cad.
  useCadReturnPathTracker();

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

  // Routes that own their own full-bleed chrome (CAD editor, Work Mode
  // shells) short-circuit the regular admin layout so nothing competes
  // for viewport space. Still inside SessionProvider, so authenticated
  // fetches keep working. See `lib/admin/chrome-bypass.ts` for the
  // prefix list.
  if (shouldBypassAdminChrome(pathname)) return <>{children}</>;

  const role = session.user.role || 'employee';
  const roles = session.user.roles || [role];
  const pageTitle = getTitle(pathname);

  return (
    <ErrorProvider>
      <ToastProvider>
      <CommandPaletteProvider>
      <CalculatorProvider>
      <div className={`admin-layout${navV2 ? ' admin-layout--nav-v2' : ''}`}>
        {navV2 && <IconRail />}
        {/* AdminSidebar is the mobile drawer (and the only nav at desktop
            widths when nav-v2 is off). When nav-v2 is on, it is hidden
            on desktop via CSS but still present so the hamburger has
            something to toggle on mobile. */}
        <AdminSidebar role={role} roles={roles} userName={session.user.name || 'User'} userEmail={session.user.email || ''} userImage={session.user.image || undefined} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="admin-layout__main">
          <AdminTopBar title={pageTitle} role={role} onMenuToggle={() => setSidebarOpen((p) => !p)} />
          <div className="admin-layout__content">
            {navV2 ? <AdminPageHeader /> : null}
            <ErrorBoundary
              pageName={pageTitle}
              userEmail={session.user.email || undefined}
              userName={session.user.name || undefined}
              userRole={role}
            >
              {children}
            </ErrorBoundary>
          </div>
        </div>
        <FloatingActionMenu>
          <FloatingMessenger />
          <DiscussionThreadButton />
          <Fieldbook />
          <CalculatorFab />
        </FloatingActionMenu>
      </div>
      </CalculatorProvider>
      </CommandPaletteProvider>
    </ToastProvider>
    </ErrorProvider>
  );
}

export default function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  return <SessionProvider><Inner>{children}</Inner></SessionProvider>;
}
