// lib/files/mounts.ts
//
// F9 of FILE_EXPLORER_2026-06-25 — surface existing file sources (receipts,
// job files, research documents, field media) as READ-ONLY virtual folders in
// the explorer, so "all files" are browsable in one tree. These never live in
// file_nodes: they're synthesized on read and capped at 'download' access, so
// no write path (rename/move/delete/permissions) can ever touch them. Each
// source is role-gated; the download route re-validates the same gate.

import { supabaseAdmin } from '@/lib/supabase';
import { shapeOf, displayName, mimeOf, sizeOf, bucketOf, type JobFileRow } from '@/lib/jobs/file-storage';
import { isImageMime, isPdfMime } from './upload';
import { STARR_DRAWING_MIME } from './kinds';
import type { AccessLevel, FileUser } from './permissions';

export const MOUNT_PREFIX = 'mnt:';

type SourceKey = 'receipts' | 'job-files' | 'research' | 'field-media' | 'drawings' | 'jobs' | 'projects';

interface MountSource {
  key: SourceKey;
  label: string;
  /** Roles (any-of) that may browse this source; admins always may. */
  roles: string[];
}

const SOURCES: MountSource[] = [
  { key: 'receipts', label: 'Receipts', roles: ['admin', 'developer'] },
  { key: 'job-files', label: 'Job Files', roles: ['admin', 'developer', 'field_crew'] },
  { key: 'research', label: 'Research Documents', roles: ['admin', 'developer', 'researcher', 'drawer'] },
  { key: 'field-media', label: 'Field Media', roles: ['admin', 'developer', 'field_crew'] },
  // F1 (2026-08-11) — the source the owner named that had no mount: *"find all of the drawings,
  // images, receipt images, jobs, folders, files, docs, and everything."*
  //
  // Drawings are UNLIKE the four above and the difference is not cosmetic: `cad_drawings.document`
  // is JSONB **in the database**, not an object in a storage bucket. There is no path to sign. See
  // `resolveMountFile` for how a download is synthesized instead, and `MountNode.open_href` for why
  // opening one in the CAD editor is the primary action rather than downloading it.
  { key: 'drawings', label: 'Drawings', roles: ['admin', 'developer', 'drawer'] },
  // ── Jobs (2026-08-19) — the arrangement the firm actually works in ────────────────────────────
  //
  // The five sources above are flat lists BY SOURCE TABLE: every receipt in one folder, every
  // drawing in another. That answers "show me all the receipts". It cannot answer *"show me
  // everything for job 24-103"*, which is the question a surveying firm asks all day — you have to
  // open the job and read five different tabs, each holding one kind of thing.
  //
  // So this mount is the same nodes under a different arrangement: job → kind → the items, where
  // each item carries the id of its OWN source mount (`mnt:receipts:…`, `mnt:job-files:…`). That is
  // the load-bearing decision here — download, preview and search keep working with no second code
  // path, and there is still exactly one place that knows how to resolve a receipt to bytes.
  //
  // Its roles are the UNION of the kinds it can contain, and that is only the door: each kind
  // re-applies its own gate below. Without that, a field crew member — who may see job files —
  // would reach receipts through a job folder that they cannot reach through the Receipts folder.
  // A permissions hole wearing a folder icon.
  { key: 'jobs', label: 'Jobs', roles: ['admin', 'developer', 'field_crew', 'drawer'] },
  // ── Projects (2026-08-19) — one level up from Jobs ────────────────────────────────────────────
  //
  // A project is the engagement: one client, one parcel, several jobs over months. The Jobs mount
  // answers *"everything for job 24-103"*; this answers *"everything for the Smith Tract"*, which
  // is the question asked when nobody remembers which of the four jobs a drawing was filed under.
  //
  // It reuses `jobKindNodes` verbatim, so a file appears with the SAME id it has everywhere else
  // (`mnt:job-files:…`) and download, preview and search need no third code path. The role gates
  // are the same ones too, applied per kind, per job — a project folder cannot widen access.
  { key: 'projects', label: 'Projects', roles: ['admin', 'developer', 'field_crew', 'drawer'] },
];

/** The kinds of thing a job folder can hold, in the order a job accumulates them.
 *
 *  `gate` names the SOURCE whose role gate applies — never a new gate of its own, so a kind cannot
 *  drift into being more permissive here than it is in its own folder. */
const JOB_KINDS = [
  { key: 'files', label: 'Files', gate: 'job-files' as SourceKey },
  { key: 'photos', label: 'Photos', gate: 'job-files' as SourceKey },
  { key: 'receipts', label: 'Receipts', gate: 'receipts' as SourceKey },
  { key: 'drawings', label: 'Drawings', gate: 'drawings' as SourceKey },
  { key: 'field-media', label: 'Field Media', gate: 'field-media' as SourceKey },
] as const;

type JobKind = (typeof JOB_KINDS)[number]['key'];

// ── Why there is no "Research" folder ────────────────────────────────────────────────────────────
//
// `job_research` is where the Research tab's rows live, and it is a table of RECORDS — a deed
// reference, a plat note, a legal description — not of files. `research_documents`, which does hold
// files, has **no `job_id` column at all**, so it cannot be scoped to a job; that was checked in the
// live schema rather than assumed. The one file-ish field a research row has is `file_id`, which
// points back into `job_files` — so those bytes are already in this job's Files folder, and a
// Research folder would list the same object twice under two different names.
//
// If research documents ever become job-scoped, this is a sixth entry in JOB_KINDS and nothing else.

