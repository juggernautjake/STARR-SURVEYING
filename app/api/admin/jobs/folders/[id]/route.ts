// app/api/admin/jobs/folders/[id]/route.ts — rename or remove a named job folder (owner, 2026-09-15).
//
//   PATCH  { name }   rename; refused when a folder of that name is already beside it
//   DELETE            remove the folder and the folders inside it — NEVER the files: every file in
//                     them moves up to where the folder was (its parent named folder, or straight
//                     into its standard folder). Losing a folder is an inconvenience; losing the
//                     twelve deeds somebody filed in it would be a disaster nobody asked for.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler, fireAndForget } from '@/lib/apiErrorHandler';
import { checkFolderName } from '@/lib/files/job-folders';

interface FolderRow { id: string; job_id: string; name: string; parent_key: string | null; parent_id: string | null }

async function liveFolder(id: string): Promise<FolderRow | null> {
  const { data } = await supabaseAdmin
    .from('job_file_folders')
    .select('id, job_id, name, parent_key, parent_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  return (data as FolderRow | null) ?? null;
}

export const PATCH = withErrorHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const folder = await liveFolder(ctx.params.id);
  if (!folder) return NextResponse.json({ error: 'That folder is not here.' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const check = checkFolderName(body.name);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  let siblings = supabaseAdmin
    .from('job_file_folders')
    .select('id, name')
    .eq('job_id', folder.job_id)
    .is('deleted_at', null)
    .neq('id', folder.id);
  siblings = folder.parent_id ? siblings.eq('parent_id', folder.parent_id) : siblings.is('parent_id', null);
  if (!folder.parent_id) siblings = folder.parent_key ? siblings.eq('parent_key', folder.parent_key) : siblings.is('parent_key', null);
  const { data: others } = await siblings;
  if ((others ?? []).some((f: { name: string }) => f.name.trim().toLowerCase() === check.value.toLowerCase())) {
    return NextResponse.json({ error: `There is already a folder called "${check.value}" there.` }, { status: 409 });
  }

  const { data: updated, error } = await supabaseAdmin
    .from('job_file_folders')
    .update({ name: check.value, updated_at: new Date().toISOString() })
    .eq('id', folder.id)
    .select('id, name, parent_key, parent_id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await fireAndForget(supabaseAdmin.from('activity_log').insert({
    user_email: session.user.email,
    action_type: 'job_folder_renamed',
    entity_type: 'job',
    entity_id: folder.job_id,
    metadata: { folder_id: folder.id, name_from: folder.name, name_to: check.value },
  }));

  return NextResponse.json({ folder: updated });
}, { routeName: 'jobs/folders/[id]' });

export const DELETE = withErrorHandler(async (_req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const folder = await liveFolder(ctx.params.id);
  if (!folder) return NextResponse.json({ error: 'That folder is not here.' }, { status: 404 });

  // The folder and everything nested under it, from one read of the job's folders.
  const { data: all, error: listErr } = await supabaseAdmin
    .from('job_file_folders')
    .select('id, parent_id')
    .eq('job_id', folder.job_id)
    .is('deleted_at', null);
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
  const doomed = new Set<string>([folder.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of (all ?? []) as Array<{ id: string; parent_id: string | null }>) {
      if (f.parent_id && doomed.has(f.parent_id) && !doomed.has(f.id)) { doomed.add(f.id); grew = true; }
    }
  }
  const ids = [...doomed];

  // Files first: up to where the folder was. Only then the folders — the other order would leave a
  // window in which the files point at folders that no longer list.
  const { data: moved, error: moveErr } = await supabaseAdmin
    .from('job_files')
    .update({ folder_id: folder.parent_id })
    .in('folder_id', ids)
    .select('id');
  if (moveErr) return NextResponse.json({ error: moveErr.message }, { status: 500 });

  const now = new Date().toISOString();
  const { error: delErr } = await supabaseAdmin
    .from('job_file_folders')
    .update({ deleted_at: now, updated_at: now })
    .in('id', ids);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  await fireAndForget(supabaseAdmin.from('activity_log').insert({
    user_email: session.user.email,
    action_type: 'job_folder_deleted',
    entity_type: 'job',
    entity_id: folder.job_id,
    metadata: { folder_id: folder.id, name: folder.name, folders_removed: ids.length, files_moved_up: (moved ?? []).length },
  }));

  return NextResponse.json({ success: true, folders_removed: ids.length, files_moved_up: (moved ?? []).length });
}, { routeName: 'jobs/folders/[id]' });
