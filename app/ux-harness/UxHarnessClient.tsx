'use client';
// app/ux-harness/UxHarnessClient.tsx — see app/ux-harness/page.tsx.
//
// Renders a registered admin page component inside a seeded mock admin
// session so its useSession() / role gates pass. Optionally wraps it in the
// real AdminLayoutClient chrome (?chrome=1) to audit the sidebar/topbar/menus.

import { SessionProvider } from 'next-auth/react';
import nextDynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import type { Session } from 'next-auth';

// Load the admin stylesheets so pages render with their real styling
// regardless of whether the AdminLayoutClient chrome is mounted.
import '@/app/admin/styles/AdminLayout.css';
import '@/app/admin/styles/AdminResponsive.css';
import '@/app/admin/styles/AdminJobs.css';
import '@/app/admin/styles/AdminPayroll.css';
import '@/app/admin/styles/AdminMyNotes.css';
import '@/app/admin/styles/AdminAssignments.css';
import '@/app/admin/styles/AdminSchedule.css';
import '@/app/admin/styles/AdminTimeLogs.css';
import '@/app/admin/styles/AdminUsers.css';
import '@/app/admin/styles/AdminLearn.css';
import '@/app/admin/styles/AdminResearch.css';
import '@/app/admin/styles/AdminMessaging.css';
import '@/app/admin/styles/AdminRewards.css';
import '@/app/admin/styles/AdminErrors.css';
import '@/app/admin/styles/AdminFieldWork.css';
import '@/app/admin/styles/AdminDiscussions.css';
import '@/app/admin/styles/AdminEmployeeManage.css';
import '@/app/admin/styles/AdminArticle.css';
import '@/app/admin/styles/AdminAudit.css';

// A fully-privileged session so every role gate renders.
const MOCK_SESSION = {
  user: {
    name: 'Test Admin',
    email: 'jacobmaddux@starr-surveying.com',
    image: null,
    role: 'admin',
    roles: ['admin', 'developer', 'field_crew', 'researcher', 'tech_support'],
  },
  expires: '2999-12-31T23:59:59.999Z',
} as unknown as Session;

