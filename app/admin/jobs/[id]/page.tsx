// app/admin/jobs/[id]/page.tsx — Job detail view with tabs
'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import { usePageError } from '../../hooks/usePageError';
import Link from 'next/link';
import JobStageTimeline from '../../components/jobs/JobStageTimeline';
import JobTeamPanel from '../../components/jobs/JobTeamPanel';
import JobFileManager from '../../components/jobs/JobFileManager';
import JobEquipmentList from '../../components/jobs/JobEquipmentList';
import JobResearchPanel from '../../components/jobs/JobResearchPanel';
import JobCadPanel from '../../components/jobs/JobCadPanel';
import JobPhotoGallery from '../../components/jobs/JobPhotoGallery';
import InlineEditField from '../../components/jobs/InlineEditField';
import JobActivityFeed from '../../components/jobs/JobActivityFeed';
import JobMessagesPanel from '../../components/jobs/JobMessagesPanel';
import JobPhaseScheduler from './JobPhaseScheduler';
// contacts plan Slice 6 (2026-05-30) — job ↔ contact linking.
import LinkContactDialog from '../../components/jobs/LinkContactDialog';
import { JOB_CONTACT_ROLES } from '@/lib/contacts/labels';
import { exportJobPdf } from '../../components/jobs/jobPdf';
import JobChecklist from '../../components/jobs/JobChecklist';
import JobQuoteBuilder from '../../components/jobs/JobQuoteBuilder';
import JobTimeTracker from '../../components/jobs/JobTimeTracker';
import FieldWorkView from '../../components/jobs/FieldWorkView';
import type { FieldPoint, JobContext } from '../../components/jobs/FieldWorkView';
import { STAGE_CONFIG, SURVEY_TYPES } from '../../components/jobs/JobCard';
import Tooltip from '../../research/components/Tooltip';
import { withAlpha } from '@/lib/admin/color-alpha';

interface Job {
  id: string;
  job_number: string;
  name: string;
  description?: string;
  stage: string;
  survey_type: string;
  acreage?: number;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  county?: string;
  lot_number?: string;
  subdivision?: string;
  abstract_number?: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  client_company?: string;
  deadline?: string;
  quote_amount?: number;
  final_amount?: number;
  amount_paid?: number;
  payment_status?: string;
  lead_rpls_email?: string;
  is_priority?: boolean;
  notes?: string;
  // job-editing 2026-05-30 — free-form deliverables description.
  // Persisted in the new `jobs.deliverables` column (seeds/304).
  deliverables?: string;
  result?: 'won' | 'lost' | 'abandoned' | null;
  result_reason?: string | null;
  result_set_at?: string | null;
  created_at: string;
  team: { id: string; user_email: string; user_name?: string; role: string; assigned_at: string; notes?: string }[];
  tags: string[];
  equipment: { id: string; equipment_name: string; equipment_type?: string; serial_number?: string; checked_out_at?: string; returned_at?: string; checked_out_by?: string; notes?: string }[];
  file_count: number;
  total_hours: number;
}

const TABS = [
  { key: 'overview', label: 'Overview', icon: '📋', tip: 'Job summary with property details, client information, team assignments, equipment, and stage checklists. This is your central dashboard for the job.' },
  { key: 'schedule', label: 'Schedule', icon: '🗓️', tip: 'Pick day(s) for the three job phases — Research, Field Work, Drawing & Deliverables. Each pick lands on the org-wide calendar at /admin/calendar and fires day-before + day-of reminders to the assignee.' },
  { key: 'research', label: 'Research', icon: '🔍', tip: 'Deed records, plat maps, previous surveys, legal descriptions, and other research documents organized by category. Upload and manage all background research for this job.' },
  { key: 'cad', label: 'CAD', icon: '📐', tip: 'Draft the survey in the Starr CAD editor. Drawings created here stay linked to the job — open existing ones or start a new drawing in one click.' },
  { key: 'fieldwork', label: 'Field Work', icon: '🏗️', tip: 'Interactive map showing collected field points, shot log with search, and timeline visualization. View GPS positions, total station data, and field observations.' },
  { key: 'files', label: 'Files', icon: '📁', tip: 'All uploaded files for this job — drawings, documents, CAD files, and Trimble data. Organized by section with automatic backup tracking.' },
  { key: 'photos', label: 'Photos', icon: '📷', tip: 'Field photos for this job — corners, monuments, site conditions. Thumbnail gallery with a click-to-enlarge lightbox and drag-and-drop upload.' },
  { key: 'financial', label: 'Financial', icon: '💰', tip: 'Quote details, payment tracking, and time entries. View revenue summary, record payments, and log hours worked by team members.' },
  { key: 'activity', label: 'Activity', icon: '🕓', tip: 'Chronological log of everything on this job — stage changes, file/photo uploads, drawings saved, team changes — newest first.' },
  { key: 'messages', label: 'Messages', icon: '💬', tip: 'Dedicated messaging thread for this job. Coordinate with team members, share updates, and discuss field observations in one place.' },
];

