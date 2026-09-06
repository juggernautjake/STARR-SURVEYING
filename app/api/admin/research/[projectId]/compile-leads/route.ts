// app/api/admin/research/[projectId]/compile-leads/route.ts
// Iterative loop (plan 3): after analysis, the user asks the worker to compile the NEW search leads
// (chain-of-title citations, adjoiners, referenced data points) into analysis_metadata.discoveredLeads.
// POST triggers the compile; GET reads whatever is already persisted (no worker call).
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const WORKER_URL = process.env.WORKER_URL || '';
const WORKER_API_KEY = process.env.WORKER_API_KEY || '';

function extractProjectId(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/research/')[1]?.split('/');
  return parts?.[0] || null;
}

/* POST — ask the worker to (re)compile the discovered leads for this project. */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!WORKER_URL || !WORKER_API_KEY) {
    return NextResponse.json({ error: 'Research worker not configured' }, { status: 503 });
  }
  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const workerRes = await fetch(`${WORKER_URL}/research/${projectId}/compile-leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${WORKER_API_KEY}` },
    signal: AbortSignal.timeout(60_000),
  });
  const data = await workerRes.json();
  if (!workerRes.ok) {
    return NextResponse.json({ error: data.error || 'Worker error' }, { status: workerRes.status >= 500 ? 502 : workerRes.status });
  }
  return NextResponse.json(data);
}, { routeName: 'research/compile-leads/post' });

/* GET — read the persisted leads without touching the worker. */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const { data } = await supabaseAdmin
    .from('research_projects')
    .select('analysis_metadata')
    .eq('id', projectId)
    .single();
  const meta = (data?.analysis_metadata ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    projectId,
    leads: Array.isArray(meta.discoveredLeads) ? meta.discoveredLeads : [],
    round: typeof meta.researchRound === 'number' ? meta.researchRound : 1,
  });
}, { routeName: 'research/compile-leads/get' });
