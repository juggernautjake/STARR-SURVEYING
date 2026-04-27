// app/api/admin/jobs/[id]/geofence/route.ts — set the centroid +
// radius the geofence classifier uses to label stops by job site.
//
// PATCH /api/admin/jobs/{id}/geofence
//   Body: { centroid_lat: number, centroid_lon: number,
//           geofence_radius_m?: number }
//   - Validates lat / lon bounds + radius (>= 25 m).
//   - Bulk-recompute is NOT triggered here; the dispatcher hits
//     /admin/timeline → Recompute after setting a geofence.
//
// Auth: admin / developer / tech_support.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const DEFAULT_RADIUS_M = 200;
const MIN_RADIUS_M = 25;
const MAX_RADIUS_M = 5000;

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userRoles = (session.user as { roles?: string[] } | undefined)
    ?.roles ?? [];
  if (!isAdmin(session.user.roles) && !userRoles.includes('tech_support')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Next 15: dynamic params arrive via the URL pathname (the
  // withErrorHandler signature accepts (req) only). Same pattern as
  // /api/admin/receipts/[id] + /api/admin/field-data/[id].
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  // path: /api/admin/jobs/{id}/geofence — id is the second-to-last.
  const id = segments[segments.length - 2];
  if (!id) {
    return NextResponse.json(
      { error: 'Missing job id' },
      { status: 400 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const lat = typeof body.centroid_lat === 'number' ? body.centroid_lat : null;
  const lon = typeof body.centroid_lon === 'number' ? body.centroid_lon : null;
  if (lat == null || lon == null) {
    return NextResponse.json(
      { error: 'centroid_lat and centroid_lon (numbers) are required' },
      { status: 400 }
    );
  }
  if (lat < -90 || lat > 90) {
    return NextResponse.json(
      { error: 'centroid_lat out of range (-90..90)' },
      { status: 400 }
    );
  }
  if (lon < -180 || lon > 180) {
    return NextResponse.json(
      { error: 'centroid_lon out of range (-180..180)' },
      { status: 400 }
    );
  }

  const radius =
    typeof body.geofence_radius_m === 'number'
      ? body.geofence_radius_m
      : DEFAULT_RADIUS_M;
  if (radius < MIN_RADIUS_M || radius > MAX_RADIUS_M) {
    return NextResponse.json(
      {
        error: `geofence_radius_m must be between ${MIN_RADIUS_M} and ${MAX_RADIUS_M} (got ${radius})`,
      },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('jobs')
    .update({
      centroid_lat: lat,
      centroid_lon: lon,
      geofence_radius_m: Math.round(radius),
    })
    .eq('id', id)
    .select('id, name, centroid_lat, centroid_lon, geofence_radius_m')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ job: data });
}, { routeName: 'admin/jobs/:id/geofence' });
