// lib/activity/record-activity.ts — "what was touched last" and the change log, in words.
//
// Owner, 2026-10-11: the project and job lists should put whatever was last modified — a file
// uploaded, information changed — at the top, and *"it is more helpful to see jobs that are being
// actively viewed and modified."* Every file addition and change on a job or project is logged.
//
// The recording happens in the database (seeds/676): triggers on jobs, projects, job_files,
// job_file_folders and job_team keep `job_activity` / `project_activity` and append to
// `record_changes`, so the phone's direct uploads count the same as the website's. This file is the
// pure half — the order the lists use and how a change-log row reads. No I/O; the reads live in
// `record-activity-server.ts`.

/** One row of `job_activity` / `project_activity`. */
export interface ActivityStamp {
  last_modified_at: string | null;
  last_modified_by: string | null;
  last_viewed_at: string | null;
  last_viewed_by: string | null;
  last_activity_at: string | null;
}

/** One row of `record_changes`. */
export interface RecordChange {
  id: string;
  created_at: string;
  project_id: string | null;
  job_id: string | null;
  subject: 'project' | 'job' | 'file' | 'folder' | 'team';
  subject_id: string | null;
  action: string;
  actor: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  label: string | null;
}

/** The instant a list sorts by: the later of modified and viewed, falling back to the row's own
 *  timestamps for anything the activity table has not seen (a row created before seeds/676 and
 *  never touched since is still placed by when it was last edited, not dropped to the bottom). */
export function activityInstant(
  stamp: Partial<ActivityStamp> | null | undefined,
  row: { updated_at?: string | null; created_at?: string | null },
): string {
  return [stamp?.last_modified_at, stamp?.last_viewed_at, row.updated_at, row.created_at]
    .filter((x): x is string => typeof x === 'string' && x.length > 0)
    .sort()
    .pop() ?? '';
}

/** Newest activity first. Stable: equal instants keep their incoming order. */
export function sortByActivity<T extends { last_activity_at?: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => String(b.last_activity_at ?? '').localeCompare(String(a.last_activity_at ?? '')));
}

/** "Edited 5 min ago" / "Viewed 2 hr ago" — which of the two put the row where it is. */
export function activityLine(stamp: Partial<ActivityStamp> | null | undefined, now = Date.now()): string | null {
  const mod = stamp?.last_modified_at ?? null;
  const view = stamp?.last_viewed_at ?? null;
  if (!mod && !view) return null;
  const viewedLast = !!view && (!mod || view > mod);
  const at = (viewedLast ? view : mod) as string;
  return `${viewedLast ? 'Viewed' : 'Edited'} ${timeAgo(at, now)}`;
}

/** "just now", "5 min ago", "3 hr ago", "2 days ago", then a date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── How a change reads ──────────────────────────────────────────────────────────────────────────

const SUBJECT_NOUN: Record<RecordChange['subject'], string> = {
  project: 'Project', job: 'Job', file: 'File', folder: 'Folder', team: 'Team member',
};

const ACTION_VERB: Record<string, string> = {
  created: 'added', updated: 'updated', deleted: 'deleted', restored: 'restored',
  renamed: 'renamed', moved: 'moved', removed: 'removed', purged: 'permanently deleted',
};

/** Column → the name people use for it. Anything missing is shown with underscores as spaces. */
export const FIELD_LABELS: Record<string, string> = {
  name: 'Name', job_number: 'Job number', project_number: 'Project number', description: 'Description',
  address: 'Address', city: 'City', state: 'State', zip: 'ZIP', county: 'County',
  latitude: 'Latitude', longitude: 'Longitude', survey_type: 'Survey type', acreage: 'Acreage',
  lot_number: 'Lot', subdivision: 'Subdivision', abstract_number: 'Abstract', stage: 'Stage',
  status: 'Status', deadline: 'Deadline', quote_amount: 'Quote', final_amount: 'Final amount',
  amount_paid: 'Amount paid', payment_status: 'Payment status', payment_notes: 'Payment notes',
  client_name: 'Client', client_email: 'Client email', client_phone: 'Client phone',
  client_company: 'Client company', client_address: 'Client address', owner_name: 'Owner',
  lead_rpls_email: 'Lead RPLS', is_priority: 'Priority', is_archived: 'Archived', notes: 'Notes',
  instructions: 'Instructions', deliverables: 'Deliverables', result: 'Result',
  result_reason: 'Result reason', project_id: 'Project', customer_id: 'Customer',
  date_received: 'Date received', date_quoted: 'Date quoted', date_accepted: 'Date accepted',
  date_started: 'Date started', date_fieldwork_complete: 'Fieldwork complete',
  date_drawing_complete: 'Drawing complete', date_legal_complete: 'Legal complete',
  date_delivered: 'Delivered', geofence_radius_m: 'Geofence radius',
  file_name: 'File name', label: 'Label', tags: 'Tags', folder_id: 'Folder', section: 'Section',
  file_type: 'Type', job_id: 'Job', role: 'Role', is_crew_lead: 'Crew lead',
  removed_at: 'Removed', deleted_at: 'Deleted', is_deleted: 'Deleted', parent_key: 'Folder',
  parent_id: 'Folder',
};

