// app/api/admin/projects/route.ts — list and create projects.
//
//   GET  /api/admin/projects?search=&status=&archived=&deleted=&limit=&offset=
//   POST /api/admin/projects  { name, ... }  → a new project with the next P-YYYY-NNNN number
//
// A project is the container the firm actually works in: one client, one parcel, several jobs over
// several months. The rules it enforces live in `lib/projects/model.ts` — this file is the org
// scope, the query, and the roll-up join.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler, dbErrorResponse, fireAndForget } from '@/lib/apiErrorHandler';
import { nextProjectNumber, rollUp, isProjectStatus, type JobMoney } from '@/lib/projects/model';

const COLS =
  'id, project_number, name, description, status, customer_id, client_name, client_email,'
  + ' client_phone, client_company, client_address, address, city, state, zip, county, subdivision,'
  + ' abstract_number, lot_number, acreage, latitude, longitude, lead_rpls_email, notes,'
  + ' is_archived, is_priority, created_by, created_at, updated_at, deleted_at';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search');
  const status = searchParams.get('status');
  const archived = searchParams.get('archived') === 'true';
  const deleted = searchParams.get('deleted') === 'true';
  const limit = Math.min(200, Number.parseInt(searchParams.get('limit') || '50', 10) || 50);
  const offset = Number.parseInt(searchParams.get('offset') || '0', 10) || 0;

  let query = supabaseAdmin.from('projects').select(COLS, { count: 'exact' });
  query = deleted ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null);
  if (!deleted) query = query.eq('is_archived', archived);
  if (status && isProjectStatus(status)) query = query.eq('status', status);
  if (search) {
    query = query.or(
      `name.ilike.%${search}%,project_number.ilike.%${search}%,client_name.ilike.%${search}%,address.ilike.%${search}%`,
    );
  }

  const { data, error, count } = await query
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return dbErrorResponse(error, 'load projects');

  const projects = (data ?? []) as unknown as Array<Record<string, unknown> & { id: string }>;

  // ── The roll-up, in ONE query for the whole page ────────────────────────────────────────────
  //
  // Per-project queries would be N+1 on a list that is meant to be scanned. Money is never stored
  // on a project (see the model): a stored total drifts the first time a job is edited by something
  // that does not know to update its parent, and a wrong money figure is worse than none.
  const ids = projects.map((p) => p.id);
  const byProject = new Map<string, JobMoney[]>();
  if (ids.length > 0) {
    const { data: jobs } = await supabaseAdmin
      .from('jobs')
      .select('project_id, quote_amount, final_amount, amount_paid, stage, is_archived, deleted_at')
      .in('project_id', ids);
    for (const j of (jobs ?? []) as Array<JobMoney & { project_id: string }>) {
      const list = byProject.get(j.project_id);
      if (list) list.push(j);
      else byProject.set(j.project_id, [j]);
    }
  }

  return NextResponse.json({
    projects: projects.map((p) => ({ ...p, rollup: rollUp(byProject.get(p.id) ?? []) })),
    total: count ?? projects.length,
  });
}, { routeName: 'projects' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'A project name is required.' }, { status: 400 });
  if (body.status !== undefined && !isProjectStatus(body.status)) {
    return NextResponse.json({ error: `Unknown status: ${body.status}` }, { status: 400 });
  }

  // Same org resolution the jobs route uses — a project is org-scoped for the same reason a job is.
  const { data: creator, error: creatorErr } = await supabaseAdmin
    .from('registered_users')
    .select('default_org_id')
    .eq('email', session.user.email)
    .maybeSingle();
  if (creatorErr) return dbErrorResponse(creatorErr, 'look up your account');
  if (!creator?.default_org_id) {
    return NextResponse.json(
      {
        error: 'Your account is not linked to an organization yet, so the project has nowhere to live.',
        code: 'NO_DEFAULT_ORG',
      },
      { status: 409 },
    );
  }
  const orgId = creator.default_org_id;

  // The next number comes from the MAX in use this year, not a count — see `nextProjectNumber`.
  const year = new Date().getFullYear();
  const { data: existing, error: numErr } = await supabaseAdmin
    .from('projects')
    .select('project_number')
    .eq('org_id', orgId)
    .ilike('project_number', `P-${year}-%`);
  if (numErr) return dbErrorResponse(numErr, 'generate the project number');
  const projectNumber = (typeof body.project_number === 'string' && body.project_number.trim())
    || nextProjectNumber(
      year,
      ((existing ?? []) as unknown as Array<{ project_number: string | null }>)
        .map((r) => String(r.project_number ?? '')),
    );

  const { data: project, error } = await supabaseAdmin
    .from('projects')
    .insert({
      org_id: orgId,
      project_number: projectNumber,
      name,
      description: body.description ?? null,
      status: body.status ?? 'active',
      customer_id: body.customer_id || null,
      client_name: body.client_name ?? null,
      client_email: body.client_email ?? null,
      client_phone: body.client_phone ?? null,
      client_company: body.client_company ?? null,
      client_address: body.client_address ?? null,
      address: body.address ?? null,
      city: body.city ?? null,
      state: body.state || 'TX',
      zip: body.zip ?? null,
      county: body.county ?? null,
      subdivision: body.subdivision ?? null,
      abstract_number: body.abstract_number ?? null,
      lot_number: body.lot_number ?? null,
      acreage: body.acreage ?? null,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      lead_rpls_email: body.lead_rpls_email ?? null,
      notes: body.notes ?? null,
      is_priority: body.is_priority === true,
      created_by: session.user.email,
    })
    .select(COLS)
    .single();
  if (error) return dbErrorResponse(error, 'create the project');

  await fireAndForget(supabaseAdmin.from('activity_log').insert({
    user_email: session.user.email,
    action_type: 'project_created',
    entity_type: 'project',
    entity_id: (project as { id: string }).id,
    metadata: { project_number: projectNumber, name },
  }));

  return NextResponse.json({ project: { ...project, rollup: rollUp([]) } }, { status: 201 });
}, { routeName: 'projects' });