export interface MountNode {
  id: string;
  parent_id: string | null;
  node_type: 'folder' | 'file';
  name: string;
  mime_type: string | null;
  size_bytes: number | null;
  updated_at: string;
  access: AccessLevel;
  /** F1 — where this node's natural "open" action goes, when that is a page rather than a download.
   *
   *  A CAD drawing is the case this exists for. Downloading a `.starr` JSON blob is not what anyone
   *  wants from a drawing; opening it in the editor is. Absent for every ordinary file, where the
   *  viewer and the download already say everything there is to say. */
  open_href?: string;
}

function canSee(source: MountSource, user: FileUser, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  const roles = new Set(user.roles.map((r) => r.toLowerCase()));
  return source.roles.some((r) => roles.has(r));
}

function mimeFromPath(path: string | null): string | null {
  if (!path) return null;
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext)) return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  if (ext === 'pdf') return 'application/pdf';
  // `video/mov` is not a real media type — a .mov is `video/quicktime`, which is what a browser
  // needs to see before it will play the file rather than offer to download it. Same for the other
  // container extensions a phone produces.
  const VIDEO_MIME: Record<string, string> = {
    mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime', webm: 'video/webm',
    mkv: 'video/x-matroska', avi: 'video/x-msvideo', '3gp': 'video/3gpp', '3g2': 'video/3gpp2',
  };
  if (VIDEO_MIME[ext]) return VIDEO_MIME[ext];
  if (['m4a', 'mp3', 'wav', 'ogg'].includes(ext)) return `audio/${ext}`;
  return null;
}

/** Video is previewable — the explorer's viewer plays it rather than offering a download. */
function isVideoMime(mime: string | null): boolean {
  return (mime ?? '').startsWith('video/');
}

const MEDIA_BUCKET: Record<string, string> = {
  photo: 'starr-field-photos',
  video: 'starr-field-videos',
  voice: 'starr-field-voice',
};

/** The read-only mount folders this user may see, as root-level nodes. */
export function mountRootNodes(user: FileUser, isAdmin: boolean): MountNode[] {
  return SOURCES.filter((s) => canSee(s, user, isAdmin)).map((s) => ({
    id: `${MOUNT_PREFIX}${s.key}`,
    parent_id: null,
    node_type: 'folder',
    name: s.label,
    mime_type: null,
    size_bytes: null,
    updated_at: '', // a source folder, not a dated node → the UI shows “—”
    access: 'view',
  }));
}

function dollars(cents: number | null | undefined): string {
  if (typeof cents !== 'number') return '';
  return ` — $${(cents / 100).toFixed(2)}`;
}
function shortDate(ts: string | null): string {
  return ts ? ts.slice(0, 10) : '';
}

export interface MountListResult {
  ok: boolean;
  status?: number;
  error?: string;
  name?: string;
  nodes?: MountNode[];
  /** The path back to the top, innermost last. Flat mounts return a single crumb; a job folder
   *  returns Jobs → the job → the kind, so somebody three levels in can still get out. */
  trail?: { id: string; name: string }[];
  /** A page this FOLDER corresponds to, when it has one. A job folder is a view of a job, and the
   *  job page is where the work happens — but clicking a folder's name must still open the folder,
   *  so this is surfaced as its own control rather than hijacking the click. */
  openHref?: string;
}

const LIMIT = 500;

