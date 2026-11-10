// lib/transcripts/media-url.ts — may this person see this file, and where can a transcription service
// fetch it from? Server only.
//
// The same two branches, and the same checks, as app/api/admin/files/[id]/download: a mounted file
// (job files, field media, …) resolves through resolveMountFile; a file node needs download access.
// The answer is a signed URL the service can reach from outside — never a route on this site, which
// would need the caller's cookie.

import { supabaseAdmin } from '@/lib/supabase';
import { accessForNode } from '@/lib/files/server';
import { canDownload, type FileUser } from '@/lib/files/permissions';
import { MOUNT_PREFIX, resolveMountFile } from '@/lib/files/mounts';

/** Long enough for the service to finish fetching a large video. */
const SERVICE_URL_SECONDS = 60 * 30;

export type MediaAccess =
  | { ok: true; name: string | null; mime: string | null; url: string | null }
  | { ok: false; status: number; error: string };

/** Check access; with `sign`, also produce a URL the transcription service can fetch. */
export async function mediaForTranscript(id: string, user: FileUser, admin: boolean, sign: boolean): Promise<MediaAccess> {
  if (id.startsWith(MOUNT_PREFIX)) {
    const ref = await resolveMountFile(id, user, admin);
    if (!ref.ok) return { ok: false, status: ref.status ?? 404, error: ref.error ?? 'File not found.' };
    const name = ref.name ?? null;
    const mime = ref.mime ?? null;
    if (!sign) return { ok: true, name, mime, url: null };
    if (ref.directUrl && /^https?:\/\//i.test(ref.directUrl)) return { ok: true, name, mime, url: ref.directUrl };
    if (!ref.bucket || !ref.path) return { ok: false, status: 400, error: 'This file cannot be transcribed.' };
    const { data, error } = await supabaseAdmin.storage.from(ref.bucket).createSignedUrl(ref.path, SERVICE_URL_SECONDS);
    if (error || !data) return { ok: false, status: 500, error: error?.message ?? 'Could not generate a link.' };
    return { ok: true, name, mime, url: data.signedUrl };
  }

  const { chain, access } = await accessForNode(id, user, admin);
  if (chain.length === 0) return { ok: false, status: 404, error: 'File not found.' };
  const node = chain[chain.length - 1];
  if (node.node_type !== 'file' || !node.storage_bucket || !node.storage_path) return { ok: false, status: 400, error: 'Not a file.' };
  if (!canDownload(access)) return { ok: false, status: 403, error: 'You cannot open this file.' };
  if (!sign) return { ok: true, name: node.name, mime: node.mime_type ?? null, url: null };
  const { data, error } = await supabaseAdmin.storage.from(node.storage_bucket).createSignedUrl(node.storage_path, SERVICE_URL_SECONDS);
  if (error || !data) return { ok: false, status: 500, error: error?.message ?? 'Could not generate a link.' };
  return { ok: true, name: node.name, mime: node.mime_type ?? null, url: data.signedUrl };
}