/** Fields that are identifiers: say THAT they changed, never print a uuid at somebody. */
const OPAQUE = new Set(['project_id', 'customer_id', 'folder_id', 'job_id', 'parent_id', 'origin_lead_id', 'accepted_quote_id', 'conversation_id']);

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'blank';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (Array.isArray(v)) return v.length ? v.join(', ') : 'none';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

/** One line per field that moved: "Address: 12 Oak St → 14 Oak St". */
export function describeFieldChanges(changes: RecordChange['changes'] | null | undefined): string[] {
  if (!changes) return [];
  return Object.entries(changes)
    .filter(([k]) => k !== 'updated_at' && k !== 'change_actor')
    .map(([k, c]) => (OPAQUE.has(k)
      ? `${fieldLabel(k)} changed`
      : `${fieldLabel(k)}: ${show(c?.from)} → ${show(c?.to)}`));
}

export interface ChangeView {
  id: string;
  /** For the icon and the filter: `file_created`, `job_updated`, … */
  type: string;
  label: string;
  detail?: string;
  /** The individual field changes, for an edit. */
  fields: string[];
  actor: string;
  at: string;
  job_id: string | null;
}

/** A change-log row as a timeline entry: "File added — plat.pdf", "Job updated — Address: … → …". */
export function changeView(row: RecordChange): ChangeView {
  const fields = row.action === 'updated' || row.action === 'renamed' || row.action === 'moved'
    ? describeFieldChanges(row.changes)
    : [];
  // An edit to the job or project itself is described by its fields, not by its own name.
  const self = row.subject === 'job' || row.subject === 'project';
  const detail = self && row.action === 'updated'
    ? (fields.length === 1 ? fields[0] : `${fields.length} fields`)
    : row.label ?? undefined;
  return {
    id: `chg-${row.id}`,
    type: `${row.subject}_${row.action}`,
    label: `${SUBJECT_NOUN[row.subject] ?? row.subject} ${ACTION_VERB[row.action] ?? row.action}`,
    detail: detail || undefined,
    fields: self && row.action === 'updated' && fields.length === 1 ? [] : fields,
    actor: row.actor || 'system',
    at: row.created_at,
    job_id: row.job_id,
  };
}

/** The `activity_log` actions the change log now records itself. Older rows of these kinds are
 *  still shown (they predate the log); newer ones are dropped as duplicates — see
 *  `isCoveredByChangeLog`. */
export const LOG_ACTIONS_COVERED = new Set([
  'job_created', 'job_file_uploaded', 'job_photo_uploaded', 'job_file_deleted', 'job_file_restored',
  'job_file_updated', 'job_file_moved', 'job_file_copied', 'job_folder_created', 'job_folder_renamed',
  'job_folder_deleted', 'job_team_added', 'project_created', 'project_updated', 'project_deleted',
]);

/** True when an `activity_log` row happened after the change log began, so the change log already
 *  has it. `since` is when seeds/676 went live (`CHANGE_LOG_STARTED_AT`). */
export function isCoveredByChangeLog(action: string, at: string, since: string | null): boolean {
  return !!since && LOG_ACTIONS_COVERED.has(action) && at >= since;
}
