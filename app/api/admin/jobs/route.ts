// app/api/admin/jobs/route.ts — Core Jobs CRUD
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler, dbErrorResponse, fireAndForget } from '@/lib/apiErrorHandler';
import { recordMilestone, toCents } from '@/lib/pipeline/events';
import { inheritFromProject, INHERITED_FIELDS } from '@/lib/projects/model';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const stage = searchParams.get('stage');
  const search = searchParams.get('search');
  const myJobs = searchParams.get('my_jobs') === 'true';
  const archived = searchParams.get('archived') === 'true';
  // job-soft-delete Slice 1 — `?deleted=true` lists the trash
  // (soft-deleted jobs inside their 30-day recovery window); every
  // other list excludes deleted rows.
  const deleted = searchParams.get('deleted') === 'true';
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
    .range(offset, offset + limit - 1);

  // job-soft-delete Slice 1 — the trash view lists soft-deleted jobs
  // (newest-deleted first); every other view excludes them. Archive
  // is an independent axis, only applied outside the trash view.
  if (deleted) {
    query = query.not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
  } else {
    query = query.is('deleted_at', null).eq('is_archived', archived).order('created_at', { ascending: false });
  }

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
    date_received, date_quoted, date_accepted, date_started, stage,
    // A6 — where this job came from. All optional: a job typed straight into the office has no lead,
    // no customer and no quote behind it, and that is an ordinary job, not an incomplete one.
    origin_lead_id, customer_id, accepted_quote_id,
    // 2026-08-19 — every job belongs to a project. See seeds/601.
    project_id } = body;

  if (!name) return NextResponse.json({ error: 'Job name is required' }, { status: 400 });

  // ── THE PROJECT, WHICH IS NOW REQUIRED ───────────────────────────────────────────────────────
  //
  // Owner's decision, 2026-08-19: a job cannot exist outside a project. The database enforces it
  // too (`jobs.project_id` is NOT NULL with a foreign key), and this check exists so the caller
  // gets a sentence rather than a constraint violation. It is also where the client and site facts
  // come from, so that the fourth job on a parcel is not a fourth retyping of the same address.
  if (!project_id) {
    return NextResponse.json(
      { error: 'A job must belong to a project. Pick a project, or create one first.', code: 'PROJECT_REQUIRED' },
      { status: 400 },
    );
  }
  const { data: project, error: projErr } = await supabaseAdmin
    .from('projects')
    .select('id, org_id, ' + INHERITED_FIELDS.join(', '))
    .eq('id', project_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (projErr) return dbErrorResponse(projErr, 'look up the project');
  if (!project) {
    return NextResponse.json({ error: 'That project no longer exists.', code: 'PROJECT_MISSING' }, { status: 404 });
  }

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
      // ── Inherited from the project, but never OVER what the caller typed ─────────────────────
      //
      // `inheritFromProject` fills only the blanks. Somebody entering a different address is
      // telling you this job is on the adjoining parcel, and a project that overwrote it would
      // silently discard the more specific of the two facts. The values are WRITTEN ONTO the job
      // rather than resolved through the project on read, so a job stays a complete, self-
      // describing record — every PDF export, field packet and CAD title block already reads
      // `job.client_name` and `job.address`.
      ...inheritFromProject(project as Record<string, unknown>, {
        address, city, zip, county,
        acreage, client_name, client_email, client_phone, client_company, client_address,
        lot_number, subdivision, abstract_number, latitude, longitude,
        lead_rpls_email, customer_id: customer_id || null,
      }),
      project_id,
      name, job_number: finalJobNumber, description,
      state: state || 'TX', survey_type: survey_type || 'boundary',
      deadline, quote_amount, notes,
      is_legacy: is_legacy || false,
      is_priority: is_priority || false,
      date_received, date_quoted, date_accepted, date_started,
      stage: stage || 'quote',
      created_by: session.user.email,
      // A6 — the forward links. `origin_lead_id` turns "where did this job come from" into a key lookup
      // instead of the unindexed reverse scan over `leads.converted_job_id` that origin-lead was doing.
      origin_lead_id: origin_lead_id || null,
      // NOT re-set here: `customer_id` is one of the inherited fields above, so writing it again
      // after the spread would overwrite the project's customer with null on every job created
      // without one — which is most of them.
      accepted_quote_id: accepted_quote_id || null,
    })
    .select()
    .single();

  // The main insert is the most failure-prone step (NOT NULL, FK, RLS).
  // dbErrorResponse turns the raw Postgres code into a specific message.
  if (error) return dbErrorResponse(error, 'create the job');
  if (!job) return NextResponse.json({ error: 'Job insert returned no row.' }, { status: 500 });

  // A6 — MILESTONE 5, and it is the primary bidding conversion.
  //
  // This is the event Google is told about and the one Smart Bidding optimises toward, so it is recorded
  // the moment the job exists rather than being derived later from a date column. `recordMilestone` is
  // idempotent on its dedupe key, so a retried request appends nothing — which matters more here than
  // anywhere else in the stream: a duplicated `job_created` is a job counted twice in the revenue signal.
  //
  // Valued at the quote, because that is what the customer agreed to. The final invoice may differ and is
  // handled as an adjustment (A9), not by restating this.
  await recordMilestone({
    milestone: 'job_created',
    jobId: (job as { id: string }).id,
    leadId: origin_lead_id || null,
    customerId: customer_id || null,
    // `date_accepted` is preferred over "now" for the same reason the backfill prefers it: the event
    // worth attributing is when the customer said yes, not when someone got round to typing it in.
    occurredAt: date_accepted || undefined,
    valueCents: toCents(typeof quote_amount === 'number' ? quote_amount : Number(quote_amount)),
    actor: session.user.email,
    sourceTable: 'jobs',
    sourceId: (job as { id: string }).id,
  });

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
    action_type: 'job_created',
    entity_type: 'job',
    entity_id: job.id,
    metadata: { job_number: finalJobNumber, name },
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

  // Remove relational fields from direct update. `price_reason` is not a column — it is the
  // explanation that rides along with a price change and lands in `job_price_history`.
  const { tags, price_reason, ...directUpdates } = updates;

  // ── A PRICE CHANGE IS A COMMERCIAL EVENT, NOT AN EDIT (2026-08-19) ───────────────────────────
  //
  // Owner: *"sometimes we change the price of the job as well, and we need to be able to record the
  // history of when payments are made and when price changes are made."*
  //
  // `quote_amount` and `final_amount` were single values that got overwritten — change a quote from
  // $4,200 to $5,600 and the $4,200 was simply gone, with no record it was ever offered. "We bid
  // 4,200, then they added the topo" is the sentence somebody has to reconstruct months later while
  // being asked why the invoice does not match the proposal.
  //
  // Read BEFORE the update: afterwards the old figure no longer exists anywhere.
  const touchesMoney = directUpdates.quote_amount !== undefined || directUpdates.final_amount !== undefined;
  const { data: before } = touchesMoney
    ? await supabaseAdmin.from('jobs').select('quote_amount, final_amount, result').eq('id', id).maybeSingle()
    : { data: null };

  // Cancelling is likewise a moment, not just a value: stamp when, so it is not inferred from
  // `stage_changed_at`, which moves on every transition.
  const nowCancelled = directUpdates.result === 'lost' || directUpdates.result === 'abandoned';
  if (nowCancelled && !(before as { result?: string } | null)?.result) {
    directUpdates.cancelled_at = new Date().toISOString();
    directUpdates.result_set_at = directUpdates.result_set_at ?? new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from('jobs')
    .update(directUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) return dbErrorResponse(error, 'update the job');

  if (touchesMoney && before) {
    const prev = before as { quote_amount: number | null; final_amount: number | null };
    const rows: Array<Record<string, unknown>> = [];
    const changed = (a: number | null, b: unknown) =>
      b !== undefined && Number(a ?? NaN) !== Number(b ?? NaN) && !(a == null && b == null);

    if (changed(prev.quote_amount, directUpdates.quote_amount)) {
      rows.push({ job_id: id, field: 'quote', old_amount: prev.quote_amount, new_amount: directUpdates.quote_amount });
    }
    if (changed(prev.final_amount, directUpdates.final_amount)) {
      rows.push({ job_id: id, field: 'final', old_amount: prev.final_amount, new_amount: directUpdates.final_amount });
    }
    // Advisory: the price is already saved, and losing the audit line is bad but losing the edit
    // because the audit failed would be worse.
    if (rows.length > 0) {
      await fireAndForget(supabaseAdmin.from('job_price_history').insert(
        rows.map((r) => ({ ...r, reason: price_reason ?? null, changed_by: session.user!.email })),
      ));
    }
  }

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

  // job-soft-delete Slice 1 — true soft delete: set the `deleted_at`
  // tombstone so the job drops out of every list but stays recoverable
  // for 30 days (restore = PUT { id, deleted_at: null }; the purge
  // cron hard-deletes past the window). Distinct from `is_archived`,
  // which leaves the job live.
  const { data, error } = await supabaseAdmin
    .from('jobs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, name, job_number, deleted_at')
    .maybeSingle();

  if (error) return dbErrorResponse(error, 'delete the job');
  if (!data) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  return NextResponse.json({ success: true, job: data });
}, { routeName: 'jobs', exposeErrors: true });
