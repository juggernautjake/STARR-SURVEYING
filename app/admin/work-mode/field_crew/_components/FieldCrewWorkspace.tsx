'use client';
// app/admin/work-mode/field_crew/_components/FieldCrewWorkspace.tsx
//
// Tab-based Field Crew workspace. Tabs come from the Phase 22 slices.
//
// Slices 159-165 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useEffect, useMemo, useState } from 'react';
import { useWorkModeStore } from '@/lib/work-mode/work-mode-store';
import { jobMapsUrl, hasJobLocation, formatJobAddress, telHref } from '@/lib/jobs/location';

type FieldTab = 'job' | 'photo' | 'points' | 'mileage' | 'receipts' | 'crew' | 'equipment' | 'time' | 'files' | 'issue';

/** The job fields the field hub reads (a subset of the jobs row + its team). */
interface FieldJob {
  id: string;
  name?: string | null;
  job_number?: string | null;
  stage?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  county?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  lead_rpls_email?: string | null;
  job_team?: { user_email?: string | null; user_name?: string | null; role?: string | null }[] | null;
}

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
  const [jobs, setJobs] = useState<FieldJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);

  // Load selectable jobs so the picker has real options and the Job tab can show the active job's
  // customer/property/crew. Active (non-archived) jobs, newest first.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/jobs?limit=200')
      .then((r) => (r.ok ? r.json() : { jobs: [] }))
      .then((j) => { if (!cancelled) setJobs((j.jobs ?? []) as FieldJob[]); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingJobs(false); });
    return () => { cancelled = true; };
  }, []);

  const activeJob = useMemo(() => jobs.find((j) => j.id === jobId) ?? null, [jobs, jobId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--hub-spc-3, 12px)', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Field Crew</h1>
        <JobPicker value={jobId} onChange={setJobId} jobs={jobs} loading={loadingJobs} />
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
        {activeTab === 'job'
          ? <JobSummary job={activeJob} loading={loadingJobs} />
          : <TabContent tab={activeTab} jobId={jobId} />}
      </section>
    </div>
  );
}

function JobPicker({ value, onChange, jobs, loading }: { value: string | null; onChange: (id: string | null) => void; jobs: FieldJob[]; loading: boolean }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--hub-font-sm, 0.875rem)' }}>
      <span style={{ color: 'var(--theme-fg-secondary)' }}>Active job:</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={loading}
        style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--theme-border)', background: 'var(--theme-bg-elevated)', color: 'var(--theme-fg-primary)', fontSize: '0.85rem', minWidth: 200 }}
      >
        <option value="">{loading ? 'Loading jobs…' : 'Select a job…'}</option>
        {jobs.map((j) => (
          <option key={j.id} value={j.id}>{[j.job_number, j.name].filter(Boolean).join(' · ') || j.id}</option>
        ))}
      </select>
    </label>
  );
}

/** The Job tab (B2): the active job's customer, property (tap-to-navigate), lead RPLS, and crew. */
function JobSummary({ job, loading }: { job: FieldJob | null; loading: boolean }) {
  const card: React.CSSProperties = { padding: 'var(--hub-spc-4, 16px)', borderRadius: 8, background: 'var(--theme-bg-surface)', border: '1px solid var(--theme-border)' };
  if (!job) {
    return (
      <div style={card}>
        <p style={{ margin: 0, color: 'var(--theme-fg-secondary)', fontSize: '0.9rem' }}>
          {loading ? 'Loading jobs…' : 'Select an active job above to load its customer, property, crew, and files.'}
        </p>
      </div>
    );
  }
  const crew = (job.job_team ?? []).filter((m) => (m.role ?? '') !== 'lead_rpls');
  const rpls = (job.job_team ?? []).find((m) => (m.role ?? '') === 'lead_rpls')?.user_name || job.lead_rpls_email || null;
  const addr = formatJobAddress(job);
  const tel = telHref(job.client_phone);
  const label = { fontSize: '0.75rem', textTransform: 'uppercase' as const, letterSpacing: '0.04em', color: 'var(--theme-fg-secondary)' };

  return (
    <div style={{ ...card, display: 'grid', gap: 14 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{[job.job_number, job.name].filter(Boolean).join(' · ')}</h2>
        {job.stage && <span style={{ fontSize: '0.8rem', color: 'var(--theme-fg-secondary)' }}>Stage: {job.stage}</span>}
      </div>

      <div style={{ display: 'grid', gap: 4 }}>
        <div style={label}>Customer</div>
        <div style={{ fontSize: '0.95rem' }}>{job.client_name || '—'}</div>
        {tel && <a href={tel} className="btn tiny" style={{ justifySelf: 'start', textDecoration: 'none' }}>📞 Call {job.client_phone}</a>}
      </div>

      <div style={{ display: 'grid', gap: 4 }}>
        <div style={label}>Property</div>
        <div style={{ fontSize: '0.95rem' }}>{addr || '—'}{job.county ? ` (${job.county} County)` : ''}</div>
        {hasJobLocation(job) && (
          <a href={jobMapsUrl(job)} target="_blank" rel="noopener noreferrer" className="btn tiny" style={{ justifySelf: 'start', textDecoration: 'none' }}>🧭 Navigate</a>
        )}
      </div>

      <div style={{ display: 'grid', gap: 4 }}>
        <div style={label}>Lead RPLS</div>
        <div style={{ fontSize: '0.95rem' }}>{rpls || '—'}</div>
      </div>

      <div style={{ display: 'grid', gap: 4 }}>
        <div style={label}>Crew ({crew.length})</div>
        <div style={{ fontSize: '0.95rem' }}>{crew.length ? crew.map((m) => m.user_name || m.user_email).filter(Boolean).join(', ') : 'Just you'}</div>
      </div>
    </div>
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
