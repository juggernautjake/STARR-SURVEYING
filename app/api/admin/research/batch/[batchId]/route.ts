// app/api/admin/research/batch/[batchId]/route.ts
// Phase 11: Batch job status endpoint.
// GET — Return status and results for a specific batch job.
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

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Extract batchId from URL: /api/admin/research/batch/[batchId]
  const parts = req.nextUrl.pathname.split('/batch/');
  const batchId = parts[1]?.split('/')[0];
  if (!batchId) return NextResponse.json({ error: 'Batch ID required' }, { status: 400 });

  // Fetch from worker
  if (WORKER_URL && WORKER_API_KEY) {
    const workerRes = await fetch(`${WORKER_URL}/research/batch/${batchId}`, {
      headers: workerHeaders(),
      signal: AbortSignal.timeout(15_000),
    });

    if (workerRes.ok) {
      const workerData = await workerRes.json();

      // Sync status back to Supabase
      await supabaseAdmin
        .from('research_batch_jobs')
        .update({
          status: workerData.status,
          completed_count: workerData.completedCount ?? 0,
          failed_count: workerData.failedCount ?? 0,
          results: workerData.results ?? [],
          completed_at: workerData.completedAt || null,
          updated_at: new Date().toISOString(),
        })
        .eq('batch_id', batchId)
        .eq('created_by', session.user.email);

      return NextResponse.json(workerData);
    }
  }

  // Fall back to Supabase cache
  const { data: job, error } = await supabaseAdmin
    .from('research_batch_jobs')
    .select('*')
    .eq('batch_id', batchId)
    .eq('created_by', session.user.email)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: 'Batch job not found' }, { status: 404 });
  }

  return NextResponse.json({
    batchId: job.batch_id,
    status: job.status,
    propertyCount: job.property_count,
    completedCount: job.completed_count,
    failedCount: job.failed_count,
    results: job.results,
    createdAt: job.created_at,
    completedAt: job.completed_at,
  });
}, { routeName: 'research/batch/status' });
