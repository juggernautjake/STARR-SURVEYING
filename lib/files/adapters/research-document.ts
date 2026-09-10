// lib/files/adapters/research-document.ts — a `research_documents` row as the shared viewer sees it.
//
// The display name is `document_label` (falling back to the uploaded name); notes and tags are the
// seed-634 columns; move / copy go to another research project through /send. The stored file is
// the public storage URL the row carries (null for the rows that advertise a file they never got).

import type { ViewerFile, ViewerCapabilities, Destination } from '../viewer-model';
import { splitName } from '../viewer-model';

export interface ResearchDocLike {
  id: string;
  research_project_id: string;
  original_filename?: string | null;
  document_label?: string | null;
  document_type?: string | null;
  source_type?: string | null;
  file_type?: string | null;
  file_size_bytes?: number | null;
  storage_path?: string | null;
  storage_url?: string | null;
  page_count?: number | null;
  processing_status?: string | null;
  created_at?: string | null;
  notes?: string | null;
  tags?: string[] | null;
  relevance?: string | null;
  research_round?: number | null;
}

export function researchDocDisplayName(d: ResearchDocLike): string {
  const uploaded = d.original_filename ?? 'document';
  const label = (d.document_label ?? '').trim();
  if (!label) return uploaded;
  const { ext } = splitName(uploaded);
  return splitName(label).ext || !ext ? label : label + ext;
}

export function researchDocToViewerFile(d: ResearchDocLike): ViewerFile {
  const url = d.storage_path && d.storage_url ? d.storage_url : null;
  const mime = d.file_type && d.file_type.includes('/') ? d.file_type : null;
  return {
    id: d.id,
    name: researchDocDisplayName(d),
    mime,
    size: d.file_size_bytes ?? null,
    url,
    downloadUrl: url ? `/api/admin/research/${d.research_project_id}/documents/${d.id}/download` : null,
    createdAt: d.created_at ?? null,
    pageCount: d.page_count ?? null,
    notes: d.notes ?? null,
    tags: d.tags ?? [],
    meta: [
      ...(d.document_type ? [{ label: 'Document type', value: d.document_type.replace(/_/g, ' ') }] : []),
      ...(d.source_type ? [{ label: 'Source', value: d.source_type.replace(/_/g, ' ') }] : []),
      ...(d.processing_status ? [{ label: 'Processing', value: d.processing_status }] : []),
      ...(d.relevance ? [{ label: 'Relevance', value: d.relevance }] : []),
      ...(d.research_round ? [{ label: 'Round', value: String(d.research_round) }] : []),
      ...(d.document_label && d.original_filename && d.document_label !== d.original_filename ? [{ label: 'Uploaded as', value: d.original_filename }] : []),
    ],
  };
}

async function patchDoc(projectId: string, id: string, body: Record<string, unknown>): Promise<ResearchDocLike> {
  const res = await fetch(`/api/admin/research/${projectId}/documents/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json.document as ResearchDocLike;
}

export interface ResearchDocCapabilityHooks {
  projectId: string;
  docFor: (id: string) => ResearchDocLike | undefined;
  onChanged: () => void;
  onDelete?: (id: string) => Promise<void>;
}

export function researchDocCapabilities(hooks: ResearchDocCapabilityHooks): ViewerCapabilities {
  const after = (d: ResearchDocLike) => { hooks.onChanged(); return researchDocToViewerFile({ ...(hooks.docFor(d.id) ?? {}), ...d } as ResearchDocLike); };
  const send = async (id: string, mode: 'move' | 'copy', destination: Destination) => {
    // The pop-up's folder is a research project under Research Documents: mnt:research:<projectId>.
    const target = destination.id.startsWith('mnt:research:') ? destination.id.slice('mnt:research:'.length) : destination.id;
    if (target === hooks.projectId) throw new Error('The document is already in this research project.');
    const res = await fetch(`/api/admin/research/${hooks.projectId}/documents/${id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, target_project_id: target }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    hooks.onChanged();
  };
  return {
    rename: async (file, newName) => {
      const d = hooks.docFor(file.id);
      const label = d && newName === (d.original_filename ?? '') ? null : newName;
      return after(await patchDoc(hooks.projectId, file.id, { document_label: label }));
    },
    updateNotes: async (file, notes) => after(await patchDoc(hooks.projectId, file.id, { notes })),
    updateTags: async (file, tags) => after(await patchDoc(hooks.projectId, file.id, { tags })),
    canSendTo: (folder) => /^mnt:research:[^:]+$/.test(folder.id) && folder.id !== `mnt:research:${hooks.projectId}`,
    sendHint: 'another research project, under Research Documents',
    move: async (file, destination) => send(file.id, 'move', destination),
    copy: async (file, destination) => send(file.id, 'copy', destination),
    ...(hooks.onDelete ? { delete: async (file) => { await hooks.onDelete!(file.id); } } : {}),
  };
}
