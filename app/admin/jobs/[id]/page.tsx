// app/admin/jobs/[id]/page.tsx — one job, as a hub (owner, 2026-11-11).
//
// "I want to get rid of the workflow model for the jobs and projects. Instead, I want it to just be a
// hub. The hub will have a job home with … widgets that the user can click … at the top you will have
// a bar with the job number, … the address, the customer, the deadline, and the quote … I am trying to
// remove UI elements and put the most important things up front and put the less important things in
// places where they can be found, but don't take visual precedence over the important stuff."
//
// So the page is two things:
//   1. The job header — who, where, when, how much. Always on screen.
//   2. Job home — one tile per part of the job. A tile opens that part in place; "Job home" (or any
//      icon in the strip beside it) goes back or across. The less-used parts — Schedule, Field work,
//      Messages — are a quiet "More" row under the tiles, and Export PDF / Delete sit at the foot of
//      Job info.
//
// The stage timeline and the ten-tab strip are gone. The stage still exists (the jobs list and the
// calendar read it); it is changed from the Job status widget. Every panel inside a widget is one
// that already existed — this page rearranges them, it does not re-implement them.
//
// The open widget is in the address as `?tab=` (the name it has always had), so a reload, a link, or
// the explorer's reopen-the-video memory lands back in the same place. Old tab names still resolve.
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import { usePageError } from '../../hooks/usePageError';
import Link from 'next/link';
import {
  ClipboardList, CalendarDays, Search, HardHat, Folder, DollarSign, Activity,
  MessageSquare, Trash2, Download, Files, Circle, Map as MapIcon, ArrowLeft,
  MapPin, User, Phone, FileText, ArrowUpRight, Users, Plus, StickyNote, Tag, ListChecks, Wrench,
  Check, Play, Pause, XCircle, GitCommitVertical, type LucideIcon,
} from 'lucide-react';
import JobTeamPanel from '../../components/jobs/JobTeamPanel';
import FolderExplorer from '../../components/files/FolderExplorer';
import { markJobSeen } from '@/lib/admin/use-new-jobs';
import { usePageTitle } from '@/lib/admin/page-title';
import { useBackTarget } from '@/lib/admin/back-target';
import { formatDate, dueBubble } from '@/lib/admin/listing';
import '@/app/admin/components/listing/Listing.css';
// LR6 of lead-reply-expansion-2026-06-18.md — back-link card to the
// originating lead so the running conversation isn't lost after
// conversion.
import PropertyPanel, { type PropertyFields } from './PropertyPanel';
import JobOriginatingLead from './JobOriginatingLead';
import JobResearchPacket from './JobResearchPacket';
import JobEquipmentList from '../../components/jobs/JobEquipmentList';
import JobResearchPanel from '../../components/jobs/JobResearchPanel';
import InlineEditField from '../../components/jobs/InlineEditField';
import { jobMapsUrl, hasJobLocation, telHref } from '@/lib/jobs/location';
import JobActivityFeed from '../../components/jobs/JobActivityFeed';
import JobMessagesPanel from '../../components/jobs/JobMessagesPanel';
import JobPhaseScheduler from './JobPhaseScheduler';
// contacts plan Slice 6 (2026-05-30) — job ↔ contact linking.
import LinkContactDialog from '../../components/jobs/LinkContactDialog';
import { JOB_CONTACT_ROLES } from '@/lib/contacts/labels';
import { exportJobPdf } from '../../components/jobs/jobPdf';
import JobChecklist from '../../components/jobs/JobChecklist';
import JobQuoteBuilder from '../../components/jobs/JobQuoteBuilder';
import JobMoneyPanel from '../../components/jobs/JobMoneyPanel';
import JobTimeTracker from '../../components/jobs/JobTimeTracker';
import FieldWorkView from '../../components/jobs/FieldWorkView';
import type { FieldPoint, JobContext } from '../../components/jobs/FieldWorkView';
import JobInstructionsPanel from '../../components/jobs/JobInstructionsPanel';
import JobFieldMediaPanel from '../../components/jobs/JobFieldMediaPanel';
import JobNotesPanel from '../../components/jobs/JobNotesPanel';
import { STAGE_CONFIG, SURVEY_TYPES } from '../../components/jobs/JobCard';
import { withAlpha, chipInk } from '@/lib/admin/color-alpha';
import '../../components/hub/Hub.css';

