// app/admin/components/AdminLayoutClient.tsx
'use client';

import { SessionProvider, useSession } from 'next-auth/react';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import PageOffGate from './PageOffGate';
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
import ShellTheme from './ShellTheme';
import AdminPageHeader from './nav/AdminPageHeader';
import SetupReturnBanner from './SetupReturnBanner';
import { shouldBypassAdminChrome } from '@/lib/admin/chrome-bypass';
import { ADMIN_ROUTES } from '@/lib/admin/route-registry';
import { isInternalUser } from '@/lib/saas/internal-user';
import { useCadReturnPathTracker } from '@/lib/admin/cad-return-path';
import { CalculatorProvider } from './calculator/CalculatorProvider';
import CalculatorFab from './calculator/CalculatorFab';
import { AssistantProvider } from './assistant/AssistantProvider';
import AssistantDock from './assistant/AssistantDock';

// Layout-global CSS only. Route-specific stylesheets are imported from
// the corresponding route segment layout (e.g. app/admin/research/layout.tsx)
// or page (e.g. app/admin/users/page.tsx) so each admin route only loads
// the CSS it actually needs. See PR 1 (Phase 0.5 cleanup) for the rationale
// and docs/planning/in-progress/CSS_CLEANUP_REPORT.md for the dead-class
// audit follow-up.
import '../styles/AdminLayout.css';
import '../styles/AdminResponsive.css';
// M2 — the dialog shell that cannot outgrow the screen. Layout-global by necessity rather than
// convenience: dialogs are opened from pages all over the admin, and a shell loaded per-route is a
// shell that is missing on the route somebody forgets. See AdminDialog.css for the measured bug.
import '../styles/AdminDialog.css';
// AdminFieldWork.css stays here because the Fieldbook is rendered by this
// layout via FloatingActionMenu and is reachable from every admin page.
import '../styles/AdminFieldWork.css';
// floating-popup-styles-fix-2026-06-18 — the FloatingMessenger + the
// DiscussionThreadButton (report-an-issue / open-threads popup) are
// rendered by this layout, so they need their stylesheets loaded on
// EVERY admin page, not just /admin/messages and /admin/discussions.
// Without these imports the popups inherit only user-agent defaults
// (no rounded corners, no padding, conversations laid out
// horizontally) — see the screenshots the user shared on
// 2026-06-18.
import '../styles/AdminMessaging.css';
import '../styles/AdminDiscussions.css';
// Same reason again (audit §5 item 14): the assistant dock is mounted by this layout, so its
// stylesheet has to be loaded on every admin page rather than by any one route.
import '../styles/AdminAssistant.css';

