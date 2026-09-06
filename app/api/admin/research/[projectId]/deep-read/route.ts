// app/api/admin/research/[projectId]/deep-read/route.ts
// Iterative loop (plan 4): the user-initiated AI "deep-read for more clues" — one bounded AI pass over the
// captured text to surface identifiers the structured parse missed, appended to discoveredLeads. Bridges to
// the worker; the AI cost lands on the run spend there.
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const WORKER_URL = process.env.WORKER_URL || '';
const WORKER_API_KEY = process.env.WORKER_API_KEY || '';

function extractProjectId(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/research/')[1]?.split('/');
  return parts?.[0] || null;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!WORKER_URL || !WORKER_API_KEY) {
    return NextResponse.json({ error: 'Research worker not configured' }, { status: 503 });
  }
  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const workerRes = await fetch(`${WORKER_URL}/research/${projectId}/deep-read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${WORKER_API_KEY}` },
    signal: AbortSignal.timeout(120_000),
  });
  const data = await workerRes.json();
  if (!workerRes.ok) {
    return NextResponse.json({ error: data.error || 'Worker error' }, { status: workerRes.status >= 500 ? 502 : workerRes.status });
  }
  return NextResponse.json(data);
}, { routeName: 'research/deep-read/post' });
