// app/admin/work-mode/layout.tsx
//
// Work Mode shell. Lives outside `AdminLayoutClient` so the regular
// admin sidebar / IconRail isn't visible — Work Mode has its own
// minimal chrome (just an Exit pill + clock timer).
//
// Slice 156 of customizable-hub-and-work-mode-2026-05-28.md.

import React from 'react';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { isWorkModeEligible } from '@/lib/hub/work-mode-eligibility';
import WorkModeTopBar from './_components/WorkModeTopBar';

export default async function WorkModeLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.email) redirect('/login');

  // Eligibility gate — students / teachers can't enter work mode.
  if (!isWorkModeEligible(session.user.roles)) {
    redirect('/admin/me');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--theme-bg-page)' }}>
      <WorkModeTopBar userName={session.user.name ?? session.user.email} />
      <main style={{ flex: 1, padding: 'var(--hub-spc-4, 16px)' }}>
        {children}
      </main>
    </div>
  );
}
