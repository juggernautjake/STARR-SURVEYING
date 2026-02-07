// app/admin/jobs/[id]/page.tsx — Job detail view with tabs
'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import { usePageError } from '../../hooks/usePageError';
import Link from 'next/link';
import UnderConstruction from '../../components/messaging/UnderConstruction';
import JobStageTimeline from '../../components/jobs/JobStageTimeline';
import JobTeamPanel from '../../components/jobs/JobTeamPanel';
import JobFileManager from '../../components/jobs/JobFileManager';
import JobEquipmentList from '../../components/jobs/JobEquipmentList';
import JobResearchPanel from '../../components/jobs/JobResearchPanel';
import JobChecklist from '../../components/jobs/JobChecklist';
import JobQuoteBuilder from '../../components/jobs/JobQuoteBuilder';
import JobTimeTracker from '../../components/jobs/JobTimeTracker';
import FieldWorkView from '../../components/jobs/FieldWorkView';
import type { FieldPoint, JobContext } from '../../components/jobs/FieldWorkView';
import { STAGE_CONFIG, SURVEY_TYPES } from '../../components/jobs/JobCard';

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
  created_at: string;
  team: { id: string; user_email: string; user_name?: string; role: string; assigned_at: string; notes?: string }[];
  tags: string[];
  equipment: { id: string; equipment_name: string; equipment_type?: string; serial_number?: string; checked_out_at?: string; returned_at?: string; checked_out_by?: string; notes?: string }[];
  file_count: number;
  total_hours: number;
}

const TABS = [
  { key: 'overview', label: 'Overview', icon: '📋' },
  { key: 'research', label: 'Research', icon: '🔍' },
  { key: 'fieldwork', label: 'Field Work', icon: '🏗️' },
  { key: 'files', label: 'Files', icon: '📁' },
  { key: 'financial', label: 'Financial', icon: '💰' },
  { key: 'messages', label: 'Messages', icon: '💬' },
];

