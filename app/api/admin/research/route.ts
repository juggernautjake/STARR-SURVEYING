// app/api/admin/research/route.ts — Research Projects CRUD
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { composeAddress, splitStreetLine, type StructuredAddress } from '@/lib/research/property-address';

/* GET — List all research projects (with optional filters) */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const status = searchParams.get('status');
  const search = searchParams.get('search');
  const archived = searchParams.get('archived') === 'true';
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  // Single project fetch
  if (id) {
    const { data: project, error } = await supabaseAdmin
      .from('research_projects')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 404 });

    // Fetch counts in parallel
    const [docsRes, pointsRes, discRes] = await Promise.all([
      supabaseAdmin.from('research_documents').select('id', { count: 'exact' }).eq('research_project_id', id),
      supabaseAdmin.from('extracted_data_points').select('id', { count: 'exact' }).eq('research_project_id', id),
      supabaseAdmin.from('discrepancies').select('id, resolution_status', { count: 'exact' }).eq('research_project_id', id),
    ]);

    const resolvedCount = (discRes.data || []).filter(
      (d: { resolution_status: string }) => d.resolution_status === 'resolved' || d.resolution_status === 'accepted'
    ).length;

    return NextResponse.json({
      project: {
        ...project,
        document_count: docsRes.count || 0,
        data_point_count: pointsRes.count || 0,
        discrepancy_count: discRes.count || 0,
        resolved_count: resolvedCount,
      },
    });
  }

  // List projects
  let query = supabaseAdmin
    .from('research_projects')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (archived) {
    query = query.not('archived_at', 'is', null);
  } else {
    query = query.is('archived_at', null);
  }

  if (status && status !== 'all') query = query.eq('status', status);
  if (search) {
    // Sanitize search input: escape special PostgREST characters to prevent filter injection
    const sanitized = search.replace(/[%_\\(),."']/g, '');
    if (sanitized) {
      query = query.or(`name.ilike.%${sanitized}%,property_address.ilike.%${sanitized}%,county.ilike.%${sanitized}%`);
    }
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ projects: data || [], total: count || 0 });
}, { routeName: 'research' });

