// lib/files/mounts.ts
//
// F9 of FILE_EXPLORER_2026-06-25 — surface existing file sources (receipts,
// job files, research documents, field media) as READ-ONLY virtual folders in
// the explorer, so "all files" are browsable in one tree. These never live in
// file_nodes: they're synthesized on read and capped at 'download' access, so
// no write path (rename/move/delete/permissions) can ever touch them. Each
// source is role-gated; the download route re-validates the same gate.

import { supabaseAdmin } from '@/lib/supabase';
import { isImageMime, isPdfMime } from './upload';
import type { AccessLevel, FileUser } from './permissions';

export const MOUNT_PREFIX = 'mnt:';

type SourceKey = 'receipts' | 'job-files' | 'research' | 'field-media';

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
];

export interface MountNode {
  id: string;
  parent_id: string | null;
  node_type: 'folder' | 'file';
  name: string;
  mime_type: string | null;
  size_bytes: number | null;
  updated_at: string;
  access: AccessLevel;
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
  if (['mp4', 'mov', 'webm'].includes(ext)) return `video/${ext}`;
  if (['m4a', 'mp3', 'wav', 'ogg'].includes(ext)) return `audio/${ext}`;
  return null;
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
}

const LIMIT = 500;

/** List a mount folder's children (its source rows as read-only file nodes). */
export async function listMount(mountId: string, user: FileUser, isAdmin: boolean): Promise<MountListResult> {
  const key = mountId.slice(MOUNT_PREFIX.length) as SourceKey;
  const source = SOURCES.find((s) => s.key === key);
  if (!source) return { ok: false, status: 404, error: 'Unknown source.' };
  if (!canSee(source, user, isAdmin)) return { ok: false, status: 403, error: 'You do not have access to this source.' };

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
    const { data, error } = await supabaseAdmin
      .from('job_files')
      .select('id, name, storage_path, content_type, file_size_bytes, created_at')
      .eq('upload_state', 'done')
      .not('storage_path', 'is', null)
      .order('created_at', { ascending: false })
      .limit(LIMIT);
    if (error) return { ok: false, status: 500, error: error.message };
    const nodes = (data ?? []).map((r: { id: string; name: string | null; storage_path: string; content_type: string | null; file_size_bytes: number | null; created_at: string }) =>
      file(r.id, r.name?.trim() || r.storage_path.split('/').pop() || 'File', r.content_type ?? mimeFromPath(r.storage_path), r.file_size_bytes, r.created_at),
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

export interface MountFileRef {
  ok: boolean;
  status?: number;
  error?: string;
  bucket?: string;
  path?: string;
  name?: string;
  mime?: string | null;
  previewable?: boolean;
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

  if (key === 'receipts') {
    const { data } = await supabaseAdmin.from('receipts').select('photo_url, vendor_name, created_at').eq('id', rowId).maybeSingle();
    const r = data as { photo_url: string; vendor_name: string | null; created_at: string } | null;
    if (!r?.photo_url) return { ok: false, status: 404, error: 'File not found.' };
    const mime = mimeFromPath(r.photo_url);
    return { ok: true, bucket: 'starr-field-receipts', path: r.photo_url, name: `${r.vendor_name?.trim() || 'Receipt'} (${shortDate(r.created_at)})`, mime, previewable: isImageMime(mime) || isPdfMime(mime) };
  }
  if (key === 'job-files') {
    const { data } = await supabaseAdmin.from('job_files').select('name, storage_path, content_type').eq('id', rowId).maybeSingle();
    const r = data as { name: string | null; storage_path: string; content_type: string | null } | null;
    if (!r?.storage_path) return { ok: false, status: 404, error: 'File not found.' };
    const mime = r.content_type ?? mimeFromPath(r.storage_path);
    return { ok: true, bucket: 'starr-field-files', path: r.storage_path, name: r.name?.trim() || 'File', mime, previewable: isImageMime(mime) || isPdfMime(mime) };
  }
  if (key === 'research') {
    const { data } = await supabaseAdmin.from('research_documents').select('original_filename, document_label, storage_path').eq('id', rowId).maybeSingle();
    const r = data as { original_filename: string | null; document_label: string | null; storage_path: string } | null;
    if (!r?.storage_path) return { ok: false, status: 404, error: 'File not found.' };
    const mime = mimeFromPath(r.storage_path);
    return { ok: true, bucket: 'research-documents', path: r.storage_path, name: r.document_label?.trim() || r.original_filename?.trim() || 'Document', mime, previewable: isImageMime(mime) || isPdfMime(mime) };
  }
  // field-media
  const { data } = await supabaseAdmin.from('field_media').select('media_type, storage_url, captured_at').eq('id', rowId).maybeSingle();
  const r = data as { media_type: string; storage_url: string; captured_at: string | null } | null;
  if (!r?.storage_url) return { ok: false, status: 404, error: 'File not found.' };
  const mime = mimeFromPath(r.storage_url);
  return { ok: true, bucket: MEDIA_BUCKET[r.media_type] ?? 'starr-field-photos', path: r.storage_url, name: `${r.media_type} (${shortDate(r.captured_at)})`, mime, previewable: isImageMime(mime) || isPdfMime(mime) };
}
