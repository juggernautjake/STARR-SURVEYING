// lib/files/adapters/job-file.ts — a job / project attachment (`job_files`) as the shared viewer sees it.
//
// The row carries `label` (what a person renamed it to), `description` (a note), `tags`, and a
// `download_href` resolved by the list route. Rename writes the label, not the stored name — the
// uploaded name and the storage key never change; the download still saves under the chosen name.
// Move and copy go through /send (job or project destinations).

import type { ViewerFile, ViewerCapabilities, Destination } from '../viewer-model';
import { splitName } from '../viewer-model';

export interface JobFileLike {
  id: string;
  file_name: string;
  label?: string | null;
  description?: string | null;
  tags?: string[] | null;
  mime_type?: string | null;
  file_size?: number | null;
  file_size_bytes?: number | null;
  uploaded_by?: string | null;
  uploaded_at?: string | null;
  section?: string | null;
  file_type?: string | null;
  download_href?: string | null;
  job_id?: string | null;
  project_id?: string | null;
  file_node_id?: string | null;
  linked_file?: { available?: boolean } | null;
}

/** The name the file is shown and saved under: the label, keeping the uploaded extension. */
export function jobFileDisplayName(f: JobFileLike): string {
  const label = (f.label ?? '').trim();
  if (!label) return f.file_name;
  const { ext } = splitName(f.file_name);
  return splitName(label).ext || !ext ? label : label + ext;
}

export function jobFileToViewerFile(f: JobFileLike): ViewerFile {
  const linkedGone = Boolean(f.file_node_id) && f.linked_file?.available === false;
  return {
    id: f.id,
    name: jobFileDisplayName(f),
    mime: f.mime_type ?? null,
    size: f.file_size ?? f.file_size_bytes ?? null,
    url: linkedGone ? null : (f.download_href ?? null),
    createdAt: f.uploaded_at ?? null,
    createdBy: f.uploaded_by ?? null,
    notes: f.description ?? null,
    tags: f.tags ?? [],
    folder: f.section ?? null,
    meta: [
      ...(f.file_type ? [{ label: 'Kind', value: f.file_type }] : []),
      ...(f.label && f.label !== f.file_name ? [{ label: 'Uploaded as', value: f.file_name }] : []),
      ...(f.file_node_id ? [{ label: 'Source', value: linkedGone ? 'File Explorer (no longer available)' : 'File Explorer document' }] : []),
    ],
  };
}

async function patchJobFile(id: string, body: Record<string, unknown>): Promise<JobFileLike> {
  const res = await fetch(`/api/admin/jobs/files/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json.file as JobFileLike;
}

/** Jobs and projects a file can be sent to. Recent first; the current owner is left out. */
export async function jobFileDestinations(current: { job_id?: string | null; project_id?: string | null }): Promise<Destination[]> {
  const [jobsRes, projectsRes] = await Promise.all([
    fetch('/api/admin/jobs?limit=50').then((r) => (r.ok ? r.json() : { jobs: [] })).catch(() => ({ jobs: [] })),
    fetch('/api/admin/projects?limit=50').then((r) => (r.ok ? r.json() : { projects: [] })).catch(() => ({ projects: [] })),
  ]);
  const out: Destination[] = [];
  for (const j of (jobsRes.jobs ?? []) as Array<{ id: string; job_number?: string | null; name?: string | null; address?: string | null }>) {
    if (j.id === current.job_id) continue;
    out.push({ id: `job:${j.id}`, label: [j.job_number, j.name].filter(Boolean).join(' — ') || `Job ${j.id.slice(0, 8)}`, hint: j.address ?? 'job' });
  }
  for (const p of (projectsRes.projects ?? []) as Array<{ id: string; project_number?: string | null; name?: string | null }>) {
    if (p.id === current.project_id && !current.job_id) continue;
    out.push({ id: `project:${p.id}`, label: [p.project_number, p.name].filter(Boolean).join(' — ') || `Project ${p.id.slice(0, 8)}`, hint: 'project documents' });
  }
  return out;
}

async function sendJobFile(id: string, mode: 'move' | 'copy', destination: Destination): Promise<void> {
  const [kind, targetId] = destination.id.split(':');
  const body = kind === 'job' ? { mode, job_id: targetId } : { mode, project_id: targetId };
  const res = await fetch(`/api/admin/jobs/files/${id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
}

export interface JobFileCapabilityHooks {
  /** Called with the server's row after a rename / note / tag change. */
  onPatched?: (row: JobFileLike) => void;
  /** Present → the viewer offers Delete and calls this. */
  onDelete?: (id: string) => void | Promise<void>;
  rowFor: (id: string) => JobFileLike | undefined;
}

export function jobFileCapabilities(hooks: JobFileCapabilityHooks): ViewerCapabilities {
  const after = (row: JobFileLike) => { hooks.onPatched?.(row); return jobFileToViewerFile({ ...(hooks.rowFor(row.id) ?? {}), ...row }); };
  return {
    rename: async (file, newName) => {
      const row = hooks.rowFor(file.id);
      // The label is the chosen name; an empty or unchanged one clears it so the uploaded name shows.
      const label = row && newName === row.file_name ? null : newName;
      return after(await patchJobFile(file.id, { label }));
    },
    updateNotes: async (file, notes) => after(await patchJobFile(file.id, { description: notes.trim() || null })),
    updateTags: async (file, tags) => after(await patchJobFile(file.id, { tags })),
    destinations: async (file) => jobFileDestinations(hooks.rowFor(file.id) ?? {}),
    move: async (file, destination) => sendJobFile(file.id, 'move', destination),
    copy: async (file, destination) => sendJobFile(file.id, 'copy', destination),
    ...(hooks.onDelete ? { delete: async (file) => { await hooks.onDelete!(file.id); } } : {}),
  };
}
