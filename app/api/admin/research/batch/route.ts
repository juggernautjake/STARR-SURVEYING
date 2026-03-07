// app/api/admin/research/batch/route.ts
// Phase 11: Batch research job management.
// POST — Create a new batch research job (forwards to worker BullMQ).
// GET  — List batch jobs for the current user.
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

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
