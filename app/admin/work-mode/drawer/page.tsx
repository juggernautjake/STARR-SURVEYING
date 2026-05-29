// app/admin/work-mode/drawer/page.tsx
//
// Drafter Work Mode shell. Sidebar (job tree) + main CAD pane + right
// rail (comms + checklist).
//
// Slices 166-169 of customizable-hub-and-work-mode-2026-05-28.md.

import React from 'react';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import DrawerWorkspace from './_components/DrawerWorkspace';

export default async function DrawerWorkModePage() {
  const session = await auth();
  if (!session?.user?.email) redirect('/login');
  const roles = session.user.roles ?? [];
  if (!roles.some((r) => ['admin', 'developer', 'drawer', 'tech_support'].includes(r))) {
    redirect('/admin/me');
  }
  return <DrawerWorkspace />;
}