/* POST — Create a new research project */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const {
    name, description, property_address, city, county, state, zip, owner_name, parcel_id,
    job_id, allow_paid_documents,
    // Seed 624 — the address arrives in parts and STAYS in parts. See below.
    street_number, street_name, unit, intake_notes,
    // Seed 625 — a deed the operator already has. Seeds the Bell deed-following cascade.
    instrument_number,
  } = body;

  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
  }

  // ── THE ADDRESS IS NO LONGER FLATTENED INTO ONE STRING (seed 624) ────────────────────────────
  //
  // This route used to do:
  //
  //     [property_address, city, state, zip].filter(Boolean).join(', ')
  //
  // and store only the result, with `city` and `zip` copied into `analysis_metadata` — which the
  // pipeline route does not select, so the worker never received them. The worker then tried to
  // guess the parts back out of the string, and on 2026-09-02 it was measured doing so wrongly:
  // `address-normalizer.parseAddress` expects `TEMPLE, TX 76501` and this route emitted
  // `TEMPLE, TX, 76501`, so the pattern missed and `streetName` came out as the whole remainder —
  // "MAIN ST, TEMPLE, TX, 76501" — which is what went into the county CAD's street-name box. It
  // matched nothing, and the run reported no appraisal record for a property that exists.
  //
  // The parts are stored as columns now. `property_address` is still written, because every
  // existing reader displays it and a null would blank the project cards, but it is now COMPOSED
  // (state and ZIP joined with a space, like an envelope) rather than being the only truth.
  //
  // A caller that sends only `property_address` — the public request form, the API, an older
  // client — gets its street line split here so the columns are populated for it too. That split is
  // a guess and is confined to the street line alone; it never invents a city.
  const streetLine = (property_address ?? '').trim();
  const split = splitStreetLine(streetLine);
  const structured: StructuredAddress = {
    // An explicit field always wins over the guess.
    streetNumber: (street_number ?? '').trim() || split.streetNumber || null,
    streetName: (street_name ?? '').trim() || split.streetName || null,
    unit: (unit ?? '').trim() || split.unit || null,
    city: city?.trim() || null,
    county: county?.trim() || null,
    state: state?.trim() || 'TX',
    zip: zip?.trim() || null,
    parcelId: parcel_id?.trim() || null,
  };
  const fullAddress = composeAddress(structured) || null;

  const { data, error } = await supabaseAdmin
    .from('research_projects')
    .insert({
      created_by: session.user.email,
      name: name.trim(),
      description: description?.trim() || null,
      property_address: fullAddress,
      street_number: structured.streetNumber,
      street_name: structured.streetName,
      unit: structured.unit,
      city: structured.city,
      zip: structured.zip,
      // What the operator knows that no record will say. `analysis_metadata.user_notes` was written
      // here and read by NOTHING (grepped across app/, lib/ and worker/src) — so the context an
      // operator took the trouble to type has been going into the database and stopping there. This
      // column is read by the briefing that goes to the AI.
      //
      // `||`, NOT `??`. Found by creating a real project through the form and reading the row back:
      // the operator's notes landed in `description` and `intake_notes` came out NULL, so the
      // context still did not reach the run. The create form holds `intake_notes: ''` in its state
      // and spreads the whole object, so the field arrives as an EMPTY STRING — which `??` happily
      // keeps, because it only falls back on null and undefined. The fallback existed and could
      // never fire.
      intake_notes: (intake_notes || description || '').trim() || null,
      county: county?.trim() || null,
      state: state?.trim() || 'TX',
      parcel_id: parcel_id?.trim() || null,
      // Raw, exactly as the county writes it. Instrument numbers come in a dozen forms and
      // normalising here would destroy the one the clerk actually uses; comparison-normalisation
      // already belongs to purchase-ledger.instrumentKey().
      instrument_number: instrument_number?.trim() || null,
      job_id: job_id || null,
      status: 'upload',
      // Per-project spend gate (seed 620). Only an explicit `false` disables purchasing: an absent
      // or malformed value keeps today's behaviour. Defaulting to `false` here would make every
      // existing client silently produce cheaper, thinner runs with no explanation — worse than the
      // cost it saves, because the operator would not know why the report shrank.
      allow_paid_documents: allow_paid_documents === false ? false : true,
      // `owner_name` genuinely belongs here — it is not a column and it IS read, by the clerk
      // grantor/grantee search. `city`, `zip` and `user_notes` are kept as a mirror only so that
      // anything still reading the blob keeps working; the columns above are what the pipeline
      // route selects and what the worker is given.
      analysis_metadata: {
        owner_name: owner_name?.trim() || null,
        user_notes: (intake_notes || description || '').trim() || null,
        city: city?.trim() || null,
        zip: zip?.trim() || null,
      },
    })
    .select()
    .single();

  console.log(`[research/create] New project: name="${name.trim()}", parcel_id=${parcel_id || 'none'}, address="${fullAddress || 'none'}", owner="${owner_name || 'none'}", county=${county || 'none'}`);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ project: data }, { status: 201 });
}, { routeName: 'research' });

