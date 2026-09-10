// app/api/admin/jobs/files/[id]/send/route.ts — move or copy a job/project attachment to another job or project.
//
// Owner, 2026-09-09: "We need to be able to copy and paste files and send them to new destinations."
// The old PATCH deliberately refused to change `job_id` / `project_id` ("moving a file between jobs
// is a real feature and it is not this one"). This is that feature.
//
//   POST { mode: 'move' | 'copy', job_id?: string, project_id?: string }
//
// A MOVE re-parents the row (the bytes stay where they are; the storage key is per-file, not
// per-job). A COPY duplicates the storage object under a fresh key and inserts a second row that
// carries the label, tags and description. Legacy inline rows (`file_url`) copy by row alone —
// their bytes live in the row. Linked explorer documents copy as a second link.

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler, fireAndForget } from '@/lib/apiErrorHandler';
import { bucketOf, downloadHref, shapeOf, jobFileStoragePath, type JobFileRow } from '@/lib/jobs/file-storage';

interface SendBody { mode?: 'move' | 'copy'; job_id?: string | null; project_id?: string | null; section?: string | null; file_type?: string | null }

export const POST = withErrorHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as SendBody;
  const mode = body.mode === 'copy' ? 'copy' : body.mode === 'move' ? 'move' : null;
  if (!mode) return NextResponse.json({ error: 'mode must be "move" or "copy".' }, { status: 400 });

  const jobId = typeof body.job_id === 'string' && body.job_id ? body.job_id : null;
  // The standard folder the file lands in at the destination (lib/files/job-folders.ts) — sent by
  // the explorer pop-up when a folder rather than a bare job was chosen (2026-09-10).
  const section = typeof body.section === 'string' && body.section.trim() ? body.section.trim() : null;
  const fileType = typeof body.file_type === 'string' && body.file_type.trim() ? body.file_type.trim() : null;
  let projectId = typeof body.project_id === 'string' && body.project_id ? body.project_id : null;
  if (!jobId && !projectId) return NextResponse.json({ error: 'A destination job_id or project_id is required.' }, { status: 400 });

  // The destination must exist and be live; a job's project is filled in from the job.
  if (jobId) {
    const { data: job } = await supabaseAdmin.from('jobs').select('id, project_id, deleted_at').eq('id', jobId).maybeSingle();
    if (!job || job.deleted_at) return NextResponse.json({ error: 'That job is not here.' }, { status: 404 });
    projectId = (job.project_id as string | null) ?? projectId;
  } else if (projectId) {
    const { data: project } = await supabaseAdmin.from('projects').select('id, deleted_at').eq('id', projectId).maybeSingle();
    if (!project || project.deleted_at) return NextResponse.json({ error: 'That project is not here.' }, { status: 404 });
  }

  const { data } = await supabaseAdmin.from('job_files').select('*').eq('id', ctx.params.id).maybeSingle();
  const row = data as (JobFileRow & Record<string, unknown> & { is_deleted?: boolean | null; is_backup?: boolean | null }) | null;
  if (!row || row.is_deleted) return NextResponse.json({ error: 'That file is not here.' }, { status: 404 });
  if (row.is_backup) return NextResponse.json({ error: 'A backup twin cannot be sent on its own.' }, { status: 400 });

  const sameOwner = (row.job_id ?? null) === jobId && (row.project_id ?? null) === projectId;
  if (mode === 'move' && sameOwner) return NextResponse.json({ error: 'The file is already there.' }, { status: 400 });

  const actor = session.user.email;
  const ownerKey = jobId ?? projectId ?? 'unfiled';

  if (mode === 'move') {
    const { data: moved, error } = await supabaseAdmin
      .from('job_files')
      .update({ job_id: jobId, project_id: projectId, ...(section ? { section } : {}), ...(fileType ? { file_type: fileType } : {}) })
      .eq('id', row.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await fireAndForget(supabaseAdmin.from('activity_log').insert({
      user_email: actor,
      action_type: 'job_file_moved',
      entity_type: jobId ? 'job' : 'project',
      entity_id: jobId ?? projectId,
      metadata: { file_id: row.id, file_name: row.file_name ?? row.name, from_job_id: row.job_id ?? null, from_project_id: row.project_id ?? null },
    }));
    const r = moved as JobFileRow;
    return NextResponse.json({ file: { ...moved, download_href: downloadHref(r), storage_shape: shapeOf(r) } });
  }

  // ── copy ──
  const shape = shapeOf(row);
  const newId = randomUUID();
  let storagePath: string | null = null;
  let storageBucket: string | null = null;
  if (shape === 'storage' && row.storage_path) {
    const bucket = bucketOf(row);
    const dest = jobFileStoragePath(ownerKey, newId, (row.file_name ?? row.name ?? 'file') as string);
    const { error: copyErr } = await supabaseAdmin.storage.from(bucket).copy(row.storage_path, dest);
    if (copyErr) return NextResponse.json({ error: `Could not copy the file's bytes: ${copyErr.message}` }, { status: 500 });
    storagePath = dest;
    storageBucket = bucket;
  } else if (shape === 'missing') {
    return NextResponse.json({ error: 'This attachment has no file behind it to copy.' }, { status: 400 });
  }

  const { data: copied, error: insErr } = await supabaseAdmin
    .from('job_files')
    .insert({
      id: newId,
      job_id: jobId,
      project_id: projectId,
      file_name: row.file_name ?? row.name ?? 'file',
      name: row.name ?? row.file_name ?? 'file',
      file_type: fileType ?? row.file_type ?? 'other',
      file_size: row.file_size ?? null,
      file_size_bytes: row.file_size_bytes ?? null,
      mime_type: row.mime_type ?? null,
      content_type: row.content_type ?? null,
      section: section ?? row.section ?? 'general',
      description: row.description ?? null,
      label: row.label ?? null,
      tags: row.tags ?? [],
      uploaded_by: actor,
      file_node_id: row.file_node_id ?? null,
      file_url: shape === 'storage' ? null : (row.file_url ?? null),
      storage_path: storagePath,
      storage_bucket: storageBucket,
      upload_state: storagePath ? 'done' : row.upload_state ?? null,
    })
    .select()
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  await fireAndForget(supabaseAdmin.from('activity_log').insert({
    user_email: actor,
    action_type: 'job_file_copied',
    entity_type: jobId ? 'job' : 'project',
    entity_id: jobId ?? projectId,
    metadata: { file_id: newId, copied_from: row.id, file_name: row.file_name ?? row.name },
  }));
  const r = copied as JobFileRow;
  return NextResponse.json({ file: { ...copied, download_href: downloadHref(r), storage_shape: shapeOf(r) } }, { status: 201 });
}, { routeName: 'jobs/files/send' });
