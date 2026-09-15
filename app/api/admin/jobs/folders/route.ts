// app/api/admin/jobs/folders/route.ts — create a named folder inside a job's files (owner, 2026-09-15).
//
// "They should even be able to create and name a new folder to drop the file(s) into."
//
//   POST { job_id, name, parent_key?: 'research' | 'cad' | 'photos' | 'videos' | 'documents', parent_id?: uuid }
//
// `parent_key` puts the folder inside a standard folder; `parent_id` inside another named folder;
// neither puts it at the job's top level. A folder with the same name already in the same place is
// RETURNED rather than refused: somebody typing "Boundary letters" twice in the upload pop-up meant
// the one folder, and an error there would only stop the upload they were in the middle of.
//
// Table and ids: seeds/639_job_file_folders.sql and lib/files/job-folders.ts.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler, fireAndForget } from '@/lib/apiErrorHandler';
import { checkFolderName, NAMED_FOLDER_ROOTS } from '@/lib/files/job-folders';

const UUID = /^[0-9a-f-]{36}$/i;

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    job_id?: string; name?: string; parent_key?: string | null; parent_id?: string | null;
  };

  const jobId = typeof body.job_id === 'string' && UUID.test(body.job_id) ? body.job_id : null;
  if (!jobId) return NextResponse.json({ error: 'job_id is required.' }, { status: 400 });

  const check = checkFolderName(body.name);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const parentId = typeof body.parent_id === 'string' && body.parent_id ? body.parent_id : null;
  let parentKey = typeof body.parent_key === 'string' && body.parent_key ? body.parent_key : null;
  if (parentId && !UUID.test(parentId)) return NextResponse.json({ error: 'That parent folder is not here.' }, { status: 400 });
  if (parentKey && !(NAMED_FOLDER_ROOTS as readonly string[]).includes(parentKey)) {
    return NextResponse.json({ error: 'New folders go inside Research, CAD, Photos, Videos, Documents, or at the top of the job.' }, { status: 400 });
  }

  const { data: job } = await supabaseAdmin.from('jobs').select('id').eq('id', jobId).is('deleted_at', null).maybeSingle();
  if (!job) return NextResponse.json({ error: 'That job no longer exists.' }, { status: 404 });

  // A folder inside a named folder must be inside one of THIS job's live folders, and takes its
  // parent's standard root so every row knows where it sits without walking up.
  if (parentId) {
    const { data: parent } = await supabaseAdmin
      .from('job_file_folders')
      .select('id, job_id, parent_key')
      .eq('id', parentId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!parent || parent.job_id !== jobId) return NextResponse.json({ error: 'That parent folder is not in this job.' }, { status: 404 });
    parentKey = (parent.parent_key as string | null) ?? null;
  }

  // Same name, same place → the folder that is already there.
  let siblings = supabaseAdmin
    .from('job_file_folders')
    .select('id, name, parent_key, parent_id, created_at')
    .eq('job_id', jobId)
    .is('deleted_at', null);
  siblings = parentId ? siblings.eq('parent_id', parentId) : siblings.is('parent_id', null);
  if (!parentId) siblings = parentKey ? siblings.eq('parent_key', parentKey) : siblings.is('parent_key', null);
  const { data: existing, error: sibErr } = await siblings;
  if (sibErr) return NextResponse.json({ error: sibErr.message }, { status: 500 });
  const same = (existing ?? []).find((f: { name: string }) => f.name.trim().toLowerCase() === check.value.toLowerCase());
  if (same) return NextResponse.json({ folder: same, existed: true });

  const { data: folder, error } = await supabaseAdmin
    .from('job_file_folders')
    .insert({ job_id: jobId, name: check.value, parent_key: parentKey, parent_id: parentId, created_by: session.user.email })
    .select('id, name, parent_key, parent_id, created_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // `action_type`/`metadata` — the columns activity_log actually has.
  await fireAndForget(supabaseAdmin.from('activity_log').insert({
    user_email: session.user.email,
    action_type: 'job_folder_created',
    entity_type: 'job',
    entity_id: jobId,
    metadata: { folder_id: folder.id, name: check.value, parent_key: parentKey, parent_id: parentId },
  }));

  return NextResponse.json({ folder, existed: false }, { status: 201 });
}, { routeName: 'jobs/folders' });
