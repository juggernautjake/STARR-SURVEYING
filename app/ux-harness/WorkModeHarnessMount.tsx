'use client';
// app/ux-harness/WorkModeHarnessMount.tsx
//
// Harness-only mount of the Work Mode shell (top bar + a role workspace)
// so its 390px layout can be screenshotted. The real /admin/work-mode
// layout is a server component behind auth + an eligibility gate.

import WorkModeTopBar from '@/app/admin/work-mode/_components/WorkModeTopBar';
import RoleWorkspaceShell from '@/app/admin/work-mode/_components/RoleWorkspaceShell';

const TABS = [
  { id: 'today', label: 'Today', icon: '📋', description: 'Your assignments and schedule for today.' },
  { id: 'jobs', label: 'Jobs', icon: '🗺️', description: 'Active jobs you are working on right now.' },
  { id: 'equipment', label: 'Equipment', icon: '🛠️', description: 'Gear currently checked out to you.' },
  { id: 'time', label: 'Time', icon: '⏱️', description: 'Clock in / out and review your hours.' },
];

export default function WorkModeHarnessMount() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--theme-bg-page)' }}>
      <WorkModeTopBar userName="jacobmaddux@starr-surveying.com" />
      <main style={{ flex: 1, padding: 16 }}>
        <RoleWorkspaceShell title="Field Crew Work Mode" tabs={TABS} />
      </main>
    </div>
  );
}
