// app/api/admin/research/[projectId]/pipeline/route.ts
// Proxies deep research requests to the DigitalOcean worker and polls for results.
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

function workerHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${WORKER_API_KEY}`,
  };
}

// ── Bell County Auto-Detection ────────────────────────────────────────────────
// Keep in sync with worker/src/counties/router.ts BELL_COUNTY_CITIES

const BELL_COUNTY_CITIES_LOWER = [
  'belton', 'killeen', 'temple', 'harker heights', 'nolanville', 'salado',
  'holland', 'rogers', 'troy', 'moody', 'bartlett', 'little river-academy',
  'little river academy', 'copperas cove', 'morgans point resort', 'moffat',
  'pendleton', 'eddy', 'heidenheimer', 'academy', 'prairie dell',
];

const BELL_COUNTY_ZIPS = new Set([
  '76501', '76502', '76503', '76504', '76505', '76506', '76507', '76508',
  '76513', '76517', '76520', '76522', '76523', '76524', '76525', '76526',
  '76527', '76528', '76530', '76534', '76537', '76538', '76539',
  '76540', '76541', '76542', '76543', '76544', '76545', '76546', '76547',
  '76548', '76549', '76554', '76557', '76561', '76569', '76570', '76571',
]);

function detectBellCountyFromAddress(address: string): boolean {
  if (!address) return false;
  const lower = address.toLowerCase();
  if (/\bbell\s+county\b/.test(lower)) return true;
  for (const city of BELL_COUNTY_CITIES_LOWER) {
    const escaped = city.replace(/-/g, '[-\\s]?');
    if (new RegExp(`\\b${escaped}\\b`).test(lower)) return true;
  }
  const zipMatches = address.match(/\b(\d{5})(?:-\d{4})?\b/g);
  if (zipMatches) {
    for (const zip of zipMatches) {
      if (BELL_COUNTY_ZIPS.has(zip.slice(0, 5))) return true;
    }
  }
  return false;
}
// ── End Bell County Auto-Detection ────────────────────────────────────────────

/* POST — Start a deep research pipeline on the worker */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!WORKER_URL || !WORKER_API_KEY) {
    console.warn('[pipeline/route] POST: worker not configured (WORKER_URL/WORKER_API_KEY missing)');
    return NextResponse.json({
      error: 'Deep research worker is not configured. Set WORKER_URL and WORKER_API_KEY in your environment.',
    }, { status: 503 });
  }

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  // Verify project exists
  const { data: project, error: projError } = await supabaseAdmin
    .from('research_projects')
    .select('id, property_address, county, state')
    .eq('id', projectId)
    .single();

  if (projError || !project) {
    console.warn(`[pipeline/route] POST ${projectId}: project not found — ${projError?.message ?? 'no data'}`);
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const body = await req.json() as {
    address?: string;
    county?: string;
    propertyId?: string;
    ownerName?: string;
  };

  const rawCounty = body.county || project.county || '';
  const rawAddress = body.address || project.property_address || '';

  // Auto-detect Bell County from address when county is not explicitly set
  const autoCounty = !rawCounty && rawAddress ? (detectBellCountyFromAddress(rawAddress) ? 'Bell' : '') : '';

  const payload = {
    projectId,
    address: rawAddress,
    county: rawCounty || autoCounty,
    state: project.state || 'TX',
    propertyId: body.propertyId || undefined,
    ownerName: body.ownerName || undefined,
  };

  if (!payload.county) {
    console.warn(`[pipeline/route] POST ${projectId}: county missing — address="${rawAddress}"`);
    return NextResponse.json({ error: 'County is required for deep research' }, { status: 400 });
  }

  console.log(
    `[pipeline/route] POST ${projectId}: forwarding to worker — county="${payload.county}" address="${payload.address}" workerUrl=${WORKER_URL}`,
  );

  // Forward to worker
  const workerRes = await fetch(`${WORKER_URL}/research/property-lookup`, {
    method: 'POST',
    headers: workerHeaders(),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });

  const workerData = await workerRes.json();

  if (!workerRes.ok) {
    console.error(
      `[pipeline/route] POST ${projectId}: worker responded HTTP ${workerRes.status} — ${workerData.error ?? 'unknown'}`,
    );
    return NextResponse.json({
      error: workerData.error || 'Worker rejected the request',
      hint: workerData.hint,
      workerStatus: workerRes.status,
    }, { status: workerRes.status >= 500 ? 502 : workerRes.status });
  }

  console.log(
    `[pipeline/route] POST ${projectId}: worker accepted — status=${workerData.status ?? 'running'} (Frontend → Backend → Worker handshake complete)`,
  );

  return NextResponse.json({
    message: 'Deep research pipeline started',
    projectId,
    status: 'running',
    pollUrl: `/api/admin/research/${projectId}/pipeline`,
    worker: workerData,
  }, { status: 202 });
}, { routeName: 'research/pipeline/start' });

/* DELETE — Cancel a running pipeline */
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!WORKER_URL || !WORKER_API_KEY) {
    return NextResponse.json({ error: 'Worker not configured' }, { status: 503 });
  }

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  console.log(`[pipeline/route] DELETE ${projectId}: sending cancel request to worker`);

  try {
    const workerRes = await fetch(`${WORKER_URL}/research/cancel/${projectId}`, {
      method: 'POST',
      headers: workerHeaders(),
      signal: AbortSignal.timeout(10_000),
    });

    const data = await workerRes.json();

    if (!workerRes.ok) {
      console.warn(`[pipeline/route] DELETE ${projectId}: worker responded HTTP ${workerRes.status}`);
      return NextResponse.json(data, { status: workerRes.status });
    }

    // Update project status in Supabase
    await supabaseAdmin
      .from('research_projects')
      .update({
        status: 'configure',
        research_message: 'Pipeline cancelled by user',
      })
      .eq('id', projectId);

    console.log(`[pipeline/route] DELETE ${projectId}: pipeline cancelled successfully`);
    return NextResponse.json({ message: 'Pipeline cancelled', projectId, ...data });
  } catch (err) {
    console.error(`[pipeline/route] DELETE ${projectId}: cancel failed —`, err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Failed to cancel pipeline' }, { status: 502 });
  }
}, { routeName: 'research/pipeline/cancel' });

/* GET — Poll worker for pipeline status / results */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!WORKER_URL || !WORKER_API_KEY) {
    return NextResponse.json({ error: 'Worker not configured' }, { status: 503 });
  }

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  // Poll worker status
  const workerRes = await fetch(`${WORKER_URL}/research/status/${projectId}`, {
    headers: workerHeaders(),
    signal: AbortSignal.timeout(30_000),
  });

  if (!workerRes.ok) {
    if (workerRes.status === 404) {
      return NextResponse.json({ projectId, status: 'not_found' }, { status: 404 });
    }
    console.warn(`[pipeline/route] GET ${projectId}: worker error HTTP ${workerRes.status}`);
    return NextResponse.json({ error: 'Worker error' }, { status: 502 });
  }

  const data = await workerRes.json() as { status?: string; log?: unknown[]; message?: string; currentStage?: string };

  // Log non-trivial status changes (not on every poll to avoid noise)
  if (data.status && data.status !== 'running') {
    console.log(
      `[pipeline/route] GET ${projectId}: status=${data.status} logEntries=${data.log?.length ?? 0}`,
    );
  } else {
    // Log running status with log count so we can confirm data is flowing
    const logCount = data.log?.length ?? 0;
    if (logCount > 0) {
      console.log(
        `[pipeline/route] GET ${projectId}: forwarding live data — status=${data.status ?? 'running'} logEntries=${logCount} stage="${data.currentStage ?? data.message?.slice(0, 40) ?? 'unknown'}"`,
      );
    }
  }

  return NextResponse.json(data);
}, { routeName: 'research/pipeline/status' });
