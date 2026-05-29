// Slices 176-177 of customizable-hub-and-work-mode-2026-05-28.md.
// Office Admin / Dispatcher Work Mode shell.

import React from 'react';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import RoleWorkspaceShell from '../_components/RoleWorkspaceShell';

const TABS = [
  { id: 'dispatch',       label: 'Dispatch',       icon: '📡', description: 'Crew calendar + open jobs + crew comms (Dispatcher view).' },
  { id: 'jobs',           label: 'Jobs',           icon: '📁', description: 'All-jobs queue with bulk actions.' },
  { id: 'approvals',      label: 'Approvals',      icon: '✅', description: 'Receipts + time-off + hours.' },
  { id: 'announcements',  label: 'Announcements',  icon: '📢', description: 'Post org-wide announcements.' },
  { id: 'reports',        label: 'Reports',        icon: '📊', description: 'KPI dashboards + custom reports.' },
];

export default async function AdminWorkModePage() {
  const session = await auth();
  if (!session?.user?.email) redirect('/login');
  const roles = session.user.roles ?? [];
  if (!roles.some((r) => ['admin', 'developer'].includes(r))) {
    redirect('/admin/me');
  }
  return <RoleWorkspaceShell title="Office Admin" tabs={TABS} />;
}
