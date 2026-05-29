// app/admin/work-mode/field_crew/page.tsx
//
// Field Crew Work Mode shell — tab-based layout.
//
// Slices 159-165 of customizable-hub-and-work-mode-2026-05-28.md.

import React from 'react';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import FieldCrewWorkspace from './_components/FieldCrewWorkspace';

export default async function FieldCrewWorkModePage() {
  const session = await auth();
  if (!session?.user?.email) redirect('/login');

  const roles = session.user.roles ?? [];
  const allowed = roles.some((r) => ['admin', 'developer', 'field_crew', 'tech_support'].includes(r));
  if (!allowed) redirect('/admin/me');

  return <FieldCrewWorkspace userEmail={session.user.email} />;
}
