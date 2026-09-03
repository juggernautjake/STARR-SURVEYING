// app/api/admin/research/[projectId]/pipeline/route.ts
// Proxies deep research requests to the DigitalOcean worker and polls for results.
import { NextRequest, NextResponse } from 'next/server';
import { assessRunReadiness, describeRunReadiness } from '@/lib/research/run-readiness';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
// Static, not `await import(...)`: the orphan ratchet reads static imports, and a module reachable
// only through a dynamic one is indistinguishable from a dead module to every guard in this repo.
import { attachUploadedDocuments } from '@/lib/research/attach-uploaded-documents';

const WORKER_URL = process.env.WORKER_URL || '';
const WORKER_API_KEY = process.env.WORKER_API_KEY || '';

function extractProjectId(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/research/')[1]?.split('/');
  return parts?.[0] || null;
}

function workerHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${WORKER_API_KEY}`,
  };
}

// ── Bell County Auto-Detection ────────────────────────────────────────────────
// Keep in sync with worker/src/counties/router.ts BELL_COUNTY_CITIES

const BELL_COUNTY_CITIES_LOWER = [
  'belton', 'killeen', 'temple', 'harker heights', 'nolanville', 'salado',
  'holland', 'rogers', 'troy', 'moody', 'bartlett', 'little river-academy',
  'little river academy', 'copperas cove', 'morgans point resort', 'moffat',
  'pendleton', 'eddy', 'heidenheimer', 'academy', 'prairie dell',
];

const BELL_COUNTY_ZIPS = new Set([
  '76501', '76502', '76503', '76504', '76505', '76506', '76507', '76508',
  '76513', '76517', '76520', '76522', '76523', '76524', '76525', '76526',
  '76527', '76528', '76530', '76534', '76537', '76538', '76539',
  '76540', '76541', '76542', '76543', '76544', '76545', '76546', '76547',
  '76548', '76549', '76554', '76557', '76561', '76569', '76570', '76571',
]);

function detectBellCountyFromAddress(address: string): boolean {
  if (!address) return false;
  const lower = address.toLowerCase();
  if (/\bbell\s+county\b/.test(lower)) return true;
  for (const city of BELL_COUNTY_CITIES_LOWER) {
    const escaped = city.replace(/-/g, '[-\\s]?');
    if (new RegExp(`\\b${escaped}\\b`).test(lower)) return true;
  }
  const zipMatches = address.match(/\b(\d{5})(?:-\d{4})?\b/g);
  if (zipMatches) {
    for (const zip of zipMatches) {
      if (BELL_COUNTY_ZIPS.has(zip.slice(0, 5))) return true;
    }
  }
  return false;
}
// ── End Bell County Auto-Detection ────────────────────────────────────────────

/* POST — Start a deep research pipeline on the worker */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!WORKER_URL || !WORKER_API_KEY) {
    console.warn('[pipeline/route] POST: worker not configured (WORKER_URL/WORKER_API_KEY missing)');
    return NextResponse.json({
      error: 'Deep research worker is not configured. Set WORKER_URL and WORKER_API_KEY in your environment.',
    }, { status: 503 });
  }

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  // Verify project exists
  const { data: project, error: projError } = await supabaseAdmin
    .from('research_projects')
    // The address PARTS, not just the flattened line (seed 624). Selecting only
    // `property_address` is why the city and ZIP the operator typed never reached the worker: they
    // were written to `analysis_metadata`, and this list is what the run actually reads.
    .select('id, property_address, street_number, street_name, unit, city, county, state, zip, parcel_id, instrument_number, intake_notes, allow_paid_documents')
    .eq('id', projectId)
    .single();

  if (projError || !project) {
    console.warn(`[pipeline/route] POST ${projectId}: project not found — ${projError?.message ?? 'no data'}`);
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const body = await req.json() as {
    address?: string;
    county?: string;
    propertyId?: string;
    ownerName?: string;
    /** Free-text starting information for THIS run — what the operator knows that the record does
     *  not. There was no field for this at all, so an operator who knew the surveyor's name or the
     *  neighbouring owner had nowhere to put it. */
    operatorNotes?: string;
    /** Files attached to this run. The worker has accepted `userFiles` since it was written and
     *  this route has never sent any. */
    userFiles?: unknown[];
    /** Per-run settings: allowPaidDocuments, maxResearchTimeMinutes, maxCostUsd, mode,
     *  refreshImagery. See worker/src/research/run-settings.ts. */
    settings?: Record<string, unknown>;
    /** Why this run exists, for the run list: initial | rerun_same | rerun_edited. */
    trigger?: string;
  };

  let rawCounty = body.county || project.county || '';
  let rawAddress = body.address || project.property_address || '';
  const parcelId = body.propertyId || project.parcel_id || '';

  // When parcel_id is available but address/county are missing,
  // look up property details from Bell CAD
  if (parcelId && (!rawAddress || !rawCounty)) {
    try {
      const { resolveParcelDetails } = await import('@/lib/research/bell-cad-arcgis.service');
      const details = await resolveParcelDetails(parcelId);
      if (details) {
        if (!rawAddress && details.address) rawAddress = details.address;
        if (!rawCounty && details.county) rawCounty = details.county;
        console.log(`[pipeline/route] Resolved from prop_id=${parcelId}: address="${details.address}", county="${details.county}"`);
      }
    } catch (err) {
      console.warn(`[pipeline/route] resolveParcelDetails failed for prop_id=${parcelId}:`, err instanceof Error ? err.message : err);
    }
  }

  // Auto-detect Bell County from address when county is not explicitly set
  const autoCounty = !rawCounty && rawAddress ? (detectBellCountyFromAddress(rawAddress) ? 'Bell' : '') : '';

  // ── EVERYTHING THE RUN CAN BE GIVEN, ACTUALLY GIVEN TO IT ────────────────────────────────────
  //
  // This payload was a six-field literal, and three capabilities the system already had were being
  // dropped on the floor here:
  //
  //   · `userFiles` — parsed and used by the worker's handler; never sent by this route.
  //   · `maxResearchTimeMinutes` / `maxCostUsd` — accepted by `limitsFor()` since it was written,
  //     with no caller ever passing one, so every run got the defaults whatever the operator chose.
  //   · `allow_paid_documents` — a column with a UI, a helper and a test file, read by the app's
  //     lite pipeline and by NOTHING in the worker, which is the process that spends the money.
  //
  // The project's column is the default and the run's setting overrides it, so a re-run can turn
  // paid documents off for one attempt without changing what the project means in general.
  const settings: Record<string, unknown> = {
    allowPaidDocuments: project.allow_paid_documents !== false,
    ...(body.settings ?? {}),
  };

  // ── G1: the files the operator already gave this project ────────────────────────────────────
  //
  // The Upload stage sits immediately before Research in the workflow, and it looked exactly like
  // giving the run information. It was not: uploads land in `research_documents` with
  // `source_type: 'user_upload'`, and neither this route nor the worker ever read them back. An
  // operator could upload the client's survey, watch it appear on the project, start the run, and
  // have the run never see it. Nothing failed — the file was stored, it just was not research.
  //
  // Files attached to THIS run (the re-run dialog) win outright: they are the operator's most recent
  // statement of what the run should read, and re-adding the project's whole library behind them
  // would quietly change what they asked for.
  const bodyFiles = Array.isArray(body.userFiles) && body.userFiles.length > 0 ? body.userFiles : null;
  let attachedFiles: unknown[] = bodyFiles ?? [];
  const attachmentNotes: string[] = [];

  if (!bodyFiles) {
    try {
      const { data: uploaded } = await supabaseAdmin
        .from('research_documents')
        .select('id, original_filename, file_type, storage_url, file_size_bytes, document_label')
        .eq('research_project_id', projectId)
        .eq('source_type', 'user_upload');

      if (uploaded && uploaded.length > 0) {
        const result = await attachUploadedDocuments(uploaded, async (url) => {
          const res = await fetch(url);
          if (!res.ok) return null;
          return Buffer.from(await res.arrayBuffer());
        });
        attachedFiles = result.files;
        attachmentNotes.push(...result.notes);
        if (result.files.length > 0) {
          console.log(`[pipeline/route] ${projectId}: attaching ${result.files.length} uploaded document(s) to the run`);
        }
      }
    } catch (err) {
      // Never fatal. A run that could not read the uploads is worse than one that could, and far
      // better than no run at all — but it must SAY so rather than start as if there were none.
      attachmentNotes.push(
        'The documents uploaded to this project could not be read, so the run did not receive them.',
      );
      console.warn(
        `[pipeline/route] ${projectId}: could not attach uploaded documents:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // ── THE PARTS TRAVEL WITH THE RUN (seed 624) ────────────────────────────────────────────────
  //
  // `address` alone is what the worker used to get, and it re-derived the street number, street
  // name and city from it with two different parsers, neither of which could handle the string this
  // app produced. `addressParts` carries what the operator actually typed, so the worker can search
  // on facts and fall back to guessing only for older projects that have nothing else.
  //
  // Sent even when empty. A worker that receives `addressParts: {}` knows the project predates the
  // columns and can say so; one that receives nothing at all cannot tell that from an old worker
  // build talking to a new app.
  const addressParts = {
    streetNumber: (project.street_number as string | null) || null,
    streetName: (project.street_name as string | null) || null,
    unit: (project.unit as string | null) || null,
    city: (project.city as string | null) || null,
    state: project.state || 'TX',
    zip: (project.zip as string | null) || null,
  };

  const payload = {
    projectId,
    address: rawAddress,
    addressParts,
    county: rawCounty || autoCounty,
    state: project.state || 'TX',
    propertyId: parcelId || undefined,
    ownerName: body.ownerName || undefined,
    // ── SEED 625 — THE CASCADE FINALLY GETS A STARTING DOCUMENT ─────────────────────────────
    //
    // `CountyResearchInput.instrumentNumber` has existed since the worker was written and the Bell
    // orchestrator seeds its known-identifiers cascade from it (orchestrator.ts:142). This route —
    // the one that actually starts a run — never mentioned it, and no column held one, so the
    // cascade has begun from nothing in every run ever made.
    instrumentNumber: (project.instrument_number as string | null) || undefined,
    // Anything the attachment step could not do travels WITH the run rather than staying in a
    // server log nobody reads. "Six of your twenty documents were attached" is exactly the kind of
    // fact that, left unsaid, makes an operator believe the run read everything they gave it.
    // ── intake_notes JOINS THE RUN HERE (seed 624) ──────────────────────────────────────────
    //
    // What the operator wrote when the project was created — "the fence is not the line", "seller
    // says 2.3 acres" — used to be stored as `analysis_metadata.user_notes` and read by NOTHING.
    // `operatorNotes` is the channel that already reaches the AI briefing, so the intake context
    // travels down it rather than getting a second, parallel pipe that would need its own wiring
    // at every stage.
    //
    // Intake first, then this run's notes: the per-run note is usually a correction or an addition
    // to the standing context, and a reader (human or model) resolves a contradiction in favour of
    // what came last.
    operatorNotes: [
      (project.intake_notes as string | null)?.trim(),
      body.operatorNotes?.trim(),
      ...attachmentNotes,
    ]
      .filter((s): s is string => !!s && s.length > 0)
      .join('\n') || undefined,
    userFiles: attachedFiles.length > 0 ? attachedFiles : undefined,
    settings,
    trigger: body.trigger,
  };

  // ── IS THERE ENOUGH HERE TO FIND ONE PARCEL? ────────────────────────────────────────────────
  //
  // This used to check the county alone, and the button that calls it used to check
  // `property_address || parcel_id || documents.length > 0` — so any non-empty string started a run.
  // "CEDAR CREEK" started a run. Twenty-five minutes and real money later it either found nothing
  // or, far worse, found a confident answer about a different parcel on the same road.
  //
  // Both ends call `assessRunReadiness` now, so a refusal here can never be one the button offered.
  // The refusal body carries the full explanation — what was supplied and what would fix it — rather
  // than a bare sentence, because this is also what an API caller outside the UI will read.
  const readiness = assessRunReadiness({
    county: payload.county,
    state: payload.state,
    parcelId: parcelId,
    instrumentNumber: payload.instrumentNumber,
    streetNumber: addressParts.streetNumber,
    streetName: addressParts.streetName || rawAddress,
    city: addressParts.city,
    zip: addressParts.zip,
    ownerName: payload.ownerName,
    documentCount: attachedFiles.length,
  });

  if (!readiness.canRun) {
    console.warn(
      `[pipeline/route] POST ${projectId}: refused — ${readiness.headline} ` +
      `(have: ${readiness.have.join('; ')})`,
    );
    return NextResponse.json(
      {
        error: readiness.headline,
        detail: describeRunReadiness(readiness),
        have: readiness.have,
        whatWouldWork: readiness.whatWouldWork,
      },
      { status: 400 },
    );
  }

  console.log(
    `[pipeline/route] POST ${projectId}: forwarding to worker — county="${payload.county}" address="${payload.address}" workerUrl=${WORKER_URL}`,
  );

  // Forward to worker.
  //
  // R2: a transport failure here — the droplet stopped, DNS gone, connection refused — used to
  // escape as a 500, which the run panel treats as an unknown error and reports as "research
  // failed". It is not a failure of the research; it is the engine not being there, and the panel
  // already knows how to fall back to the lite pipeline on a 503. So the shape of the answer is
  // what tells it apart, and the reason travels with it.
  let workerRes: Response;
  try {
    workerRes = await fetch(`${WORKER_URL}/research/property-lookup`, {
      method: 'POST',
      headers: workerHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline/route] POST ${projectId}: worker unreachable at ${WORKER_URL} — ${reason}`);
    return NextResponse.json({
      error: 'The research worker is not answering, so deep research cannot run right now.',
      hint: reason,
      workerUnreachable: true,
    }, { status: 503 });
  }

  const workerData = await workerRes.json();

  if (!workerRes.ok) {
    console.error(
      `[pipeline/route] POST ${projectId}: worker responded HTTP ${workerRes.status} — ${workerData.error ?? 'unknown'}`,
    );
    return NextResponse.json({
      error: workerData.error || 'Worker rejected the request',
      hint: workerData.hint,
      workerStatus: workerRes.status,
    }, { status: workerRes.status >= 500 ? 502 : workerRes.status });
  }

  console.log(
    `[pipeline/route] POST ${projectId}: worker accepted — status=${workerData.status ?? 'running'} (Frontend → Backend → Worker handshake complete)`,
  );

  // Persist pipeline start time so the frontend timer can survive page refreshes
  const startedAt = new Date().toISOString();
  await supabaseAdmin
    .from('research_projects')
    .update({ pipeline_started_at: startedAt, research_status: 'running' })
    .eq('id', projectId);

  return NextResponse.json({
    message: 'Deep research pipeline started',
    projectId,
    status: 'running',
    startedAt,
    // The run this call started. The panel keeps it and ignores any status payload naming a
    // different run — which is what stops a cached result from the PREVIOUS run ending the poll
    // for this one.
    runId: workerData?.runId ?? null,
    runNumber: workerData?.runNumber ?? null,
    settings,
    settingsSummary: workerData?.settingsSummary ?? null,
    pollUrl: `/api/admin/research/${projectId}/pipeline`,
    worker: workerData,
  }, { status: 202 });
}, { routeName: 'research/pipeline/start' });

/* DELETE — Cancel a running pipeline */
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!WORKER_URL || !WORKER_API_KEY) {
    return NextResponse.json({ error: 'Worker not configured' }, { status: 503 });
  }

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  console.log(`[pipeline/route] DELETE ${projectId}: sending cancel request to worker`);

  try {
    const workerRes = await fetch(`${WORKER_URL}/research/cancel/${projectId}`, {
      method: 'POST',
      headers: workerHeaders(),
      signal: AbortSignal.timeout(10_000),
    });

    const data = await workerRes.json();

    if (!workerRes.ok) {
      console.warn(`[pipeline/route] DELETE ${projectId}: worker responded HTTP ${workerRes.status}`);
      return NextResponse.json(data, { status: workerRes.status });
    }

    // Update project status in Supabase
    await supabaseAdmin
      .from('research_projects')
      .update({
        status: 'configure',
        research_message: 'Pipeline cancelled by user',
      })
      .eq('id', projectId);

    console.log(`[pipeline/route] DELETE ${projectId}: pipeline cancelled successfully`);
    return NextResponse.json({ message: 'Pipeline cancelled', projectId, ...data });
  } catch (err) {
    console.error(`[pipeline/route] DELETE ${projectId}: cancel failed —`, err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Failed to cancel pipeline' }, { status: 502 });
  }
}, { routeName: 'research/pipeline/cancel' });

/* GET — Poll worker for pipeline status / results */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!WORKER_URL || !WORKER_API_KEY) {
    return NextResponse.json({ error: 'Worker not configured' }, { status: 503 });
  }

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  // Poll worker status
  let workerRes: Response | null = null;
  try {
    workerRes = await fetch(`${WORKER_URL}/research/status/${projectId}`, {
      headers: workerHeaders(),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    console.warn(`[pipeline/route] GET ${projectId}: worker unreachable — ${err instanceof Error ? err.message : String(err)}`);
    // Worker is down — fall through to DB check below
  }

  if (workerRes && workerRes.ok) {
    const data = await workerRes.json() as { status?: string; log?: unknown[]; message?: string; currentStage?: string; startedAt?: string };

    // Log non-trivial status changes (not on every poll to avoid noise)
    if (data.status && data.status !== 'running') {
      console.log(
        `[pipeline/route] GET ${projectId}: status=${data.status} logEntries=${data.log?.length ?? 0}`,
      );
    } else {
      // Log running status with log count so we can confirm data is flowing
      const logCount = data.log?.length ?? 0;
      if (logCount > 0) {
        console.log(
          `[pipeline/route] GET ${projectId}: forwarding live data — status=${data.status ?? 'running'} logEntries=${logCount} stage="${data.currentStage ?? data.message?.slice(0, 40) ?? 'unknown'}"`,
        );
      }
    }

    // Persist logs and status to DB so they survive worker restarts and page refreshes
    const dbUpdate: Record<string, unknown> = {};
    if (data.log && data.log.length > 0) dbUpdate.research_logs = data.log;
    if (data.message) dbUpdate.research_message = data.message;
    if (data.status) dbUpdate.research_status = data.status;
    if (Object.keys(dbUpdate).length > 0) {
      // Fire-and-forget — don't block the response
      supabaseAdmin
        .from('research_projects')
        .update(dbUpdate)
        .eq('id', projectId)
        .then(({ error: dbErr }: { error: { message: string } | null }) => {
          if (dbErr) console.warn(`[pipeline/route] GET ${projectId}: failed to persist logs/status — ${dbErr.message}`);
        });
    }

    // If the worker didn't include startedAt, fetch it from the DB
    if (!data.startedAt) {
      const { data: proj } = await supabaseAdmin
        .from('research_projects')
        .select('pipeline_started_at')
        .eq('id', projectId)
        .single();
      if (proj?.pipeline_started_at) {
        data.startedAt = proj.pipeline_started_at;
      }
    }

    return NextResponse.json(data);
  }

  if (workerRes && workerRes.status !== 404) {
    console.warn(`[pipeline/route] GET ${projectId}: worker error HTTP ${workerRes.status}`);
    return NextResponse.json({ error: 'Worker error' }, { status: 502 });
  }

  // ── THE WORKER HAS NOTHING. ASK THE RUN RECORD BEFORE GUESSING. ───────────────────────────────
  //
  // What followed used to be a chain of inferences from the PROJECT's workflow status: if it is
  // 'review' or later the pipeline must have completed; if it is 'analyzing' and research_status
  // says 'running' it must still be going. Both are guesses about a run, made from a column that
  // describes a project, and both are wrong in the case that matters — a re-run, where the project
  // still carries run 1's status while run 2 is what somebody is watching.
  //
  // `research_runs` answers the question directly, and since seed 623 it carries the run's phase,
  // its percentage and why it stopped. A row still marked `running` with a recent heartbeat means
  // the run is alive and this process simply could not reach the worker; that is "reconnecting",
  // not "failed", and it is the difference between an operator waiting and an operator re-running
  // a job that was already working.
  console.log(`[pipeline/route] GET ${projectId}: worker has no active/cached pipeline — checking the run record`);

  const { data: latestRun } = await supabaseAdmin
    .from('research_runs')
    .select('id, run_number, status, phase, message, progress_percent, stop_reason, started_at, finished_at, heartbeat_at, failure_reason, budget_summary, cost_usd')
    .eq('research_project_id', projectId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestRun) {
    const run = latestRun as Record<string, unknown>;
    const runStatus = String(run.status ?? '');
    const heartbeat = run.heartbeat_at ? new Date(String(run.heartbeat_at)).getTime() : 0;
    // The same ten minutes the worker uses to decide a run was orphaned by a restart. Long enough
    // that a county portal taking four minutes to answer is never mistaken for a dead process.
    const heartbeatIsFresh = heartbeat > 0 && Date.now() - heartbeat < 10 * 60_000;

    const common = {
      projectId,
      runId: String(run.id),
      runNumber: run.run_number ?? null,
      startedAt: (run.started_at as string) ?? undefined,
      percent: typeof run.progress_percent === 'number' ? run.progress_percent : undefined,
      currentStage: (run.phase as string) ?? undefined,
      message: (run.message as string) ?? undefined,
      stopReason: (run.stop_reason as string) ?? null,
      costUsd: Number(run.cost_usd ?? 0),
      fromDatabase: true,
    };

    if (runStatus === 'running' && heartbeatIsFresh) {
      console.log(`[pipeline/route] GET ${projectId}: run ${run.run_number} is alive (heartbeat fresh) — reporting running`);
      return NextResponse.json({
        ...common,
        status: 'running',
        message: common.message ?? 'Pipeline running (reconnecting…)',
        failureReason: null,
      });
    }

    if (runStatus === 'running') {
      // Marked running, heartbeat stale: the process holding it is gone. That is INTERRUPTED, and
      // it is deliberately not 'failed' — the research did not fail, the box did, and it is usually
      // a deploy. Somebody scanning failures should not have to work out which were releases.
      console.log(`[pipeline/route] GET ${projectId}: run ${run.run_number} has a stale heartbeat — reporting interrupted`);
      return NextResponse.json({
        ...common,
        status: 'interrupted',
        message: common.message ?? 'The worker stopped while this run was in progress.',
        failureReason: null,
      });
    }

    if (runStatus === 'complete') {
      const meta = await loadPersistedResult(projectId);
      return NextResponse.json({
        ...common,
        status: 'complete',
        percent: 100,
        // A run that stopped on its ceiling is complete AND has something to say about why it is
        // shorter than usual. Reporting it as a failure is what put "Research Failed — Pipeline
        // cancelled by user" on screen beside "Finished in 2 minutes for $0.02".
        budgetSummary: (run.budget_summary as string) ?? null,
        failureReason: null,
        ...meta,
      });
    }

    if (runStatus === 'cancelled' || runStatus === 'interrupted' || runStatus === 'failed') {
      return NextResponse.json({
        ...common,
        status: runStatus,
        failureReason: runStatus === 'failed' ? (run.failure_reason as string) ?? null : null,
        message: common.message ?? (run.failure_reason as string) ?? undefined,
      });
    }
  }


  const { data: dbProject, error: dbError } = await supabaseAdmin
    .from('research_projects')
    .select('status, research_status, research_message, research_logs, analysis_metadata, pipeline_started_at')
    .eq('id', projectId)
    .single();

  if (dbError || !dbProject) {
    return NextResponse.json({ projectId, status: 'not_found' }, { status: 404 });
  }

  // If project status is 'review' or later, the pipeline already completed
  const completedStatuses = ['review', 'drawing', 'verifying', 'complete'];
  if (completedStatuses.includes(dbProject.status)) {
    const meta = (dbProject.analysis_metadata as Record<string, unknown>) ?? {};
    const result = (meta.result ?? {}) as Record<string, unknown>;
    console.log(`[pipeline/route] GET ${projectId}: pipeline already completed (DB status=${dbProject.status}) — returning persisted result`);
    return NextResponse.json({
      projectId,
      status: 'complete',
      message: (dbProject.research_message as string) ?? 'Pipeline completed',
      startedAt: (dbProject.pipeline_started_at as string) ?? undefined,
      result,
      log: (dbProject.research_logs as unknown[]) ?? [],
      fromDatabase: true,
    });
  }

  // If project is in 'analyzing' state, the pipeline is still running but
  // the worker may have restarted. Report as running so the frontend keeps
  // polling (the worker may come back).
  if (dbProject.status === 'analyzing' || dbProject.status === 'configure') {
    const researchStatus = (dbProject.research_status as string) ?? '';
    if (researchStatus === 'running') {
      console.log(`[pipeline/route] GET ${projectId}: DB shows analyzing/running but worker lost state — reporting running`);
      return NextResponse.json({
        projectId,
        status: 'running',
        message: (dbProject.research_message as string) ?? 'Pipeline running (reconnecting…)',
        startedAt: (dbProject.pipeline_started_at as string) ?? undefined,
        log: (dbProject.research_logs as unknown[]) ?? [],
        fromDatabase: true,
      });
    }
  }

  // Otherwise, no pipeline ever ran or it was in an unrecognized state
  return NextResponse.json({ projectId, status: 'not_found' }, { status: 404 });
}, { routeName: 'research/pipeline/status' });

/** The persisted result of a finished run, for a poll that could not reach the worker.
 *
 *  Split out because the run record says a run FINISHED and the project's `analysis_metadata` holds
 *  WHAT it produced — two different questions, and conflating them is what let a project's stale
 *  workflow status stand in for a run's outcome. */
async function loadPersistedResult(projectId: string): Promise<Record<string, unknown>> {
  const { data } = await supabaseAdmin
    .from('research_projects')
    .select('analysis_metadata, research_logs, research_message')
    .eq('id', projectId)
    .single();

  const meta = (data?.analysis_metadata as Record<string, unknown>) ?? {};
  return {
    result: (meta.result ?? {}) as Record<string, unknown>,
    log: (data?.research_logs as unknown[]) ?? [],
    ...(data?.research_message ? { message: String(data.research_message) } : {}),
  };
}
