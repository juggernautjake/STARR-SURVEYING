// app/api/admin/jobs/route.ts — Core Jobs CRUD
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler, dbErrorResponse, fireAndForget } from '@/lib/apiErrorHandler';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const stage = searchParams.get('stage');
  const search = searchParams.get('search');
  const myJobs = searchParams.get('my_jobs') === 'true';
  const archived = searchParams.get('archived') === 'true';
  const legacy = searchParams.get('legacy') === 'true';
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  // Single job fetch
  if (id) {
    const { data: job, error } = await supabaseAdmin
      .from('jobs')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 404 });

    // Fetch related data
    const [teamRes, tagsRes, equipRes, filesCount, timeRes] = await Promise.all([
      supabaseAdmin.from('job_team').select('*').eq('job_id', id).is('removed_at', null),
      supabaseAdmin.from('job_tags').select('*').eq('job_id', id),
      supabaseAdmin.from('job_equipment').select('*').eq('job_id', id),
      supabaseAdmin.from('job_files').select('id', { count: 'exact' }).eq('job_id', id).eq('is_deleted', false),
      supabaseAdmin.from('job_time_entries').select('duration_minutes').eq('job_id', id),
    ]);

    const totalMinutes = (timeRes.data || []).reduce((sum: number, e: { duration_minutes: number | null }) => sum + (e.duration_minutes || 0), 0);

    return NextResponse.json({
      job: {
        ...job,
        team: teamRes.data || [],
        tags: (tagsRes.data || []).map((t: { tag: string }) => t.tag),
        equipment: equipRes.data || [],
        file_count: filesCount.count || 0,
        total_hours: Math.round((totalMinutes / 60) * 100) / 100,
      },
    });
  }

  // List jobs
  let query = supabaseAdmin
    .from('jobs')
    .select('*, job_team(user_email, user_name, role), job_tags(tag)', { count: 'exact' })
    .eq('is_archived', archived)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (stage && stage !== 'all') query = query.eq('stage', stage);
  if (legacy) query = query.eq('is_legacy', true);
  if (search) query = query.or(`name.ilike.%${search}%,job_number.ilike.%${search}%,client_name.ilike.%${search}%,address.ilike.%${search}%`);

  // For "my jobs", filter to jobs where user is a team member
  if (myJobs) {
    const { data: myJobIds } = await supabaseAdmin
      .from('job_team')
      .select('job_id')
      .eq('user_email', session.user.email)
      .is('removed_at', null);
    const ids = (myJobIds || []).map((j: { job_id: string }) => j.job_id);
    if (ids.length === 0) return NextResponse.json({ jobs: [], total: 0 });
    query = query.in('id', ids);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ jobs: data || [], total: count || 0 });
}, { routeName: 'jobs' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, job_number, description, address, city, state, zip, county, survey_type,
    acreage, client_name, client_email, client_phone, client_company, client_address,
    lead_rpls_email, deadline, quote_amount, notes, tags, is_legacy, is_priority,
    lot_number, subdivision, abstract_number, latitude, longitude,
    date_received, date_quoted, date_accepted, date_started, stage } = body;

  if (!name) return NextResponse.json({ error: 'Job name is required' }, { status: 400 });

  // The jobs table is org-scoped (org_id is NOT NULL). Resolve the
  // creator's organisation so the insert satisfies the constraint —
  // same source of truth the org-scoped job sub-routes use.
  const { data: creator, error: creatorErr } = await supabaseAdmin
    .from('registered_users')
    .select('default_org_id')
    .eq('email', session.user.email)
    .maybeSingle();
  if (creatorErr) {
    // Distinguish "couldn't even look up your account" from "you have
    // no org" — they need different fixes (schema vs. data).
    return dbErrorResponse(creatorErr, 'look up your account');
  }
  if (!creator) {
    return NextResponse.json(
      { error: `No registered_users row found for ${session.user.email}. Your login exists but the user record is missing — re-run the user/org seeds.` },
      { status: 409 },
    );
  }
  if (!creator.default_org_id) {
    return NextResponse.json(
      {
        error: 'Your account is not linked to an organization yet, so the job has nowhere to live. '
          + 'Run seed 289 (dev-bootstrap) or set registered_users.default_org_id for your account, then sign out and back in.',
        step: 'resolve organization',
        code: 'NO_DEFAULT_ORG',
      },
      { status: 409 },
    );
  }
  const orgId = creator.default_org_id;

  // Auto-generate job number if not provided. Scope the running
  // count to this org so two orgs don't collide on the same number.
  let finalJobNumber = job_number;
  if (!finalJobNumber) {
    const year = new Date().getFullYear();
    const { count, error: countErr } = await supabaseAdmin
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .ilike('job_number', `${year}-%`);
    if (countErr) return dbErrorResponse(countErr, 'generate the job number');
    finalJobNumber = `${year}-${String((count || 0) + 1).padStart(4, '0')}`;
  }

  const { data: job, error } = await supabaseAdmin
    .from('jobs')
    .insert({
      org_id: orgId,
      name, job_number: finalJobNumber, description, address, city,
      state: state || 'TX', zip, county, survey_type: survey_type || 'boundary',
      acreage, client_name, client_email, client_phone, client_company, client_address,
      lead_rpls_email, deadline, quote_amount, notes,
      is_legacy: is_legacy || false,
      is_priority: is_priority || false,
      lot_number, subdivision, abstract_number, latitude, longitude,
      date_received, date_quoted, date_accepted, date_started,
      stage: stage || 'quote',
      created_by: session.user.email,
    })
    .select()
    .single();

  // The main insert is the most failure-prone step (NOT NULL, FK, RLS).
  // dbErrorResponse turns the raw Postgres code into a specific message.
  if (error) return dbErrorResponse(error, 'create the job');
  if (!job) return NextResponse.json({ error: 'Job insert returned no row.' }, { status: 500 });

  // Secondary writes. The job already exists, so a failure here must
  // NOT 500 the whole request — collect warnings and return them with
  // the created job so the surveyor knows what didn't get attached.
  const warnings: string[] = [];

  if (tags && Array.isArray(tags) && tags.length > 0) {
    const { error: tagErr } = await supabaseAdmin.from('job_tags').insert(
      tags.map((tag: string) => ({ job_id: job.id, tag }))
    );
    if (tagErr) warnings.push(`Tags not saved: ${tagErr.message}`);
  }

  if (lead_rpls_email) {
    const { error: teamErr } = await supabaseAdmin.from('job_team').insert({
      job_id: job.id,
      user_email: lead_rpls_email,
      role: 'lead_rpls',
    });
    if (teamErr) warnings.push(`Lead RPLS not added to team: ${teamErr.message}`);
  }

  const { error: stageErr } = await supabaseAdmin.from('job_stages_history').insert({
    job_id: job.id,
    to_stage: stage || 'quote',
    changed_by: session.user.email,
    notes: 'Job created',
  });
  if (stageErr) warnings.push(`Stage history not logged: ${stageErr.message}`);

  // Activity log is purely advisory — never surface its failure.
  await fireAndForget(supabaseAdmin.from('activity_log').insert({
    user_email: session.user.email,
    action: 'job_created',
    entity_type: 'job',
    entity_id: job.id,
    details: { job_number: finalJobNumber, name },
  }));

  return NextResponse.json(
    warnings.length > 0 ? { job, warnings } : { job },
    { status: 201 },
  );
}, { routeName: 'jobs', exposeErrors: true });

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'Job ID required' }, { status: 400 });

  // Remove relational fields from direct update
  const { tags, ...directUpdates } = updates;

  const { data, error } = await supabaseAdmin
    .from('jobs')
    .update(directUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) return dbErrorResponse(error, 'update the job');

  // Update tags if provided
  if (tags && Array.isArray(tags)) {
    await supabaseAdmin.from('job_tags').delete().eq('job_id', id);
    if (tags.length > 0) {
      await supabaseAdmin.from('job_tags').insert(
        tags.map((tag: string) => ({ job_id: id, tag }))
      );
    }
  }

  return NextResponse.json({ job: data });
}, { routeName: 'jobs', exposeErrors: true });

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Job ID required' }, { status: 400 });

  // Soft delete (archive)
  const { error } = await supabaseAdmin
    .from('jobs')
    .update({ is_archived: true })
    .eq('id', id);

  if (error) return dbErrorResponse(error, 'archive the job');
  return NextResponse.json({ success: true });
}, { routeName: 'jobs', exposeErrors: true });
