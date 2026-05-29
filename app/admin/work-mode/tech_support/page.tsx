// Slice 174-175 of customizable-hub-and-work-mode-2026-05-28.md.
// Bookkeeper Work Mode (re-using tech_support route as a placeholder
// since there's no dedicated bookkeeper role yet).

import React from 'react';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import RoleWorkspaceShell from '../_components/RoleWorkspaceShell';

const TABS = [
  { id: 'receipts',         label: 'Receipts',         icon: '🧾', description: 'Pending receipts queue.' },
  { id: 'time-off',         label: 'Time-Off',         icon: '🏖', description: 'PTO approval queue.' },
  { id: 'hours',            label: 'Hours',            icon: '⏱', description: 'Timesheet approval queue.' },
  { id: 'payroll',          label: 'Payroll',          icon: '💰', description: 'Payroll runs + payouts.' },
  { id: 'invoices',         label: 'Invoices',         icon: '📋', description: 'Outstanding + sent invoices.' },
  { id: 'reimbursements',   label: 'Reimbursements',   icon: '💳', description: 'Expense reimbursements.' },
];

export default async function BookkeeperWorkModePage() {
  const session = await auth();
  if (!session?.user?.email) redirect('/login');
  const roles = session.user.roles ?? [];
  if (!roles.some((r) => ['admin', 'developer', 'tech_support'].includes(r))) {
    redirect('/admin/me');
  }
  return <RoleWorkspaceShell title="Bookkeeper" tabs={TABS} />;
}
