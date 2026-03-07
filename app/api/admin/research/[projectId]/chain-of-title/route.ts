// app/api/admin/research/[projectId]/chain-of-title/route.ts
// Phase 11: Chain of Title query proxy.
// POST — Triggers a chain-of-title build on the worker for the project.
// GET  — Returns cached chain-of-title for the project.
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

function extractProjectId(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/research/')[1]?.split('/');
  return parts?.[0] || null;
}

/* POST — Build chain of title */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!WORKER_URL || !WORKER_API_KEY) {
    return NextResponse.json({ error: 'Research worker not configured' }, { status: 503 });
  }

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const { data: project, error } = await supabaseAdmin
    .from('research_projects')
    .select('id, property_address, county, state')
    .eq('id', projectId)
    .single();

  if (error || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({})) as { grantorName?: string; depth?: number };

  const workerRes = await fetch(`${WORKER_URL}/research/chain-of-title`, {
    method: 'POST',
    headers: workerHeaders(),
    body: JSON.stringify({
      projectId,
      address: project.property_address,
      county: project.county,
      state: project.state || 'TX',
      grantorName: body.grantorName,
      depth: body.depth ?? 10,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const data = await workerRes.json();
  if (!workerRes.ok) {
    return NextResponse.json(
      { error: data.error || 'Worker error', workerStatus: workerRes.status },
      { status: workerRes.status >= 500 ? 502 : workerRes.status }
    );
  }

  // Store result in Supabase (new record per query for historical tracking)
  if (data.chain) {
    await supabaseAdmin.from('research_chain_of_title').insert({
      research_project_id: projectId,
      created_by: session.user.email,
      links_found: data.chain.length ?? 0,
      oldest_year: data.chain.reduce((min: number | null, l: { year?: number }) => {
        const y = l.year; return (y && (!min || y < min)) ? y : min;
      }, null),
      newest_year: data.chain.reduce((max: number | null, l: { year?: number }) => {
        const y = l.year; return (y && (!max || y > max)) ? y : max;
      }, null),
      has_gap: data.hasGap ?? false,
      chain: data.chain,
      warnings: data.warnings ?? [],
    });
  }

  return NextResponse.json(data);
}, { routeName: 'research/chain-of-title/start' });

/* GET — Return cached chain of title */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const { data: cached } = await supabaseAdmin
    .from('research_chain_of_title')
    .select('*')
    .eq('research_project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (cached) {
    return NextResponse.json({
      projectId,
      cached: true,
      chain: cached.chain,
      warnings: cached.warnings,
      summary: {
        linksFound: cached.links_found,
        oldestYear: cached.oldest_year,
        newestYear: cached.newest_year,
        hasGap: cached.has_gap,
        queriedAt: cached.queried_at,
      },
    });
  }

  if (!WORKER_URL || !WORKER_API_KEY) {
    return NextResponse.json({ projectId, status: 'not_queried' });
  }

  const workerRes = await fetch(`${WORKER_URL}/research/chain-of-title/${projectId}`, {
    headers: workerHeaders(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!workerRes.ok) {
    if (workerRes.status === 404) return NextResponse.json({ projectId, status: 'not_queried' });
    return NextResponse.json({ error: 'Worker error' }, { status: 502 });
  }

  return NextResponse.json(await workerRes.json());
}, { routeName: 'research/chain-of-title/get' });
