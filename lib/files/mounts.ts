// lib/files/mounts.ts
//
// F9 of FILE_EXPLORER_2026-06-25 — surface existing file sources (receipts,
// job files, research documents, field media) as READ-ONLY virtual folders in
// the explorer, so "all files" are browsable in one tree. These never live in
// file_nodes: they're synthesized on read and capped at 'download' access, so
// no write path (rename/move/delete/permissions) can ever touch them. Each
// source is role-gated; the download route re-validates the same gate.

import { supabaseAdmin } from '@/lib/supabase';
import { shapeOf, displayName, originalName, mimeOf, sizeOf, bucketOf, type JobFileRow } from '@/lib/jobs/file-storage';
import { JOB_FOLDERS, folderForJobFile, folderForFieldMedia, type JobFolderKey, type JobFolderSpec } from './job-folders';
import type { MountNode, MountTree, MountTreeFolder } from './mount-node';
import { isImageMime, isPdfMime } from './upload';
import { STARR_DRAWING_MIME } from './kinds';
import type { FileUser } from './permissions';

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
  //
  // 'researcher' since 2026-09-10: a job folder has a Research folder now (research documents are
  // job-scoped through seed 633), so the door opens for the people who make them. Inside, they see
  // that folder and nothing a researcher could not see in Research Documents.
  { key: 'jobs', label: 'Jobs', roles: ['admin', 'developer', 'field_crew', 'drawer', 'researcher'] },
  // ── Projects (2026-08-19) — one level up from Jobs ────────────────────────────────────────────
  //
  // A project is the engagement: one client, one parcel, several jobs over months. The Jobs mount
  // answers *"everything for job 24-103"*; this answers *"everything for the Smith Tract"*, which
  // is the question asked when nobody remembers which of the four jobs a drawing was filed under.
  //
  // It reuses `listJobLevels` verbatim, so a file appears with the SAME id it has everywhere else
  // (`mnt:job-files:…`) and download, preview and search need no third code path. The role gates
  // are the same ones too, applied per source, per job — a project folder cannot widen access.
  //
  // "Job Projects" since 2026-09-10: the owner's name for the folder that holds every project
  // folder, each holding its job folders in the standard structure (lib/files/job-folders.ts).
  { key: 'projects', label: 'Job Projects', roles: ['admin', 'developer', 'field_crew', 'drawer', 'researcher'] },
];

// ── The standard folders of a job (owner, 2026-09-10) ────────────────────────────────────────────
//
// Research / CAD / Photos / Videos, always; Documents and Receipts when they hold something. The
// table is lib/files/job-folders.ts, shared with the FolderExplorer that uploads INTO them, so a
// photo uploaded into Photos is what Photos lists — one vocabulary, nothing to drift.
//
// Each folder names the SOURCES whose rows it can contain, and every source re-applies its own
// role gate when its rows are fetched (`jobFolderListing`) — a folder cannot be more permissive
// than the flat mount of the same rows. A field crew member opening a job folder sees Photos and
// Videos and an empty-looking Research folder; the receipts are not there for them.
//
// Before this a job folder held one KIND per source table — Files, Photos, Receipts, Drawings,
// Field Media — which is how the database is arranged, not how a surveyor thinks about a job. And
// there was no Research folder at all, because `research_documents` had no path to a job; seed 633
// (`research_project_jobs`, plus the older `research_projects.job_id`) gave it one.
//
// A mounted FILE keeps the id of its OWN source mount (`mnt:job-files:…`, `mnt:research:…`), so
// download, preview and search need no second resolver; and it carries `source` (the row behind it)
// so the shared viewer can rename / annotate / move it through that row's own API.

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
  if (key === 'research') return listResearchMount(segments);

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
// Three levels: the jobs, one job's standard folders, one folder's items.
//
// The items are emitted with the id of their OWN source mount — `mnt:receipts:<id>`,
// `mnt:job-files:<id>` — never a new `mnt:jobs:…` file id. That is what keeps download, preview and
// search working here for free, and keeps exactly one place in the codebase that knows how to turn
// a receipt into bytes. A parallel resolver would be a second place to get permissions wrong.

function canSeeKey(key: SourceKey, user: FileUser, isAdmin: boolean): boolean {
  const source = SOURCES.find((s) => s.key === key);
  return source ? canSee(source, user, isAdmin) : false;
}

