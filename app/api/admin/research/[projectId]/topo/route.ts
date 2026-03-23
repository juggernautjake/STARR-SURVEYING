// app/api/admin/research/[projectId]/topo/route.ts
// Phase 13: USGS topographic data proxy.
//
// POST — Triggers a topographic data query on the worker for the project.
//         Stores result in research_topo table.
//
// GET  — Returns cached topographic result for the project.
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

// ── Typed response helpers ────────────────────────────────────────────────────
interface TopoResponse {
  topo?: {
    query_lat?: number;
    query_lon?: number;
    query_radius_m?: number;
    elevation?: { elevation_ft?: number; data_source?: string } | null;
    contours?: unknown[];
    water_features?: unknown[];
    slope_pct?: number | null;
    aspect_deg?: number | null;
    elevation_range_ft?: number | null;
    errors?: string[];
  };
  error?: string;
}

/* POST — Trigger topographic data query */
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
    .select('id, property_address, county, state, analysis_metadata, parcel_id')
    .eq('id', projectId)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({})) as {
    latitude?: number;
    longitude?: number;
    radiusM?: number;
  };

  // Use parcel centroid when no coordinates are provided
  let lat = body.latitude;
  let lon = body.longitude;
  if ((!lat || !lon) && project.parcel_id) {
    try {
      const { fetchParcelCentroidWgs84 } = await import('@/lib/research/bell-cad-arcgis.service');
      const centroid = await fetchParcelCentroidWgs84(project.parcel_id);
      if (centroid) {
        lat = centroid.lat;
        lon = centroid.lon;
        console.log(`[topo] Using parcel centroid for prop_id=${project.parcel_id}: ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
      }
    } catch { /* continue with whatever coords we have */ }
  }

  const workerRes = await fetch(`${WORKER_URL}/research/topo`, {
    method: 'POST',
    headers: workerHeaders(),
    body: JSON.stringify({
      projectId,
      lat,
      lon,
      radiusM: body.radiusM ?? 200,
      parcel_id: project.parcel_id || undefined,
    }),
    signal: AbortSignal.timeout(45_000),
  });

  const data = await workerRes.json() as TopoResponse;
  if (!workerRes.ok) {
    return NextResponse.json(
      { error: data.error || 'Worker error', workerStatus: workerRes.status },
      { status: workerRes.status >= 500 ? 502 : workerRes.status },
    );
  }

  // Persist result to Supabase
  const topo = data.topo;
  if (topo) {
    await supabaseAdmin.from('research_topo').insert({
      research_project_id: projectId,
      created_by: session.user.email,
      query_lat: topo.query_lat ?? null,
      query_lon: topo.query_lon ?? null,
      query_radius_m: topo.query_radius_m ?? 200,
      elevation_ft: topo.elevation?.elevation_ft ?? null,
      elevation_data_source: topo.elevation?.data_source ?? null,
      contour_count: topo.contours?.length ?? 0,
      water_feature_count: topo.water_features?.length ?? 0,
      slope_pct: topo.slope_pct ?? null,
      aspect_deg: topo.aspect_deg ?? null,
      elevation_range_ft: topo.elevation_range_ft ?? null,
      result: topo as object,
      errors: topo.errors ?? [],
    });
  }

  return NextResponse.json(data);
}, { routeName: 'research/topo/start' });

/* GET — Return cached topographic result */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  // Try Supabase cache first
  const { data: cached } = await supabaseAdmin
    .from('research_topo')
    .select('*')
    .eq('research_project_id', projectId)
    .order('queried_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached) {
    return NextResponse.json({
      projectId,
      cached: true,
      topo: cached.result,
      summary: {
        elevationFt: cached.elevation_ft,
        dataSource: cached.elevation_data_source,
        contourCount: cached.contour_count,
        waterFeatureCount: cached.water_feature_count,
        slopePct: cached.slope_pct,
        aspectDeg: cached.aspect_deg,
        elevationRangeFt: cached.elevation_range_ft,
        queriedAt: cached.queried_at,
      },
    });
  }

  // Fall through to worker if no cache
  if (!WORKER_URL || !WORKER_API_KEY) {
    return NextResponse.json({ projectId, status: 'not_queried' });
  }

  const workerRes = await fetch(`${WORKER_URL}/research/topo/${projectId}`, {
    headers: workerHeaders(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!workerRes.ok) {
    if (workerRes.status === 404) return NextResponse.json({ projectId, status: 'not_queried' });
    return NextResponse.json({ error: 'Worker error' }, { status: 502 });
  }

  return NextResponse.json(await workerRes.json());
}, { routeName: 'research/topo/get' });
