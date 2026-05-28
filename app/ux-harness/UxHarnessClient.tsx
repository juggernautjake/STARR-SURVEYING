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
  settings: nextDynamic(() => import('@/app/admin/settings/page'), { ssr: false }),
  mileage: nextDynamic(() => import('@/app/admin/mileage/page'), { ssr: false }),
  assignments: nextDynamic(() => import('@/app/admin/assignments/page'), { ssr: false }),
  reports: nextDynamic(() => import('@/app/admin/reports/page'), { ssr: false }),
  equipment: nextDynamic(() => import('@/app/admin/equipment/page'), { ssr: false }),
  invites: nextDynamic(() => import('@/app/admin/invites/page'), { ssr: false }),
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