/** The standard folders the CALLER may see: a folder shows when any of its sources would. */
function foldersVisibleTo(user: FileUser, isAdmin: boolean): JobFolderSpec[] {
  return JOB_FOLDERS.filter((f) => f.sources.some((key) => canSeeKey(key, user, isAdmin)));
}

interface JobFolderListing {
  ok: boolean;
  error?: string;
  /** Every folder's items, keyed by folder — the empty standard folders included. */
  byFolder: Map<JobFolderKey, MountNode[]>;
}

/** Everything in one job, already filed into the standard folders and shaped as mount nodes.
 *
 *  One query per source table, each behind that source's own gate. Called once for a job and
 *  then read for every folder, so listing a job costs the same whether it shows six folders or one. */
async function jobFolderListing(jobId: string, jobNode: string, user: FileUser, isAdmin: boolean): Promise<JobFolderListing> {
  const byFolder = new Map<JobFolderKey, MountNode[]>(JOB_FOLDERS.map((f) => [f.key, [] as MountNode[]]));
  const push = (key: JobFolderKey, n: MountNode) => { byFolder.get(key)?.push(n); };
  const node = (key: JobFolderKey, partial: Omit<MountNode, 'parent_id' | 'node_type' | 'access' | 'folder_key'>): MountNode => ({
    parent_id: `${jobNode}:${key}`,
    node_type: 'file',
    access: 'download',
    folder_key: key,
    ...partial,
  });

  if (canSeeKey('job-files', user, isAdmin)) {
    const { data, error } = await supabaseAdmin
      .from('job_files')
      .select('id, job_id, project_id, file_name, name, label, description, tags, file_url, storage_path, mime_type, content_type, file_size, file_size_bytes, file_node_id, uploaded_at, created_at, section, file_type')
      .eq('job_id', jobId)
      .eq('is_deleted', false)
      .eq('is_backup', false)
      .order('uploaded_at', { ascending: false, nullsFirst: false })
      .limit(LIMIT);
    if (error) return { ok: false, error: error.message, byFolder };
    type Row = JobFileRow & {
      job_id: string | null; project_id: string | null; description: string | null;
      uploaded_at: string | null; created_at: string | null; section: string | null; file_type: string | null;
    };
    for (const r of (data ?? []) as unknown as Row[]) {
      const shape = shapeOf(r);
      if (shape === 'missing') continue;
      // The job page's old split, kept and extended: section decides (photos / videos / research /
      // drawing), then the file type, then the bytes — see folderForJobFile.
      const key = folderForJobFile(r);
      // A row that only REFERENCES a File Explorer document (F5) has no bytes of its own, so it is
      // listed AS that document — its explorer id — and opens through the explorer's download route,
      // which re-checks the VIEWER's access to the document rather than the attacher's. A copy that
      // is no longer there (deleted, or not shared with this person) opens to a plain "not here".
      push(key, node(key, {
        id: shape === 'linked' && r.file_node_id ? r.file_node_id : `${MOUNT_PREFIX}job-files:${r.id}`,
        name: displayName(r),
        mime_type: mimeOf(r) ?? mimeFromPath(r.storage_path ?? null),
        size_bytes: sizeOf(r),
        updated_at: r.uploaded_at ?? r.created_at ?? '',
        source: { table: 'job_files', id: r.id as string, job_id: r.job_id, project_id: r.project_id, section: r.section },
        notes: r.description ?? null,
        tags: r.tags ?? [],
        original_name: originalName(r),
      }));
    }
  }

  if (canSeeKey('research', user, isAdmin)) {
    // The research projects attached to this job: the join table (seed 633) and the older single
    // column, both — a project linked before the join existed is still this job's research.
    const [viaJoin, viaColumn] = await Promise.all([
      supabaseAdmin.from('research_project_jobs').select('research_project_id').eq('job_id', jobId),
      supabaseAdmin.from('research_projects').select('id').eq('job_id', jobId),
    ]);
    const ids = new Set<string>();
    for (const r of (viaJoin.data ?? []) as Array<{ research_project_id: string }>) ids.add(r.research_project_id);
    for (const r of (viaColumn.data ?? []) as Array<{ id: string }>) ids.add(r.id);
    if (ids.size > 0) {
      const { data, error } = await supabaseAdmin
        .from('research_documents')
        .select('id, research_project_id, original_filename, document_label, storage_path, file_type, file_size_bytes, created_at, notes, tags')
        .in('research_project_id', [...ids])
        .not('storage_path', 'is', null)
        .order('created_at', { ascending: false })
        .limit(LIMIT);
      if (error) return { ok: false, error: error.message, byFolder };
      type Row = {
        id: string; research_project_id: string; original_filename: string | null; document_label: string | null;
        storage_path: string; file_type: string | null; file_size_bytes: number | null; created_at: string;
        notes: string | null; tags: string[] | null;
      };
      for (const r of (data ?? []) as Row[]) {
        push('research', node('research', {
          id: `${MOUNT_PREFIX}research:${r.id}`,
          name: r.document_label?.trim() || r.original_filename?.trim() || 'Document',
          mime_type: mimeFromPath(r.storage_path) ?? (r.file_type ? `application/${r.file_type}` : null),
          size_bytes: r.file_size_bytes,
          updated_at: r.created_at,
          source: { table: 'research_documents', id: r.id, research_project_id: r.research_project_id, job_id: jobId },
          notes: r.notes ?? null,
          tags: r.tags ?? [],
          ...(r.original_filename ? { original_name: r.original_filename } : {}),
        }));
      }
    }
  }

  if (canSeeKey('drawings', user, isAdmin)) {
    const { data, error } = await supabaseAdmin
      .from('cad_drawings')
      .select('id, name, feature_count, layer_count, updated_at')
      .eq('job_id', jobId)
      .order('updated_at', { ascending: false })
      .limit(LIMIT);
    if (error) return { ok: false, error: error.message, byFolder };
    type Row = { id: string; name: string; feature_count: number; layer_count: number; updated_at: string };
    for (const r of (data ?? []) as Row[]) {
      push('cad', node('cad', {
        id: `${MOUNT_PREFIX}drawings:${r.id}`,
        name: `${r.name?.trim() || 'Drawing'} (${r.feature_count} features, ${r.layer_count} layers)`,
        mime_type: STARR_DRAWING_MIME,
        size_bytes: null,
        updated_at: r.updated_at,
        open_href: `/admin/cad?drawing=${r.id}`,
        source: { table: 'cad_drawings', id: r.id, job_id: jobId },
      }));
    }
  }

  if (canSeeKey('field-media', user, isAdmin)) {
    const { data, error } = await supabaseAdmin
      .from('field_media')
      .select('id, media_type, storage_url, captured_at, created_at')
      .eq('job_id', jobId)
      .eq('upload_state', 'done')
      .not('storage_url', 'is', null)
      .order('captured_at', { ascending: false, nullsFirst: false })
      .limit(LIMIT);
    if (error) return { ok: false, error: error.message, byFolder };
    type Row = { id: string; media_type: string; storage_url: string; captured_at: string | null; created_at: string };
    for (const r of (data ?? []) as Row[]) {
      const when = r.captured_at ?? r.created_at;
      const key = folderForFieldMedia(r.media_type);
      push(key, node(key, {
        id: `${MOUNT_PREFIX}field-media:${r.id}`,
        name: `${r.media_type[0].toUpperCase()}${r.media_type.slice(1)} (${shortDate(when)})`,
        mime_type: mimeFromPath(r.storage_url),
        size_bytes: null,
        updated_at: when,
        source: { table: 'field_media', id: r.id, job_id: jobId },
      }));
    }
  }

  if (canSeeKey('receipts', user, isAdmin)) {
    const { data, error } = await supabaseAdmin
      .from('receipts')
      .select('id, photo_url, vendor_name, total_cents, created_at')
      .eq('job_id', jobId)
      .is('deleted_at', null)
      .not('photo_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(LIMIT);
    if (error) return { ok: false, error: error.message, byFolder };
    type Row = { id: string; photo_url: string; vendor_name: string | null; total_cents: number | null; created_at: string };
    for (const r of (data ?? []) as Row[]) {
      push('receipts', node('receipts', {
        id: `${MOUNT_PREFIX}receipts:${r.id}`,
        name: `${r.vendor_name?.trim() || 'Receipt'}${dollars(r.total_cents)} (${shortDate(r.created_at)})`,
        mime_type: mimeFromPath(r.photo_url),
        size_bytes: null,
        updated_at: r.created_at,
        source: { table: 'receipts', id: r.id, job_id: jobId },
      }));
    }
  }

  return { ok: true, byFolder };
}

/** The folder nodes under a job: the standard four always, the catch-alls when they hold something. */
function jobFolderNodes(jobNode: string, folders: JobFolderSpec[], byFolder: Map<JobFolderKey, MountNode[]>): MountNode[] {
  return folders
    .filter((f) => f.standard || (byFolder.get(f.key)?.length ?? 0) > 0)
    .map((f) => {
      const items = byFolder.get(f.key) ?? [];
      return {
        id: `${jobNode}:${f.key}`,
        parent_id: jobNode,
        node_type: 'folder' as const,
        name: `${f.label} (${items.length})`,
        mime_type: null,
        size_bytes: null,
        // The newest thing inside, so a folder's date means "last touched" rather than nothing.
        updated_at: items.reduce((a, n) => (n.updated_at > a ? n.updated_at : a), ''),
        access: 'view' as const,
        folder_key: f.key,
        blurb: f.blurb,
      };
    });
}

/** One job's folders (level 2) or one folder's items (level 3), for either mount. */
async function listJobLevels(
  job: { id: string; job_number: string | null; name: string | null },
  jobNode: string,
  trail: { id: string; name: string }[],
  kindSeg: string | undefined,
  user: FileUser,
  isAdmin: boolean,
): Promise<MountListResult> {
  const folders = foldersVisibleTo(user, isAdmin);
  const jobLabel = `${job.job_number?.trim() || 'No number'} — ${job.name?.trim() || 'Untitled job'}`;
  const listing = await jobFolderListing(job.id, jobNode, user, isAdmin);
  if (!listing.ok) return { ok: false, status: 500, error: listing.error };

  if (kindSeg === undefined) {
    return {
      ok: true,
      name: jobLabel,
      nodes: jobFolderNodes(jobNode, folders, listing.byFolder),
      trail,
      // The job itself is a page, and from a folder named after it that is usually where somebody
      // wants to go. The explorer opens folders on a name click, so this is offered separately.
      openHref: `/admin/jobs/${job.id}`,
    };
  }

  // Resolved out of the VISIBLE list, so a forbidden slug and a bad slug both answer 404 — telling
  // somebody a folder exists but is forbidden is itself a disclosure, and there is nothing they can do.
  const kind = folders.find((k) => k.key === kindSeg);
  if (!kind) return { ok: false, status: 404, error: 'That folder is not here.' };
  return {
    ok: true,
    name: kind.label,
    nodes: listing.byFolder.get(kind.key) ?? [],
    trail: [...trail, { id: `${jobNode}:${kind.key}`, name: kind.label }],
  };
}

async function listJobsMount(
  segments: string[],
  user: FileUser,
  isAdmin: boolean,
): Promise<MountListResult> {
  const root = `${MOUNT_PREFIX}jobs`;

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
  if (segments.length > 2) return { ok: false, status: 404, error: 'That is a file, not a folder.' };

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

  // ── Levels 2 + 3: the standard folders, then one folder's items ──────────────────────────────
  return listJobLevels(job, jobNode, baseTrail, kindSeg, user, isAdmin);
}

/**
 * `mnt:projects` → a project → one of its jobs → a kind → the items.
 *
 * Four levels rather than the Jobs mount's three, and the bottom two are the SAME code: once a job
 * is chosen it delegates to `jobKindNodes`, so a file has one id, one gate and one download path no
 * matter which folder somebody reached it through. Adding a parallel resolver here would have been
 * a second place to get permissions wrong.
 */
/** A project's own documents: `project_id` set, `job_id` null. Same shaping as a job's files, and the
 *  same `mnt:job-files:` ids, so download needs no new code path. */
async function projectDocNodes(
  projectId: string,
  parent: string,
): Promise<{ ok: boolean; error?: string; nodes: MountNode[] }> {
  const { data, error } = await supabaseAdmin
    .from('job_files')
    .select('id, job_id, project_id, file_name, name, label, description, tags, file_url, storage_path, mime_type, content_type, file_size, file_size_bytes, file_node_id, uploaded_at, created_at, section')
    .eq('project_id', projectId)
    .is('job_id', null)
    .eq('is_deleted', false)
    .eq('is_backup', false)
    .order('uploaded_at', { ascending: false, nullsFirst: false })
    .limit(LIMIT);
  if (error) return { ok: false, error: error.message, nodes: [] };
  type Row = JobFileRow & { job_id: string | null; project_id: string | null; description: string | null; uploaded_at: string | null; created_at: string | null; section: string | null };
  const nodes = ((data ?? []) as unknown as Row[])
    .filter((r) => shapeOf(r) !== 'missing')
    .map((r): MountNode => ({
      id: `${MOUNT_PREFIX}job-files:${r.id}`,
      parent_id: parent,
      node_type: 'file',
      name: displayName(r),
      mime_type: mimeOf(r) ?? mimeFromPath(r.storage_path ?? null),
      size_bytes: sizeOf(r),
      updated_at: r.uploaded_at ?? r.created_at ?? '',
      access: 'download',
      source: { table: 'job_files', id: r.id as string, job_id: null, project_id: r.project_id, section: r.section },
      notes: r.description ?? null,
      tags: r.tags ?? [],
      original_name: originalName(r),
    }));
  return { ok: true, nodes };
}

const PROJECTS_LABEL = 'Job Projects';
const PROJECT_DOCS_BLURB = 'The contract, the title commitment — documents of the engagement rather than of one job.';

async function listProjectsMount(
  segments: string[],
  user: FileUser,
  isAdmin: boolean,
): Promise<MountListResult> {
  const root = `${MOUNT_PREFIX}projects`;

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
    return { ok: true, name: PROJECTS_LABEL, nodes, trail: [{ id: root, name: PROJECTS_LABEL }] };
  }

  const [projectId, jobId, kindSeg] = segments;
  if (segments.length > 3) return { ok: false, status: 404, error: 'That is a file, not a folder.' };

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
  const projTrail = [{ id: root, name: PROJECTS_LABEL }, { id: projNode, name: projLabel }];
  const docsNode = `${projNode}:docs`;
  const seesDocs = canSeeKey('job-files', user, isAdmin);

  // ── Level 2: this project's jobs, and its own documents ──────────────────────────────────────
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
      folder_key: 'job',
    }));
    // ── The project's OWN documents sit beside its jobs ─────────────────────────────────────────
    //
    // Files with a `project_id` and no `job_id` — the contract, the title commitment. They are not
    // any job's, so they are a sibling folder rather than hidden inside whichever job happened to be
    // created first. Always present (2026-09-10) so there is somewhere to put the first one; same
    // gate as job files, because they are the same table.
    if (seesDocs) {
      const docs = await projectDocNodes(project.id, docsNode);
      if (!docs.ok) return { ok: false, status: 500, error: docs.error };
      nodes.unshift({
        id: docsNode,
        parent_id: projNode,
        node_type: 'folder',
        name: `Project documents (${docs.nodes.length})`,
        mime_type: null,
        size_bytes: null,
        updated_at: docs.nodes.reduce((a, n) => (n.updated_at > a ? n.updated_at : a), ''),
        access: 'view',
        folder_key: 'docs',
        blurb: PROJECT_DOCS_BLURB,
      });
    }

    return { ok: true, name: projLabel, nodes, trail: projTrail, openHref: `/admin/projects/${project.id}` };
  }

  // The project-documents folder, which is a leaf of files rather than another job.
  if (jobId === 'docs') {
    if (!seesDocs || segments.length !== 2) return { ok: false, status: 404, error: 'That folder is not here.' };
    const docs = await projectDocNodes(project.id, docsNode);
    if (!docs.ok) return { ok: false, status: 500, error: docs.error };
    return {
      ok: true,
      name: 'Project documents',
      nodes: docs.nodes,
      trail: [...projTrail, { id: docsNode, name: 'Project documents' }],
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

  // ── Levels 3 + 4: the standard folders, then one folder's items — the same code as Jobs ──────
  return listJobLevels(job, jobNode, jobTrail, kindSeg, user, isAdmin);
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

// ── The flattened subtree (owner, 2026-09-10) ────────────────────────────────────────────────────
//
// "View all files in this folder and its subfolders": every folder under a node, depth-first, each
// with its files — one response, so the FolderExplorer on a job or project can show the whole job
// at once and walk it with the viewer's arrows. A job node is expanded from ONE `jobFolderListing`
// rather than one `listMount` per folder, because those would each re-run the same five queries.
//
// Bounded: at most `maxFolders` folders and `maxDepth` levels, and `truncated` says when the walk
// stopped short — the Job Projects root over every project is not a tree anyone should be shown.

/** `mnt:jobs:<job>` or `mnt:projects:<project>:<job>` → the job id, else null. */
function jobNodeOf(id: string): string | null {
  const parts = id.split(':');
  if (parts[0] !== 'mnt') return null;
  if (parts[1] === 'jobs' && parts.length === 3) return parts[2];
  if (parts[1] === 'projects' && parts.length === 4 && parts[3] !== 'docs') return parts[3];
  return null;
}

export async function listMountTree(
  rootId: string,
  user: FileUser,
  isAdmin: boolean,
  opts: { maxFolders?: number; maxDepth?: number } = {},
): Promise<{ ok: boolean; status?: number; error?: string; tree?: MountTree }> {
  const maxFolders = opts.maxFolders ?? 150;
  const maxDepth = opts.maxDepth ?? 4;
  const rootList = await listMount(rootId, user, isAdmin);
  if (!rootList.ok) return { ok: false, status: rootList.status, error: rootList.error };

  const folders: MountTreeFolder[] = [];
  let total = 0;
  let truncated = false;
  const isFile = (n: MountNode) => n.node_type === 'file';
  const isFolder = (n: MountNode) => n.node_type === 'folder';

  type Pending = {
    id: string; name: string; path: string[]; depth: number; parent_id: string | null;
    folder_key?: string; blurb?: string; nodes?: MountNode[]; open_href?: string; error?: string;
  };

  const record = (p: Pending, files: MountNode[]): MountTreeFolder => {
    const entry: MountTreeFolder = {
      id: p.id, name: p.name, path: p.path, depth: p.depth, parent_id: p.parent_id,
      ...(p.folder_key ? { folder_key: p.folder_key } : {}),
      ...(p.blurb ? { blurb: p.blurb } : {}),
      ...(p.open_href ? { open_href: p.open_href } : {}),
      ...(p.error ? { error: p.error } : {}),
      files,
    };
    folders.push(entry);
    total += files.length;
    return entry;
  };

  async function walk(p: Pending): Promise<void> {
    if (folders.length >= maxFolders) { truncated = true; return; }

    // A job: one listing, then its folders come from the map rather than five more round trips.
    const jobId = jobNodeOf(p.id);
    if (jobId && !p.nodes) {
      const listing = await jobFolderListing(jobId, p.id, user, isAdmin);
      if (!listing.ok) { record({ ...p, error: listing.error }, []); return; }
      const folderNodes = jobFolderNodes(p.id, foldersVisibleTo(user, isAdmin), listing.byFolder);
      record({ ...p, open_href: `/admin/jobs/${jobId}` }, []);
      for (const f of folderNodes) {
        if (folders.length >= maxFolders) { truncated = true; return; }
        record(
          { id: f.id, name: f.name, path: [...p.path, f.name], depth: p.depth + 1, parent_id: p.id, folder_key: f.folder_key, blurb: f.blurb },
          listing.byFolder.get(f.folder_key as JobFolderKey) ?? [],
        );
      }
      return;
    }

    const listing: MountListResult = p.nodes ? { ok: true, nodes: p.nodes, openHref: p.open_href } : await listMount(p.id, user, isAdmin);
    if (!listing.ok) { record({ ...p, error: listing.error }, []); return; }
    const nodes = listing.nodes ?? [];
    record({ ...p, open_href: listing.openHref ?? p.open_href }, nodes.filter(isFile));
    if (p.depth >= maxDepth) return;
    for (const f of nodes.filter(isFolder)) {
      await walk({ id: f.id, name: f.name, path: [...p.path, f.name], depth: p.depth + 1, parent_id: p.id, folder_key: f.folder_key, blurb: f.blurb, open_href: f.open_href });
    }
  }

  const rootName = rootList.name ?? 'Files';
  await walk({ id: rootId, name: rootName, path: [], depth: 0, parent_id: null, nodes: rootList.nodes ?? [], open_href: rootList.openHref });

  return {
    ok: true,
    tree: {
      root: { id: rootId, name: rootName, ...(rootList.openHref ? { open_href: rootList.openHref } : {}) },
      breadcrumb: rootList.trail ?? [{ id: rootId, name: rootName }],
      folders,
      total_files: total,
      truncated,
    },
  };
}

// ── Research Documents: a folder per research project (owner, 2026-09-10) ──────────────────────
//
// The flat "every research document" list became one folder per research project, so the explorer
// pop-up has somewhere a research document can be SENT (the folder id is the research project id:
// `mnt:research:<researchProjectId>`), and so 500 documents from forty projects read as forty
// folders rather than one wall. Document ids are unchanged (`mnt:research:<docId>`) — the two share
// a prefix but never a value, both being UUIDs from different tables.

async function listResearchMount(segments: string[]): Promise<MountListResult> {
  const root = `${MOUNT_PREFIX}research`;
  const label = 'Research Documents';
  if (segments.length > 1) return { ok: false, status: 404, error: 'That is a file, not a folder.' };

  if (segments.length === 0) {
    const { data, error } = await supabaseAdmin
      .from('research_projects')
      .select('id, name, property_address, county, updated_at, created_at')
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(LIMIT);
    if (error) return { ok: false, status: 500, error: error.message };
    type Row = { id: string; name: string | null; property_address: string | null; county: string | null; updated_at: string | null; created_at: string | null };
    const nodes: MountNode[] = ((data ?? []) as Row[]).map((p) => ({
      id: `${root}:${p.id}`,
      parent_id: root,
      node_type: 'folder',
      name: p.name?.trim() || p.property_address?.trim() || 'Untitled research',
      mime_type: null,
      size_bytes: null,
      updated_at: p.updated_at ?? p.created_at ?? '',
      access: 'view',
      ...(p.property_address || p.county ? { blurb: [p.property_address, p.county ? `${p.county} County` : null].filter(Boolean).join(' · ') } : {}),
    }));
    return { ok: true, name: label, nodes, trail: [{ id: root, name: label }] };
  }

  const [projectId] = segments;
  const { data: proj } = await supabaseAdmin.from('research_projects').select('id, name, property_address').eq('id', projectId).maybeSingle();
  const project = proj as { id: string; name: string | null; property_address: string | null } | null;
  if (!project) return { ok: false, status: 404, error: 'That research project is not here.' };
  const projLabel = project.name?.trim() || project.property_address?.trim() || 'Untitled research';
  const projNode = `${root}:${project.id}`;

  const { data, error } = await supabaseAdmin
    .from('research_documents')
    .select('id, original_filename, document_label, storage_path, file_type, file_size_bytes, created_at, notes, tags')
    .eq('research_project_id', project.id)
    .not('storage_path', 'is', null)
    .order('created_at', { ascending: false })
    .limit(LIMIT);
  if (error) return { ok: false, status: 500, error: error.message };
  type Doc = { id: string; original_filename: string | null; document_label: string | null; storage_path: string; file_type: string | null; file_size_bytes: number | null; created_at: string; notes: string | null; tags: string[] | null };
  const nodes: MountNode[] = ((data ?? []) as Doc[]).map((r) => ({
    id: `${root}:${r.id}`,
    parent_id: projNode,
    node_type: 'file',
    name: r.document_label?.trim() || r.original_filename?.trim() || 'Document',
    mime_type: mimeFromPath(r.storage_path) ?? (r.file_type ? `application/${r.file_type}` : null),
    size_bytes: r.file_size_bytes,
    updated_at: r.created_at,
    access: 'download',
    source: { table: 'research_documents', id: r.id, research_project_id: project.id },
    notes: r.notes ?? null,
    tags: r.tags ?? [],
    ...(r.original_filename ? { original_name: r.original_filename } : {}),
  }));
  return {
    ok: true,
    name: projLabel,
    nodes,
    trail: [{ id: root, name: label }, { id: projNode, name: projLabel }],
    openHref: `/admin/research/${project.id}`,
  };
}