// Exported so the bug-report page selector (DiscussionThreadButton) can
// offer the same admin route → label list the nav uses.
export const PAGE_TITLES: Record<string, string> = {
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
  // /admin/profile + /admin/my-jobs page-titles removed in
  // consolidation Slice 2 — the pages were deleted; middleware
  // redirects the URLs to /admin/me?tab=… before they ever render.
  '/admin/jobs': 'All Jobs',
  '/admin/jobs/new': 'New Job',
  '/admin/jobs/import': 'Import Jobs',
  '/admin/employees': 'Employees',
  '/admin/users': 'Manage Users',
  '/admin/employees/manage': 'Manage Employee',
  '/admin/payroll': 'Payroll',
  // /admin/my-pay + /admin/my-notes page-titles removed in
  // consolidation Slice 2 (see note above).
  '/admin/payout-log': 'Payout History',
  '/admin/notes': 'Company Notes',
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
  // /admin/my-hours page-title removed in consolidation Slice 2.
  '/admin/hours?tab=approvals': 'Hours Approval',
  '/admin/hours?tab=time-off': 'Time Off',
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
  // The registry, before the pattern heuristics below (audit §1.3 — one source of truth). This map
  // is hand-maintained, so every page added since somebody last remembered it has been falling
  // through: /admin/availability read "Admin", and /admin/research/sites read "Research Project",
  // because the `/admin/research/` prefix rule below catches anything the map missed. A registered
  // route already carries a label that the rail, the palette and the breadcrumb all use; taking it
  // from there means a new page is titled correctly by being registered, which it must be anyway.
  const registered = ADMIN_ROUTES.find((r) => r.href === p);
  if (registered) return registered.label;
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
  // cad-exit-return-path 2026-05-30 — record the prior admin path
  // whenever the user navigates INTO /admin/cad, so the CAD Exit
  // button can return there instead of always defaulting to
  // /admin/research-cad.
  useCadReturnPathTracker();

  if (pathname === '/admin/login') return <>{children}</>;

  if (status === 'loading') return (
    <div className="admin-layout" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: 'var(--theme-fg-secondary, #6B7280)' }}>
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
  // Only the EDITOR, not the designs list: the list is an ordinary page and the dock belongs on it.
  // Only the EDITOR, not the designs list: the list is an ordinary page and the dock belongs on it.
  const isPageDesigner = pathname.startsWith('/admin/design/') && pathname.split('/').length === 4;
  const pageTitle = getTitle(pathname);

  return (
    <ErrorProvider>
      <ToastProvider>
      <CommandPaletteProvider>
      <CalculatorProvider>
      {/* AssistantProvider wraps the layout rather than the dock so any page — and the help drawer's
          fallback (item 15) — can call `openAssistant(question)` without owning a transcript. */}
      <AssistantProvider>
      {/* The user's theme + density on <html>, so it reaches every admin page — and every dialog,
          toast and portal, which a wrapper div would miss. Until 2026-08-04 the theme was applied
          only inside HubProviders, i.e. on the Hub alone: picking "Forest Dark" darkened one page
          and left the rest of the product default. Renders nothing. */}
      <ShellTheme />
      <div className="admin-layout admin-layout--nav-v2">
        <IconRail />
        {/* AdminSidebar is the MOBILE DRAWER — hidden on desktop via CSS, where the IconRail above
            is the nav. It is not a second navigation system any more: since platform audit §1.3 it
            derives its sections from the same `ADMIN_ROUTES` registry the rail uses, so a page
            registered once appears in both. Deleting it, as the audit first proposed, would leave a
            phone with no navigation at all. */}
        <AdminSidebar role={role} roles={roles} userName={session.user.name || 'User'} userEmail={session.user.email || ''} userImage={session.user.image || undefined} isCompanyUser={isInternalUser(session)} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="admin-layout__main">
          <AdminTopBar title={pageTitle} role={role} onMenuToggle={() => setSidebarOpen((p) => !p)} />
          <div className="admin-layout__content">
            <AdminPageHeader />
            {/* Renders only for ?setup=1, which the onboarding checklist sets and nothing else does.
                Mounted once here rather than added to each destination: the steps point at six
                different pages today and the seventh would be the one somebody forgets. */}
            <SetupReturnBanner />
            <ErrorBoundary
              pageName={pageTitle}
              userEmail={session.user.email || undefined}
              userName={session.user.name || undefined}
              userRole={role}
            >
              {/* T4 of §11.4. A switched-off page shows a plain notice — an ADMIN sees the page
                * itself behind a banner, because "turn it back on and make sure it is hooked up
                * correctly" is impossible if the only thing they can see of it is a notice.
                *
                * INSIDE the ErrorBoundary, so a fault in the gate is caught like any other page
                * fault rather than taking the whole shell down — and above `children`, so the page
                * underneath never mounts for somebody who should not see it. */}
              <PageOffGate isAdminUser={roles.includes('admin')}>
                {children}
              </PageOffGate>
            </ErrorBoundary>
          </div>
        </div>
        {/* ── THE FLOATING DOCK IS A TOOL EVERYWHERE EXCEPT ON A CANVAS ─────────────────────────
          * It is `position: fixed` at the bottom right of every admin page, which is empty
          * background on all of them but one. In the Page Designer that corner is the bottom of the
          * properties column, so the dock sat on top of the Appearance swatches and the layer list
          * — controls you cannot click rather than ones you cannot see, which is the worse kind of
          * hidden. The designer has its own toolset and does not want a second floating one. */}
        {!isPageDesigner && (
          <FloatingActionMenu>
            <FloatingMessenger />
            <DiscussionThreadButton />
            <Fieldbook />
            <CalculatorFab />
            <AssistantDock />
          </FloatingActionMenu>
        )}
      </div>
      </AssistantProvider>
      </CalculatorProvider>
      </CommandPaletteProvider>
    </ToastProvider>
    </ErrorProvider>
  );
}

export default function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  return <SessionProvider><Inner>{children}</Inner></SessionProvider>;
}