/* PATCH — Update a research project */
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, clear_analysis_data, clear_pipeline_documents, ...updates } = body;

  if (!id) return NextResponse.json({ error: 'Project id is required' }, { status: 400 });

  // Only allow updating specific fields
  const allowed: Record<string, unknown> = {};
  if (updates.name !== undefined) allowed.name = (updates.name || '').trim();
  if (updates.description !== undefined) allowed.description = updates.description?.trim() || null;
  if (updates.property_address !== undefined) allowed.property_address = updates.property_address?.trim() || null;
  if (updates.county !== undefined) allowed.county = updates.county?.trim() || null;
  if (updates.state !== undefined) allowed.state = updates.state?.trim() || 'TX';

  // ── The address parts are editable too, or the columns rot (seed 624) ───────────────────────
  //
  // Accepting them on POST and not on PATCH is exactly the shape of the `job_id` defect recorded
  // twenty lines below: a column that could only ever be set at creation, from one screen, and was
  // wrong forever afterwards. An operator who corrects a misspelled street on an existing project
  // must correct the value the run actually uses, not just the display string.
  for (const [field, col] of [
    ['street_number', 'street_number'],
    ['street_name', 'street_name'],
    ['unit', 'unit'],
    ['city', 'city'],
    ['zip', 'zip'],
    ['intake_notes', 'intake_notes'],
    ['instrument_number', 'instrument_number'],
  ] as const) {
    if (updates[field] !== undefined) allowed[col] = updates[field]?.trim() || null;
  }

  // Keep the human-readable line in step with the parts. Recomposing it from whatever the PATCH
  // touched — rather than leaving whatever string was there — is what stops the card and the search
  // from disagreeing about which property this is.
  const touchesAddress = ['street_number', 'street_name', 'unit', 'city', 'zip', 'state']
    .some((f) => updates[f] !== undefined);
  if (touchesAddress && updates.property_address === undefined) {
    const { data: current } = await supabaseAdmin
      .from('research_projects')
      .select('street_number, street_name, unit, city, state, zip')
      .eq('id', id)
      .single();
    const merged = { ...(current ?? {}), ...allowed } as Record<string, string | null>;
    allowed.property_address = composeAddress({
      streetNumber: merged.street_number,
      streetName: merged.street_name,
      unit: merged.unit,
      city: merged.city,
      state: merged.state,
      zip: merged.zip,
    }) || null;
  }
  if (updates.status !== undefined) {
    const validStatuses = ['upload', 'configure', 'analyzing', 'review', 'drawing', 'verifying', 'complete'];
    if (!validStatuses.includes(updates.status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
    }
    allowed.status = updates.status;
  }
  // ── job_id WAS ACCEPTED ON CREATE AND NOWHERE ELSE (Phase J1) ────────────────────────────────
  //
  // The column has existed since seeds/090 with an index on it and a comment reading "optional link
  // to a jobs record". POST took it; PATCH did not; and no `.tsx` under app/admin/research mentioned
  // it at all. So the only way to link a research project to a job was to send it at creation, from
  // a form that never did — and once created, nothing could change it.
  //
  // `null` is a real value here: unlinking is a thing somebody does, and `|| null` would make an
  // empty string mean the same as "leave it alone" if this were folded into the pattern above.
  if (updates.job_id !== undefined) {
    allowed.job_id = updates.job_id ? String(updates.job_id) : null;
  }
  // ── allow_paid_documents WAS ACCEPTED ON CREATE AND NOWHERE ELSE ─────────────────────────────
  //
  // Exactly the shape of the job_id defect above, and with a sharper consequence: the column
  // controls whether a run may SPEND MONEY, and it could only be set at the moment a project was
  // created, from a modal most operators fill in before they know what the property needs.
  //
  // The owner's requirement is that a re-run be editable — "changing the settings of the run, such
  // as whether or not it uses texasfile" — and that is not expressible while the switch is
  // write-once.
  //
  // `=== false` and not `!value`: absence must mean "leave it alone", and a truthiness test would
  // turn every PATCH that does not mention the field into an instruction to switch paid documents
  // ON, which is the direction that costs money.
  if (updates.allow_paid_documents !== undefined) {
    allowed.allow_paid_documents = updates.allow_paid_documents === false ? false : true;
  }
  if (updates.analysis_template_id !== undefined) allowed.analysis_template_id = updates.analysis_template_id;
  if (updates.analysis_filters !== undefined) allowed.analysis_filters = updates.analysis_filters;

  // job_notes lives inside analysis_metadata so it survives analysis reruns but is
  // explicitly preserved across clear_analysis_data resets (user-authored content).
  // Fetch current analysis_metadata once (needed by both job_notes and clear_analysis_data paths).
  let currentMeta: Record<string, unknown> = {};
  if (updates.job_notes !== undefined || clear_analysis_data) {
    const { data: current } = await supabaseAdmin
      .from('research_projects')
      .select('analysis_metadata')
      .eq('id', id)
      .single();
    currentMeta = (current?.analysis_metadata as Record<string, unknown>) ?? {};
  }

  if (updates.job_notes !== undefined) {
    allowed.analysis_metadata = { ...currentMeta, job_notes: updates.job_notes };
    // Update currentMeta so the clear path below sees the merged value
    currentMeta = allowed.analysis_metadata as Record<string, unknown>;
  }

  allowed.updated_at = new Date().toISOString();

  if (updates.status === 'complete') {
    allowed.completed_at = new Date().toISOString();
  }

  // When reverting to a pre-analysis step the caller can request clearing extracted data.
  // job_notes are preserved — only AI-generated analysis data is wiped.
  if (clear_analysis_data) {
    // Keep only user-authored job_notes; discard all AI-generated analysis data
    const preservedNotes = (currentMeta.job_notes as string | undefined) ?? '';
    allowed.analysis_metadata = preservedNotes ? { job_notes: preservedNotes } : {};
    const cleanupOps: Promise<unknown>[] = [
      supabaseAdmin.from('extracted_data_points').delete().eq('research_project_id', id),
      supabaseAdmin.from('discrepancies').delete().eq('research_project_id', id),
    ];

    if (clear_pipeline_documents) {
      // ── A RE-RUN SUPERSEDES. IT DOES NOT DELETE. ──────────────────────────────────────────────
      //
      // This was:
      //
      //     .from('research_documents').delete()
      //       .eq('research_project_id', id).neq('source_type', 'user_upload')
      //
      // and the confirmation dialog said so plainly — "All data from the previous run will be
      // permanently deleted, including pipeline-fetched documents". That is the exact opposite of
      // what the owner asked for: **keep the files from the first run.**
      //
      // It was also lossy in a way nobody could see. The rows went; the objects in Supabase Storage
      // did not, so every re-run left another set of orphaned files in the bucket with nothing
      // pointing at them. And a run cut short at minute 20 has usually already BOUGHT documents —
      // deleting those throws away money that was already spent, to no purpose.
      //
      // So the previous run's documents are marked superseded and stay exactly where they are:
      // attributed, downloadable, and one toggle away in the library. The new run researches
      // everything again from scratch, and the cross-run duplicate check
      // (worker/src/research/project-library.ts) is what stops it filing them a second time.
      cleanupOps.push(
        supabaseAdmin
          .from('research_documents')
          .update({ superseded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('research_project_id', id)
          .neq('source_type', 'user_upload')
          .is('superseded_at', null),
      );
      // Clear pipeline logs and status
      allowed.research_logs = null;
      allowed.research_status = null;
      allowed.research_message = null;
      allowed.pipeline_started_at = null;
    } else {
      // Partial revert: just reset document processing status
      cleanupOps.push(
        supabaseAdmin
          .from('research_documents')
          .update({ processing_status: 'extracted', processing_error: null, updated_at: new Date().toISOString() })
          .eq('research_project_id', id)
          .in('processing_status', ['analyzed', 'analyzing']),
      );
    }
    await Promise.all(cleanupOps);

    if (clear_pipeline_documents) {
      // ── AND THE STATE THAT LIVES IN THE WORKER'S MEMORY ─────────────────────────────────────
      //
      // Clearing rows here is not enough, and the gap was visible on screen: a re-run showed
      // "Research Failed — Pipeline cancelled by user" while the new run was retrieving documents
      // in the background.
      //
      // The worker keeps the previous run's terminal result in an in-process Map, and its status
      // endpoint served that to every poll until the new run registered. The panel latched the
      // failure and stopped polling — permanently — before the new run existed. Nothing the app
      // could write to Postgres reaches that Map; only the worker can clear it.
      //
      // Best-effort on purpose: a reset must not fail because the worker is unreachable. If it is
      // down there is no stale in-process state to clear, because there is no process holding it.
      await resetWorkerState(id);
    }
  }

  const { data, error } = await supabaseAdmin
    .from('research_projects')
    .update(allowed)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ project: data });
}, { routeName: 'research' });

