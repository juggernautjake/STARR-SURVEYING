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

  // ── SEARCH (2026-08-19) ──────────────────────────────────────────────────────────────────────
  //
  // Owner: *"search for projects by date or range of time or key words like owner name or by who
  // was assigned to it."*
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const assignee = searchParams.get('assignee');
  const recent = searchParams.get('recent') === 'true';

  // ── "assigned to" is a JOB fact, not a project one ───────────────────────────────────────────
  //
  // Nobody is assigned to a project; people are assigned to its jobs. So this resolves to "projects
  // holding a job this person is on" — done first, because it produces an id list the main query
  // filters by, and an empty list is a real "no matches" rather than a reason to skip the filter.
  let assignedProjectIds: string[] | null = null;
  if (assignee && assignee.trim()) {
    const term = assignee.trim();
    const { data: team } = await supabaseAdmin
      .from('job_team')
      .select('job_id')
      .is('removed_at', null)
      .or(`user_email.ilike.%${term}%,user_name.ilike.%${term}%`);
    const teamRows = (team ?? []) as unknown as Array<{ job_id: string }>;
    const jobIds = [...new Set(teamRows.map((t) => String(t.job_id)))];
    if (jobIds.length === 0) {
      assignedProjectIds = [];
    } else {
      const { data: jobs } = await supabaseAdmin.from('jobs').select('project_id').in('id', jobIds);
      const jobRows = (jobs ?? []) as unknown as Array<{ project_id: string | null }>;
      assignedProjectIds = [...new Set(
        jobRows.map((j) => j.project_id).filter((x): x is string => Boolean(x)),
      )];
    }
  }

  let query = supabaseAdmin.from('projects').select(COLS, { count: 'exact' });
  query = deleted ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null);
  if (!deleted) query = query.eq('is_archived', archived);
  if (status && isProjectStatus(status)) query = query.eq('status', status);
  if (assignedProjectIds !== null) {
    if (assignedProjectIds.length === 0) return NextResponse.json({ projects: [], total: 0 });
    query = query.in('id', assignedProjectIds);
  }
  // A date range matches on EITHER end of the project's life. Filtering on `updated_at` alone would
  // hide a project created in January from a January search once it was touched in August, and
  // filtering on `created_at` alone would hide August's work on it. Both are the honest answer to
  // "was this project a thing during that period".
  if (from) query = query.or(`created_at.gte.${from},updated_at.gte.${from}`);
  if (to) {
    // `to` is a date, and a date means the END of that day — otherwise picking today as the upper
    // bound excludes everything done today, which is the most common search there is.
    const end = /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999Z` : to;
    query = query.lte('created_at', end);
  }
  if (search) {
    // Widened beyond name/number/client/address: county and city are how a surveyor describes a
    // job out loud, and the company is often the only name anyone remembers.
    query = query.or(
      `name.ilike.%${search}%,project_number.ilike.%${search}%,client_name.ilike.%${search}%,`
      + `client_company.ilike.%${search}%,address.ilike.%${search}%,city.ilike.%${search}%,`
      + `county.ilike.%${search}%,subdivision.ilike.%${search}%,description.ilike.%${search}%`,
    );
  }

  const { data, error, count } = await query
    .order('updated_at', { ascending: false })
    // `recent` needs a wider slice than it returns: the ordering below folds in opens and job
    // activity, which the database order cannot see, so the top 5 by `updated_at` are not
    // necessarily the top 5 by "last touched".
    .range(offset, offset + (recent ? 60 : limit) - 1);
  if (error) return dbErrorResponse(error, 'load projects');

  const projects = (data ?? []) as unknown as Array<Record<string, unknown> & { id: string }>;

  // ── The roll-up, in ONE query for the whole page ────────────────────────────────────────────
  //
  // Per-project queries would be N+1 on a list that is meant to be scanned. Money is never stored
  // on a project (see the model): a stored total drifts the first time a job is edited by something
  // that does not know to update its parent, and a wrong money figure is worse than none.
  const ids = projects.map((p) => p.id);
  const byProject = new Map<string, JobMoney[]>();
  // When each project's newest job moved — half of "worked on", and invisible from `projects` alone
  // because editing a job does not touch its parent row.
  const jobTouched = new Map<string, string>();
  if (ids.length > 0) {
    const { data: jobs } = await supabaseAdmin
      .from('jobs')
      .select('project_id, updated_at, quote_amount, final_amount, amount_paid, stage, is_archived, deleted_at')
      .in('project_id', ids);
    for (const j of (jobs ?? []) as Array<JobMoney & { project_id: string; updated_at: string | null }>) {
      const list = byProject.get(j.project_id);
      if (list) list.push(j);
      else byProject.set(j.project_id, [j]);
      const prev = jobTouched.get(j.project_id);
      if (j.updated_at && (!prev || j.updated_at > prev)) jobTouched.set(j.project_id, j.updated_at);
    }
  }

  // ── WHEN EACH PROJECT WAS LAST OPENED ────────────────────────────────────────────────────────
  //
  // This caller's own opens first, because "recent projects" means the ones YOU were in. Everyone
  // else's are read too and used as a fallback, so a person who has opened nothing still sees the
  // projects the firm has been working rather than an empty strip on their first visit.
  const mine = new Map<string, string>();
  const anyone = new Map<string, string>();
  if (ids.length > 0) {
    const { data: opens } = await supabaseAdmin
      .from('project_opens')
      .select('project_id, user_email, opened_at')
      .in('project_id', ids);
    for (const o of (opens ?? []) as Array<{ project_id: string; user_email: string; opened_at: string }>) {
      if (o.user_email === session.user.email) {
        const prev = mine.get(o.project_id);
        if (!prev || o.opened_at > prev) mine.set(o.project_id, o.opened_at);
      }
      const prevAny = anyone.get(o.project_id);
      if (!prevAny || o.opened_at > prevAny) anyone.set(o.project_id, o.opened_at);
    }
  }

  const withMeta = projects.map((p) => {
    const openedByMe = mine.get(p.id) ?? null;
    // The three verbs the owner named, reduced to one comparable instant: created (which sets
    // `updated_at`), worked on (the project row or any of its jobs), and opened.
    const touched = [
      String(p.updated_at ?? ''),
      jobTouched.get(p.id) ?? '',
      openedByMe ?? anyone.get(p.id) ?? '',
    ].filter(Boolean).sort().pop() ?? String(p.created_at ?? '');
    return {
      ...p,
      rollup: rollUp(byProject.get(p.id) ?? []),
      last_touched_at: touched,
      opened_by_me_at: openedByMe,
    };
  });

  if (recent) {
    withMeta.sort((a, b) => String(b.last_touched_at).localeCompare(String(a.last_touched_at)));
    return NextResponse.json({ projects: withMeta.slice(0, limit), total: withMeta.length });
  }

  return NextResponse.json({ projects: withMeta, total: count ?? withMeta.length });
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