export default function JobDetailPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;
  const { safeFetch, safeAction, reportPageError } = usePageError('JobDetailPage');

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [stageHistory, setStageHistory] = useState<{ from_stage?: string; to_stage: string; changed_by: string; notes?: string; created_at: string }[]>([]);
  const [files, setFiles] = useState<{ id: string; file_name: string; file_type: string; file_url?: string; file_size?: number; section: string; description?: string; uploaded_by: string; uploaded_at: string; is_backup: boolean }[]>([]);
  const [research, setResearch] = useState<{ id: string; category: string; title: string; content?: string; source?: string; reference_number?: string; date_of_record?: string; added_by: string; created_at: string }[]>([]);
  const [timeEntries, setTimeEntries] = useState<{ id: string; user_email: string; user_name?: string; work_type: string; start_time: string; end_time?: string; duration_minutes?: number; description?: string; billable: boolean }[]>([]);
  const [payments, setPayments] = useState<{ id: string; amount: number; payment_type: string; payment_method?: string; reference_number?: string; notes?: string; paid_at: string; recorded_by: string }[]>([]);
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

  // Load tab-specific data on tab change
  useEffect(() => {
    if (!jobId) return;
    if (activeTab === 'overview') {
      fetch(`/api/admin/jobs/stages?job_id=${jobId}`).then(r => r.json()).then(d => setStageHistory(d.history || [])).catch((err: unknown) => { reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load stage history' }); });
      fetch(`/api/admin/jobs/checklists?job_id=${jobId}`).then(r => r.json()).then(d => setChecklists(d.checklists || [])).catch((err: unknown) => { reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load checklists' }); });
    }
    if (activeTab === 'research') {
      fetch(`/api/admin/jobs/research?job_id=${jobId}`).then(r => r.json()).then(d => setResearch(d.research || [])).catch((err: unknown) => { reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load research' }); });
    }
    if (activeTab === 'fieldwork') {
      loadFieldData();
    }
    if (activeTab === 'files') {
      fetch(`/api/admin/jobs/files?job_id=${jobId}`).then(r => r.json()).then(d => setFiles(d.files || [])).catch((err: unknown) => { reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load files' }); });
    }
    if (activeTab === 'financial') {
      fetch(`/api/admin/jobs/payments?job_id=${jobId}`).then(r => r.json()).then(d => setPayments(d.payments || [])).catch((err: unknown) => { reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load payments' }); });
      fetch(`/api/admin/jobs/time?job_id=${jobId}`).then(r => r.json()).then(d => setTimeEntries(d.entries || [])).catch((err: unknown) => { reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load time entries' }); });
    }
  }, [activeTab, jobId]);

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

  return (
    <>
      <UnderConstruction
        feature="Job Detail"
        description="Full job view with stage tracking, crew management, research, field work, files, financials, and job messaging."
      />

      {/* Job Header */}
      <div className="job-detail__header">
        <Link href="/admin/jobs" className="learn__back">&larr; Back to Jobs</Link>
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
          <span className="job-detail__stage-badge" style={{ background: stageInfo.color + '20', color: stageInfo.color }}>
            {stageInfo.icon} {stageInfo.label}
          </span>
        </div>

        {/* Quick stats */}
        <div className="job-detail__stats">
          <div className="job-detail__stat">
            <span className="job-detail__stat-value">{job.team.length}</span>
            <span className="job-detail__stat-label">Team</span>
          </div>
          <div className="job-detail__stat">
            <span className="job-detail__stat-value">{job.file_count}</span>
            <span className="job-detail__stat-label">Files</span>
          </div>
          <div className="job-detail__stat">
            <span className="job-detail__stat-value">{job.total_hours}h</span>
            <span className="job-detail__stat-label">Time</span>
          </div>
          <div className="job-detail__stat">
            <span className="job-detail__stat-value">${(job.quote_amount || 0).toLocaleString()}</span>
            <span className="job-detail__stat-label">Quote</span>
          </div>
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
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`job-detail__tab ${activeTab === tab.key ? 'job-detail__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="job-detail__tab-icon">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="job-detail__content">
        {activeTab === 'overview' && (
          <div className="job-detail__overview">
            <div className="job-detail__overview-grid">
              <div className="job-detail__overview-main">
                {/* Description */}
                {job.description && (
                  <div className="job-detail__section">
                    <h3>Description</h3>
                    <p>{job.description}</p>
                  </div>
                )}

                {/* Property Details */}
                <div className="job-detail__section">
                  <h3>Property Details</h3>
                  <div className="job-detail__props">
                    {job.address && <div className="job-detail__prop"><strong>Address:</strong> {job.address}{job.city && `, ${job.city}`}{job.state && `, ${job.state}`} {job.zip}</div>}
                    {job.county && <div className="job-detail__prop"><strong>County:</strong> {job.county}</div>}
                    {job.lot_number && <div className="job-detail__prop"><strong>Lot:</strong> {job.lot_number}</div>}
                    {job.subdivision && <div className="job-detail__prop"><strong>Subdivision:</strong> {job.subdivision}</div>}
                    {job.abstract_number && <div className="job-detail__prop"><strong>Abstract:</strong> {job.abstract_number}</div>}
                    {job.acreage && <div className="job-detail__prop"><strong>Acreage:</strong> {job.acreage}</div>}
                  </div>
                </div>

                {/* Client */}
                {job.client_name && (
                  <div className="job-detail__section">
                    <h3>Client</h3>
                    <div className="job-detail__props">
                      <div className="job-detail__prop"><strong>Name:</strong> {job.client_name}</div>
                      {job.client_email && <div className="job-detail__prop"><strong>Email:</strong> {job.client_email}</div>}
                      {job.client_phone && <div className="job-detail__prop"><strong>Phone:</strong> {job.client_phone}</div>}
                      {job.client_company && <div className="job-detail__prop"><strong>Company:</strong> {job.client_company}</div>}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {job.notes && (
                  <div className="job-detail__section">
                    <h3>Notes</h3>
                    <p>{job.notes}</p>
                  </div>
                )}

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

        {activeTab === 'research' && (
          <JobResearchPanel
            research={research}
            onAdd={addResearch}
            onDelete={deleteResearch}
          />
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

        {activeTab === 'financial' && (
          <div className="job-detail__financial">
            <JobQuoteBuilder
              quoteAmount={job.quote_amount}
              finalAmount={job.final_amount}
              amountPaid={job.amount_paid}
              paymentStatus={job.payment_status}
              payments={payments}
              editable={true}
            />
            <JobTimeTracker
              entries={timeEntries}
              totalHours={job.total_hours}
              onAdd={addTimeEntry}
            />
          </div>
        )}

        {activeTab === 'messages' && (
          <div className="job-detail__messages">
            <div className="job-detail__section">
              <h3>Job Thread</h3>
              <p className="job-detail__section-desc">
                This is a dedicated messaging thread for this job. All team members assigned to the job
                can communicate, share updates, and coordinate field work here.
              </p>
              <div className="job-detail__messages-placeholder">
                <span>💬</span>
                <p>Job messaging thread will be connected to the internal messaging system.</p>
                <p className="job-detail__field-data-sub">Each job gets its own conversation where team members can coordinate.</p>
                <Link href="/admin/messages" className="jobs-page__btn jobs-page__btn--secondary">
                  Go to Messages
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Setup Guide */}
      <div className="msg-setup-guide">
        <h2 className="msg-setup-guide__title">Job Detail — Development Guide</h2>
        <div className="msg-setup-guide__section">
          <h3>Current Capabilities</h3>
          <ul className="msg-setup-guide__list">
            <li>Full job detail view with header, stats, tags</li>
            <li>Stage timeline with advance button and history</li>
            <li>6 tabs: Overview, Research, Field Work, Files, Financial, Messages</li>
            <li>Overview: property details, client info, notes, stage checklist (with templates), team panel, equipment list</li>
            <li>Research: categorized research documents (14 categories) with add/expand/delete</li>
            <li>Field Work: interactive point map (SVG) with zoom/pan, shot log with search, timeline slider with session markers, point detail popup on double-click, bi-directional selection highlighting, toggleable map labels, live polling support</li>
            <li>Files: upload/download/delete with sections and types, auto-backup</li>
            <li>Financial: quote/payment summary, payment history, time tracker with user breakdown</li>
            <li>Messages: placeholder for job-specific messaging thread</li>
          </ul>
        </div>
        <div className="msg-setup-guide__section">
          <h3>Remaining Work</h3>
          <ul className="msg-setup-guide__list">
            <li><strong>Trimble Integration:</strong> Connect Trimble Access API for real-time point streaming via WebSocket or polling. Map instrument serial numbers to equipment inventory.</li>
            <li><strong>Satellite Imagery:</strong> Integrate a tile map provider (Mapbox, Google Maps, or ESRI) for satellite background on point map. Requires API key and coordinate transformation (State Plane → WGS84).</li>
            <li><strong>Messages Tab:</strong> Auto-create a conversation for the job, link via conversation_id column, embed messaging thread.</li>
            <li><strong>Inline Editing:</strong> Click-to-edit for job name, description, client info, property details.</li>
            <li><strong>DWG/CAD Preview:</strong> Autodesk Platform Services (APS) Viewer for .dwg file preview in Files tab.</li>
            <li><strong>Photo Gallery:</strong> GPS-tagged field images with location overlay on point map.</li>
            <li><strong>Activity Feed:</strong> Chronological log of all changes, stage transitions, file uploads, messages.</li>
            <li><strong>PDF Export:</strong> Print/export job summary as PDF report.</li>
            <li><strong>Weather Widget:</strong> Weather forecast for field work planning.</li>
            <li><strong>Point Import:</strong> CSV/TXT import for bulk field data from Trimble data collectors (.dc, .job files).</li>
          </ul>
        </div>
        <div className="msg-setup-guide__section">
          <h3>Continuation Prompt</h3>
          <pre className="msg-setup-guide__prompt">{`Continue developing the Job Detail page at /admin/jobs/[id]/page.tsx.

CURRENT STATE: Tabbed view with 6 tabs. Field Work tab has full interactive visualization:
- SVG point map with zoom/pan, colored dots by data type, toggleable labels
- Shot log panel with search, click/double-click selection, accuracy/RTK badges
- Timeline slider with session break markers (30min gap detection)
- Point detail popup showing all coordinates, quality metrics, observations
- Live polling toggle for real-time data updates (5-second interval)
- Bi-directional highlighting between map and log

FIELD DATA STRUCTURE (job_field_data table):
- id, job_id, data_type (point/observation/measurement/gps_position/total_station/photo/note)
- point_name, northing, easting, elevation, description
- raw_data JSONB: { accuracy, rtk_status, pdop, hdop, vdop, satellites, code, session_id, hz_angle, vt_angle, slope_dist }
- collected_by, collected_at, instrument

NEXT PRIORITY STEPS:
1. Connect Trimble Access API for real-time field data streaming (WebSocket or SSE)
2. Add satellite imagery overlay (Mapbox GL JS or Google Maps) with coordinate transformation
3. Connect messages tab to internal messaging system (auto-create conversation)
4. Add CSV/TXT point import for bulk data from Trimble data collectors
5. Add field photo capture with GPS tagging and map overlay
6. Build job activity feed (track all changes chronologically)
7. Add PDF export for job summary report
8. Inline editing for job metadata fields`}</pre>
        </div>
      </div>
    </>
  );
}