/* DELETE — Soft-delete (archive) a research project */
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Project id is required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('research_projects')
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}, { routeName: 'research' });

// ── Worker reset ────────────────────────────────────────────────────────────────────────────────

/**
 * Ask the worker to forget everything it remembers about a project's previous run.
 *
 * Best-effort by design. The three ways this can fail — worker not configured, worker unreachable,
 * worker rejects — all mean the same thing for correctness: there is no live process holding stale
 * state, so there is nothing to clear. Failing the operator's reset over it would be strictly worse.
 *
 * Returns what happened so the caller can say so rather than guessing.
 */
async function resetWorkerState(projectId: string): Promise<{ ok: boolean; detail: string }> {
  const workerUrl = process.env.WORKER_URL || '';
  const workerKey = process.env.WORKER_API_KEY || '';
  if (!workerUrl || !workerKey) {
    return { ok: false, detail: 'Worker is not configured, so it holds no state for this project.' };
  }

  try {
    const res = await fetch(`${workerUrl}/research/reset/${projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${workerKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const detail = `Worker responded HTTP ${res.status} to the reset.`;
      console.warn(`[research/reset] ${projectId}: ${detail}`);
      return { ok: false, detail };
    }
    const data = await res.json().catch(() => ({}));
    const cleared = Array.isArray(data?.cleared) ? data.cleared.join('; ') : 'nothing to clear';
    console.log(`[research/reset] ${projectId}: worker cleared — ${cleared}`);
    return { ok: true, detail: cleared };
  } catch (err) {
    const detail = `Worker unreachable (${err instanceof Error ? err.message : String(err)}), so it is not holding state for this project.`;
    console.warn(`[research/reset] ${projectId}: ${detail}`);
    return { ok: false, detail };
  }
}
