// app/api/admin/research/batch/route.ts
// Phase 11: Batch research job management.
// POST — Create a new batch research job (forwards to worker BullMQ).
// GET  — List batch jobs for the current user.
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { checkScope, scopeRefusal } from '@/lib/research/scope';

const WORKER_URL = process.env.WORKER_URL || '';
const WORKER_API_KEY = process.env.WORKER_API_KEY || '';

function workerHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${WORKER_API_KEY}`,
  };
}

/* POST — Create a batch research job */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!WORKER_URL || !WORKER_API_KEY) {
    return NextResponse.json({ error: 'Research worker not configured' }, { status: 503 });
  }

  const body = await req.json() as {
    properties: Array<{ address: string; county: string; state?: string }>;
    options?: Record<string, unknown>;
  };

  if (!body.properties || !Array.isArray(body.properties) || body.properties.length === 0) {
    return NextResponse.json({ error: 'properties array is required' }, { status: 400 });
  }
  if (body.properties.length > 50) {
    return NextResponse.json({ error: 'Maximum 50 properties per batch' }, { status: 400 });
  }

  // ── SCOPE, PER ROW, BEFORE THE WORKER IS TOLD ANYTHING (Phase S2) ──────────────────────────────
  //
  // The guard has to sit on BOTH run paths or it is not a guard: this form is a different screen
  // from the project page, with its own copy of the button, and it is the path that actually buys
  // documents. A batch of fifty with one New Mexico row in it would previously have queued fifty.
  //
  // ALL the bad rows are reported, not the first. Fifty rows fixed one refusal at a time is fifty
  // round trips, and the operator would rightly stop trusting the form.
  //
  // A DEGRADED row is not refused here — it is a price, and the spend limit on this form is exactly
  // the control for it. Only `canRun === false` stops the batch.
  const refusals = body.properties
    .map((p, i) => ({ i, p, scope: checkScope(p.state ?? 'TX', p.county) }))
    .filter((r) => !r.scope.canRun);

  if (refusals.length > 0) {
    const first = refusals[0]!;
    return NextResponse.json({
      ...scopeRefusal(first.scope),
      error: refusals.length === 1
        ? `Row ${first.i + 1}: ${first.scope.message}`
        : `${refusals.length} of ${body.properties.length} properties are outside our coverage, so no part of this batch was started.`,
      rows: refusals.map((r) => ({
        index: r.i,
        address: r.p.address,
        county: r.p.county,
        state: r.p.state ?? 'TX',
        verdict: r.scope.verdict,
        message: r.scope.message,
        nextStep: r.scope.nextStep,
      })),
    }, { status: 422 });
  }

  const workerRes = await fetch(`${WORKER_URL}/research/batch`, {
    method: 'POST',
    headers: workerHeaders(),
    body: JSON.stringify({
      userId: session.user.email,
      properties: body.properties,
      options: body.options || {},
    }),
    signal: AbortSignal.timeout(30_000),
  });

  const data = await workerRes.json();
  if (!workerRes.ok) {
    return NextResponse.json(
      { error: data.error || 'Worker error' },
      { status: workerRes.status >= 500 ? 502 : workerRes.status }
    );
  }

  // Record batch job in Supabase
  if (data.batchId) {
    await supabaseAdmin.from('research_batch_jobs').insert({
      batch_id: data.batchId,
      created_by: session.user.email,
      status: data.status || 'queued',
      property_count: body.properties.length,
      options: body.options || {},
    });
  }

  return NextResponse.json(data, { status: 202 });
}, { routeName: 'research/batch/create' });

/* GET — List batch jobs for current user */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: jobs, error } = await supabaseAdmin
    .from('research_batch_jobs')
    .select('id, batch_id, status, property_count, completed_count, failed_count, created_at, completed_at')
    .eq('created_by', session.user.email)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: 'Failed to load batch jobs' }, { status: 500 });
  }

  return NextResponse.json({ jobs: jobs ?? [] });
}, { routeName: 'research/batch/list' });
