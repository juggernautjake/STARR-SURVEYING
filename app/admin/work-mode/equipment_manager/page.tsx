// Slice 173 of customizable-hub-and-work-mode-2026-05-28.md.

import React from 'react';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import RoleWorkspaceShell from '../_components/RoleWorkspaceShell';

const TABS = [
  { id: 'checkout',    label: 'Checkout',    icon: '📤', description: 'Check equipment out to a crew + record return dates.' },
  { id: 'maintenance', label: 'Maintenance', icon: '🛠', description: 'Maintenance schedule + history.' },
  { id: 'vehicles',    label: 'Vehicles',    icon: '🚚', description: 'Fleet status + driver assignments.' },
  { id: 'consumables', label: 'Consumables', icon: '📦', description: 'Stock + reorder list.' },
];

export default async function EquipmentManagerWorkModePage() {
  const session = await auth();
  if (!session?.user?.email) redirect('/login');
  const roles = session.user.roles ?? [];
  if (!roles.some((r) => ['admin', 'developer', 'equipment_manager', 'tech_support'].includes(r))) {
    redirect('/admin/me');
  }
  return <RoleWorkspaceShell title="Equipment Manager" tabs={TABS} />;
}