interface Job {
  id: string;
  job_number: string;
  project_id?: string;
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
  property_id?: string | null;
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


/** What can be open: job home, one of the widgets, or one of the "More" views. */
type ViewKey =
  | 'home' | 'info' | 'status' | 'research' | 'files' | 'financial'
  | 'schedule' | 'fieldwork' | 'messages';

interface Widget {
  /** `map` is not a view: the interactive map is its own page, so its tile is a link straight there. */
  key: Exclude<ViewKey, 'home'> | 'map';
  label: string;
  Icon: LucideIcon;
  blurb: string;
}

/** The six tiles on job home, in the order a person reaches for them. Documents and Photos & videos
 *  were folded into Files (owner, 2026-11-11: "just have files. so we will have just 6 widgets"). */
const WIDGETS: Widget[] = [
  { key: 'research', label: 'Research', Icon: Search, blurb: 'Deeds, plats, prior surveys and research runs for this property.' },
  { key: 'map', label: 'Interactive map', Icon: MapIcon, blurb: 'The property on satellite, with points, photos and notes pinned to it.' },
  { key: 'files', label: 'Files', Icon: Folder, blurb: 'Documents, photos, videos, CAD and research — every file for this job, in its folders.' },
  { key: 'info', label: 'Job info', Icon: ClipboardList, blurb: 'Property, client, contacts, notes, team and equipment.' },
  { key: 'status', label: 'Job status', Icon: Activity, blurb: 'Where the job stands, and everything that has happened on it.' },
  { key: 'financial', label: 'Financial', Icon: DollarSign, blurb: 'Money made and money spent on this job.' },
];

/** Found, not featured: a quiet row under the tiles. */
const MORE: Widget[] = [
  { key: 'schedule', label: 'Schedule', Icon: CalendarDays, blurb: 'Pick the days for research, field work and drawing.' },
  { key: 'fieldwork', label: 'Field work', Icon: HardHat, blurb: 'Crew instructions, field notes, captured media and the shot log.' },
  { key: 'messages', label: 'Messages', Icon: MessageSquare, blurb: 'The message thread for this job.' },
];

const VIEWS: Widget[] = [...WIDGETS, ...MORE];

/** `?tab=` → the view, including every name the old tab strip used, so old links still land. */
function viewFromTab(tab: string | null): { view: ViewKey; folder?: string } | null {
  switch (tab) {
    case null: case '': return null;
    case 'overview': case 'propertymap': return { view: 'home' };
    // Documents and Photos & videos live in Files now; old links open the matching folder.
    case 'photos': case 'media': return { view: 'files', folder: 'photos' };
    case 'videos': return { view: 'files', folder: 'videos' };
    case 'documents': return { view: 'files', folder: 'documents' };
    case 'activity': return { view: 'status' };
    case 'cad': return { view: 'files', folder: 'cad' };
    default: return VIEWS.some((w) => w.key === tab && w.key !== 'map') ? { view: tab as ViewKey } : null;
  }
}

/** Job info's section links, in page order. */
const INFO_SECTIONS: Array<{ id: string; label: string; Icon: LucideIcon }> = [
  { id: 'about', label: 'About', Icon: FileText },
  { id: 'property', label: 'Property', Icon: MapPin },
  { id: 'client', label: 'Client', Icon: User },
  { id: 'contacts', label: 'Contacts', Icon: Users },
  { id: 'notes', label: 'Notes', Icon: StickyNote },
  { id: 'checklist', label: 'Checklist', Icon: ListChecks },
  { id: 'team', label: 'Team', Icon: Users },
  { id: 'equipment', label: 'Equipment', Icon: Wrench },
];

/** The stages a job moves through, in order. On hold and Cancelled are side states, not steps. */
const PIPELINE = ['quote', 'research', 'fieldwork', 'drawing', 'legal', 'delivery', 'completed'];

/** "3 days", "today" — how long since `iso`. */
function daysSince(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (!Number.isFinite(d) || d <= 0) return 'today';
  return d === 1 ? '1 day' : `${d} days`;
}

const money = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export default function JobDetailPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user?.roles || []).includes('admin');
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;
  const { safeFetch, safeAction, reportPageError } = usePageError('JobDetailPage');

  const [job, setJob] = useState<Job | null>(null);
  // The bar says which job this is, not "Job Detail" (owner, 2026-09-10).
  usePageTitle(job ? [job.job_number, job.name].filter(Boolean).join(' — ') : null);
  const [loading, setLoading] = useState(true);
  /** Job home, or the widget that is open. */
  const [view, setView] = useState<ViewKey>('home');
  /** Every file under the job, reported by the explorer after each load — the Files badge. */
  const [filesTotal, setFilesTotal] = useState<number | null>(null);
  /** The folder the Files widget should open on (an upload into one folder shows that folder). */
  const [filesFolder, setFilesFolder] = useState<string | null>(null);
  /** Every tab's count, fetched once on load so the strip is informative before anything is opened. */
  const [tabCountsLoaded, setTabCountsLoaded] = useState<Record<string, number>>({});
  /** Does this job have an interactive property map yet, and how many points are on it? The whole
   *  reason `?summary=1` exists: the button must not pay for the map to decide what to say. */
  const [propertyMap, setPropertyMap] = useState<{ exists: boolean; mapId: string | null; title: string | null; points: number } | null>(null);
  // contacts plan Slice 6 — linked-contacts state for the overview tab.
  const [contactLinks, setContactLinks] = useState<Array<{
    id: string; role: string; notes?: string | null;
    contact_id: string;
    contacts: { id: string; name: string; company: string | null; email: string | null; phone: string | null } | null;
  }>>([]);
  const [showLinkContactDialog, setShowLinkContactDialog] = useState(false);
  const [stageHistory, setStageHistory] = useState<{ from_stage?: string; to_stage: string; changed_by: string; notes?: string; created_at: string }[]>([]);
  /** The project this job belongs to (2026-08-19). Loaded separately so a slow projects query can
   *  never delay the job itself — the header simply shows no parent until it arrives. */
  const [project, setProject] = useState<{ id: string; project_number: string | null; name: string } | null>(null);
  // You reach a job from its project, so "Back to …" goes to the jobs in that project (owner,
  // 2026-11-11: "whenever I click the back to jobs button, it takes me back to the projects listing
  // page, not the jobs in that project page"). A job with no project keeps the address parent.
  useBackTarget(project ? { href: `/admin/projects/${project.id}`, label: project.project_number ? `${project.project_number} — ${project.name}` : project.name } : null);
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
        // Best-effort: a job renders fine without its parent's name, and a failure here must not
        // blank the page a person came to read.
        if (data.job?.project_id) {
          try {
            const pr = await fetch(`/api/admin/projects/${data.job.project_id}`);
            if (pr.ok) setProject((await pr.json()).project ?? null);
          } catch { /* the header just omits the parent */ }
        }
      }
    } catch (err) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load job' });
    }
    setLoading(false);
  }, [jobId, reportPageError]);

  useEffect(() => { loadJob(); }, [loadJob]);

  // Counts for every tab, once, on load. Separate from `loadJob` so a slow count query can never
  // delay the job itself — the badges simply read 0 until they arrive, which is also what they
  // would read if the answer really were zero.
  const loadCounts = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/jobs/counts?job_id=${encodeURIComponent(jobId)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data?.counts) setTabCountsLoaded(data.counts as Record<string, number>);
    } catch {
      /* a badge is a hint; its absence is not worth reporting to the user */
    }
  }, [jobId]);

  useEffect(() => { void loadCounts(); }, [loadCounts]);

  // Opening the job is reviewing it (owner, 2026-09-10): the NEW bubbles and the bell entry clear.
  useEffect(() => { if (jobId) markJobSeen(jobId); }, [jobId]);

  // …and a view moves the job (and its project) to the top of their lists (owner, 2026-10-11).
  // Fire-and-forget: a list order is never worth failing a page open over.
  useEffect(() => {
    if (jobId) void fetch(`/api/admin/jobs/${encodeURIComponent(jobId)}/open`, { method: 'POST' }).catch(() => undefined);
  }, [jobId]);

  // Inline-edit save: PUT the single changed field, then patch local
  // state so the UI reflects it without a full reload. Throws on
  // failure so InlineEditField can surface the message + roll back.
  /**
   * Write several fields at once.
   *
   * The inline editors each save one field, which is right for one field. A property is not one
   * field: picking an address fills six of them, and sending six requests is six chances for half
   * of it to land and for the page to end up describing a property that does not exist.
   */
  const saveFields = useCallback(async (patch: Record<string, string | number | null>) => {
    const res = await fetch('/api/admin/jobs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: jobId, ...patch }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
    setJob((prev) => (prev ? { ...prev, ...(patch as Record<string, never>) } : prev));
  }, [jobId]);

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
  // recoverable for 30 days from the all-jobs "Deleted" view), then
  // route back to the list.
  const [deletingJob, setDeletingJob] = useState(false);
  const handleDeleteJob = useCallback(async () => {
    if (!job) return;
    const ok = window.confirm(
      `Delete "${job.name}"?\n\n` +
      `It will be moved to the trash and stays recoverable for 30 days ` +
      `(restore it from Jobs → "Deleted"), then it's permanently removed.`,
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

  /** Open a view. The Files widget can be asked to open on one of its folders. */
  const openView = useCallback((next: ViewKey, folder?: string | null) => {
    if (folder !== undefined) setFilesFolder(folder);
    setView(next);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }, []);

  // ── THE OPEN WIDGET IS IN THE ADDRESS (owner, 2026-11-09, kept for the hub) ─────────────────
  // A video open in an explorer has to survive the page being rebuilt behind it (see
  // FolderExplorer's OPEN_KEY), so `?tab=` is read once on arrival and kept current with
  // replaceState — no navigation, no history entry per click, and a link to a widget works.
  const tabFromUrl = useRef(false);
  useEffect(() => {
    if (tabFromUrl.current) return;
    tabFromUrl.current = true;
    const v = viewFromTab(new URLSearchParams(window.location.search).get('tab'));
    if (v) { if (v.folder) setFilesFolder(v.folder); setView(v.view); }
  }, []);
  useEffect(() => {
    if (!tabFromUrl.current) return;
    const url = new URL(window.location.href);
    if (view === 'home') url.searchParams.delete('tab'); else url.searchParams.set('tab', view);
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url.href);
  }, [view]);

  // The map tile carries the point count, so the (tiny) summary is fetched once, wherever you land.
  useEffect(() => {
    if (!jobId) return;
    fetch(`/api/admin/jobs/${jobId}/property-map?summary=1`).then(r => r.json()).then(d => setPropertyMap(d)).catch((err: unknown) => { reportPageError(err instanceof Error ? err : new Error(String(err)), { element: 'load property map summary' }); });
  }, [jobId, reportPageError]);

  // Load what the open view needs, when it opens.
  useEffect(() => {
    if (!jobId) return;

    function handleError(err: unknown, element: string) {
      reportPageError(err instanceof Error ? err : new Error(String(err)), { element });
    }

    if (view === 'info') {
      fetch(`/api/admin/jobs/checklists?job_id=${jobId}`).then(r => r.json()).then(d => setChecklists(d.checklists || [])).catch((err: unknown) => { handleError(err, 'load checklists'); });
      // contacts plan Slice 6 — linked contacts for the Contacts panel.
      fetch(`/api/admin/jobs/contacts?job_id=${jobId}`).then(r => r.json()).then(d => setContactLinks(d.links || [])).catch((err: unknown) => { handleError(err, 'load contacts'); });
    }
    if (view === 'status') {
      fetch(`/api/admin/jobs/stages?job_id=${jobId}`).then(r => r.json()).then(d => setStageHistory(d.history || [])).catch((err: unknown) => { handleError(err, 'load stage history'); });
    }
    if (view === 'research') {
      fetch(`/api/admin/jobs/research?job_id=${jobId}`).then(r => r.json()).then(d => setResearch(d.research || [])).catch((err: unknown) => { handleError(err, 'load research'); });
    }
    if (view === 'fieldwork') {
      fetch(`/api/admin/jobs/field-data?job_id=${jobId}`).then(r => r.json()).then(d => setFieldData(d.field_data || [])).catch((err: unknown) => { handleError(err, 'load field data'); });
    }
    if (view === 'financial') {
      fetch(`/api/admin/jobs/payments?job_id=${jobId}`).then(r => r.json()).then(d => setPayments(d.payments || [])).catch((err: unknown) => { handleError(err, 'load payments'); });
      fetch(`/api/admin/jobs/time?job_id=${jobId}`).then(r => r.json()).then(d => setTimeEntries(d.entries || [])).catch((err: unknown) => { handleError(err, 'load time entries'); });
      // Receipts/expenses linked to this job (admin/bookkeeper only — the
      // receipts API is admin-gated, so skip the call for other roles to
      // avoid a guaranteed 403).
      if (isAdmin) {
        fetch(`/api/admin/receipts?jobId=${jobId}&limit=200`).then(r => r.ok ? r.json() : { receipts: [] }).then(d => setJobReceipts(d.receipts || [])).catch((err: unknown) => { handleError(err, 'load job receipts'); });
      }
    }
  }, [view, jobId, isAdmin, reportPageError]);

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
  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--theme-fg-muted, #9CA3AF)' }}>Loading job...</div>;
  if (!job) return <div style={{ padding: '2rem', textAlign: 'center' }}>Job not found. <Link href="/admin/jobs">Back to Jobs</Link></div>;

  const stageInfo = STAGE_CONFIG[job.stage] || STAGE_CONFIG.quote;
  const stagesNewestFirst = [...stageHistory].sort((x, y) => y.created_at.localeCompare(x.created_at));
  /** When the job entered its current stage, from the history. */
  const stageSince = stagesNewestFirst.find((h) => h.to_stage === job.stage)?.created_at ?? null;
  /** Where "Resume" goes from On hold / Cancelled: the last real stage before it, else Quote. */
  const resumeStage = stagesNewestFirst.find((h) => PIPELINE.includes(h.to_stage))?.to_stage ?? 'quote';
  const jobTitle = job.job_number ? `${job.job_number} — ${job.name}` : job.name;

  // ── the header's four facts ──
  const street = [job.address, job.city].filter(Boolean).join(', ');
  const locale = [job.state, job.zip].filter(Boolean).join(' ');
  const mapsUrl = hasJobLocation(job) ? jobMapsUrl(job) : null;
  const customer = job.client_name || job.client_company || null;
  const due = dueBubble(job.deadline);
  const quoted = job.final_amount ?? job.quote_amount ?? null;

  // ── what each tile says under its name ──
  const photos = tabCountsLoaded.photos ?? 0;
  const videos = tabCountsLoaded.videos ?? 0;
  const researchCount = research.length || tabCountsLoaded.research || 0;
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const tileMeta: Partial<Record<Widget['key'], string>> = {
    research: plural(researchCount, 'research item'),
    map: propertyMap?.exists && propertyMap.points > 0 ? plural(propertyMap.points, 'point') : 'Open the map',
    files: [plural(filesTotal ?? job.file_count ?? 0, 'file'), photos ? plural(photos, 'photo') : null, videos ? plural(videos, 'video') : null].filter(Boolean).join(' · '),
    info: [SURVEY_TYPES[job.survey_type] || job.survey_type, job.acreage ? `${job.acreage} acres` : null].filter(Boolean).join(' · '),
    status: job.result ? `${stageInfo.label} · ${job.result}` : stageInfo.label,
    financial: quoted != null ? `${money(job.amount_paid ?? 0)} paid of ${money(quoted)}` : 'No quote yet',
  };

  // ── money made and money spent (the Financial widget) ──
  const received = job.amount_paid ?? payments.reduce((s, p) => s + (p.amount || 0), 0);
  const spent = jobReceipts.filter((r) => r.status !== 'rejected').reduce((s, r) => s + (r.total_cents || 0), 0) / 100;

  const current = VIEWS.find((w) => w.key === view) ?? null;

  /** One tile on job home. The map is a link to its own page; everything else opens in place. */
  const renderTile = (w: Widget) => {
    const body = (
      <>
        <span className={`jh__tile-icon jh__tile-icon--${w.key}`} aria-hidden><w.Icon size={22} strokeWidth={1.9} /></span>
        <span className="jh__tile-body">
          <span className="jh__tile-name">{w.label}{w.key === 'map' && <ArrowUpRight size={14} aria-hidden className="jh__tile-out" />}</span>
          <span className="jh__tile-blurb">{w.blurb}</span>
          {tileMeta[w.key] && <span className="jh__tile-meta">{tileMeta[w.key]}</span>}
        </span>
      </>
    );
    return (
      <li key={w.key}>
        {w.key === 'map' ? (
          <Link href={`/admin/map?job=${jobId}`} className="jh__tile" data-testid="job-widget-map">{body}</Link>
        ) : (
          <button type="button" className="jh__tile" onClick={() => openView(w.key as ViewKey)} data-testid={`job-widget-${w.key}`}>{body}</button>
        )}
      </li>
    );
  };

  return (
    <div className="jh">
      {/* ── THE JOB HEADER: which job, where, for whom, by when, for how much ── */}
      <header className="jh__header" data-testid="job-header">
        <div className="jh__title-row">
          <div className="jh__title">
            <span className="jh__number">{job.job_number}</span>
            <h1 className="jh__name">
              {job.is_priority && <Circle size={11} fill="currentColor" className="jh__priority" aria-label="Priority" />}
              {job.name}
            </h1>
          </div>
          {/* No Upload button here (owner, 2026-11-11) — it lives in Files and Photos & videos. */}
        </div>
        <dl className="jh__facts">
          <div className="jh__fact jh__fact--address">
            <dt><MapPin size={13} aria-hidden /> Address</dt>
            <dd>
              {street || locale ? <>{street}{street && locale ? ', ' : ''}{locale}</> : <span className="jh__muted">No address yet</span>}
              {mapsUrl && <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="jh__fact-link">Directions</a>}
            </dd>
          </div>
          <div className="jh__fact">
            <dt><User size={13} aria-hidden /> Customer</dt>
            <dd>
              {customer ?? <span className="jh__muted">—</span>}
              {job.client_name && job.client_company && <span className="jh__sub">{job.client_company}</span>}
              {telHref(job.client_phone) && <a href={telHref(job.client_phone)} className="jh__fact-link"><Phone size={12} aria-hidden /> {job.client_phone}</a>}
            </dd>
          </div>
          <div className="jh__fact">
            <dt><CalendarDays size={13} aria-hidden /> Deadline</dt>
            <dd>
              {job.deadline ? formatDate(job.deadline) : <span className="jh__muted">—</span>}
              {due && <span className={`lst-bubble lst-bubble--${due.tone}`}>{due.label}</span>}
            </dd>
          </div>
          <div className="jh__fact">
            <dt><DollarSign size={13} aria-hidden /> {job.final_amount != null ? 'Final amount' : 'Quote'}</dt>
            <dd className="jh__money">{money(quoted)}</dd>
          </div>
        </dl>
      </header>

      {view === 'home' || !current ? (
        /* ── JOB HOME ── */
        <div className="jh__home">
          <ul className="jh__tiles jh__tiles--six" aria-label="Job sections">{WIDGETS.map(renderTile)}</ul>
          <div className="jh__more" aria-label="More">
            <span className="jh__more-label">More</span>
            {MORE.map((w) => (
              <button key={w.key} type="button" className="jh__more-btn" onClick={() => openView(w.key as ViewKey)} title={w.blurb} data-testid={`job-widget-${w.key}`}>
                <w.Icon size={14} aria-hidden /> {w.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* ── ONE WIDGET, OPEN ── */
        <section className="jh__open" aria-label={current.label}>
          <div className="jh__viewbar">
            <button type="button" className="jh__back" onClick={() => openView('home')} data-testid="job-home">
              <ArrowLeft size={16} aria-hidden /> Job home
            </button>
            <h2 className="jh__viewtitle"><current.Icon size={18} aria-hidden /> {current.label}</h2>
            <nav className="jh__switch" aria-label="Go to">
              {WIDGETS.map((w) => (w.key === 'map' ? (
                <Link key={w.key} href={`/admin/map?job=${jobId}`} className="jh__switch-btn" title={w.label} aria-label={w.label}><w.Icon size={16} aria-hidden /></Link>
              ) : (
                <button key={w.key} type="button" className={`jh__switch-btn${view === w.key ? ' jh__switch-btn--on' : ''}`} onClick={() => openView(w.key as ViewKey)} title={w.label} aria-label={w.label} aria-current={view === w.key ? 'page' : undefined}>
                  <w.Icon size={16} aria-hidden />
                </button>
              )))}
            </nav>
          </div>

          <div className="jh__view">
            {view === 'research' && (
              <div className="jh__stack">
                <div className="job-research-start">
                  <div>
                    <strong>Research this property</strong>
                    <p>
                      STARR RECON searches the county records for this property, pre-filled from this job&apos;s
                      address, parcel and owner. Every document it retrieves is filed in the Research folder below.
                    </p>
                  </div>
                  <Link className="job-research-start__btn" href={`/admin/research/start?job=${jobId}`} data-testid="job-research-header">
                    <Search size={14} strokeWidth={2} aria-hidden /> Start research
                  </Link>
                </div>
                {/* The approved research packet, on the job (plan R26). */}
                <JobResearchPacket jobId={jobId} />
                <FolderExplorer
                  rootId={`mnt:jobs:${jobId}`}
                  title={jobTitle}
                  initialFolder="research"
                  uploads={false}
                  folderExtras={{ research: <JobResearchPanel research={research} onAdd={addResearch} onDelete={deleteResearch} /> }}
                />
              </div>
            )}

            {view === 'files' && (
              <FolderExplorer
                rootId={`mnt:jobs:${jobId}`}
                title={jobTitle}
                initialFolder={filesFolder}
                onTotalChange={setFilesTotal}
                folderExtras={{
                  research: <JobResearchPanel research={research} onAdd={addResearch} onDelete={deleteResearch} />,
                  cad: (
                    <div className="job-cad-start">
                      <div>
                        <strong>Starr CAD</strong>
                        <p>Draft this job&apos;s survey in the editor. Drawings you save stay linked to the job and are listed above; open one from the list.</p>
                      </div>
                      <a
                        href={`/admin/cad?job=${encodeURIComponent(jobId)}&job_name=${encodeURIComponent(job.name)}`}
                        className="jobs-page__btn jobs-page__btn--primary"
                        data-testid="job-new-drawing"
                      >
                        ✏️ New Drawing
                      </a>
                    </div>
                  ),
                  root: (
                    <p className="job-files__explorer-link">
                      <Link href="/admin/files" data-testid="job-all-files-link">
                        <Files size={13} aria-hidden /> Browse all files on the platform
                      </Link>
                      {project && (
                        <>
                          <span> · </span>
                          <Link href={`/admin/files?node=mnt:projects:${project.id}`} data-testid="job-project-files-link">
                            Everything in {project.project_number ?? 'this project'}
                          </Link>
                        </>
                      )}
                    </p>
                  ),
                }}
              />
            )}

            {view === 'info' && (
              /* ── JOB INFO (owner, 2026-11-11: "more appealing and easier to navigate") ──
                 A row of section links on top; then cards — the job itself, the property, the client
                 and everyone else involved, notes and the checklist on the left; the people and the
                 equipment on the right; the rarely-used actions last. */
              <div className="ji" data-testid="job-info">
                <nav className="ji__jump" aria-label="Sections">
                  {INFO_SECTIONS.map((sec) => (
                    <a key={sec.id} href={`#ji-${sec.id}`} className="ji__jump-link" onClick={(e) => { e.preventDefault(); document.getElementById(`ji-${sec.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                      <sec.Icon size={14} aria-hidden /> {sec.label}
                    </a>
                  ))}
                </nav>

                <div className="ji__grid">
                  <div className="ji__main">
                    <section id="ji-about" className="ji__card">
                      <h3 className="ji__card-title"><FileText size={16} aria-hidden /> About this job</h3>
                      {/* LR6 — the lead this job came from; renders nothing when there was none. */}
                      <JobOriginatingLead jobId={jobId} />
                      <dl className="ji__fields">
                        <div className="ji__field ji__field--wide">
                          <dt>Description</dt>
                          <dd><InlineEditField value={job.description} type="textarea" ariaLabel="description" emptyLabel="Add a description…" onSave={(v) => saveField('description', v)} /></dd>
                        </div>
                        <div className="ji__field ji__field--wide">
                          <dt>Deliverables</dt>
                          <dd><InlineEditField value={job.deliverables} type="textarea" ariaLabel="deliverables" emptyLabel="What does this job deliver? (boundary survey, topo, ALTA cert, …)" onSave={(v) => saveField('deliverables', v)} /></dd>
                        </div>
                        <div className="ji__field">
                          <dt>Survey type</dt>
                          <dd>{SURVEY_TYPES[job.survey_type] || job.survey_type || <span className="jh__muted">—</span>}</dd>
                        </div>
                        <div className="ji__field">
                          <dt>Opened</dt>
                          <dd>{formatDate(job.created_at)}</dd>
                        </div>
                      </dl>
                    </section>

                    {/* The property: one panel with one Edit; picking a suggested address fills the
                        city, state, ZIP, county and the coordinates the map opens on. */}
                    <section id="ji-property" className="ji__slot">
                      <PropertyPanel jobId={jobId} job={job as unknown as PropertyFields} mapsUrl={mapsUrl} onSave={saveFields} />
                    </section>

                    <section id="ji-client" className="ji__card">
                      <h3 className="ji__card-title"><User size={16} aria-hidden /> Client</h3>
                      <dl className="ji__fields">
                        <div className="ji__field"><dt>Name</dt><dd><InlineEditField value={job.client_name} ariaLabel="client name" emptyLabel="Add client name" onSave={(v) => saveField('client_name', v)} /></dd></div>
                        <div className="ji__field"><dt>Company</dt><dd><InlineEditField value={job.client_company} ariaLabel="client company" emptyLabel="Add company" onSave={(v) => saveField('client_company', v)} /></dd></div>
                        <div className="ji__field"><dt>Email</dt><dd><InlineEditField value={job.client_email} type="email" ariaLabel="client email" emptyLabel="Add email" onSave={(v) => saveField('client_email', v)} /></dd></div>
                        <div className="ji__field">
                          <dt>Phone</dt>
                          <dd>
                            <InlineEditField value={job.client_phone} type="tel" ariaLabel="client phone" emptyLabel="Add phone" onSave={(v) => saveField('client_phone', v)} />
                            {telHref(job.client_phone) && <a href={telHref(job.client_phone)} className="ji__call" title="Call this number"><Phone size={13} aria-hidden /> Call</a>}
                          </dd>
                        </div>
                        <div className="ji__field"><dt>Deadline</dt><dd><InlineEditField value={job.deadline ? job.deadline.slice(0, 10) : ''} type="date" ariaLabel="deadline" emptyLabel="Add a deadline" onSave={(v) => saveField('deadline', v)} /></dd></div>
                        <div className="ji__field"><dt>Quote</dt><dd><InlineEditField value={job.quote_amount != null ? String(job.quote_amount) : ''} ariaLabel="quote" emptyLabel="Add a quote" onSave={(v) => saveField('quote_amount', v)} /></dd></div>
                      </dl>
                    </section>

                    {/* contacts plan Slice 6 — realtors, lenders and anyone else linked to the job. */}
                    <section id="ji-contacts" className="ji__card">
                      <div className="ji__card-head">
                        <h3 className="ji__card-title"><Users size={16} aria-hidden /> Contacts <span className="ji__count">{contactLinks.length}</span></h3>
                        <button type="button" className="jh__btn" onClick={() => setShowLinkContactDialog(true)}><Plus size={14} aria-hidden /> Link a contact</button>
                      </div>
                      {contactLinks.length === 0 ? (
                        <p className="ji__empty">No contacts linked yet. Link a realtor, lender, or anyone else involved in this job.</p>
                      ) : (
                        <ul className="jh__contacts">
                          {contactLinks.map((link) => (
                            <li key={link.id} className="jh__contact">
                              <div className="jh__contact-main">
                                {link.contacts ? (
                                  <Link href={`/admin/contacts/${link.contacts.id}`} className="jh__contact-name">{link.contacts.name}</Link>
                                ) : (
                                  <span>(contact no longer exists)</span>
                                )}
                                <span className="jh__chip">{JOB_CONTACT_ROLES.find((r) => r.id === link.role)?.label ?? link.role}</span>
                                {(link.contacts?.company || link.contacts?.email) && (
                                  <span className="jh__sub">
                                    {link.contacts.company ?? ''}
                                    {link.contacts.company && link.contacts.email ? ' · ' : ''}
                                    {link.contacts.email ?? ''}
                                  </span>
                                )}
                                {telHref(link.contacts?.phone) && (
                                  <a href={telHref(link.contacts?.phone)} className="ji__call" title={`Call ${link.contacts?.name ?? 'this contact'}`}><Phone size={13} aria-hidden /> {link.contacts?.phone}</a>
                                )}
                              </div>
                              <button
                                type="button"
                                className="jh__btn jh__btn--quiet"
                                onClick={async () => {
                                  if (!link.contacts) return;
                                  if (!window.confirm(`Unlink ${link.contacts.name} from this job?`)) return;
                                  const params = new URLSearchParams({ job_id: jobId, contact_id: link.contact_id, role: link.role });
                                  const res = await fetch(`/api/admin/jobs/contacts?${params}`, { method: 'DELETE' });
                                  if (!res.ok) return;
                                  setContactLinks((cur) => cur.filter((l) => l.id !== link.id));
                                }}
                                aria-label="Unlink contact"
                              >
                                Unlink
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    <section id="ji-notes" className="ji__card">
                      <h3 className="ji__card-title"><StickyNote size={16} aria-hidden /> Notes</h3>
                      <div className="ji__notes">
                        <InlineEditField value={job.notes} type="textarea" ariaLabel="notes" emptyLabel="Add notes…" onSave={(v) => saveField('notes', v)} />
                      </div>
                    </section>

                    <section id="ji-checklist" className="ji__slot">
                      <JobChecklist items={checklists} stage={job.stage} onToggle={toggleChecklist} onLoadTemplate={loadChecklistTemplate} />
                    </section>
                  </div>

                  <aside className="ji__side">
                    <section id="ji-team" className="ji__slot">
                      <JobTeamPanel team={job.team} onAdd={addTeamMember} onRemove={removeTeamMember} onChangeRole={changeTeamRole} editable={true} />
                    </section>
                    <section id="ji-equipment" className="ji__slot">
                      <JobEquipmentList equipment={job.equipment} onAdd={addEquipment} onReturn={returnEquipment} editable={true} />
                    </section>
                    {job.tags.length > 0 && (
                      <section className="ji__card">
                        <h3 className="ji__card-title"><Tag size={16} aria-hidden /> Tags</h3>
                        <div className="job-detail__tags">{job.tags.map((tag) => <span key={tag} className="job-card__tag">{tag}</span>)}</div>
                      </section>
                    )}
                    {/* Rarely needed, so last and quiet. */}
                    <section className="ji__card ji__card--quiet">
                      <h3 className="ji__card-title">More actions</h3>
                      <div className="ji__actions">
                        <button
                          type="button"
                          className="jh__btn"
                          onClick={() => exportJobPdf({
                            ...job,
                            counts: { files: job.file_count, photos: tabCountsLoaded.photos, drawings: tabCountsLoaded.cad, research: research.length || undefined, hours: job.total_hours },
                          })}
                          title="Download a one-page job summary PDF"
                        >
                          <Download size={14} aria-hidden /> Export PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteJob()}
                          disabled={deletingJob}
                          title="Delete this job (recoverable for 30 days)"
                          className="jh__btn jh__btn--danger"
                        >
                          <Trash2 size={14} aria-hidden /> {deletingJob ? 'Deleting…' : 'Delete job'}
                        </button>
                      </div>
                    </section>
                  </aside>
                </div>
              </div>
            )}

            {view === 'status' && (
              /* ── JOB STATUS (owner, 2026-11-11: "more appealing and easier to navigate") ──
                 Where the job is, as a row of steps you can click to move it; how long it has been
                 there; the numbers; then its history — the status changes as a timeline beside
                 everything else that has happened on the job. */
              <div className="jst" data-testid="job-status">
                <section className="jst__hero">
                  <div className="jst__hero-top">
                    <div className="jst__now">
                      <span className="jst__eyebrow">Current status</span>
                      <span className="jst__stage" style={{ background: withAlpha(stageInfo.color, 12.55), color: chipInk(stageInfo.color) }}>
                        <span aria-hidden>{stageInfo.icon}</span> {stageInfo.label}
                      </span>
                      {stageSince && <span className="jh__sub">since {formatDate(stageSince)} · {daysSince(stageSince)}</span>}
                    </div>
                    <div className="jst__hero-actions">
                      <JobResultControl
                        jobId={job.id}
                        currentResult={job.result ?? null}
                        currentReason={job.result_reason ?? null}
                        onUpdate={(r, reason) => setJob((cur) => cur ? { ...cur, result: r, result_reason: reason } : cur)}
                      />
                    </div>
                  </div>

                  {/* The pipeline. A step behind is done (✓), the current one is lit; click any to move the job. */}
                  <ol className="jst__steps" aria-label="Stages — click one to move the job there">
                    {PIPELINE.map((k, i) => {
                      const cfg = STAGE_CONFIG[k];
                      const at = PIPELINE.indexOf(job.stage);
                      const state = at < 0 ? 'next' : i < at ? 'done' : i === at ? 'now' : 'next';
                      return (
                        <li key={k} className={`jst__step jst__step--${state}`}>
                          <button
                            type="button"
                            onClick={() => { if (k !== job.stage) void advanceStage(k); }}
                            aria-current={state === 'now' ? 'step' : undefined}
                            title={state === 'now' ? `${cfg.label} — the current stage` : `Move the job to ${cfg.label}`}
                            data-testid={`job-stage-step-${k}`}
                          >
                            <span className="jst__step-dot" style={state === 'now' ? { background: cfg.color } : undefined}>
                              {state === 'done' ? <Check size={13} aria-hidden /> : i + 1}
                            </span>
                            <span className="jst__step-label">{cfg.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>

                  <div className="jst__aside">
                    {job.stage === 'on_hold' || job.stage === 'cancelled' ? (
                      <button type="button" className="jh__btn" onClick={() => void advanceStage(resumeStage)} data-testid="job-stage-resume">
                        <Play size={14} aria-hidden /> Resume at {STAGE_CONFIG[resumeStage]?.label ?? 'Quote'}
                      </button>
                    ) : (
                      <>
                        <button type="button" className="jh__btn jh__btn--quiet" onClick={() => void advanceStage('on_hold')} data-testid="job-stage-hold">
                          <Pause size={14} aria-hidden /> Put on hold
                        </button>
                        <button type="button" className="jh__btn jh__btn--quiet jh__btn--danger" onClick={() => { if (window.confirm('Mark this job as cancelled?')) void advanceStage('cancelled'); }} data-testid="job-stage-cancel">
                          <XCircle size={14} aria-hidden /> Cancel job
                        </button>
                      </>
                    )}
                  </div>
                </section>

                <dl className="jst__stats">
                  <div><dt>Open for</dt><dd>{daysSince(job.created_at)}</dd></div>
                  <div><dt>Team</dt><dd>{job.team.length}</dd></div>
                  <div><dt>Files</dt><dd>{job.file_count}</dd></div>
                  <div><dt>Hours logged</dt><dd>{job.total_hours}h</dd></div>
                </dl>

                <div className="jst__cols">
                  <section className="ji__card">
                    <h3 className="ji__card-title"><GitCommitVertical size={16} aria-hidden /> Status timeline</h3>
                    <ol className="jst__timeline">
                      {stagesNewestFirst.map((h, i) => {
                        const cfg = STAGE_CONFIG[h.to_stage];
                        return (
                          <li key={i} className="jst__tl-item">
                            <span className="jst__tl-dot" style={{ background: cfg?.color ?? 'var(--theme-fg-muted, #94A3B8)' }} aria-hidden />
                            <div className="jst__tl-body">
                              <strong>{cfg?.label ?? h.to_stage}</strong>
                              {h.from_stage && <span className="jh__sub"> from {STAGE_CONFIG[h.from_stage]?.label ?? h.from_stage}</span>}
                              <span className="jst__tl-meta">{new Date(h.created_at).toLocaleString()}{h.changed_by ? ` · ${h.changed_by}` : ''}</span>
                              {h.notes && <span className="jst__tl-note">{h.notes}</span>}
                            </div>
                          </li>
                        );
                      })}
                      <li className="jst__tl-item">
                        <span className="jst__tl-dot jst__tl-dot--start" aria-hidden />
                        <div className="jst__tl-body">
                          <strong>Job opened</strong>
                          <span className="jst__tl-meta">{new Date(job.created_at).toLocaleString()}</span>
                        </div>
                      </li>
                    </ol>
                  </section>

                  {/* Everything that has happened on the job — uploads, renames, payments, edits — newest first. */}
                  <section className="ji__card">
                    <h3 className="ji__card-title"><Activity size={16} aria-hidden /> Everything that&apos;s happened</h3>
                    <JobActivityFeed jobId={jobId} />
                  </section>
                </div>
              </div>
            )}

            {view === 'financial' && (
              <div className="job-detail__financial">
                <dl className="jh__money-summary" data-testid="job-money-summary">
                  <div><dt>Quoted</dt><dd>{money(quoted)}</dd></div>
                  <div><dt>Money in</dt><dd className="jh__in">{money(received)}</dd></div>
                  <div><dt>Money spent</dt><dd className="jh__out">{isAdmin ? money(spent) : '—'}</dd></div>
                  <div><dt>Net so far</dt><dd>{isAdmin ? money(received - spent) : '—'}</dd></div>
                </dl>
                {!isAdmin && <p className="jh__muted">Spending comes from receipts, which only admins can see.</p>}
                {/* Bid, received, owed — plus down payments, price history and cancellation, all from
                    one arithmetic source (lib/jobs/money.ts). */}
                <JobMoneyPanel jobId={jobId} onChanged={loadJob} />
                <JobQuoteBuilder
                  quoteAmount={job.quote_amount}
                  finalAmount={job.final_amount}
                  amountPaid={job.amount_paid}
                  paymentStatus={job.payment_status}
                  payments={payments}
                  editable={true}
                  onUpdateQuote={(val) => { void saveField('quote_amount', String(val)); }}
                />
                {isAdmin && (
                  <div className="jh__card">
                    <div className="jh__section-head">
                      <h3 className="jh__card-title">Money spent — expenses &amp; receipts</h3>
                      <span className="jh__money">{money(spent)}</span>
                    </div>
                    {jobReceipts.length === 0 ? (
                      <p className="jh__muted">No receipts are linked to this job yet. Receipts submitted against this job appear here.</p>
                    ) : (
                      <ul className="jh__receipts">
                        {jobReceipts.map((r) => (
                          <li key={r.id} className="jh__receipt">
                            <div className="jh__receipt-main">
                              <strong>{r.vendor_name || 'Unknown vendor'}</strong>
                              <span className="jh__sub">
                                {r.category || 'uncategorized'}
                                {r.submitted_by_name || r.submitted_by_email ? ` · ${r.submitted_by_name || r.submitted_by_email}` : ''}
                                {r.transaction_at ? ` · ${new Date(r.transaction_at).toLocaleDateString()}` : ''}
                              </span>
                            </div>
                            <span className="jh__money">${((r.total_cents || 0) / 100).toFixed(2)}</span>
                            <span className={`jh__receipt-status jh__receipt-status--${r.status}`}>{r.status}</span>
                            {r.photo_signed_url
                              ? <a href={r.photo_signed_url} target="_blank" rel="noopener noreferrer">View</a>
                              : <span className="jh__muted">—</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                    <Link href="/admin/receipts" className="jh__fact-link">Manage all receipts →</Link>
                  </div>
                )}
                <JobTimeTracker entries={timeEntries} totalHours={job.total_hours} onAdd={addTimeEntry} />
              </div>
            )}

            {view === 'schedule' && (
              <JobPhaseScheduler jobId={jobId} jobName={job.name} jobAddress={job.address ?? null} selfEmail={session?.user?.email ?? ''} />
            )}

            {view === 'fieldwork' && (
              <>
                {/* C0c — RPLS-authored instructions for the crew. */}
                <JobInstructionsPanel jobId={jobId} />
                <JobNotesPanel jobId={jobId} />
                {/* C0d — mobile-captured field media (`job_media`). */}
                <JobFieldMediaPanel jobId={jobId} />
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
              </>
            )}

            {view === 'messages' && <JobMessagesPanel jobId={jobId} />}
          </div>
        </section>
      )}

      {showLinkContactDialog && (
        <LinkContactDialog
          open={showLinkContactDialog}
          jobId={jobId}
          jobName={job.name}
          onClose={() => setShowLinkContactDialog(false)}
          onLinked={() => {
            setShowLinkContactDialog(false);
            fetch(`/api/admin/jobs/contacts?job_id=${jobId}`)
              .then((r) => r.json())
              .then((d) => setContactLinks(d.links || []))
              .catch(() => { /* surfaced through the dialog already */ });
          }}
        />
      )}
    </div>
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
            style={{ fontSize: '0.74rem', background: 'none', border: 0, color: 'var(--theme-fg-secondary, #6B7280)', cursor: 'pointer', textDecoration: 'underline' }}
          >
            change
          </button>
        </div>
      );
    }
    return (
      // Was 29px tall with 11.8px type, sitting under three 35-40px controls in the same header —
      // and under the 40px a thumb needs. The dashed border stays: it is what says "nothing has
      // been decided yet" rather than "here is a value".
      <button
        onClick={() => setEditing(true)}
        className="job-detail__action job-detail__action--quiet"
        style={{ borderStyle: 'dashed' }}
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
            style={{ fontSize: '0.74rem', background: 'none', border: 0, color: 'var(--theme-fg-secondary, #6B7280)', cursor: 'pointer', textDecoration: 'underline' }}
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
            style={{ padding: '0.25rem 0.7rem', background: 'var(--color-brand-navy)', color: 'var(--theme-accent-fg, #FFF)', border: 0, borderRadius: 4, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
