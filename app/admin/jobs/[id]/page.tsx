// app/admin/jobs/[id]/page.tsx — Job detail view with tabs
'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
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

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [stageHistory, setStageHistory] = useState<{ from_stage?: string; to_stage: string; changed_by: string; notes?: string; created_at: string }[]>([]);
  const [files, setFiles] = useState<{ id: string; file_name: string; file_type: string; file_url?: string; file_size?: number; section: string; description?: string; uploaded_by: string; uploaded_at: string; is_backup: boolean }[]>([]);
  const [research, setResearch] = useState<{ id: string; category: string; title: string; content?: string; source?: string; reference_number?: string; date_of_record?: string; added_by: string; created_at: string }[]>([]);
  const [timeEntries, setTimeEntries] = useState<{ id: string; user_email: string; user_name?: string; work_type: string; start_time: string; end_time?: string; duration_minutes?: number; description?: string; billable: boolean }[]>([]);
  const [payments, setPayments] = useState<{ id: string; amount: number; payment_type: string; payment_method?: string; reference_number?: string; notes?: string; paid_at: string; recorded_by: string }[]>([]);
  const [checklists, setChecklists] = useState<{ id: string; stage: string; item: string; is_completed: boolean; completed_by?: string; completed_at?: string }[]>([]);
  const [fieldData, setFieldData] = useState<{ id: string; data_type: string; point_name?: string; northing?: number; easting?: number; elevation?: number; description?: string; collected_by: string; collected_at: string }[]>([]);

  const loadJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/jobs?id=${jobId}`);
      if (res.ok) {
        const data = await res.json();
        setJob(data.job);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [jobId]);

  useEffect(() => { loadJob(); }, [loadJob]);

  // Load tab-specific data on tab change
  useEffect(() => {
    if (!jobId) return;
    if (activeTab === 'overview') {
      fetch(`/api/admin/jobs/stages?job_id=${jobId}`).then(r => r.json()).then(d => setStageHistory(d.history || [])).catch(() => {});
      fetch(`/api/admin/jobs/checklists?job_id=${jobId}`).then(r => r.json()).then(d => setChecklists(d.checklists || [])).catch(() => {});
    }
    if (activeTab === 'research') {
      fetch(`/api/admin/jobs/research?job_id=${jobId}`).then(r => r.json()).then(d => setResearch(d.research || [])).catch(() => {});
    }
    if (activeTab === 'fieldwork') {
      fetch(`/api/admin/jobs/field-data?job_id=${jobId}`).then(r => r.json()).then(d => setFieldData(d.field_data || [])).catch(() => {});
    }
    if (activeTab === 'files') {
      fetch(`/api/admin/jobs/files?job_id=${jobId}`).then(r => r.json()).then(d => setFiles(d.files || [])).catch(() => {});
    }
    if (activeTab === 'financial') {
      fetch(`/api/admin/jobs/payments?job_id=${jobId}`).then(r => r.json()).then(d => setPayments(d.payments || [])).catch(() => {});
      fetch(`/api/admin/jobs/time?job_id=${jobId}`).then(r => r.json()).then(d => setTimeEntries(d.entries || [])).catch(() => {});
    }
  }, [activeTab, jobId]);

  async function advanceStage(toStage: string) {
    await fetch('/api/admin/jobs/stages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, to_stage: toStage }),
    });
    loadJob();
    fetch(`/api/admin/jobs/stages?job_id=${jobId}`).then(r => r.json()).then(d => setStageHistory(d.history || [])).catch(() => {});
  }

  async function addTeamMember(email: string, name: string, role: string) {
    await fetch('/api/admin/jobs/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, user_email: email, user_name: name, role }),
    });
    loadJob();
  }

  async function removeTeamMember(id: string) {
    await fetch(`/api/admin/jobs/team?id=${id}`, { method: 'DELETE' });
    loadJob();
  }

  async function changeTeamRole(id: string, role: string) {
    await fetch('/api/admin/jobs/team', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, role }),
    });
    loadJob();
  }

  async function addEquipment(name: string, type: string, serial: string) {
    await fetch('/api/admin/jobs/equipment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, equipment_name: name, equipment_type: type, serial_number: serial }),
    });
    loadJob();
  }

  async function returnEquipment(id: string) {
    await fetch('/api/admin/jobs/equipment', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, returned: true }),
    });
    loadJob();
  }

  async function uploadFile(file: { file_name: string; file_type: string; file_url: string; file_size: number; section: string; description: string }) {
    await fetch('/api/admin/jobs/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, ...file }),
    });
    fetch(`/api/admin/jobs/files?job_id=${jobId}`).then(r => r.json()).then(d => setFiles(d.files || [])).catch(() => {});
  }

  async function deleteFile(id: string) {
    await fetch(`/api/admin/jobs/files?id=${id}`, { method: 'DELETE' });
    fetch(`/api/admin/jobs/files?job_id=${jobId}`).then(r => r.json()).then(d => setFiles(d.files || [])).catch(() => {});
  }

  async function addResearch(item: { category: string; title: string; content: string; source: string; reference_number: string }) {
    await fetch('/api/admin/jobs/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, ...item }),
    });
    fetch(`/api/admin/jobs/research?job_id=${jobId}`).then(r => r.json()).then(d => setResearch(d.research || [])).catch(() => {});
  }

  async function deleteResearch(id: string) {
    await fetch(`/api/admin/jobs/research?id=${id}`, { method: 'DELETE' });
    fetch(`/api/admin/jobs/research?job_id=${jobId}`).then(r => r.json()).then(d => setResearch(d.research || [])).catch(() => {});
  }

  async function toggleChecklist(id: string, completed: boolean) {
    await fetch('/api/admin/jobs/checklists', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_completed: completed }),
    });
    fetch(`/api/admin/jobs/checklists?job_id=${jobId}`).then(r => r.json()).then(d => setChecklists(d.checklists || [])).catch(() => {});
  }

  async function loadChecklistTemplate(stage: string) {
    await fetch('/api/admin/jobs/checklists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, stage, use_template: true }),
    });
    fetch(`/api/admin/jobs/checklists?job_id=${jobId}`).then(r => r.json()).then(d => setChecklists(d.checklists || [])).catch(() => {});
  }

  async function addTimeEntry(entry: { work_type: string; duration_minutes: number; description: string }) {
    await fetch('/api/admin/jobs/time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, start_time: new Date().toISOString(), ...entry }),
    });
    fetch(`/api/admin/jobs/time?job_id=${jobId}`).then(r => r.json()).then(d => setTimeEntries(d.entries || [])).catch(() => {});
    loadJob();
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
          <div className="job-detail__fieldwork">
            <div className="job-detail__section">
              <h3>Field Data Collection</h3>
              <p className="job-detail__section-desc">
                Live field data from Trimble instruments will appear here. Points, observations, and measurements
                are streamed in real-time as the field crew collects data.
              </p>
            </div>

            {/* Field data table */}
            <div className="job-detail__field-data">
              <div className="job-detail__field-data-header">
                <h4>Collected Points ({fieldData.length})</h4>
              </div>
              {fieldData.length === 0 ? (
                <div className="job-detail__field-data-empty">
                  <span>📡</span>
                  <p>No field data collected yet</p>
                  <p className="job-detail__field-data-sub">Data will appear here when field crew begins collection</p>
                </div>
              ) : (
                <div className="job-detail__field-data-table">
                  <div className="job-detail__field-data-row job-detail__field-data-row--header">
                    <span>Point</span>
                    <span>Northing</span>
                    <span>Easting</span>
                    <span>Elev</span>
                    <span>Description</span>
                    <span>Time</span>
                  </div>
                  {fieldData.map(pt => (
                    <div key={pt.id} className="job-detail__field-data-row">
                      <span>{pt.point_name || '—'}</span>
                      <span>{pt.northing?.toFixed(3) || '—'}</span>
                      <span>{pt.easting?.toFixed(3) || '—'}</span>
                      <span>{pt.elevation?.toFixed(3) || '—'}</span>
                      <span>{pt.description || '—'}</span>
                      <span>{new Date(pt.collected_at).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Trimble Integration Info */}
            <div className="job-detail__section" style={{ marginTop: '1rem' }}>
              <h3>Trimble Integration</h3>
              <div className="job-detail__integration-cards">
                <div className="job-detail__integration-card">
                  <span className="job-detail__integration-icon">📡</span>
                  <h4>Trimble Access</h4>
                  <p>Real-time data streaming from field instruments</p>
                  <span className="job-detail__integration-status">Not Connected</span>
                </div>
                <div className="job-detail__integration-card">
                  <span className="job-detail__integration-icon">💻</span>
                  <h4>Trimble Business Center</h4>
                  <p>Process and adjust field data</p>
                  <span className="job-detail__integration-status">Not Connected</span>
                </div>
                <div className="job-detail__integration-card">
                  <span className="job-detail__integration-icon">☁️</span>
                  <h4>Trimble Connect</h4>
                  <p>Cloud file sync and collaboration</p>
                  <span className="job-detail__integration-status">Not Connected</span>
                </div>
              </div>
            </div>
          </div>
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
            <li>Field Work: collected points table, Trimble integration cards (placeholder)</li>
            <li>Files: upload/download/delete with sections and types, auto-backup</li>
            <li>Financial: quote/payment summary, payment history, time tracker with user breakdown</li>
            <li>Messages: placeholder for job-specific messaging thread</li>
          </ul>
        </div>
        <div className="msg-setup-guide__section">
          <h3>Continuation Prompt</h3>
          <pre className="msg-setup-guide__prompt">{`Continue developing the Job Detail page at /admin/jobs/[id]/page.tsx. Current: tabbed view with overview, research, fieldwork, files, financial, messages tabs. All components are functional with API integration.

NEXT STEPS:
1. Connect job messages tab to the messaging system (auto-create conversation for job, link via conversation_id)
2. Add inline editing for job fields (click to edit name, description, client info, etc.)
3. Implement Trimble Access integration for real-time field data streaming
4. Add map tab showing job location, collected points, and boundary
5. Add AutoCAD/DWG file preview using Autodesk Platform Services (APS) Viewer
6. Add photo gallery for field images with GPS location overlay
7. Add job activity feed showing all changes, stage transitions, file uploads, messages
8. Add print/export job summary as PDF
9. Add weather widget for field work planning (integrate weather API)
10. Add job duplication (clone job with similar parameters)
11. Add job comparison tool (compare two jobs side-by-side)
12. Add voice memo recording and playback in Research tab
13. Add satellite imagery viewer with measurement tools
14. Implement job-specific notifications (team members get alerts for updates)`}</pre>
        </div>
      </div>
    </>
  );
}