// Param-free top-level admin pages worth auditing. (Pages needing route
// params like [id] are excluded.)
const PAGES: Record<string, ComponentType> = {
  // Research panels (2026-08-03). Registered so this session's UI can be driven at all — the pages
  // they live on need a project with data, the panels themselves need only props.
  'research-rotation': nextDynamic(
    () => import('./ResearchPanelHarnessMount').then((m) => m.RotationPanelHarness), { ssr: false }),
  'research-vendor-accounts': nextDynamic(
    () => import('./ResearchPanelHarnessMount').then((m) => m.VendorAccountsPanelHarness), { ssr: false }),
  // C7: `/admin/jobs` is a portal shell now. Pointed at the LIST, which is what this entry has
  // always been a picture of — shooting the shell would replace a screenshot of the jobs table with
  // one of a tab strip.
  jobs: nextDynamic(() => import('@/app/admin/jobs/_tabs/JobsTab'), { ssr: false }),
  leads: nextDynamic(() => import('@/app/admin/marketing/_tabs/LeadsTab'), { ssr: false }),
  notes: nextDynamic(() => import('@/app/admin/notes/page'), { ssr: false }),
  // C5: the harness shoots page BODIES, and `/admin/receipts` is a portal shell now. Pointed at the
  // QUEUE, which is what this entry has always been a picture of — shooting the shell would replace a
  // screenshot of the approval queue with one of a tab strip.
  receipts: nextDynamic(() => import('@/app/admin/receipts/_tabs/QueueTab'), { ssr: false }),
  // C6: all four are TABS of the Pay portal now and their routes are redirects. The harness shoots
  // page BODIES, so it points at the components — importing a redirect renders nothing and the shot
  // would be of a blank page that looked like a styling bug. Same fix as C3, C4 and C5.
  payroll: nextDynamic(() => import('@/app/admin/pay/_tabs/PayrollTab'), { ssr: false }),
  'pay-progression': nextDynamic(() => import('@/app/admin/pay-progression/page'), { ssr: false }),
  settings: nextDynamic(() => import('@/app/admin/settings/page'), { ssr: false }),
  install: nextDynamic(() => import('@/app/admin/install/page'), { ssr: false }),
  mileage: nextDynamic(() => import('@/app/admin/receipts/_tabs/MileageTab'), { ssr: false }),
  assignments: nextDynamic(() => import('@/app/admin/assignments/page'), { ssr: false }),
  reports: nextDynamic(() => import('@/app/admin/reports/page'), { ssr: false }),
  equipment: nextDynamic(() => import('@/app/admin/equipment/page'), { ssr: false }),
  // C9: five of these are TABS now and their routes are redirects. The harness shoots page BODIES,
  // so each points at the component — importing a redirect renders nothing and the shot would be a
  // blank page that looked like a styling bug.
  invites: nextDynamic(() => import('@/app/admin/people/_tabs/InvitesTab'), { ssr: false }),
  // Batch 2
  // The /admin/my-* and /admin/schedule pages are server redirects to the
  // Hub at /admin/me?tab=…; mount the actual Panel components instead so the
  // harness renders their real content.
  'my-pay': nextDynamic(() => import('@/app/admin/my-pay/MyPayPanel'), { ssr: false }),
  'my-hours': nextDynamic(() => import('@/app/admin/my-hours/MyHoursPanel'), { ssr: false }),
  'my-jobs': nextDynamic(() => import('@/app/admin/my-jobs/MyJobsPanel'), { ssr: false }),
  'my-notes': nextDynamic(() => import('@/app/admin/my-notes/MyNotesPanel'), { ssr: false }),
  'my-files': nextDynamic(() => import('@/app/admin/my-files/MyFilesPanel'), { ssr: false }),
  schedule: nextDynamic(() => import('@/app/admin/schedule/SchedulePanel'), { ssr: false }),
  team: nextDynamic(() => import('@/app/admin/team/page'), { ssr: false }),
  work: nextDynamic(() => import('@/app/admin/work/page'), { ssr: false }),
  users: nextDynamic(() => import('@/app/admin/people/_tabs/AccountsTab'), { ssr: false }),
  employees: nextDynamic(() => import('@/app/admin/people/_tabs/EmployeesTab'), { ssr: false }),
  discussions: nextDynamic(() => import('@/app/admin/discussions/page'), { ssr: false }),
  // C4: both are TABS of the Hours portal now, and their routes are redirects. The harness shoots
  // page BODIES, so it points at the components — importing a redirect renders nothing and the shot
  // would be of an empty page that looked like a styling bug. Same fix as `vehicles` in C3.
  'hours-approval': nextDynamic(() => import('@/app/admin/hours/_tabs/ApprovalsTab'), { ssr: false }),
  'time-off': nextDynamic(() => import('@/app/admin/hours/_tabs/TimeOffTab'), { ssr: false }),
  announcements: nextDynamic(() => import('@/app/admin/announcements/page'), { ssr: false }),
  audit: nextDynamic(() => import('@/app/admin/audit/page'), { ssr: false }),
  'error-log': nextDynamic(() => import('@/app/admin/error-log/page'), { ssr: false }),
  office: nextDynamic(() => import('@/app/admin/office/page'), { ssr: false }),
  'org-settings': nextDynamic(() => import('@/app/admin/org-settings/page'), { ssr: false }),
  profile: nextDynamic(() => import('@/app/admin/profile/ProfilePanel'), { ssr: false }),
  timeline: nextDynamic(() => import('@/app/admin/jobs/_tabs/ActivityTab'), { ssr: false }),
  // C3: /admin/vehicles is a redirect now — it became the Equipment portal's `vehicles` tab.
  // The harness screenshots page BODIES, so it points at the component rather than at the route that
  // forwards to it; importing the redirect would render nothing and the shot would be of an empty
  // page that looked like a styling bug.
  vehicles: nextDynamic(() => import('@/app/admin/equipment/_tabs/VehiclesTab'), { ssr: false }),
  rewards: nextDynamic(() => import('@/app/admin/pay/_tabs/RewardsTab'), { ssr: false }),
  billing: nextDynamic(() => import('@/app/admin/billing/page'), { ssr: false }),
  research: nextDynamic(() => import('@/app/admin/research/page'), { ssr: false }),
  // C8: `/admin/finances` is a portal shell now. Pointed at the job-profitability body, which is
  // what this entry has always been a picture of.
  finances: nextDynamic(() => import('@/app/admin/finances/_tabs/ScheduleCTab'), { ssr: false }),
  // Newly registered in route-registry Slice 56 — kept for harness parity.
  orgs: nextDynamic(() => import('@/app/admin/orgs/page'), { ssr: false }),
  payouts: nextDynamic(() => import('@/app/admin/pay/_tabs/LedgerTab'), { ssr: false }),
  support: nextDynamic(() => import('@/app/admin/support/page'), { ssr: false }),
  learn: nextDynamic(() => import('@/app/admin/learn/page'), { ssr: false }),
  'learn-modules': nextDynamic(() => import('@/app/admin/learn/modules/page'), { ssr: false }),
  messages: nextDynamic(() => import('@/app/admin/messages/_tabs/InboxTab'), { ssr: false }),
  email: nextDynamic(() => import('@/app/admin/email/new/page'), { ssr: false }),
  'email-sent': nextDynamic(() => import('@/app/admin/messages/_tabs/EmailTab'), { ssr: false }),
  notifications: nextDynamic(() => import('@/app/admin/notifications/page'), { ssr: false }),
  'payout-log': nextDynamic(() => import('@/app/admin/pay/_tabs/HistoryTab'), { ssr: false }),
  // The Hub (/admin/me) is a server component behind auth; mount the real
  // canvas via a harness wrapper that seeds a default multi-widget layout
  // so the mobile customization flow can be exercised + screenshotted.
  hub: nextDynamic(() => import('@/app/ux-harness/HubHarnessMount'), { ssr: false }),
  // Work Mode shell (top bar + a role workspace) — the real route is a
  // server component behind auth; mount the client pieces for 390px audit.
};

const AdminLayoutClient = nextDynamic(
  () => import('@/app/admin/components/AdminLayoutClient'),
  { ssr: false },
);

export default function UxHarnessClient({ page, chrome }: { page: string; chrome: boolean }) {
  const Comp = PAGES[page] ?? PAGES.settings;
  const body = (
    <SessionProvider session={MOCK_SESSION} refetchOnWindowFocus={false} refetchInterval={0}>
      <div data-ux-harness={page} style={{ minHeight: '100vh' }}>
        {chrome ? <AdminLayoutClient><Comp /></AdminLayoutClient> : <Comp />}
      </div>
    </SessionProvider>
  );
  return body;
}
