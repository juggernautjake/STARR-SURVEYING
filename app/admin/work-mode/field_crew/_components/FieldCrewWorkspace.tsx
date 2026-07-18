'use client';
// app/admin/work-mode/field_crew/_components/FieldCrewWorkspace.tsx
//
// Tab-based Field Crew workspace. Tabs come from the Phase 22 slices.
//
// Slices 159-165 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useEffect, useMemo, useState } from 'react';
import { useWorkModeStore } from '@/lib/work-mode/work-mode-store';
import { jobMapsUrl, hasJobLocation, formatJobAddress, telHref } from '@/lib/jobs/location';
import { jobCrew, jobRpls, crewNames } from '@/lib/jobs/crew';
import { jobLabel, groupFilesBySection, mediaDisplay } from '@/lib/jobs/hub';
import { evalArithmetic, formatCalcResult } from '@/lib/jobs/calc';

type FieldTab = 'job' | 'calc' | 'notes' | 'photo' | 'points' | 'mileage' | 'receipts' | 'crew' | 'equipment' | 'time' | 'files' | 'issue';

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
  { id: 'calc',      label: 'Calc',      icon: '🧮' },
  { id: 'notes',     label: 'Notes',     icon: '📝' },
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
        {activeTab === 'job' ? <JobSummary job={activeJob} loading={loadingJobs} />
          : activeTab === 'calc' ? <FieldCalculator />
          : activeTab === 'notes' ? <FieldNotes jobId={jobId} />
          : activeTab === 'files' ? <JobFiles jobId={jobId} />
          : activeTab === 'photo' ? <JobMedia jobId={jobId} />
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
          <option key={j.id} value={j.id}>{jobLabel(j, j.id)}</option>
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
  const crew = jobCrew(job);
  const rpls = jobRpls(job);
  const addr = formatJobAddress(job);
  const tel = telHref(job.client_phone);
  const label = { fontSize: '0.75rem', textTransform: 'uppercase' as const, letterSpacing: '0.04em', color: 'var(--theme-fg-secondary)' };

  return (
    <div style={{ ...card, display: 'grid', gap: 14 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{jobLabel(job)}</h2>
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
        <div style={{ fontSize: '0.95rem' }}>{crew.length ? crewNames(crew) : 'Just you'}</div>
      </div>
    </div>
  );
}

/** A quick field calculator (B3) — button-driven, evaluated by the safe arithmetic evaluator. */
function FieldCalculator() {
  const [expr, setExpr] = useState('');
  const result = evalArithmetic(expr);
  const preview = result === null ? '' : formatCalcResult(result);
  const push = (s: string) => setExpr((e) => e + s);
  const keys: string[] = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '(', ')'];
  const card: React.CSSProperties = { padding: 'var(--hub-spc-4, 16px)', borderRadius: 8, background: 'var(--theme-bg-surface)', border: '1px solid var(--theme-border)', maxWidth: 320 };
  const btn: React.CSSProperties = { padding: '12px 0', borderRadius: 6, border: '1px solid var(--theme-border)', background: 'var(--theme-bg-elevated)', color: 'var(--theme-fg-primary)', fontSize: '1.05rem', cursor: 'pointer' };

  return (
    <div style={{ ...card, display: 'grid', gap: 10 }}>
      <input
        value={expr}
        onChange={(e) => setExpr(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && preview) setExpr(preview); }}
        placeholder="0"
        aria-label="calculator expression"
        style={{ width: '100%', textAlign: 'right', fontSize: '1.3rem', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--theme-border)', background: 'var(--theme-bg-elevated)', color: 'var(--theme-fg-primary)' }}
      />
      <div style={{ textAlign: 'right', minHeight: 20, color: 'var(--theme-fg-secondary)', fontSize: '0.95rem' }}>{preview && `= ${preview}`}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {keys.map((k) => <button key={k} type="button" style={btn} onClick={() => push(k)}>{k}</button>)}
        <button type="button" style={{ ...btn, gridColumn: 'span 2', color: 'var(--theme-warning)' }} onClick={() => setExpr('')}>C</button>
        <button type="button" style={{ ...btn }} onClick={() => setExpr((e) => e.slice(0, -1))}>⌫</button>
        <button type="button" style={{ ...btn, background: 'var(--theme-accent)', color: '#fff' }} onClick={() => { if (preview) setExpr(preview); }}>=</button>
      </div>
    </div>
  );
}

/** A per-job field notes pad (B3). Persists to localStorage keyed by the job so notes survive
 *  navigation on the device; DB-persistence for review-by-others is a follow-up. */
function FieldNotes({ jobId }: { jobId: string | null }) {
  const key = `starr:field-notes:${jobId ?? 'nojob'}`;
  const [text, setText] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  useEffect(() => {
    try { setText(window.localStorage.getItem(key) ?? ''); } catch { setText(''); }
  }, [key]);
  useEffect(() => {
    const id = setTimeout(() => {
      try { window.localStorage.setItem(key, text); setSavedAt(new Date().toLocaleTimeString()); } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(id);
  }, [key, text]);
  const card: React.CSSProperties = { padding: 'var(--hub-spc-4, 16px)', borderRadius: 8, background: 'var(--theme-bg-surface)', border: '1px solid var(--theme-border)', display: 'grid', gap: 8 };
  return (
    <div style={card}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={jobId ? 'Field notes for this job…' : 'Pick a job to keep notes per job (these are saved on this device).'}
        rows={10}
        aria-label="field notes"
        style={{ width: '100%', resize: 'vertical', padding: 10, borderRadius: 6, border: '1px solid var(--theme-border)', background: 'var(--theme-bg-elevated)', color: 'var(--theme-fg-primary)', fontSize: '0.95rem' }}
      />
      <div style={{ fontSize: '0.78rem', color: 'var(--theme-fg-secondary)' }}>{savedAt ? `Saved on this device · ${savedAt}` : 'Saved automatically on this device.'}</div>
    </div>
  );
}

interface JobMediaItem {
  id: string;
  media_type?: string | null;
  storage_signed_url?: string | null;
  thumbnail_signed_url?: string | null;
  original_signed_url?: string | null;
  captured_at?: string | null;
  uploaded_by_name?: string | null;
  upload_state?: string | null;
}

/** A read-only gallery of the job's captured field media (photos/videos/voice) — captured on the
 *  mobile app, reviewed here. Capture on web is a mobile-first concern (see the plan); this surfaces
 *  what's already been captured so a field worker can confirm coverage from the hub. */
function JobMedia({ jobId }: { jobId: string | null }) {
  const [media, setMedia] = useState<JobMediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!jobId) { setMedia([]); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/jobs/${encodeURIComponent(jobId)}/field-data`)
      .then((r) => (r.ok ? r.json() : { job_media: [] }))
      .then((j) => { if (!cancelled) setMedia((j.job_media ?? []) as JobMediaItem[]); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [jobId]);

  const card: React.CSSProperties = { padding: 'var(--hub-spc-4, 16px)', borderRadius: 8, background: 'var(--theme-bg-surface)', border: '1px solid var(--theme-border)' };
  if (!jobId) return <div style={card}><p style={{ margin: 0, color: 'var(--theme-fg-secondary)', fontSize: '0.9rem' }}>Select a job to review its captured photos and videos.</p></div>;
  if (loading) return <div style={card}><p style={{ margin: 0, color: 'var(--theme-fg-secondary)', fontSize: '0.9rem' }}>Loading captured media…</p></div>;

  return (
    <div style={{ ...card, display: 'grid', gap: 10 }}>
      <p style={{ margin: 0, color: 'var(--theme-fg-secondary)', fontSize: '0.82rem' }}>
        Captured media for this job. New capture happens in the field on the mobile app; this reviews what&apos;s been uploaded.
      </p>
      {!media.length ? (
        <p style={{ margin: 0, color: 'var(--theme-fg-secondary)', fontSize: '0.9rem' }}>No media captured for this job yet.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
          {media.map((m) => {
            const { thumbUrl, openUrl, showImage, icon } = mediaDisplay(m);
            return (
              <a key={m.id} href={openUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', display: 'grid', gap: 3 }} title={m.captured_at ? new Date(m.captured_at).toLocaleString() : undefined}>
                <div style={{ aspectRatio: '1 / 1', borderRadius: 6, overflow: 'hidden', background: 'var(--theme-bg-elevated)', border: '1px solid var(--theme-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {showImage
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 26 }} aria-hidden>{icon}</span>}
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--theme-fg-secondary)' }}>{m.uploaded_by_name || m.media_type || 'media'}</span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface JobFile { id: string; file_name?: string | null; file_url?: string | null; file_type?: string | null; section?: string | null; description?: string | null }

/** One-tap access to the active job's documents, research, and files (A3). Fetches the job's files
 *  and groups them by section so a field worker can open any doc without leaving the hub. */
function JobFiles({ jobId }: { jobId: string | null }) {
  const [files, setFiles] = useState<JobFile[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!jobId) { setFiles([]); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/jobs/files?job_id=${encodeURIComponent(jobId)}`)
      .then((r) => (r.ok ? r.json() : { files: [] }))
      .then((j) => { if (!cancelled) setFiles((j.files ?? []) as JobFile[]); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [jobId]);

  const card: React.CSSProperties = { padding: 'var(--hub-spc-4, 16px)', borderRadius: 8, background: 'var(--theme-bg-surface)', border: '1px solid var(--theme-border)' };
  if (!jobId) return <div style={card}><p style={{ margin: 0, color: 'var(--theme-fg-secondary)', fontSize: '0.9rem' }}>Select a job to see its documents, research, and files.</p></div>;
  if (loading) return <div style={card}><p style={{ margin: 0, color: 'var(--theme-fg-secondary)', fontSize: '0.9rem' }}>Loading files…</p></div>;
  if (!files.length) return <div style={card}><p style={{ margin: 0, color: 'var(--theme-fg-secondary)', fontSize: '0.9rem' }}>No files on this job yet.</p></div>;

  const bySection = groupFilesBySection(files);

  return (
    <div style={{ ...card, display: 'grid', gap: 14 }}>
      {bySection.map(([section, list]) => (
        <div key={section} style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--theme-fg-secondary)' }}>{section} ({list.length})</div>
          {list.map((f) => (
            <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, borderTop: '1px solid var(--theme-border)', paddingTop: 6 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.92rem', wordBreak: 'break-word' }}>{f.file_name || 'Untitled'}</div>
                {f.description && <div style={{ fontSize: '0.78rem', color: 'var(--theme-fg-secondary)' }}>{f.description}</div>}
              </div>
              {f.file_url
                ? <a href={f.file_url} target="_blank" rel="noopener noreferrer" className="btn tiny" style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}>Open</a>
                : <span style={{ fontSize: '0.78rem', color: 'var(--theme-fg-secondary)' }}>no link</span>}
            </div>
          ))}
        </div>
      ))}
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
  calc:      { title: 'Calculator',        description: 'A quick field calculator.' },
  notes:     { title: 'Notes',             description: 'Per-job field notes.' },
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
