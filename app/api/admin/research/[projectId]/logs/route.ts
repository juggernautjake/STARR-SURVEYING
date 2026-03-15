// app/api/admin/research/[projectId]/logs/route.ts
// Returns persisted pipeline run logs for a completed research project.
// First tries the worker's in-memory cache (via GET /research/logs/:projectId),
// then falls back to reading research_logs directly from Supabase.
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

/* GET — Retrieve persisted run logs for a research project */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  // Try the worker first (may have in-memory cache of recent runs)
  if (WORKER_URL && WORKER_API_KEY) {
    try {
      const workerRes = await fetch(`${WORKER_URL}/research/logs/${projectId}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${WORKER_API_KEY}`,
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (workerRes.ok) {
        const data = await workerRes.json();
        return NextResponse.json(data);
      }
      // Fall through to Supabase if worker returns 404 or non-200
    } catch {
      // Worker unreachable — fall through to Supabase
    }
  }

  // Supabase fallback: read research_logs column directly
  const { data, error } = await supabaseAdmin
    .from('research_projects')
    .select('research_logs')
    .eq('id', projectId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Project not found or no logs available' }, { status: 404 });
  }

  return NextResponse.json({
    projectId,
    log: data.research_logs ?? [],
    source: 'supabase',
  });
}, { routeName: 'research/logs' });
