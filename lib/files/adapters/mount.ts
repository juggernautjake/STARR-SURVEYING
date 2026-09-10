// lib/files/adapters/mount.ts — a mounted node (`mnt:…`, as listed by lib/files/mounts.ts) as the
// shared viewer sees it, WITH the edits its source row allows (2026-09-10).
//
// The explorer adapter treats every mount item as read-only, which was right when a mount was only
// a different arrangement of rows edited elsewhere. The FolderExplorer on a job or project IS the
// place those rows are edited now (the Files / Photos / Videos tabs it replaced could rename, tag
// and delete), so a mounted job file or research document carries its `source` and this adapter
// routes each edit to that row's own API — the same routes the job-file and research adapters use.

import type { ViewerFile, ViewerCapabilities, Destination } from '../viewer-model';
import type { MountNode } from '../mount-node';
import { JOB_FOLDERS, jobFolder, type JobFolderKey } from '../job-folders';
import { jobFileDestinations } from './job-file';

export async function mountViewUrl(id: string): Promise<string | null> {
  const res = await fetch(`/api/admin/files/${id}/download?inline=1`);
  if (!res.ok) return null;
  const { url } = await res.json();
  return typeof url === 'string' ? url : null;
}

export function mountNodeToViewerFile(n: MountNode, url: string | null, folderName?: string | null): ViewerFile {
  const src = n.source;
  const meta: Array<{ label: string; value: string }> = [];
  if (src?.table === 'research_documents') meta.push({ label: 'Source', value: 'Research document' });
  if (src?.table === 'cad_drawings') meta.push({ label: 'Source', value: 'Starr CAD drawing — open it in the editor' });
  if (src?.table === 'receipts') meta.push({ label: 'Source', value: 'Receipt' });
  if (src?.table === 'field_media') meta.push({ label: 'Source', value: 'Captured in Work Mode' });
  if (n.original_name && n.original_name !== n.name) meta.push({ label: 'Uploaded as', value: n.original_name });
  return {
    id: n.id,
    name: n.name,
    mime: n.mime_type,
    size: n.size_bytes,
    url,
    createdAt: n.updated_at || null,
    notes: n.notes ?? null,
    tags: n.tags ?? [],
    folder: folderName ?? null,
    meta,
  };
}

async function patchJson(url: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
}

export interface MountCapabilityHooks {
  nodeFor: (id: string) => MountNode | undefined;
  /** Re-list after an edit; the viewer receives the refreshed file through `onChanged`'s reload. */
  onChanged: () => void | Promise<void>;
  /** The job the folder belongs to, when it is a job folder — offers "move to another folder of this job". */
  jobId?: string | null;
  url: (id: string) => string | null;
}

/** The standard folders of the SAME job, as destinations — moving a photo to Documents is a section edit. */
function sameJobFolderDestinations(current: JobFolderKey | null): Destination[] {
  return JOB_FOLDERS
    .filter((f) => f.uploadSection && f.key !== current)
    .map((f) => ({ id: `folder:${f.key}`, label: f.label, hint: 'this job' }));
}

export function mountCapabilities(hooks: MountCapabilityHooks): ViewerCapabilities {
  const src = (id: string) => hooks.nodeFor(id)?.source;
  const refreshed = async (id: string): Promise<ViewerFile> => {
    await hooks.onChanged();
    const n = hooks.nodeFor(id);
    return n ? mountNodeToViewerFile(n, hooks.url(id)) : ({ id, name: '', mime: null, size: null, url: null } as ViewerFile);
  };

  return {
    rename: async (file, newName) => {
      const s = src(file.id);
      if (s?.table === 'job_files') {
        const n = hooks.nodeFor(file.id);
        // The label is the chosen name; naming it back to the uploaded name clears the label.
        await patchJson(`/api/admin/jobs/files/${s.id}`, { label: n?.original_name && newName === n.original_name ? null : newName });
      } else if (s?.table === 'research_documents' && s.research_project_id) {
        await patchJson(`/api/admin/research/${s.research_project_id}/documents/${s.id}`, { document_label: newName });
      } else {
        throw new Error('This file is renamed where it lives (a drawing in CAD, a receipt in Receipts).');
      }
      return refreshed(file.id);
    },
    updateNotes: async (file, notes) => {
      const s = src(file.id);
      if (s?.table === 'job_files') await patchJson(`/api/admin/jobs/files/${s.id}`, { description: notes.trim() || null });
      else if (s?.table === 'research_documents' && s.research_project_id) await patchJson(`/api/admin/research/${s.research_project_id}/documents/${s.id}`, { notes });
      else throw new Error('Notes are kept on job files and research documents.');
      return refreshed(file.id);
    },
    updateTags: async (file, tags) => {
      const s = src(file.id);
      if (s?.table === 'job_files') await patchJson(`/api/admin/jobs/files/${s.id}`, { tags });
      else if (s?.table === 'research_documents' && s.research_project_id) await patchJson(`/api/admin/research/${s.research_project_id}/documents/${s.id}`, { tags });
      else throw new Error('Tags are kept on job files and research documents.');
      return refreshed(file.id);
    },
    destinations: async (file) => {
      const s = src(file.id);
      if (s?.table !== 'job_files') return [];
      const current = jobFolder(hooks.nodeFor(file.id)?.folder_key ?? null)?.key ?? null;
      const others = await jobFileDestinations({ job_id: s.job_id ?? null, project_id: s.project_id ?? null });
      return [...(s.job_id ? sameJobFolderDestinations(current) : []), ...others];
    },
    move: async (file, destination) => {
      const s = src(file.id);
      if (s?.table !== 'job_files') throw new Error('Only job files can be moved from here.');
      const [kind, target] = destination.id.split(':');
      if (kind === 'folder') {
        const spec = jobFolder(target);
        if (!spec?.uploadSection) throw new Error('That folder does not take files.');
        await patchJson(`/api/admin/jobs/files/${s.id}`, { section: spec.uploadSection, ...(spec.uploadFileType ? { file_type: spec.uploadFileType } : {}) });
      } else {
        const body = kind === 'job' ? { mode: 'move', job_id: target } : { mode: 'move', project_id: target };
        const res = await fetch(`/api/admin/jobs/files/${s.id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) { const json = await res.json().catch(() => ({})); throw new Error(json.error ?? `HTTP ${res.status}`); }
      }
      await hooks.onChanged();
    },
    copy: async (file, destination) => {
      const s = src(file.id);
      if (s?.table !== 'job_files') throw new Error('Only job files can be copied from here.');
      const [kind, target] = destination.id.split(':');
      if (kind === 'folder') throw new Error('A file is in one folder of a job at a time — move it instead.');
      const body = kind === 'job' ? { mode: 'copy', job_id: target } : { mode: 'copy', project_id: target };
      const res = await fetch(`/api/admin/jobs/files/${s.id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const json = await res.json().catch(() => ({})); throw new Error(json.error ?? `HTTP ${res.status}`); }
      await hooks.onChanged();
    },
    delete: async (file) => {
      const s = src(file.id);
      if (s?.table !== 'job_files') throw new Error('Delete this where it lives (a drawing in CAD, a research document on its research project).');
      const res = await fetch(`/api/admin/jobs/files?id=${encodeURIComponent(s.id)}`, { method: 'DELETE' });
      if (!res.ok) { const json = await res.json().catch(() => ({})); throw new Error(json.error ?? `HTTP ${res.status}`); }
      await hooks.onChanged();
    },
  };
}
