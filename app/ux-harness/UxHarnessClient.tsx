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
  dashboard: nextDynamic(() => import('@/app/admin/dashboard/page'), { ssr: false }),
  jobs: nextDynamic(() => import('@/app/admin/jobs/page'), { ssr: false }),
  leads: nextDynamic(() => import('@/app/admin/leads/page'), { ssr: false }),
  notes: nextDynamic(() => import('@/app/admin/notes/page'), { ssr: false }),
  receipts: nextDynamic(() => import('@/app/admin/receipts/page'), { ssr: false }),
  payroll: nextDynamic(() => import('@/app/admin/payroll/page'), { ssr: false }),
  'pay-progression': nextDynamic(() => import('@/app/admin/pay-progression/page'), { ssr: false }),
  settings: nextDynamic(() => import('@/app/admin/settings/page'), { ssr: false }),
  install: nextDynamic(() => import('@/app/admin/install/page'), { ssr: false }),
  mileage: nextDynamic(() => import('@/app/admin/mileage/page'), { ssr: false }),
  assignments: nextDynamic(() => import('@/app/admin/assignments/page'), { ssr: false }),
  reports: nextDynamic(() => import('@/app/admin/reports/page'), { ssr: false }),
  equipment: nextDynamic(() => import('@/app/admin/equipment/page'), { ssr: false }),
  invites: nextDynamic(() => import('@/app/admin/invites/page'), { ssr: false }),
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
  users: nextDynamic(() => import('@/app/admin/users/page'), { ssr: false }),
  employees: nextDynamic(() => import('@/app/admin/employees/page'), { ssr: false }),
  discussions: nextDynamic(() => import('@/app/admin/discussions/page'), { ssr: false }),
  'hours-approval': nextDynamic(() => import('@/app/admin/hours-approval/page'), { ssr: false }),
  'time-off': nextDynamic(() => import('@/app/admin/time-off/page'), { ssr: false }),
  announcements: nextDynamic(() => import('@/app/admin/announcements/page'), { ssr: false }),
  audit: nextDynamic(() => import('@/app/admin/audit/page'), { ssr: false }),
  'error-log': nextDynamic(() => import('@/app/admin/error-log/page'), { ssr: false }),
  office: nextDynamic(() => import('@/app/admin/office/page'), { ssr: false }),
  'org-settings': nextDynamic(() => import('@/app/admin/org-settings/page'), { ssr: false }),
  profile: nextDynamic(() => import('@/app/admin/profile/ProfilePanel'), { ssr: false }),
  timeline: nextDynamic(() => import('@/app/admin/timeline/page'), { ssr: false }),
  vehicles: nextDynamic(() => import('@/app/admin/vehicles/page'), { ssr: false }),
  rewards: nextDynamic(() => import('@/app/admin/rewards/page'), { ssr: false }),
  billing: nextDynamic(() => import('@/app/admin/billing/page'), { ssr: false }),
  research: nextDynamic(() => import('@/app/admin/research/page'), { ssr: false }),
  finances: nextDynamic(() => import('@/app/admin/finances/page'), { ssr: false }),
  // Newly registered in route-registry Slice 56 — kept for harness parity.
  orgs: nextDynamic(() => import('@/app/admin/orgs/page'), { ssr: false }),
  payouts: nextDynamic(() => import('@/app/admin/payouts/page'), { ssr: false }),
  support: nextDynamic(() => import('@/app/admin/support/page'), { ssr: false }),
  learn: nextDynamic(() => import('@/app/admin/learn/page'), { ssr: false }),
  messages: nextDynamic(() => import('@/app/admin/messages/page'), { ssr: false }),
  email: nextDynamic(() => import('@/app/admin/email/new/page'), { ssr: false }),
  'email-sent': nextDynamic(() => import('@/app/admin/email/sent/page'), { ssr: false }),
  notifications: nextDynamic(() => import('@/app/admin/notifications/page'), { ssr: false }),
  'payout-log': nextDynamic(() => import('@/app/admin/payout-log/page'), { ssr: false }),
  // The Hub (/admin/me) is a server component behind auth; mount the real
  // canvas via a harness wrapper that seeds a default multi-widget layout
  // so the mobile customization flow can be exercised + screenshotted.
  hub: nextDynamic(() => import('@/app/ux-harness/HubHarnessMount'), { ssr: false }),
  // Work Mode shell (top bar + a role workspace) — the real route is a
  // server component behind auth; mount the client pieces for 390px audit.
  'work-mode': nextDynamic(() => import('@/app/ux-harness/WorkModeHarnessMount'), { ssr: false }),
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
