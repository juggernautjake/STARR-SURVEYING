// lib/files/job-folders-server.ts — the one check every write that files a job file into a named
// folder makes (owner, 2026-09-15): upload (`jobs/files` POST), move within a job (`jobs/files/[id]`
// PATCH) and send / copy to another job (`jobs/files/[id]/send`).
//
// A folder id from a client is only a claim. It must name a LIVE folder of the SAME job the file is
// in, or the file would list under a job it does not belong to (or under nothing at all).

import { supabaseAdmin } from '@/lib/supabase';

export type FolderIdCheck =
  | { ok: true; folderId: string | null }
  | { ok: false; status: number; error: string };

/** `raw` undefined → not sent (ok, null). `null`/'' → explicitly no named folder (ok, null). */
export async function checkJobFolderId(raw: unknown, jobId: string | null | undefined): Promise<FolderIdCheck> {
  if (raw === undefined || raw === null || raw === '') return { ok: true, folderId: null };
  if (typeof raw !== 'string' || !/^[0-9a-f-]{36}$/i.test(raw)) return { ok: false, status: 400, error: 'That folder is not here.' };
  if (!jobId) return { ok: false, status: 400, error: 'Named folders live inside a job.' };
  const { data } = await supabaseAdmin
    .from('job_file_folders')
    .select('id, job_id')
    .eq('id', raw)
    .is('deleted_at', null)
    .maybeSingle();
  if (!data || data.job_id !== jobId) return { ok: false, status: 404, error: 'That folder is not in this job any more — choose another.' };
  return { ok: true, folderId: data.id as string };
}
