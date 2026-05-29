'use client';
// app/admin/work-mode/_components/RolePicker.tsx
//
// Multi-role tile picker. Lets a user with multiple work-mode
// eligible roles pick which one to enter.
//
// Slice 157 of customizable-hub-and-work-mode-2026-05-28.md.

import React from 'react';
import { useRouter } from 'next/navigation';
import type { UserRole } from '@/lib/auth';
import { ROLE_LABELS } from '@/lib/auth';
import { useWorkModeStore } from '@/lib/work-mode/work-mode-store';

const ROLE_DESCRIPTIONS: Partial<Record<UserRole, string>> = {
  field_crew: 'Capture jobs, photos, time, and field data.',
  drawer: 'Edit drawings, log time on CAD work.',
  researcher: 'Run research pipelines + log adjacent deeds.',
  equipment_manager: 'Check equipment in/out + record maintenance.',
  admin: 'Manage org-wide work, with all role panels.',
  developer: 'Internal tooling + diagnostics.',
  tech_support: 'Investigate tickets + reset user state.',
};

const ROLE_ICONS: Partial<Record<UserRole, string>> = {
  field_crew: '🏗️',
  drawer: '✏️',
  researcher: '🔬',
  equipment_manager: '🚚',
  admin: '🛡️',
  developer: '💻',
  tech_support: '🛠️',
};

export default function RolePicker({ roles }: { roles: UserRole[] }) {
  const router = useRouter();
  const enterWorkMode = useWorkModeStore((s) => s.enterWorkMode);

  function pick(role: UserRole) {
    enterWorkMode(role);
    router.push(`/admin/work-mode/${role}`);
  }

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Pick a work mode</h1>
      <p style={subtitleStyle}>You hold multiple roles — choose which workflow you&apos;re focusing on.</p>
      <div style={gridStyle}>
        {roles.map((role) => (
          <button key={role} type="button" onClick={() => pick(role)} style={tileStyle}>
            <span aria-hidden style={{ fontSize: '2rem' }}>{ROLE_ICONS[role] ?? '🧰'}</span>
            <span style={tileTitleStyle}>{ROLE_LABELS[role] ?? role}</span>
            <span style={tileDescriptionStyle}>{ROLE_DESCRIPTIONS[role] ?? ''}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  maxWidth: 720, margin: '0 auto', padding: 'var(--hub-spc-5, 24px) var(--hub-spc-4, 16px)',
  display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)',
};

const titleStyle: React.CSSProperties = { margin: 0, fontSize: '1.5rem', fontWeight: 700 };
const subtitleStyle: React.CSSProperties = { margin: 0, color: 'var(--theme-fg-secondary)', fontSize: '0.95rem' };
const gridStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--hub-spc-3, 12px)',
};
const tileStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
  padding: 'var(--hub-spc-4, 16px)', borderRadius: 12,
  border: '1px solid var(--theme-border)', background: 'var(--theme-bg-elevated)',
  color: 'var(--theme-fg-primary)', cursor: 'pointer', textAlign: 'left',
};
const tileTitleStyle: React.CSSProperties = { fontSize: '1rem', fontWeight: 600 };
const tileDescriptionStyle: React.CSSProperties = { fontSize: '0.85rem', color: 'var(--theme-fg-secondary)' };
