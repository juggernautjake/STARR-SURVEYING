// app/admin/work-mode/start/page.tsx
//
// Work Mode role picker. The Slice 88 "Enter Work Mode" button on
// the hub routes here. Single-role users get the fast-path; multi-
// role users see a tile picker.
//
// Slice 157 of customizable-hub-and-work-mode-2026-05-28.md.

import React from 'react';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { eligibleWorkModeRoles } from '@/lib/hub/work-mode-eligibility';
import RolePicker from '../_components/RolePicker';

export default async function WorkModeStartPage() {
  const session = await auth();
  if (!session?.user?.email) redirect('/login');

  const eligible = eligibleWorkModeRoles(session.user.roles ?? []);
  if (eligible.length === 0) redirect('/admin/me');

  // Single-role fast-path: skip the picker, route directly to the
  // role-specific shell.
  if (eligible.length === 1) {
    redirect(`/admin/work-mode/${eligible[0]}`);
  }

  return <RolePicker roles={eligible} />;
}
