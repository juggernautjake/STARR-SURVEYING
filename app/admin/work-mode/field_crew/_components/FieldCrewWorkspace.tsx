'use client';
// app/admin/work-mode/field_crew/_components/FieldCrewWorkspace.tsx
//
// Tab-based Field Crew workspace. Tabs come from the Phase 22 slices.
//
// Slices 159-165 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useState } from 'react';
import { useWorkModeStore } from '@/lib/work-mode/work-mode-store';

type FieldTab = 'job' | 'photo' | 'points' | 'mileage' | 'receipts' | 'crew' | 'equipment' | 'time' | 'files' | 'issue';

const TABS: Array<{ id: FieldTab; label: string; icon: string }> = [
  { id: 'job',       label: 'Job',       icon: '🧭' },
  { id: 'photo',     label: 'Photo',     icon: '📷' },
  { id: 'points',    label: 'Points',    icon: '📍' },
  { id: 'mileage',   label: 'Mileage',   icon: '🚗' },
  { id: 'receipts',  label: 'Receipts',  icon: '🧾' },
  { id: 'crew',      label: 'Crew',      icon: '👥' },
  { id: 'equipment', label: 'Equipment', icon: '🔧' },
  { id: 'time',      label: 'Time',      icon: '⏱' },
  { id: 'files',     label: 'Files',     icon: '📁' },
  { id: 'issue',     label: 'Issue',     icon: '🚨' },
];

interface FieldCrewWorkspaceProps {
  userEmail: string;
}

export default function FieldCrewWorkspace({ userEmail: _ }: FieldCrewWorkspaceProps) {
  const jobId = useWorkModeStore((s) => s.jobId);
  const setJobId = useWorkModeStore((s) => s.setJobId);
  const [activeTab, setActiveTab] = useState<FieldTab>('job');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--hub-spc-3, 12px)' }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Field Crew</h1>
        <JobPicker value={jobId} onChange={setJobId} />
      </div>

      <nav role="tablist" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, borderBottom: '1px solid var(--theme-border)' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '6px 12px',
              border: 'none',
              borderBottom: activeTab === t.id ? '2px solid var(--theme-accent)' : '2px solid transparent',
              background: 'transparent',
              color: activeTab === t.id ? 'var(--theme-fg-primary)' : 'var(--theme-fg-secondary)',
              fontWeight: activeTab === t.id ? 600 : 500,
              fontSize: 'var(--hub-font-sm, 0.875rem)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span aria-hidden>{t.icon}</span> {t.label}
          </button>
        ))}
      </nav>

      <section role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
        <TabContent tab={activeTab} jobId={jobId} />
      </section>
    </div>
  );
}

function JobPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  // Placeholder picker — the real combobox lives in Slice 159 follow-up.
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--hub-font-sm, 0.875rem)' }}>
      <span style={{ color: 'var(--theme-fg-secondary)' }}>Active job:</span>
      <input
        type="text"
        placeholder="Pick a job…"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--theme-border)', background: 'var(--theme-bg-elevated)', color: 'var(--theme-fg-primary)', fontSize: '0.85rem' }}
      />
    </label>
  );
}

function TabContent({ tab, jobId }: { tab: FieldTab; jobId: string | null }) {
  const meta = TAB_DESCRIPTIONS[tab];
  return (
    <div style={{ padding: 'var(--hub-spc-4, 16px)', borderRadius: 8, background: 'var(--theme-bg-surface)', border: '1px solid var(--theme-border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{meta.title}</h2>
      <p style={{ margin: 0, color: 'var(--theme-fg-secondary)', fontSize: '0.9rem' }}>{meta.description}</p>
      {!jobId && (
        <p style={{ margin: 0, color: 'var(--theme-warning)', fontSize: '0.85rem' }}>
          Pick an active job above to enable capture flows.
        </p>
      )}
    </div>
  );
}

const TAB_DESCRIPTIONS: Record<FieldTab, { title: string; description: string }> = {
  job:       { title: 'Job summary',       description: "Job header, tasks, and notes for the active job." },
  photo:     { title: 'Photo + Video',     description: 'Camera capture wired to the job. OCR + caption + auto-upload.' },
  points:    { title: 'Point recording',   description: 'GPS point capture with description. PNEZD export.' },
  mileage:   { title: 'Mileage tracking',  description: 'GPS start/stop or manual entry. Auto-distance.' },
  receipts:  { title: 'Receipt capture',   description: 'Camera + OCR pipeline + auto-submit.' },
  crew:      { title: 'Crew chat',         description: 'Job DM thread with the rest of the crew.' },
  equipment: { title: 'Equipment',         description: 'Checkout state for the active job + return.' },
  time:      { title: 'Time tracking',     description: 'Today\'s timesheet — clock in/out + edits.' },
  files:     { title: 'Files',             description: 'Cached files attached to the job.' },
  issue:     { title: 'Escalate issue',    description: 'Red-button escalation to dispatcher / RPLS.' },
};