export default function JobDetailPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user?.roles || []).includes('admin');
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;
  const { safeFetch, safeAction, reportPageError } = usePageError('JobDetailPage');

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  // Live tab counts. CAD + Photos report theirs via onCountChange when
  // their tab is opened (we avoid preloading photos — their data URLs
  // are heavy). null = not yet known, so no badge shows.
  const [cadCount, setCadCount] = useState<number | null>(null);
  const [photoCount, setPhotoCount] = useState<number | null>(null);
  // contacts plan Slice 6 — linked-contacts state for the overview tab.
  const [contactLinks, setContactLinks] = useState<Array<{
    id: string; role: string; notes?: string | null;
    contact_id: string;
    contacts: { id: string; name: string; company: string | null; email: string | null } | null;
  }>>([]);
  const [showLinkContactDialog, setShowLinkContactDialog] = useState(false);
  const [stageHistory, setStageHistory] = useState<{ from_stage?: string; to_stage: string; changed_by: string; notes?: string; created_at: string }[]>([]);
  const [files, setFiles] = useState<{ id: string; file_name: string; file_type: string; file_url?: string; file_size?: number; section: string; description?: string; uploaded_by: string; uploaded_at: string; is_backup: boolean }[]>([]);
  const [research, setResearch] = useState<{ id: string; category: string; title: string; content?: string; source?: string; reference_number?: string; date_of_record?: string; added_by: string; created_at: string }[]>([]);
  const [timeEntries, setTimeEntries] = useState<{ id: string; user_email: string; user_name?: string; work_type: string; start_time: string; end_time?: string; duration_minutes?: number; description?: string; billable: boolean }[]>([]);
  const [payments, setPayments] = useState<{ id: string; amount: number; payment_type: string; payment_method?: string; reference_number?: string; notes?: string; paid_at: string; recorded_by: string }[]>([]);
  const [jobReceipts, setJobReceipts] = useState<{ id: string; vendor_name: string | null; total_cents: number | null; transaction_at: string | null; category: string | null; status: string; submitted_by_name: string | null; submitted_by_email: string | null; photo_signed_url: string | null }[]>([]);
  const [checklists, setChecklists] = useState<{ id: string; stage: string; item: string; is_completed: boolean; completed_by?: string; completed_at?: string }[]>([]);
  const [fieldData, setFieldData] = useState<FieldPoint[]>([]);

  const loadJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/jobs?id=${jobId}`);
      if (res.ok) {
        const data = await res.json();
        setJob(data.job);
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load job' });
    }
    setLoading(false);
  }, [jobId, reportPageError]);

  useEffect(() => { loadJob(); }, [loadJob]);

  // Inline-edit save: PUT the single changed field, then patch local
  // state so the UI reflects it without a full reload. Throws on
  // failure so InlineEditField can surface the message + roll back.
  const saveField = useCallback(async (field: string, value: string) => {
    // Coerce types the API expects.
    let payloadValue: string | number | boolean | null = value;
    if (field === 'acreage' || field === 'quote_amount') {
      payloadValue = value.trim() === '' ? null : Number(value);
      if (payloadValue !== null && !Number.isFinite(payloadValue)) throw new Error('Enter a number.');
    } else if (field === 'is_priority') {
      payloadValue = value === 'true';
    } else if (value.trim() === '') {
      payloadValue = null;
    }
    const res = await fetch('/api/admin/jobs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: jobId, [field]: payloadValue }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
    setJob((prev) => (prev ? { ...prev, [field]: payloadValue as never } : prev));
  }, [jobId]);

  // job-soft-delete Slice 1 — warn, then soft-delete (sets deleted_at;
  // recoverable for 30 days from the all-jobs "🗑 Deleted" view), then
  // route back to the list.
  const [deletingJob, setDeletingJob] = useState(false);
  const handleDeleteJob = useCallback(async () => {
    if (!job) return;
    const ok = window.confirm(
      `Delete "${job.name}"?\n\n` +
      `It will be moved to the trash and stays recoverable for 30 days ` +
      `(restore it from Jobs → "🗑 Deleted"), then it's permanently removed.`,
    );
    if (!ok) return;
    setDeletingJob(true);
    try {
      const res = await fetch(`/api/admin/jobs?id=${encodeURIComponent(jobId)}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/admin/jobs');
        return;
      }
      setDeletingJob(false);
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'delete job' });
      setDeletingJob(false);
    }
  }, [job, jobId, router, reportPageError]);

  // Load tab-specific data on tab change
  useEffect(() => {
    if (!jobId) return;

    function handleError(err: unknown, element: string) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element });
    }

    if (activeTab === 'overview') {
      fetch(`/api/admin/jobs/stages?job_id=${jobId}`).then(r => r.json()).then(d => setStageHistory(d.history || [])).catch((err: unknown) => { handleError(err, 'load stage history'); });
      fetch(`/api/admin/jobs/checklists?job_id=${jobId}`).then(r => r.json()).then(d => setChecklists(d.checklists || [])).catch((err: unknown) => { handleError(err, 'load checklists'); });
      // contacts plan Slice 6 — linked contacts for the Contacts panel.
      fetch(`/api/admin/jobs/contacts?job_id=${jobId}`).then(r => r.json()).then(d => setContactLinks(d.links || [])).catch((err: unknown) => { handleError(err, 'load contacts'); });
    }
    if (activeTab === 'research') {
      fetch(`/api/admin/jobs/research?job_id=${jobId}`).then(r => r.json()).then(d => setResearch(d.research || [])).catch((err: unknown) => { handleError(err, 'load research'); });
    }
    if (activeTab === 'fieldwork') {
      fetch(`/api/admin/jobs/field-data?job_id=${jobId}`).then(r => r.json()).then(d => setFieldData(d.field_data || [])).catch((err: unknown) => { handleError(err, 'load field data'); });
    }
    if (activeTab === 'files') {
      fetch(`/api/admin/jobs/files?job_id=${jobId}`).then(r => r.json()).then(d => setFiles(d.files || [])).catch((err: unknown) => { handleError(err, 'load files'); });
    }
    if (activeTab === 'financial') {
      fetch(`/api/admin/jobs/payments?job_id=${jobId}`).then(r => r.json()).then(d => setPayments(d.payments || [])).catch((err: unknown) => { handleError(err, 'load payments'); });
      fetch(`/api/admin/jobs/time?job_id=${jobId}`).then(r => r.json()).then(d => setTimeEntries(d.entries || [])).catch((err: unknown) => { handleError(err, 'load time entries'); });
      // Receipts/expenses linked to this job (admin/bookkeeper only — the
      // receipts API is admin-gated, so skip the call for other roles to
      // avoid a guaranteed 403).
      if (isAdmin) {
        fetch(`/api/admin/receipts?jobId=${jobId}&limit=200`).then(r => r.ok ? r.json() : { receipts: [] }).then(d => setJobReceipts(d.receipts || [])).catch((err: unknown) => { handleError(err, 'load job receipts'); });
      }
    }
  }, [activeTab, jobId, isAdmin, reportPageError]);

  async function advanceStage(toStage: string) {
    try {
      await fetch('/api/admin/jobs/stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, to_stage: toStage }),
      });
      loadJob();
      fetch(`/api/admin/jobs/stages?job_id=${jobId}`).then(r => r.json()).then(d => setStageHistory(d.history || [])).catch((err: unknown) => { reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'reload stage history' }); });
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'advance stage' });
    }
  }

  const loadFieldData = useCallback(() => {
    fetch(`/api/admin/jobs/field-data?job_id=${jobId}`).then(r => r.json()).then(d => setFieldData(d.field_data || [])).catch((err: unknown) => { reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load field data' }); });
  }, [jobId, reportPageError]);

  async function addTeamMember(email: string, name: string, role: string) {
    try {
      await fetch('/api/admin/jobs/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, user_email: email, user_name: name, role }),
      });
      loadJob();
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'add team member' });
    }
  }

  async function removeTeamMember(id: string) {
    try {
      await fetch(`/api/admin/jobs/team?id=${id}`, { method: 'DELETE' });
      loadJob();
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'remove team member' });
    }
  }

  async function changeTeamRole(id: string, role: string) {
    try {
      await fetch('/api/admin/jobs/team', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, role }),
      });
      loadJob();
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'change team role' });
    }
  }

  async function addEquipment(name: string, type: string, serial: string) {
    try {
      await fetch('/api/admin/jobs/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, equipment_name: name, equipment_type: type, serial_number: serial }),
      });
      loadJob();
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'add equipment' });
    }
  }

  async function returnEquipment(id: string) {
    try {
      await fetch('/api/admin/jobs/equipment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, returned: true }),
      });
      loadJob();
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'return equipment' });
    }
  }

  async function uploadFile(file: { file_name: string; file_type: string; file_url: string; file_size: number; section: string; description: string }) {
    try {
      await fetch('/api/admin/jobs/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, ...file }),
      });
      fetch(`/api/admin/jobs/files?job_id=${jobId}`).then(r => r.json()).then(d => setFiles(d.files || [])).catch((err: unknown) => { reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'reload files' }); });
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'upload file' });
    }
  }

  async function deleteFile(id: string) {
    try {
      await fetch(`/api/admin/jobs/files?id=${id}`, { method: 'DELETE' });
      fetch(`/api/admin/jobs/files?job_id=${jobId}`).then(r => r.json()).then(d => setFiles(d.files || [])).catch((err: unknown) => { reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'reload files after delete' }); });
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'delete file' });
    }
  }

  async function addResearch(item: { category: string; title: string; content: string; source: string; reference_number: string }) {
    try {
      await fetch('/api/admin/jobs/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, ...item }),
      });
      fetch(`/api/admin/jobs/research?job_id=${jobId}`).then(r => r.json()).then(d => setResearch(d.research || [])).catch((err: unknown) => { reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'reload research' }); });
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'add research' });
    }
  }

  async function deleteResearch(id: string) {
    try {
      await fetch(`/api/admin/jobs/research?id=${id}`, { method: 'DELETE' });
      fetch(`/api/admin/jobs/research?job_id=${jobId}`).then(r => r.json()).then(d => setResearch(d.research || [])).catch((err: unknown) => { reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'reload research after delete' }); });
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'delete research' });
    }
  }

  async function toggleChecklist(id: string, completed: boolean) {
    try {
      await fetch('/api/admin/jobs/checklists', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_completed: completed }),
      });
      fetch(`/api/admin/jobs/checklists?job_id=${jobId}`).then(r => r.json()).then(d => setChecklists(d.checklists || [])).catch((err: unknown) => { reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'reload checklists' }); });
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'toggle checklist' });
    }
  }

  async function loadChecklistTemplate(stage: string) {
    try {
      await fetch('/api/admin/jobs/checklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, stage, use_template: true }),
      });
      fetch(`/api/admin/jobs/checklists?job_id=${jobId}`).then(r => r.json()).then(d => setChecklists(d.checklists || [])).catch((err: unknown) => { reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'reload checklists after template' }); });
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load checklist template' });
    }
  }

  async function addTimeEntry(entry: { work_type: string; duration_minutes: number; description: string }) {
    try {
      await fetch('/api/admin/jobs/time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, start_time: new Date().toISOString(), ...entry }),
      });
      fetch(`/api/admin/jobs/time?job_id=${jobId}`).then(r => r.json()).then(d => setTimeEntries(d.entries || [])).catch((err: unknown) => { reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'reload time entries' }); });
      loadJob();
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'add time entry' });
    }
  }

  if (!session?.user) return null;
  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#9CA3AF' }}>Loading job...</div>;
  if (!job) return <div style={{ padding: '2rem', textAlign: 'center' }}>Job not found. <Link href="/admin/jobs">Back to Jobs</Link></div>;

  const stageInfo = STAGE_CONFIG[job.stage] || STAGE_CONFIG.quote;

  // Tab badge counts. Files always known (job.file_count); research +
  // field work fill in once their tab loads; CAD + Photos report via
  // onCountChange. undefined = no badge.
  const tabCounts: Record<string, number | undefined> = {
    research: research.length || undefined,
    cad: cadCount ?? undefined,
    fieldwork: fieldData.length || undefined,
    files: job.file_count || undefined,
    photos: photoCount ?? undefined,
  };

  return (
    <>

      {/* Job Header */}
      <div className="job-detail__header">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <Link href="/admin/jobs" className="learn__back">&larr; Back to Jobs</Link>
          {/* Quick jump to the consolidated per-job field captures
              view (Batch S — points + media + notes + files in one
              place, with bulk media-manifest download). Inline-styled
              to avoid adding new CSS to the existing job-detail
              stylesheet. */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Link
              href={`/admin/jobs/${jobId}/field`}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-brand-navy)',
                border: '1px solid var(--color-brand-navy)',
                borderRadius: 8,
                padding: '6px 12px',
                textDecoration: 'none',
              }}
              title="See every point + photo + voice memo + file the field crew has logged on this job, and download the media in one CSV."
            >
              📍 View field captures →
            </Link>
            {/* job-soft-delete Slice 1 — delete with a warning; the job
                is recoverable for 30 days from Jobs → "🗑 Deleted". */}
            <button
              type="button"
              onClick={() => void handleDeleteJob()}
              disabled={deletingJob}
              title="Delete this job (recoverable for 30 days)"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#B42318',
                border: '1px solid #FCA5A5',
                background: 'transparent',
                borderRadius: 8,
                padding: '6px 12px',
                cursor: 'pointer',
              }}
            >
              {deletingJob ? 'Deleting…' : '🗑 Delete job'}
            </button>
          </div>
        </div>
        <div className="job-detail__header-top">
          <div>
            <div className="job-detail__number">{job.job_number}</div>
            <h2 className="job-detail__name">
              {job.is_priority && <span title="Priority">🔴 </span>}
              {job.name}
            </h2>
            <p className="job-detail__meta">
              {SURVEY_TYPES[job.survey_type] || job.survey_type}
              {job.acreage && ` · ${job.acreage} acres`}
              {job.client_name && ` · ${job.client_name}`}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
            <span className="job-detail__stage-badge" style={{ background: withAlpha(stageInfo.color, 12.55), color: stageInfo.color }}>
              {stageInfo.icon} {stageInfo.label}
            </span>
            <button
              className="jobs-page__btn jobs-page__btn--secondary"
              onClick={() => exportJobPdf({
                ...job,
                counts: {
                  files: job.file_count,
                  photos: photoCount ?? undefined,
                  drawings: cadCount ?? undefined,
                  research: research.length || undefined,
                  hours: job.total_hours,
                },
              })}
              title="Download a one-page job summary PDF"
            >
              ⬇ Export PDF
            </button>
            <JobResultControl
              jobId={job.id}
              currentResult={job.result ?? null}
              currentReason={job.result_reason ?? null}
              onUpdate={(r, reason) => {
                setJob((cur) => cur ? { ...cur, result: r, result_reason: reason } : cur);
              }}
            />
          </div>
        </div>

        {/* Quick stats */}
        <div className="job-detail__stats">
          <Tooltip text="Number of team members currently assigned to this job, including the lead RPLS, field crew, and office staff." position="bottom">
            <div className="job-detail__stat">
              <span className="job-detail__stat-value">{job.team.length}</span>
              <span className="job-detail__stat-label">Team</span>
            </div>
          </Tooltip>
          <Tooltip text="Total number of files uploaded to this job, including documents, drawings, field data, images, and CAD files." position="bottom">
            <div className="job-detail__stat">
              <span className="job-detail__stat-value">{job.file_count}</span>
              <span className="job-detail__stat-label">Files</span>
            </div>
          </Tooltip>
          <Tooltip text="Total hours logged by all team members on this job across all work types (field work, office, travel, etc.)." position="bottom">
            <div className="job-detail__stat">
              <span className="job-detail__stat-value">{job.total_hours}h</span>
              <span className="job-detail__stat-label">Time</span>
            </div>
          </Tooltip>
          <Tooltip text="The quoted price for this survey job. View the Financial tab for payment details, invoicing, and profitability analysis." position="bottom">
            <div className="job-detail__stat">
              <span className="job-detail__stat-value">${(job.quote_amount || 0).toLocaleString()}</span>
              <span className="job-detail__stat-label">Quote</span>
            </div>
          </Tooltip>
        </div>

        {/* Tags */}
        {job.tags.length > 0 && (
          <div className="job-detail__tags">
            {job.tags.map(tag => (
              <span key={tag} className="job-card__tag">{tag}</span>
            ))}
          </div>
        )}
      </div>

      {/* Stage Timeline */}
      <JobStageTimeline
        currentStage={job.stage}
        history={stageHistory}
        onAdvance={advanceStage}
        canAdvance={true}
      />

      {/* Tabs */}
      <div className="job-detail__tabs">
        {TABS.map(tab => {
          const count = tabCounts[tab.key];
          return (
            <Tooltip key={tab.key} text={tab.tip} position="bottom" delay={600}>
              <button
                className={`job-detail__tab ${activeTab === tab.key ? 'job-detail__tab--active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                <span className="job-detail__tab-icon">{tab.icon}</span>
                {tab.label}
                {typeof count === 'number' && count > 0 && (
                  <span className="job-detail__tab-badge">{count}</span>
                )}
              </button>
            </Tooltip>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="job-detail__content">
        {activeTab === 'overview' && (
          <div className="job-detail__overview">
            {/* Quick actions — jump straight into the parts of the job */}
            <div className="job-detail__quick-actions">
              <button className="job-detail__quick-action" onClick={() => setActiveTab('research')}>🔍 Add research</button>
              <button className="job-detail__quick-action" onClick={() => setActiveTab('cad')}>📐 Start a drawing</button>
              <button className="job-detail__quick-action" onClick={() => setActiveTab('files')}>📁 Add files</button>
              <button className="job-detail__quick-action" onClick={() => setActiveTab('photos')}>📷 Add photos</button>
              <button className="job-detail__quick-action" onClick={() => setActiveTab('fieldwork')}>🏗️ Field work</button>
            </div>
            <div className="job-detail__overview-grid">
              <div className="job-detail__overview-main">
                {/* Description — click to edit */}
                <div className="job-detail__section">
                  <h3>Description</h3>
                  <p>
                    <InlineEditField value={job.description} type="textarea" ariaLabel="description"
                      emptyLabel="Add a description…" onSave={(v) => saveField('description', v)} />
                  </p>
                </div>

                {/* job-editing 2026-05-30 — Deliverables: what's being
                    handed over on this job (e.g., "boundary survey +
                    topo + ALTA cert; recorded plat by 2026-06-15").
                    Same inline-edit pattern as Description. */}
                <div className="job-detail__section">
                  <h3>Deliverables</h3>
                  <p>
                    <InlineEditField value={job.deliverables} type="textarea" ariaLabel="deliverables"
                      emptyLabel="What does this job deliver? (boundary survey, topo, ALTA cert, …)"
                      onSave={(v) => saveField('deliverables', v)} />
                  </p>
                </div>

                {/* Property Details — click to edit */}
                <div className="job-detail__section">
                  <h3>Property Details</h3>
                  <div className="job-detail__props">
                    <div className="job-detail__prop"><strong>Address:</strong> <InlineEditField value={job.address} ariaLabel="address" emptyLabel="Add address" onSave={(v) => saveField('address', v)} /></div>
                    <div className="job-detail__prop"><strong>City:</strong> <InlineEditField value={job.city} ariaLabel="city" emptyLabel="Add city" onSave={(v) => saveField('city', v)} /></div>
                    <div className="job-detail__prop"><strong>State:</strong> <InlineEditField value={job.state} ariaLabel="state" emptyLabel="Add state" onSave={(v) => saveField('state', v)} /></div>
                    <div className="job-detail__prop"><strong>ZIP:</strong> <InlineEditField value={job.zip} ariaLabel="zip" emptyLabel="Add ZIP" onSave={(v) => saveField('zip', v)} /></div>
                    <div className="job-detail__prop"><strong>County:</strong> <InlineEditField value={job.county} ariaLabel="county" emptyLabel="Add county" onSave={(v) => saveField('county', v)} /></div>
                    <div className="job-detail__prop"><strong>Lot:</strong> <InlineEditField value={job.lot_number} ariaLabel="lot" emptyLabel="Add lot" onSave={(v) => saveField('lot_number', v)} /></div>
                    <div className="job-detail__prop"><strong>Subdivision:</strong> <InlineEditField value={job.subdivision} ariaLabel="subdivision" emptyLabel="Add subdivision" onSave={(v) => saveField('subdivision', v)} /></div>
                    <div className="job-detail__prop"><strong>Abstract:</strong> <InlineEditField value={job.abstract_number} ariaLabel="abstract" emptyLabel="Add abstract" onSave={(v) => saveField('abstract_number', v)} /></div>
                    <div className="job-detail__prop"><strong>Acreage:</strong> <InlineEditField value={job.acreage} type="number" ariaLabel="acreage" emptyLabel="Add acreage" onSave={(v) => saveField('acreage', v)} /></div>
                  </div>
                </div>

                {/* Client — click to edit */}
                <div className="job-detail__section">
                  <h3>Client</h3>
                  <div className="job-detail__props">
                    <div className="job-detail__prop"><strong>Name:</strong> <InlineEditField value={job.client_name} ariaLabel="client name" emptyLabel="Add client name" onSave={(v) => saveField('client_name', v)} /></div>
                    <div className="job-detail__prop"><strong>Email:</strong> <InlineEditField value={job.client_email} type="email" ariaLabel="client email" emptyLabel="Add email" onSave={(v) => saveField('client_email', v)} /></div>
                    <div className="job-detail__prop"><strong>Phone:</strong> <InlineEditField value={job.client_phone} type="tel" ariaLabel="client phone" emptyLabel="Add phone" onSave={(v) => saveField('client_phone', v)} /></div>
                    <div className="job-detail__prop"><strong>Company:</strong> <InlineEditField value={job.client_company} ariaLabel="client company" emptyLabel="Add company" onSave={(v) => saveField('client_company', v)} /></div>
                  </div>
                </div>

                {/* Notes — click to edit */}
                <div className="job-detail__section">
                  <h3>Notes</h3>
                  <p>
                    <InlineEditField value={job.notes} type="textarea" ariaLabel="notes"
                      emptyLabel="Add notes…" onSave={(v) => saveField('notes', v)} />
                  </p>
                </div>

                {/* contacts plan Slice 6 — Contacts (realtors, clients,
                    lenders, etc.) linked to this job via job_contacts.
                    Legacy client_name / client_email fields above keep
                    serving unlinked / pre-existing rows; this section
                    is the new picker-driven surface. */}
                <div className="job-detail__section">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <h3>Contacts ({contactLinks.length})</h3>
                    <button
                      type="button"
                      onClick={() => setShowLinkContactDialog(true)}
                      style={{
                        padding: '6px 12px', borderRadius: 6,
                        border: '1px solid var(--theme-accent, #3b82f6)',
                        background: 'var(--theme-accent, #3b82f6)', color: 'var(--theme-accent-fg, white)',
                        cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                      }}
                    >
                      + Link a contact
                    </button>
                  </div>
                  {contactLinks.length === 0 ? (
                    <p style={{ color: 'var(--color-text-muted, #6B7280)', fontSize: '0.9rem' }}>
                      No contacts linked yet. Use the button above to associate a realtor, lender, or anyone else with this job.
                    </p>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {contactLinks.map((link) => (
                        <li key={link.id} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 12px', borderRadius: 8,
                          background: 'var(--theme-bg-elevated, #f9fafb)',
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {link.contacts ? (
                              <Link href={`/admin/contacts/${link.contacts.id}`} style={{ color: 'var(--theme-accent, #3b82f6)', fontWeight: 600 }}>
                                {link.contacts.name}
                              </Link>
                            ) : (
                              <span>(contact no longer exists)</span>
                            )}
                            <span style={{
                              marginLeft: 8, padding: '2px 8px', borderRadius: 999,
                              background: 'color-mix(in srgb, var(--theme-accent, #3b82f6) 12%, transparent)',
                              color: 'var(--theme-accent, #3b82f6)', fontSize: '0.72rem',
                            }}>
                              {JOB_CONTACT_ROLES.find((r) => r.id === link.role)?.label ?? link.role}
                            </span>
                            {(link.contacts?.company || link.contacts?.email) && (
                              <span style={{ marginLeft: 8, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                                {link.contacts.company ?? ''}
                                {link.contacts.company && link.contacts.email ? ' · ' : ''}
                                {link.contacts.email ?? ''}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!link.contacts) return;
                              if (!window.confirm(`Unlink ${link.contacts.name} from this job?`)) return;
                              const params = new URLSearchParams({
                                job_id: jobId,
                                contact_id: link.contact_id,
                                role: link.role,
                              });
                              const res = await fetch(`/api/admin/jobs/contacts?${params}`, { method: 'DELETE' });
                              if (!res.ok) return;
                              setContactLinks((cur) => cur.filter((l) => l.id !== link.id));
                            }}
                            style={{
                              padding: '6px 12px', borderRadius: 6,
                              border: '1px solid var(--theme-border, #e5e7eb)',
                              background: 'transparent', color: 'inherit',
                              cursor: 'pointer', fontSize: '0.85rem',
                            }}
                            aria-label="Unlink contact"
                          >
                            Unlink
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Checklist */}
                <JobChecklist
                  items={checklists}
                  stage={job.stage}
                  onToggle={toggleChecklist}
                  onLoadTemplate={loadChecklistTemplate}
                />
              </div>

              <div className="job-detail__overview-side">
                <JobTeamPanel
                  team={job.team}
                  onAdd={addTeamMember}
                  onRemove={removeTeamMember}
                  onChangeRole={changeTeamRole}
                  editable={true}
                />
                <JobEquipmentList
                  equipment={job.equipment}
                  onAdd={addEquipment}
                  onReturn={returnEquipment}
                  editable={true}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'schedule' && (
          <JobPhaseScheduler
            jobId={jobId}
            jobName={job.name}
            jobAddress={job.address ?? null}
            selfEmail={session?.user?.email ?? ''}
          />
        )}

        {activeTab === 'research' && (
          <JobResearchPanel
            research={research}
            onAdd={addResearch}
            onDelete={deleteResearch}
          />
        )}

        {activeTab === 'cad' && (
          <JobCadPanel jobId={jobId} jobName={job.name} onCountChange={setCadCount} />
        )}

        {activeTab === 'fieldwork' && (
          <FieldWorkView
            jobId={jobId}
            points={fieldData}
            onRefresh={loadFieldData}
            job={{
              jobNumber: job.job_number,
              jobName: job.name,
              stage: job.stage,
              surveyType: job.survey_type,
              clientName: job.client_name,
              address: job.address,
              city: job.city,
              state: job.state,
              county: job.county,
              acreage: job.acreage,
              deadline: job.deadline,
              createdAt: job.created_at,
              team: job.team,
              totalHours: job.total_hours,
            } as JobContext}
          />
        )}

        {activeTab === 'files' && (
          <JobFileManager
            files={files}
            onUpload={uploadFile}
            onDelete={deleteFile}
          />
        )}

        {activeTab === 'photos' && (
          <JobPhotoGallery jobId={jobId} onCountChange={setPhotoCount} />
        )}

        {activeTab === 'financial' && (
          <div className="job-detail__financial">
            <JobQuoteBuilder
              quoteAmount={job.quote_amount}
              finalAmount={job.final_amount}
              amountPaid={job.amount_paid}
              paymentStatus={job.payment_status}
              payments={payments}
              editable={true}
              // job-editing 2026-05-30 — wire the quote-edit handler
              // so the Financial tab's inline click-to-edit on Quote
              // saves through the existing PUT /api/admin/jobs flow.
              // saveField expects a string (coerced to a number inside)
              // so we stringify the value here.
              onUpdateQuote={(val) => { void saveField('quote_amount', String(val)); }}
            />
            <JobTimeTracker
              entries={timeEntries}
              totalHours={job.total_hours}
              onAdd={addTimeEntry}
            />
            {isAdmin && (
              <div className="job-expenses" style={{ marginTop: '1rem', background: 'var(--color-bg-card)', border: 'var(--border-light)', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>Expenses &amp; Receipts</h3>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-brand-navy)' }}>
                    ${(jobReceipts.reduce((s, r) => s + (r.total_cents || 0), 0) / 100).toFixed(2)} total
                  </span>
                </div>
                {jobReceipts.length === 0 ? (
                  <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', margin: 0 }}>
                    No receipts are linked to this job yet. Receipts submitted against this job (with its job link set) appear here once approved or pending.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {jobReceipts.map((r) => (
                      <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '0.6rem', alignItems: 'center', padding: '0.5rem 0.6rem', background: 'var(--color-bg-subtle, #F8FAFC)', borderRadius: '6px', fontSize: '0.82rem' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.vendor_name || 'Unknown vendor'}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                            {r.category || 'uncategorized'}
                            {r.submitted_by_name || r.submitted_by_email ? ` · ${r.submitted_by_name || r.submitted_by_email}` : ''}
                            {r.transaction_at ? ` · ${new Date(r.transaction_at).toLocaleDateString()}` : ''}
                          </div>
                        </div>
                        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>${((r.total_cents || 0) / 100).toFixed(2)}</span>
                        <span style={{
                          fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em',
                          padding: '0.15rem 0.45rem', borderRadius: '10px',
                          background: r.status === 'approved' ? 'var(--color-success-bg)' : r.status === 'rejected' ? 'var(--color-danger-bg, #FEE2E2)' : '#FEF3C7',
                          color: r.status === 'approved' ? '#065F46' : r.status === 'rejected' ? '#991B1B' : '#92400E',
                        }}>{r.status}</span>
                        {r.photo_signed_url
                          ? <a href={r.photo_signed_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--color-brand-navy)' }}>View</a>
                          : <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>—</span>}
                      </div>
                    ))}
                  </div>
                )}
                <Link href="/admin/receipts" style={{ display: 'inline-block', marginTop: '0.6rem', fontSize: '0.78rem', color: 'var(--color-brand-navy)' }}>
                  Manage all receipts &rarr;
                </Link>
              </div>
            )}
          </div>
        )}

        {activeTab === 'activity' && (
          <JobActivityFeed jobId={jobId} />
        )}

        {activeTab === 'messages' && (
          <JobMessagesPanel jobId={jobId} />
        )}
      </div>

      {/* contacts plan Slice 6 — Link-a-contact picker for the
          overview tab's Contacts section. */}
      {showLinkContactDialog && (
        <LinkContactDialog
          open={showLinkContactDialog}
          jobId={jobId}
          jobName={job.name}
          onClose={() => setShowLinkContactDialog(false)}
          onLinked={() => {
            setShowLinkContactDialog(false);
            // Refresh the linked-contacts panel.
            fetch(`/api/admin/jobs/contacts?job_id=${jobId}`)
              .then((r) => r.json())
              .then((d) => setContactLinks(d.links || []))
              .catch(() => { /* surfaced through the dialog already */ });
          }}
        />
      )}
    </>
  );
}

function JobResultControl({ jobId, currentResult, currentReason, onUpdate }: {
  jobId: string;
  currentResult: 'won' | 'lost' | 'abandoned' | null;
  currentReason: string | null;
  onUpdate: (result: 'won' | 'lost' | 'abandoned' | null, reason: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftResult, setDraftResult] = useState<'won' | 'lost' | 'abandoned'>(currentResult ?? 'lost');
  const [draftReason, setDraftReason] = useState(currentReason ?? '');
  const [submitting, setSubmitting] = useState(false);

  async function save() {
    if ((draftResult === 'lost' || draftResult === 'abandoned') && !draftReason.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/result`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: draftResult, reason: draftReason.trim() }),
      });
      if (res.ok) {
        onUpdate(draftResult, draftReason.trim() || null);
        setEditing(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function clearResult() {
    if (!confirm('Clear the result on this job? It will return to "still active".')) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/result`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: null }),
      });
      if (res.ok) {
        onUpdate(null, null);
        setEditing(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const colors = { won: '#10B981', lost: 'var(--color-error)', abandoned: '#9CA3AF' } as const;

  if (!editing) {
    if (currentResult) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{
            padding: '0.18rem 0.55rem',
            background: withAlpha(colors[currentResult], 12.55),
            color: colors[currentResult],
            borderRadius: 999,
            fontSize: '0.74rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}>
            {currentResult}
          </span>
          <button
            onClick={() => setEditing(true)}
            style={{ fontSize: '0.74rem', background: 'none', border: 0, color: '#6B7280', cursor: 'pointer', textDecoration: 'underline' }}
          >
            change
          </button>
        </div>
      );
    }
    return (
      <button
        onClick={() => setEditing(true)}
        style={{
          padding: '0.25rem 0.6rem',
          background: 'transparent',
          border: '1px dashed #D1D5DB',
          borderRadius: 4,
          fontSize: '0.74rem',
          color: '#6B7280',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Mark result…
      </button>
    );
  }

  return (
    <div style={{
      padding: '0.6rem',
      background: '#FFF',
      border: '1px solid #E5E7EB',
      borderRadius: 6,
      display: 'flex',
      flexDirection: 'column',
      gap: '0.4rem',
      minWidth: 240,
    }}>
      <div style={{ display: 'flex', gap: '0.3rem' }}>
        {(['won', 'lost', 'abandoned'] as const).map((r) => (
          <button
            key={r}
            onClick={() => setDraftResult(r)}
            style={{
              flex: 1,
              padding: '0.3rem 0.5rem',
              border: '1px solid ' + (draftResult === r ? colors[r] : '#D1D5DB'),
              background: draftResult === r ? withAlpha(colors[r], 12.55) : '#FFF',
              color: draftResult === r ? colors[r] : '#374151',
              borderRadius: 4,
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {r}
          </button>
        ))}
      </div>
      {(draftResult === 'lost' || draftResult === 'abandoned') && (
        <input
          type="text"
          value={draftReason}
          onChange={(e) => setDraftReason(e.target.value)}
          placeholder="Reason (required)"
          style={{
            padding: '0.35rem 0.5rem',
            border: '1px solid #D1D5DB',
            borderRadius: 4,
            fontSize: '0.82rem',
            fontFamily: 'inherit',
          }}
        />
      )}
      <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'space-between' }}>
        {currentResult && (
          <button
            onClick={clearResult}
            disabled={submitting}
            style={{ fontSize: '0.74rem', background: 'none', border: 0, color: '#6B7280', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Clear
          </button>
        )}
        <div style={{ display: 'flex', gap: '0.3rem', marginLeft: 'auto' }}>
          <button
            onClick={() => setEditing(false)}
            disabled={submitting}
            style={{ padding: '0.25rem 0.6rem', background: '#FFF', border: '1px solid #D1D5DB', borderRadius: 4, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={submitting || ((draftResult === 'lost' || draftResult === 'abandoned') && !draftReason.trim())}
            style={{ padding: '0.25rem 0.7rem', background: 'var(--color-brand-navy)', color: '#FFF', border: 0, borderRadius: 4, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
