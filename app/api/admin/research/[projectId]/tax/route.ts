// app/api/admin/research/[projectId]/tax/route.ts
// Phase 13: TX Comptroller tax data proxy.
//
// POST — Triggers a property tax rate query on the worker for the project.
//         Stores result in research_tax table.
//
// GET  — Returns cached tax rate result for the project.
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

/* POST — Trigger property tax rate query */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!WORKER_URL || !WORKER_API_KEY) {
    return NextResponse.json({ error: 'Research worker not configured' }, { status: 503 });
  }

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const { data: project, error: projErr } = await supabaseAdmin
    .from('research_projects')
    .select('id, property_address, county, state')
    .eq('id', projectId)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({})) as { countyFips?: string; taxYear?: number };

  const workerRes = await fetch(`${WORKER_URL}/research/tax`, {
    method: 'POST',
    headers: workerHeaders(),
    body: JSON.stringify({
      projectId,
      countyFips: body.countyFips,
      taxYear: body.taxYear,
      county: project.county,
      state: project.state || 'TX',
    }),
    signal: AbortSignal.timeout(30_000),
  });

  const data = await workerRes.json() as Record<string, unknown>;
  if (!workerRes.ok) {
    return NextResponse.json(
      { error: (data as { error?: string }).error || 'Worker error', workerStatus: workerRes.status },
      { status: workerRes.status >= 500 ? 502 : workerRes.status },
    );
  }

  // Persist result to Supabase
  const tax = data.tax as Record<string, unknown> | undefined;
  if (tax) {
    await supabaseAdmin.from('research_tax').insert({
      research_project_id: projectId,
      created_by: session.user.email,
      county_fips: tax.county_fips as string | null,
      county_name: tax.county_name as string | null,
      appraisal_district_name: tax.appraisal_district_name as string | null,
      appraisal_district_url: tax.appraisal_district_url as string | null,
      tax_year: tax.tax_year as number | null,
      combined_rate: tax.combined_rate as number | null,
      taxing_unit_count: (tax.taxing_units as unknown[] | null)?.length ?? 0,
      result: tax,
      errors: tax.errors as string[] ?? [],
    });
  }

  return NextResponse.json(data);
}, { routeName: 'research/tax/start' });

/* GET — Return cached tax rate result */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  // Try Supabase cache first
  const { data: cached } = await supabaseAdmin
    .from('research_tax')
    .select('*')
    .eq('research_project_id', projectId)
    .order('queried_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached) {
    return NextResponse.json({
      projectId,
      cached: true,
      tax: cached.result,
      summary: {
        countyFips: cached.county_fips,
        countyName: cached.county_name,
        appraisalDistrict: cached.appraisal_district_name,
        appraisalDistrictUrl: cached.appraisal_district_url,
        combinedRate: cached.combined_rate,
        taxYear: cached.tax_year,
        queriedAt: cached.queried_at,
      },
    });
  }

  // Fall through to worker if no cache
  if (!WORKER_URL || !WORKER_API_KEY) {
    return NextResponse.json({ projectId, status: 'not_queried' });
  }

  const workerRes = await fetch(`${WORKER_URL}/research/tax/${projectId}`, {
    headers: workerHeaders(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!workerRes.ok) {
    if (workerRes.status === 404) return NextResponse.json({ projectId, status: 'not_queried' });
    return NextResponse.json({ error: 'Worker error' }, { status: 502 });
  }

  return NextResponse.json(await workerRes.json());
}, { routeName: 'research/tax/get' });
