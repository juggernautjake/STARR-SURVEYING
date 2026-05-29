'use client';
// app/admin/work-mode/_components/RoleWorkspaceShell.tsx
//
// Reusable tab-based shell for role-specific Work Mode pages that
// haven't been built out to their full integration depth yet. Each
// role has its own page that just declares its tab catalog + a
// renderer.
//
// Used by Slices 170 (researcher), 173 (equipment_manager), 174-175
// (bookkeeper), 176 (dispatcher), 177 (office admin).

import React, { useState } from 'react';

export interface WorkModeTab {
  id: string;
  label: string;
  icon: string;
  description: string;
}

interface RoleWorkspaceShellProps {
  title: string;
  tabs: WorkModeTab[];
}

export default function RoleWorkspaceShell({ title, tabs }: RoleWorkspaceShellProps) {
  const [activeTab, setActiveTab] = useState<string>(tabs[0]?.id ?? '');
  const active = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>{title}</h1>
      <nav role="tablist" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, borderBottom: '1px solid var(--theme-border)' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '6px 12px', border: 'none',
              borderBottom: activeTab === t.id ? '2px solid var(--theme-accent)' : '2px solid transparent',
              background: 'transparent',
              color: activeTab === t.id ? 'var(--theme-fg-primary)' : 'var(--theme-fg-secondary)',
              fontWeight: activeTab === t.id ? 600 : 500,
              fontSize: 'var(--hub-font-sm, 0.875rem)',
              cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            <span aria-hidden>{t.icon}</span> {t.label}
          </button>
        ))}
      </nav>
      <section role="tabpanel" style={{ padding: 'var(--hub-spc-4, 16px)', borderRadius: 8, background: 'var(--theme-bg-surface)', border: '1px solid var(--theme-border)' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{active?.label}</h2>
        <p style={{ margin: '8px 0 0', color: 'var(--theme-fg-secondary)', fontSize: '0.9rem' }}>{active?.description}</p>
      </section>
    </div>
  );
}