/** List a mount folder's children (its source rows as read-only file nodes). */
export async function listMount(mountId: string, user: FileUser, isAdmin: boolean): Promise<MountListResult> {
  // `mnt:receipts` is one segment; `mnt:jobs:<jobId>:<kind>` is three. Job ids are UUIDs and kinds
  // are fixed slugs, so neither can contain a colon and splitting is unambiguous.
  const [rawKey, ...segments] = mountId.slice(MOUNT_PREFIX.length).split(':');
  const key = rawKey as SourceKey;
  const source = SOURCES.find((s) => s.key === key);
  if (!source) return { ok: false, status: 404, error: 'Unknown source.' };
  if (!canSee(source, user, isAdmin)) return { ok: false, status: 403, error: 'You do not have access to this source.' };

  if (key === 'jobs') return listJobsMount(segments, user, isAdmin);
  if (key === 'projects') return listProjectsMount(segments, user, isAdmin);

  // Every other source is a flat folder. Extra segments mean a FILE id was passed where a folder
  // was expected — listing the whole folder instead would quietly answer a different question.
  if (segments.length > 0) return { ok: false, status: 404, error: 'That is a file, not a folder.' };

  const file = (id: string, name: string, mime: string | null, size: number | null, updated: string): MountNode => ({
    id: `${MOUNT_PREFIX}${key}:${id}`,
    parent_id: mountId,
    node_type: 'file',
    name,
    mime_type: mime,
    size_bytes: size,
    updated_at: updated,
    access: 'download',
  });

  if (key === 'receipts') {
    const { data, error } = await supabaseAdmin
      .from('receipts')
      .select('id, photo_url, vendor_name, total_cents, created_at')
      .not('photo_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(LIMIT);
    if (error) return { ok: false, status: 500, error: error.message };
    const nodes = (data ?? []).map((r: { id: string; photo_url: string; vendor_name: string | null; total_cents: number | null; created_at: string }) =>
      file(r.id, `${r.vendor_name?.trim() || 'Receipt'}${dollars(r.total_cents)} (${shortDate(r.created_at)})`, mimeFromPath(r.photo_url), null, r.created_at),
    );
    return { ok: true, name: source.label, nodes };
  }

  if (key === 'job-files') {
    // ── THIS FOLDER USED TO BE STRUCTURALLY EMPTY ───────────────────────────────────────────────
    //
    // It selected only the MOBILE app's columns and filtered `upload_state = 'done'` with a
    // non-null `storage_path`. Every file uploaded from the job page had neither: that path wrote
    // `file_name` + `file_url` (the whole file, base64, in a text column). So the File Explorer's
    // "Job Files" folder could not show a single attachment the product had ever made — measured
    // against the live database, where the one existing row is exactly that shape.
    //
    // The web now writes storage objects too (`lib/jobs/file-storage.ts`), but the legacy rows are
    // real files somebody attached, so both are listed and `shapeOf` decides which is which.
    // Backups are excluded: a browser is for finding a file, and the `[BACKUP]` twin is the same
    // bytes under a louder name.
    const { data, error } = await supabaseAdmin
      .from('job_files')
      .select('id, file_name, name, file_url, storage_path, mime_type, content_type, file_size, file_size_bytes, file_node_id, created_at, uploaded_at')
      .eq('is_deleted', false)
      .eq('is_backup', false)
      .order('uploaded_at', { ascending: false, nullsFirst: false })
      .limit(LIMIT);
    if (error) return { ok: false, status: 500, error: error.message };
    type JobFileListRow = JobFileRow & { created_at: string | null; uploaded_at: string | null };
    const nodes = ((data ?? []) as unknown as JobFileListRow[])
      // A row with no bytes anywhere is not a file. It stays visible on the job page, where it can
      // be explained and deleted; a file browser listing a name that downloads nothing is worse.
      .filter((r: JobFileListRow) => shapeOf(r) !== 'missing')
      .map((r: JobFileListRow) =>
        file(
          r.id as string,
          displayName(r),
          mimeOf(r) ?? mimeFromPath(r.storage_path ?? null),
          sizeOf(r),
          r.uploaded_at ?? r.created_at ?? '',
        ),
      );
    return { ok: true, name: source.label, nodes };
  }

  if (key === 'research') {
    const { data, error } = await supabaseAdmin
      .from('research_documents')
      .select('id, original_filename, document_label, storage_path, file_type, file_size_bytes, created_at')
      .not('storage_path', 'is', null)
      .order('created_at', { ascending: false })
      .limit(LIMIT);
    if (error) return { ok: false, status: 500, error: error.message };
    const nodes = (data ?? []).map((r: { id: string; original_filename: string | null; document_label: string | null; storage_path: string; file_type: string | null; file_size_bytes: number | null; created_at: string }) =>
      file(r.id, r.document_label?.trim() || r.original_filename?.trim() || 'Document', mimeFromPath(r.storage_path) ?? (r.file_type ? `application/${r.file_type}` : null), r.file_size_bytes, r.created_at),
    );
    return { ok: true, name: source.label, nodes };
  }

  if (key === 'drawings') {
    // `document` is deliberately NOT selected. It is the entire serialised drawing, and pulling 500
    // of them to render a file list would move megabytes to print names. The size shown is the
    // feature/layer count instead of bytes, because bytes of a JSONB column is not a number that
    // means anything to a surveyor.
    const { data, error } = await supabaseAdmin
      .from('cad_drawings')
      .select('id, name, job_id, feature_count, layer_count, updated_at')
      .order('updated_at', { ascending: false })
      .limit(LIMIT);
    if (error) return { ok: false, status: 500, error: error.message };
    const nodes = (data ?? []).map(
      (r: {
        id: string;
        name: string;
        job_id: string | null;
        feature_count: number;
        layer_count: number;
        updated_at: string;
      }) => ({
        ...file(
          r.id,
          `${r.name?.trim() || 'Drawing'} (${r.feature_count} features, ${r.layer_count} layers)`,
          // A product-specific media type, NOT `application/json`.
          //
          // The display name deliberately carries no extension, so `kindOf`'s extension fallback
          // lands on "layers)" and files a drawing under "other" — caught by filtering a real search
          // for `kind=cad` and getting zero hits over three drawings that were plainly there. The
          // DOWNLOAD still serves `application/json`, which is what the bytes are; this is only how
          // the file is classified in the explorer.
          STARR_DRAWING_MIME,
          null,
          r.updated_at,
        ),
        open_href: `/admin/cad?drawing=${r.id}`,
      }),
    );
    return { ok: true, name: source.label, nodes };
  }

  // field-media
  const { data, error } = await supabaseAdmin
    .from('field_media')
    .select('id, media_type, storage_url, captured_at, created_at')
    .eq('upload_state', 'done')
    .not('storage_url', 'is', null)
    .order('captured_at', { ascending: false, nullsFirst: false })
    .limit(LIMIT);
  if (error) return { ok: false, status: 500, error: error.message };
  const nodes = (data ?? []).map((r: { id: string; media_type: string; storage_url: string; captured_at: string | null; created_at: string }) => {
    const when = r.captured_at ?? r.created_at;
    return file(r.id, `${r.media_type[0].toUpperCase()}${r.media_type.slice(1)} (${shortDate(when)})`, mimeFromPath(r.storage_url), null, when);
  });
  return { ok: true, name: source.label, nodes };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE JOBS MOUNT
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// Three levels: the jobs, one job's kinds, one kind's items.
//
// The items are emitted with the id of their OWN source mount — `mnt:receipts:<id>`,
// `mnt:job-files:<id>` — never a new `mnt:jobs:…` file id. That is what keeps download, preview and
// search working here for free, and keeps exactly one place in the codebase that knows how to turn
// a receipt into bytes. A parallel resolver would be a second place to get permissions wrong.

/** A job folder shows the kinds the CALLER may see, each gated by its own source. */
function kindsVisibleTo(user: FileUser, isAdmin: boolean) {
  return JOB_KINDS.filter((k) => {
    const gate = SOURCES.find((s) => s.key === k.gate);
    return gate ? canSee(gate, user, isAdmin) : false;
  });
}

/** Rows of a kind for one job, already shaped as mount nodes under `parent`. */
async function jobKindNodes(
  kind: JobKind,
  jobId: string,
  parent: string,
): Promise<{ ok: boolean; error?: string; nodes: MountNode[] }> {
  const node = (
    id: string,
    name: string,
    mime: string | null,
    size: number | null,
    updated: string,
    open_href?: string,
  ): MountNode => ({
    id,
    parent_id: parent,
    node_type: 'file',
    name,
    mime_type: mime,
    size_bytes: size,
    updated_at: updated,
    access: 'download',
    ...(open_href ? { open_href } : {}),
  });

  if (kind === 'files' || kind === 'photos') {
    const q = supabaseAdmin
      .from('job_files')
      .select('id, file_name, name, file_url, storage_path, mime_type, content_type, file_size, file_size_bytes, file_node_id, uploaded_at, created_at, section')
      .eq('job_id', jobId)
      .eq('is_deleted', false)
      .eq('is_backup', false)
      .order('uploaded_at', { ascending: false, nullsFirst: false })
      .limit(LIMIT);
    // The job page's own split, mirrored exactly: the Photos tab asks for `section=photos` and the
    // Files tab shows the rest. Inventing a different rule here would put a photo in two folders or
    // in neither, and the job page is the authority on its own vocabulary.
    const { data, error } = kind === 'photos' ? await q.eq('section', 'photos') : await q.neq('section', 'photos');
    if (error) return { ok: false, error: error.message, nodes: [] };
    type Row = JobFileRow & { uploaded_at: string | null; created_at: string | null };
    const nodes = ((data ?? []) as unknown as Row[])
      .filter((r: Row) => shapeOf(r) !== 'missing')
      .map((r: Row) =>
        node(
          `${MOUNT_PREFIX}job-files:${r.id}`,
          displayName(r),
          mimeOf(r) ?? mimeFromPath(r.storage_path ?? null),
          sizeOf(r),
          r.uploaded_at ?? r.created_at ?? '',
        ),
      );
    return { ok: true, nodes };
  }

  if (kind === 'receipts') {
    const { data, error } = await supabaseAdmin
      .from('receipts')
      .select('id, photo_url, vendor_name, total_cents, created_at')
      .eq('job_id', jobId)
      .is('deleted_at', null)
      .not('photo_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(LIMIT);
    if (error) return { ok: false, error: error.message, nodes: [] };
    type Row = { id: string; photo_url: string; vendor_name: string | null; total_cents: number | null; created_at: string };
    const nodes = ((data ?? []) as Row[]).map((r) =>
      node(
        `${MOUNT_PREFIX}receipts:${r.id}`,
        `${r.vendor_name?.trim() || 'Receipt'}${dollars(r.total_cents)} (${shortDate(r.created_at)})`,
        mimeFromPath(r.photo_url),
        null,
        r.created_at,
      ),
    );
    return { ok: true, nodes };
  }

  if (kind === 'drawings') {
    const { data, error } = await supabaseAdmin
      .from('cad_drawings')
      .select('id, name, feature_count, layer_count, updated_at')
      .eq('job_id', jobId)
      .order('updated_at', { ascending: false })
      .limit(LIMIT);
    if (error) return { ok: false, error: error.message, nodes: [] };
    type Row = { id: string; name: string; feature_count: number; layer_count: number; updated_at: string };
    const nodes = ((data ?? []) as Row[]).map((r) =>
      node(
        `${MOUNT_PREFIX}drawings:${r.id}`,
        `${r.name?.trim() || 'Drawing'} (${r.feature_count} features, ${r.layer_count} layers)`,
        STARR_DRAWING_MIME,
        null,
        r.updated_at,
        `/admin/cad?drawing=${r.id}`,
      ),
    );
    return { ok: true, nodes };
  }

  // field-media
  const { data, error } = await supabaseAdmin
    .from('field_media')
    .select('id, media_type, storage_url, captured_at, created_at')
    .eq('job_id', jobId)
    .eq('upload_state', 'done')
    .not('storage_url', 'is', null)
    .order('captured_at', { ascending: false, nullsFirst: false })
    .limit(LIMIT);
  if (error) return { ok: false, error: error.message, nodes: [] };
  type Row = { id: string; media_type: string; storage_url: string; captured_at: string | null; created_at: string };
  const nodes = ((data ?? []) as Row[]).map((r) => {
    const when = r.captured_at ?? r.created_at;
    return node(
      `${MOUNT_PREFIX}field-media:${r.id}`,
      `${r.media_type[0].toUpperCase()}${r.media_type.slice(1)} (${shortDate(when)})`,
      mimeFromPath(r.storage_url),
      null,
      when,
    );
  });
  return { ok: true, nodes };
}

async function listJobsMount(
  segments: string[],
  user: FileUser,
  isAdmin: boolean,
): Promise<MountListResult> {
  const root = `${MOUNT_PREFIX}jobs`;
  const kinds = kindsVisibleTo(user, isAdmin);

  // ── Level 1: the jobs ────────────────────────────────────────────────────────────────────────
  if (segments.length === 0) {
    const { data, error } = await supabaseAdmin
      .from('jobs')
      .select('id, job_number, name, updated_at, is_archived')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(LIMIT);
    if (error) return { ok: false, status: 500, error: error.message };
    type Row = { id: string; job_number: string | null; name: string | null; updated_at: string; is_archived: boolean | null };
    const nodes: MountNode[] = ((data ?? []) as Row[]).map((j) => ({
      id: `${root}:${j.id}`,
      parent_id: root,
      node_type: 'folder',
      // Number first, because that is how a surveyor says a job out loud and how the folder sorts
      // when somebody searches for one. Archived jobs are marked, not hidden — their files are the
      // reason anybody opens an old job.
      name: `${j.job_number?.trim() || 'No number'} — ${j.name?.trim() || 'Untitled job'}${j.is_archived ? ' (archived)' : ''}`,
      mime_type: null,
      size_bytes: null,
      updated_at: j.updated_at,
      access: 'view',
    }));
    return { ok: true, name: 'Jobs', nodes, trail: [{ id: root, name: 'Jobs' }] };
  }

  const [jobId, kindSeg] = segments;

  const { data: jobRow } = await supabaseAdmin
    .from('jobs')
    .select('id, job_number, name')
    .eq('id', jobId)
    .is('deleted_at', null)
    .maybeSingle();
  const job = jobRow as { id: string; job_number: string | null; name: string | null } | null;
  if (!job) return { ok: false, status: 404, error: 'That job is not here.' };
  const jobLabel = `${job.job_number?.trim() || 'No number'} — ${job.name?.trim() || 'Untitled job'}`;
  const jobNode = `${root}:${job.id}`;
  const baseTrail = [{ id: root, name: 'Jobs' }, { id: jobNode, name: jobLabel }];

  // ── Level 2: this job's kinds, and only the ones holding something ───────────────────────────
  if (segments.length === 1) {
    const counted = await Promise.all(
      kinds.map(async (k) => ({ kind: k, result: await jobKindNodes(k.key, job.id, jobNode) })),
    );
    const failed = counted.find((c) => !c.result.ok);
    if (failed) return { ok: false, status: 500, error: failed.result.error };

    const nodes: MountNode[] = counted
      // An empty folder in every job is noise in every job. A kind appears once it holds something,
      // which also makes the folder list a readable answer to "what has this job got?".
      .filter((c) => c.result.nodes.length > 0)
      .map((c) => ({
        id: `${jobNode}:${c.kind.key}`,
        parent_id: jobNode,
        node_type: 'folder',
        name: `${c.kind.label} (${c.result.nodes.length})`,
        mime_type: null,
        size_bytes: null,
        // The newest thing inside, so a job folder's date means "last touched" rather than nothing.
        updated_at: c.result.nodes.reduce((a, n) => (n.updated_at > a ? n.updated_at : a), ''),
        access: 'view',
      }));

    return {
      ok: true,
      name: jobLabel,
      nodes,
      trail: baseTrail,
      // The job itself is a page, and from a folder named after it that is usually where somebody
      // wants to go. The explorer opens folders on a name click, so this is offered separately.
      openHref: `/admin/jobs/${job.id}`,
    };
  }

  // ── Level 3: the items ───────────────────────────────────────────────────────────────────────
  const kind = kinds.find((k) => k.key === kindSeg);
  if (!kind) {
    // Either a bad slug or a kind this person may not see. Both answer 404: telling somebody a
    // folder exists but is forbidden is itself a disclosure, and there is nothing they can do.
    return { ok: false, status: 404, error: 'That folder is not here.' };
  }
  const result = await jobKindNodes(kind.key, job.id, `${jobNode}:${kind.key}`);
  if (!result.ok) return { ok: false, status: 500, error: result.error };
  return {
    ok: true,
    name: kind.label,
    nodes: result.nodes,
    trail: [...baseTrail, { id: `${jobNode}:${kind.key}`, name: kind.label }],
  };
}

/**
 * `mnt:projects` → a project → one of its jobs → a kind → the items.
 *
 * Four levels rather than the Jobs mount's three, and the bottom two are the SAME code: once a job
 * is chosen it delegates to `jobKindNodes`, so a file has one id, one gate and one download path no
 * matter which folder somebody reached it through. Adding a parallel resolver here would have been
 * a second place to get permissions wrong.
 */
/** A project's own documents: `project_id` set, `job_id` null. Same shaping as `jobKindNodes`'
 *  files branch, and the same `mnt:job-files:` ids, so download needs no new code path. */
async function projectDocNodes(
  projectId: string,
  parent: string,
): Promise<{ ok: boolean; error?: string; nodes: MountNode[] }> {
  const { data, error } = await supabaseAdmin
    .from('job_files')
    .select('id, file_name, name, file_url, storage_path, mime_type, content_type, file_size, file_size_bytes, file_node_id, uploaded_at, created_at')
    .eq('project_id', projectId)
    .is('job_id', null)
    .eq('is_deleted', false)
    .eq('is_backup', false)
    .order('uploaded_at', { ascending: false, nullsFirst: false })
    .limit(LIMIT);
  if (error) return { ok: false, error: error.message, nodes: [] };
  type Row = JobFileRow & { uploaded_at: string | null; created_at: string | null };
  const nodes = ((data ?? []) as unknown as Row[])
    .filter((r) => shapeOf(r) !== 'missing')
    .map((r) => ({
      id: `${MOUNT_PREFIX}job-files:${r.id}`,
      parent_id: parent,
      node_type: 'file' as const,
      name: displayName(r),
      mime_type: mimeOf(r) ?? mimeFromPath(r.storage_path ?? null),
      size_bytes: sizeOf(r),
      updated_at: r.uploaded_at ?? r.created_at ?? '',
      access: 'download' as const,
    }));
  return { ok: true, nodes };
}

async function listProjectsMount(
  segments: string[],
  user: FileUser,
  isAdmin: boolean,
): Promise<MountListResult> {
  const root = `${MOUNT_PREFIX}projects`;
  const kinds = kindsVisibleTo(user, isAdmin);

  // ── Level 1: the projects ────────────────────────────────────────────────────────────────────
  if (segments.length === 0) {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select('id, project_number, name, updated_at, is_archived')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(LIMIT);
    if (error) return { ok: false, status: 500, error: error.message };
    type Row = { id: string; project_number: string | null; name: string | null; updated_at: string; is_archived: boolean | null };
    const nodes: MountNode[] = ((data ?? []) as Row[]).map((p) => ({
      id: `${root}:${p.id}`,
      parent_id: root,
      node_type: 'folder',
      name: `${p.project_number?.trim() || 'No number'} — ${p.name?.trim() || 'Untitled project'}${p.is_archived ? ' (archived)' : ''}`,
      mime_type: null,
      size_bytes: null,
      updated_at: p.updated_at,
      access: 'view',
    }));
    return { ok: true, name: 'Projects', nodes, trail: [{ id: root, name: 'Projects' }] };
  }

  const [projectId, jobId, kindSeg] = segments;

  const { data: projRow } = await supabaseAdmin
    .from('projects')
    .select('id, project_number, name')
    .eq('id', projectId)
    .is('deleted_at', null)
    .maybeSingle();
  const project = projRow as { id: string; project_number: string | null; name: string | null } | null;
  if (!project) return { ok: false, status: 404, error: 'That project is not here.' };
  const projLabel = `${project.project_number?.trim() || 'No number'} — ${project.name?.trim() || 'Untitled project'}`;
  const projNode = `${root}:${project.id}`;
  const projTrail = [{ id: root, name: 'Projects' }, { id: projNode, name: projLabel }];

  // ── Level 2: this project's jobs ─────────────────────────────────────────────────────────────
  if (segments.length === 1) {
    const { data, error } = await supabaseAdmin
      .from('jobs')
      .select('id, job_number, name, updated_at, is_archived')
      .eq('project_id', project.id)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(LIMIT);
    if (error) return { ok: false, status: 500, error: error.message };
    type Row = { id: string; job_number: string | null; name: string | null; updated_at: string; is_archived: boolean | null };
    const nodes: MountNode[] = ((data ?? []) as Row[]).map((j) => ({
      id: `${projNode}:${j.id}`,
      parent_id: projNode,
      node_type: 'folder',
      name: `${j.job_number?.trim() || 'No number'} — ${j.name?.trim() || 'Untitled job'}${j.is_archived ? ' (archived)' : ''}`,
      mime_type: null,
      size_bytes: null,
      updated_at: j.updated_at,
      access: 'view',
    }));
    // ── The project's OWN documents sit beside its jobs ─────────────────────────────────────────
    //
    // Files with a `project_id` and no `job_id` — the contract, the title commitment. They are not
    // any job's, so they appear as a sibling folder rather than being hidden inside whichever job
    // happened to be created first. Same gate as job files, because they are the same table.
    if (canSee(SOURCES.find((s) => s.key === 'job-files') as MountSource, user, isAdmin)) {
      const docs = await projectDocNodes(project.id, `${projNode}:docs`);
      if (docs.ok && docs.nodes.length > 0) {
        nodes.unshift({
          id: `${projNode}:docs`,
          parent_id: projNode,
          node_type: 'folder',
          name: `Project documents (${docs.nodes.length})`,
          mime_type: null,
          size_bytes: null,
          updated_at: docs.nodes.reduce((a, n) => (n.updated_at > a ? n.updated_at : a), ''),
          access: 'view',
        });
      }
    }

    return { ok: true, name: projLabel, nodes, trail: projTrail, openHref: `/admin/projects/${project.id}` };
  }

  // The project-documents folder, which is a leaf of files rather than another job.
  if (segments.length === 2 && jobId === 'docs') {
    if (!canSee(SOURCES.find((s) => s.key === 'job-files') as MountSource, user, isAdmin)) {
      return { ok: false, status: 404, error: 'That folder is not here.' };
    }
    const docs = await projectDocNodes(project.id, `${projNode}:docs`);
    if (!docs.ok) return { ok: false, status: 500, error: docs.error };
    return {
      ok: true,
      name: 'Project documents',
      nodes: docs.nodes,
      trail: [...projTrail, { id: `${projNode}:docs`, name: 'Project documents' }],
    };
  }

  // Below here the job must actually be IN this project — otherwise `mnt:projects:<a>:<jobFromB>`
  // would render another project's job under this project's breadcrumb, which is a quiet way to
  // file a drawing against the wrong engagement.
  const { data: jobRow } = await supabaseAdmin
    .from('jobs')
    .select('id, job_number, name')
    .eq('id', jobId)
    .eq('project_id', project.id)
    .is('deleted_at', null)
    .maybeSingle();
  const job = jobRow as { id: string; job_number: string | null; name: string | null } | null;
  if (!job) return { ok: false, status: 404, error: 'That job is not in this project.' };
  const jobLabel = `${job.job_number?.trim() || 'No number'} — ${job.name?.trim() || 'Untitled job'}`;
  const jobNode = `${projNode}:${job.id}`;
  const jobTrail = [...projTrail, { id: jobNode, name: jobLabel }];

  // ── Level 3: the kinds that hold something ───────────────────────────────────────────────────
  if (segments.length === 2) {
    const counted = await Promise.all(
      kinds.map(async (k) => ({ kind: k, result: await jobKindNodes(k.key, job.id, jobNode) })),
    );
    const failed = counted.find((c) => !c.result.ok);
    if (failed) return { ok: false, status: 500, error: failed.result.error };

    const nodes: MountNode[] = counted
      .filter((c) => c.result.nodes.length > 0)
      .map((c) => ({
        id: `${jobNode}:${c.kind.key}`,
        parent_id: jobNode,
        node_type: 'folder',
        name: `${c.kind.label} (${c.result.nodes.length})`,
        mime_type: null,
        size_bytes: null,
        updated_at: c.result.nodes.reduce((a, n) => (n.updated_at > a ? n.updated_at : a), ''),
        access: 'view',
      }));

    return { ok: true, name: jobLabel, nodes, trail: jobTrail, openHref: `/admin/jobs/${job.id}` };
  }

  // ── Level 4: the items ───────────────────────────────────────────────────────────────────────
  const kind = kinds.find((k) => k.key === kindSeg);
  if (!kind) return { ok: false, status: 404, error: 'That folder is not here.' };
  const result = await jobKindNodes(kind.key, job.id, `${jobNode}:${kind.key}`);
  if (!result.ok) return { ok: false, status: 500, error: result.error };
  return {
    ok: true,
    name: kind.label,
    nodes: result.nodes,
    trail: [...jobTrail, { id: `${jobNode}:${kind.key}`, name: kind.label }],
  };
}

export interface MountFileRef {
  ok: boolean;
  status?: number;
  error?: string;
  bucket?: string;
  path?: string;
  name?: string;
  mime?: string | null;
  previewable?: boolean;
  /** F1 — the file's bytes, when the source has no storage object to sign.
   *
   *  `cad_drawings.document` is JSONB in the database; there is no bucket and no path. Rather than
   *  bend the drawings into a fake storage location, the download route serves this directly. Every
   *  other source leaves it undefined and keeps the signed-URL path unchanged. */
  inlineBody?: string;
  /** A URL the caller can use as-is, when the source already holds one.
   *
   *  A legacy job attachment is a `data:` URI (or an ordinary link) sitting in a column — there is
   *  no storage object to sign, and nothing to serve as bytes either. Returning the URL it already
   *  is keeps this endpoint's "you get a URL" contract and renders in the viewer unchanged. */
  directUrl?: string;
  /** Where "open" should go when the natural action is a page, not a download. */
  open_href?: string;
}

/** Resolve a mounted file id (`mnt:<source>:<rowId>`) to a storage object,
 *  re-validating the role gate. */
export async function resolveMountFile(fileId: string, user: FileUser, isAdmin: boolean): Promise<MountFileRef> {
  const rest = fileId.slice(MOUNT_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep < 0) return { ok: false, status: 400, error: 'Bad reference.' };
  const key = rest.slice(0, sep) as SourceKey;
  const rowId = rest.slice(sep + 1);
  const source = SOURCES.find((s) => s.key === key);
  if (!source) return { ok: false, status: 404, error: 'Unknown source.' };
  if (!canSee(source, user, isAdmin)) return { ok: false, status: 403, error: 'You do not have access to this file.' };
  // Every id under `mnt:jobs:…` names a FOLDER — the items inside a job folder carry their own
  // source's id (`mnt:receipts:…`), which is what makes them resolvable at all. Falling through
  // here would try to read a job id out of the receipts table and 404 for the wrong reason.
  if (key === 'jobs' || key === 'projects') return { ok: false, status: 400, error: 'That is a folder, not a file.' };

  if (key === 'receipts') {
    const { data } = await supabaseAdmin.from('receipts').select('photo_url, vendor_name, created_at').eq('id', rowId).maybeSingle();
    const r = data as { photo_url: string; vendor_name: string | null; created_at: string } | null;
    if (!r?.photo_url) return { ok: false, status: 404, error: 'File not found.' };
    const mime = mimeFromPath(r.photo_url);
    return { ok: true, bucket: 'starr-field-receipts', path: r.photo_url, name: `${r.vendor_name?.trim() || 'Receipt'} (${shortDate(r.created_at)})`, mime, previewable: isImageMime(mime) || isPdfMime(mime) };
  }
  if (key === 'job-files') {
    const { data } = await supabaseAdmin
      .from('job_files')
      .select('id, file_name, name, file_url, storage_path, storage_bucket, mime_type, content_type, file_node_id')
      .eq('id', rowId)
      .maybeSingle();
    const r = data as JobFileRow | null;
    if (!r) return { ok: false, status: 404, error: 'File not found.' };
    const shape = shapeOf(r);
    const mime = mimeOf(r) ?? mimeFromPath(r.storage_path ?? null);
    const name = displayName(r);
    const previewable = isImageMime(mime) || isPdfMime(mime);

    // A legacy row's bytes are already a URL — a `data:` URI or an ordinary link. Handing it back
    // as `directUrl` keeps this endpoint's contract ("you get a URL") intact and lets the viewer
    // render it unchanged, rather than inventing a bucket path that does not exist.
    if (shape === 'legacy-inline' || shape === 'legacy-remote') {
      return { ok: true, directUrl: (r.file_url ?? '').trim(), name, mime, previewable };
    }
    // A row that only REFERENCES an explorer document has no bytes here by design (F5). Sending the
    // caller to the document itself keeps one answer for "where does this live".
    if (shape === 'linked') {
      return { ok: false, status: 404, error: 'This attachment is a link to a document in Files — open it there.' };
    }
    if (shape === 'missing') return { ok: false, status: 404, error: 'That attachment has no file behind it.' };
    // Video lives in a different bucket to documents (seeds/605), so the row is asked rather than
    // assumed — hardcoding the files bucket here would 404 every video the moment it worked.
    return { ok: true, bucket: bucketOf(r), path: r.storage_path as string, name, mime, previewable: previewable || isVideoMime(mime) };
  }
  if (key === 'research') {
    const { data } = await supabaseAdmin.from('research_documents').select('original_filename, document_label, storage_path').eq('id', rowId).maybeSingle();
    const r = data as { original_filename: string | null; document_label: string | null; storage_path: string } | null;
    if (!r?.storage_path) return { ok: false, status: 404, error: 'File not found.' };
    const mime = mimeFromPath(r.storage_path);
    return { ok: true, bucket: 'research-documents', path: r.storage_path, name: r.document_label?.trim() || r.original_filename?.trim() || 'Document', mime, previewable: isImageMime(mime) || isPdfMime(mime) };
  }
  if (key === 'drawings') {
    // The one source with no storage object. `document` IS the file — the schema's own comment says
    // it is "the same payload as .starr file" — so the download is synthesized from it rather than
    // signed. This is the only place `document` is read, and only ever for one row.
    const { data } = await supabaseAdmin
      .from('cad_drawings')
      .select('name, document, updated_at')
      .eq('id', rowId)
      .maybeSingle();
    const r = data as { name: string; document: unknown; updated_at: string } | null;
    if (!r) return { ok: false, status: 404, error: 'Drawing not found.' };
    // `.starr` rather than `.json`: it is what the CAD editor writes and reads, so a file downloaded
    // here can be opened again without renaming it.
    const safeName = (r.name?.trim() || 'Drawing').replace(/[\\/:*?"<>|]/g, '-');
    return {
      ok: true,
      name: `${safeName}.starr`,
      mime: 'application/json',
      // Not previewable: the viewer renders images and PDFs, and a wall of raw JSON is not a preview
      // of a drawing — it is a worse version of opening it in CAD.
      previewable: false,
      inlineBody: JSON.stringify(r.document ?? {}),
      open_href: `/admin/cad?drawing=${rowId}`,
    };
  }
  // field-media
  const { data } = await supabaseAdmin.from('field_media').select('media_type, storage_url, captured_at').eq('id', rowId).maybeSingle();
  const r = data as { media_type: string; storage_url: string; captured_at: string | null } | null;
  if (!r?.storage_url) return { ok: false, status: 404, error: 'File not found.' };
  const mime = mimeFromPath(r.storage_url);
  return { ok: true, bucket: MEDIA_BUCKET[r.media_type] ?? 'starr-field-photos', path: r.storage_url, name: `${r.media_type} (${shortDate(r.captured_at)})`, mime, previewable: isImageMime(mime) || isPdfMime(mime) };
}
