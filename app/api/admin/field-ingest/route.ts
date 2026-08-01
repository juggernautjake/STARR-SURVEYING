// app/api/admin/field-ingest/route.ts — points from a collector, in (audit §3d, items 8n–8o).
//
//   GET  ?jobId=…   → recent arrivals and their points.
//   POST multipart  → upload a collector file (the manual path, and the one that works today).
//   POST json       → { text, fileName?, jobId?, sourceId? } for the watched-folder agent.
//
// ── WHY BOTH SHAPES ─────────────────────────────────────────────────────────────────────────────
//
// The multipart form is a surveyor dragging a file in. The JSON body is for the watched-folder agent
// (§3d step 1) — a small process on the office machine that notices a new export in a Drive/Dropbox
// folder and posts it. That path *"works with all five vendors and needs nobody's permission"*, which
// is why it is step 1 and Trimble Connect is step 3.
//
// Both land in `ingestArrival`, so the two clocks and the idempotency are decided once.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { ingestArrival } from '@/lib/field-ingest/ingest';

const MAX_BYTES = 25 * 1024 * 1024;

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const jobId = sp.get('jobId');
  const batchId = sp.get('batchId');

  if (batchId) {
    const { data, error } = await supabaseAdmin
      .from('instrument_points')
      // Both clocks, always. A caller that only selects one will present whichever it got as "when
      // this was shot", and after a day with no signal those are hours apart.
      .select('id, point_name, code, description, northing, easting, elevation, unit, measured_at, received_at, source_ref')
      .eq('batch_id', batchId)
      .order('point_name');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ points: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  let q = supabaseAdmin
    .from('ingest_batches')
    .select('id, source_id, job_id, file_name, format, received_at, point_count, skipped_count, status, warnings, error, created_by')
    .order('received_at', { ascending: false })
    .limit(50);
  if (jobId) q = q.eq('job_id', jobId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ batches: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const contentType = req.headers.get('content-type') ?? '';
  let text: string;
  let fileName: string | undefined;
  let jobId: string | null = null;
  let sourceId: string | null = null;

  if (contentType.includes('application/json')) {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.text !== 'string') {
      return NextResponse.json({ error: 'Expected { text } in the JSON body, or a multipart upload.' }, { status: 400 });
    }
    text = body.text;
    fileName = typeof body.fileName === 'string' ? body.fileName : undefined;
    jobId = typeof body.jobId === 'string' ? body.jobId : null;
    sourceId = typeof body.sourceId === 'string' ? body.sourceId : null;
  } else {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: 'Expected a multipart upload or a JSON body.' }, { status: 400 });
    }
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: `That file is larger than ${MAX_BYTES / 1024 / 1024} MB.` }, { status: 413 });
    text = await file.text();
    fileName = file.name;
    const j = form.get('jobId');
    jobId = typeof j === 'string' && j ? j : null;
  }

  try {
    const result = await ingestArrival(text, { sourceId, jobId, fileName, createdBy: session.user.email });
    return NextResponse.json({
      ...result,
      // Said explicitly rather than left to the caller to notice from `imported: 0`. Re-uploading is
      // a normal, sensible thing for a crew to do when they are not sure the first one worked, and
      // "nothing happened" reads as a failure.
      message: result.alreadyImported
        ? 'This exact file was already imported — nothing was duplicated.'
        : `Imported ${result.imported} point(s) as ${result.format}.`,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
});
