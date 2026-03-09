// app/api/admin/research/[projectId]/flood-zone/route.ts
// Phase 11: FEMA NFHL Flood Zone query proxy.
// POST — Triggers a flood zone query on the worker for the project.
// GET  — Returns cached flood zone result for the project.
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

/* POST — Start flood zone query */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!WORKER_URL || !WORKER_API_KEY) {
    return NextResponse.json({ error: 'Research worker not configured' }, { status: 503 });
  }

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  // Look up project coordinates
  const { data: project, error } = await supabaseAdmin
    .from('research_projects')
    .select('id, property_address, county, state, analysis_metadata')
    .eq('id', projectId)
    .single();

  if (error || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({})) as { longitude?: number; latitude?: number };

  const workerRes = await fetch(`${WORKER_URL}/research/flood-zone`, {
    method: 'POST',
    headers: workerHeaders(),
    body: JSON.stringify({
      projectId,
      longitude: body.longitude,
      latitude: body.latitude,
      address: project.property_address,
      county: project.county,
      state: project.state || 'TX',
    }),
    signal: AbortSignal.timeout(30_000),
  });

  const data = await workerRes.json();
  if (!workerRes.ok) {
    return NextResponse.json(
      { error: data.error || 'Worker error', workerStatus: workerRes.status },
      { status: workerRes.status >= 500 ? 502 : workerRes.status }
    );
  }

  // Store result in Supabase (new record per query for historical tracking)
  if (data.floodZone) {
    await supabaseAdmin.from('research_flood_zone').insert({
      research_project_id: projectId,
      created_by: session.user.email,
      result: data.floodZone,
      primary_zone: data.floodZone?.summary?.primaryZone,
      is_in_floodplain: data.floodZone?.summary?.isInFloodplain ?? false,
      flood_insurance_required: data.floodZone?.summary?.floodInsuranceRequired ?? false,
      firm_panel_number: data.floodZone?.summary?.firmPanelNumber,
      risk_level: data.floodZone?.summary?.riskLevel,
    });
  }

  return NextResponse.json(data);
}, { routeName: 'research/flood-zone/start' });

/* GET — Return cached flood zone result */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  // Try cache first
  const { data: cached } = await supabaseAdmin
    .from('research_flood_zone')
    .select('*')
    .eq('research_project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (cached) {
    return NextResponse.json({ projectId, cached: true, floodZone: cached.result, summary: {
      primaryZone: cached.primary_zone,
      isInFloodplain: cached.is_in_floodplain,
      floodInsuranceRequired: cached.flood_insurance_required,
      firmPanelNumber: cached.firm_panel_number,
      riskLevel: cached.risk_level,
      queriedAt: cached.queried_at,
    } });
  }

  // Fall through to worker if no cache
  if (!WORKER_URL || !WORKER_API_KEY) {
    return NextResponse.json({ projectId, status: 'not_queried' });
  }

  const workerRes = await fetch(`${WORKER_URL}/research/flood-zone/${projectId}`, {
    headers: workerHeaders(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!workerRes.ok) {
    if (workerRes.status === 404) return NextResponse.json({ projectId, status: 'not_queried' });
    return NextResponse.json({ error: 'Worker error' }, { status: 502 });
  }

  return NextResponse.json(await workerRes.json());
}, { routeName: 'research/flood-zone/get' });
