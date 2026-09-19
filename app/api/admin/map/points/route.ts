// app/api/admin/map/points/route.ts — the pins inside whatever the map is currently showing.
//
// Owner, 2026-09-18: "the point loading and rendering would only show up at a certain level of zoom.
// We wouldn't want a situation where we have 500 points loading all at once."
//
// So this route refuses to answer below MIN_POINT_ZOOM rather than trusting the browser not to ask.
// A client bug, an old tab, or somebody driving it with curl would otherwise pull every point in
// Texas — and the request that did it would look exactly like a legitimate one.
//
// Positions and labels only. Attachments are loaded per point, when one is opened, by the existing
// per-job loader; signing six hundred photographs to draw six hundred dots is most of a second of
// storage calls for pictures nobody asked to see.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { loadPointsInBounds, loadPlacedJobs } from '@/lib/jobs/map-world-server';
import { MIN_POINT_ZOOM, shouldLoadPoints, type Bounds } from '@/lib/jobs/map-world';

export const dynamic = 'force-dynamic';

/** A viewport edge, or NaN — which every comparison then fails, which is the point. */
const num = (v: string | null): number => (v === null || v.trim() === '' ? NaN : Number(v));

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const p = new URL(req.url).searchParams;

  // The job picker's list — every job with a geocoded address. Small, and independent of the
  // viewport, so it is one flag on this route rather than a second endpoint.
  if (p.get('jobs') === '1') {
    return NextResponse.json({ jobs: await loadPlacedJobs() });
  }

  const zoom = num(p.get('zoom'));
  if (!Number.isFinite(zoom)) {
    return NextResponse.json({ error: 'zoom is required.' }, { status: 400 });
  }
  if (!shouldLoadPoints(zoom)) {
    // Not an error — the map is simply further out than the point at which pins mean anything. It
    // gets an empty list and the reason, so it can say "zoom in" rather than "no points here".
    return NextResponse.json({ points: [], capped: false, tooFarOut: true, minZoom: MIN_POINT_ZOOM });
  }

  const bounds: Bounds = {
    north: num(p.get('north')),
    south: num(p.get('south')),
    east: num(p.get('east')),
    west: num(p.get('west')),
  };
  const finite = Object.values(bounds).every((n) => Number.isFinite(n));
  if (!finite) return NextResponse.json({ error: 'north, south, east and west are required.' }, { status: 400 });
  if (bounds.north < bounds.south) {
    return NextResponse.json({ error: 'north must be above south.' }, { status: 400 });
  }
  if (bounds.north > 90 || bounds.south < -90 || bounds.east > 180 || bounds.west < -180) {
    return NextResponse.json({ error: 'That viewport is not on the earth.' }, { status: 400 });
  }

  const { points, capped } = await loadPointsInBounds(bounds);
  return NextResponse.json({ points, capped, tooFarOut: false, minZoom: MIN_POINT_ZOOM });
}, { routeName: 'admin/map/points' });
