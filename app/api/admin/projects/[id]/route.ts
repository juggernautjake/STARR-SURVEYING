// app/api/admin/projects/[id]/route.ts — one project, its jobs, and what they add up to.
//
//   GET    /api/admin/projects/<id>  → { project, jobs, rollup }
//   PATCH  /api/admin/projects/<id>  → edit
//   DELETE /api/admin/projects/<id>  → soft-delete, REFUSED while it still holds live jobs

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { dbErrorResponse, fireAndForget } from '@/lib/apiErrorHandler';
import { rollUp, isProjectStatus, INHERITED_FIELDS, type JobMoney } from '@/lib/projects/model';

const COLS =
  'id, project_number, name, description, status, customer_id, client_name, client_email,'
  + ' client_phone, client_company, client_address, address, city, state, zip, county, subdivision,'
  + ' abstract_number, lot_number, acreage, latitude, longitude, lead_rpls_email, notes,'
  + ' is_archived, is_priority, created_by, created_at, updated_at, deleted_at';

const JOB_COLS =
  'id, job_number, name, survey_type, stage, address, city, county, deadline, quote_amount,'
  + ' final_amount, amount_paid, payment_status, client_name, is_priority, is_archived,'
  + ' created_at, updated_at, deleted_at';

/** Fields a PATCH may set. Deliberately explicit: a spread of the body would let a caller write
 *  `id`, `org_id` or `created_by`, and "the client sent it" is not authorisation. */
const EDITABLE = [
  'name', 'description', 'status', 'notes', 'is_priority', 'is_archived',
  ...INHERITED_FIELDS,
] as const;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: project, error } = await supabaseAdmin
    .from('projects').select(COLS).eq('id', params.id).maybeSingle();
  if (error) return dbErrorResponse(error, 'load the project');
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

  const { data: jobs, error: jobErr } = await supabaseAdmin
    .from('jobs')
    .select(JOB_COLS)
    .eq('project_id', params.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (jobErr) return dbErrorResponse(jobErr, 'load the project’s jobs');

  return NextResponse.json({
    project,
    jobs: jobs ?? [],
    rollup: rollUp((jobs ?? []) as JobMoney[]),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (body.status !== undefined && !isProjectStatus(body.status)) {
    return NextResponse.json({ error: `Unknown status: ${body.status}` }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const field of EDITABLE) {
    if (body[field] !== undefined) updates[field] = body[field];
  }
  if (typeof updates.name === 'string' && !updates.name.trim()) {
    return NextResponse.json({ error: 'A project name is required.' }, { status: 400 });
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }
  updates.updated_at = new Date().toISOString();

  const { data: project, error } = await supabaseAdmin
    .from('projects').update(updates).eq('id', params.id).select(COLS).single();
  if (error) return dbErrorResponse(error, 'update the project');

  // ── Edits do NOT cascade to jobs, on purpose ────────────────────────────────────────────────
  //
  // A job inherits the client and site ONCE, at creation, and its copy is then its own. Pushing a
  // project edit down would silently overwrite a job whose address was deliberately different —
  // the adjoining parcel, the buyer rather than the seller — and that job's own record is the one
  // that gets printed on the drawing. The project page shows which jobs have diverged instead.
  await fireAndForget(supabaseAdmin.from('activity_log').insert({
    user_email: session.user.email,
    action_type: 'project_updated',
    entity_type: 'project',
    entity_id: params.id,
    metadata: { fields: Object.keys(updates).filter((k) => k !== 'updated_at') },
  }));

  return NextResponse.json({ project });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Every job must have a project, so deleting a project that still holds live jobs would either
  // orphan them or delete work nobody asked to delete. Refuse, and say how many are in the way —
  // an error that names the obstacle is one the person can act on.
  const { count, error: countErr } = await supabaseAdmin
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', params.id)
    .is('deleted_at', null);
  if (countErr) return dbErrorResponse(countErr, 'check the project’s jobs');
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `This project still holds ${count} job${count === 1 ? '' : 's'}. Delete or move them first.`,
        jobs: count,
      },
      { status: 409 },
    );
  }

  const { error } = await supabaseAdmin
    .from('projects')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', params.id);
  if (error) return dbErrorResponse(error, 'delete the project');

  await fireAndForget(supabaseAdmin.from('activity_log').insert({
    user_email: session.user.email,
    action_type: 'project_deleted',
    entity_type: 'project',
    entity_id: params.id,
    metadata: {},
  }));

  return NextResponse.json({ ok: true });
}
