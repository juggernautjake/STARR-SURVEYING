// Slices 170-172 of customizable-hub-and-work-mode-2026-05-28.md.

import React from 'react';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import RoleWorkspaceShell from '../_components/RoleWorkspaceShell';

const TABS = [
  { id: 'documents',   label: 'Documents',   icon: '📚', description: 'Property research documents pulled from county records.' },
  { id: 'pipeline',    label: 'Pipeline',    icon: '🔁', description: 'Pipeline run queue + diagnostics for active jobs.' },
  { id: 'discoveries', label: 'Discoveries', icon: '🔍', description: 'Adjacent deeds, abstracts, and other discoveries.' },
  { id: 'ai',          label: 'AI assistant', icon: '🤖', description: 'AI-assisted document summarisation + drafting (Slice 172).' },
];

export default async function ResearcherWorkModePage() {
  const session = await auth();
  if (!session?.user?.email) redirect('/login');
  const roles = session.user.roles ?? [];
  if (!roles.some((r) => ['admin', 'developer', 'researcher', 'tech_support'].includes(r))) {
    redirect('/admin/me');
  }
  return <RoleWorkspaceShell title="Researcher" tabs={TABS} />;
}
