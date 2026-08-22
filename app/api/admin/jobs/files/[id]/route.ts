// app/api/admin/jobs/files/[id]/route.ts — change what a file is called, and how it is tagged.
//
// Owner, 2026-08-22: *"I need to be able to name them and write notes for them too."*
//
// ── WHY THIS ROUTE IS NEW ───────────────────────────────────────────────────────────────────────
//
// `job_files` has had `name` and `description` columns since it was created. Nothing has ever been
// able to WRITE them after the upload: `/api/admin/jobs/files` has GET, POST and DELETE and no
// PATCH, and the only place `description` is set is the upload form. So a phone video called
// `IMG_4417.MOV` stayed `IMG_4417.MOV`, and the sentence explaining what it shows had to be typed
// before anyone had watched it back.
//
// The columns existing was mistaken for the feature existing. It is worth stating plainly because
// this is the second time on this table: the same shape of gap made the File Explorer's "Job Files"
// folder structurally empty (see `lib/jobs/file-storage.ts`).
//
// ── WHAT IT DELIBERATELY WILL NOT CHANGE ────────────────────────────────────────────────────────
//
// `file_name`, `storage_path`, `storage_bucket`, `job_id`, `project_id`. Renaming is a display
// concern; the first three are how the bytes are found and the last two are what the file belongs
// to. Moving a file between jobs is a real feature and it is not this one — doing it as a side
// effect of a rename would move files by accident.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler, fireAndForget } from '@/lib/apiErrorHandler';
import { checkLabel, parseTags } from '@/lib/files/labels';
import { downloadHref, shapeOf, type JobFileRow } from '@/lib/jobs/file-storage';

export const GET = withErrorHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabaseAdmin
    .from('job_files')
    .select('*')
    .eq('id', ctx.params.id)
    .maybeSingle();

  const row = data as (JobFileRow & { is_deleted?: boolean | null }) | null;
  if (!row || row.is_deleted) return NextResponse.json({ error: 'That file is not here.' }, { status: 404 });

  return NextResponse.json({
    file: { ...row, download_href: downloadHref(row), storage_shape: shapeOf(row) },
  });
}, { routeName: 'jobs/files/[id]' });

export const PATCH = withErrorHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    label?: string | null;
    tags?: string[] | string;
    description?: string | null;
    file_type?: string;
    section?: string;
  };

  const { data: existing } = await supabaseAdmin
    .from('job_files')
    .select('id, job_id, project_id, file_name, label, tags, is_deleted')
    .eq('id', ctx.params.id)
    .maybeSingle();

  if (!existing || existing.is_deleted) {
    return NextResponse.json({ error: 'That file is not here.' }, { status: 404 });
  }

  // Build the patch from only the keys that were actually sent. `'label' in body` rather than a
  // truthiness check, because `null` is a meaningful value here — it CLEARS the rename and restores
  // the uploaded name, and a truthiness check would make that the one edit nobody could make.
  const patch: Record<string, unknown> = {};

  if ('label' in body) {
    const check = checkLabel(body.label);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
    patch.label = check.value;
  }

  if ('tags' in body) {
    // Normalised server-side even though the client normalises too. The client's copy is a
    // convenience for showing the chip as it will be stored; this one is the rule, because anything
    // that can POST can send `["Monument", "monument", "MONUMENT "]` and turn the tag filter into
    // three rows that mean one thing.
    patch.tags = parseTags(body.tags);
  }

  if ('description' in body) {
    const raw = typeof body.description === 'string' ? body.description.trim() : '';
    patch.description = raw || null;
  }

  // The two existing closed vocabularies. Left as free strings rather than validated against the
  // UI's lists on purpose: those lists live in the component and have grown twice, and a route that
  // rejected a value the dropdown offers would be a bug that only appears after a deploy.
  if (typeof body.file_type === 'string' && body.file_type.trim()) patch.file_type = body.file_type.trim();
  if (typeof body.section === 'string' && body.section.trim()) patch.section = body.section.trim();

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  }

  patch.updated_at = new Date().toISOString();

  const { data: updated, error } = await supabaseAdmin
    .from('job_files')
    .update(patch)
    .eq('id', ctx.params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // `action_type`/`metadata`, NOT `action`/`details` — the column names this table actually has.
  // Getting that wrong is why jobs, CAD and files silently recorded nothing for months.
  await fireAndForget(supabaseAdmin.from('activity_log').insert({
    user_email: session.user.email,
    action_type: 'job_file_updated',
    entity_type: 'job',
    entity_id: existing.job_id ?? existing.project_id,
    metadata: {
      file_id: ctx.params.id,
      file_name: existing.file_name,
      // What changed, not the whole row — an audit line is read to answer "who renamed this", and a
      // dump of every column buries the answer.
      changed: Object.keys(patch).filter((k) => k !== 'updated_at'),
      ...(('label' in body) ? { label_from: existing.label ?? null, label_to: patch.label ?? null } : {}),
    },
  }));

  const row = updated as JobFileRow;
  return NextResponse.json({
    file: { ...row, download_href: downloadHref(row), storage_shape: shapeOf(row) },
  });
}, { routeName: 'jobs/files/[id]' });
