// app/api/admin/jobs/[id]/property-map/library/route.ts — the job's files, beside the map.
//
// Owner, 2026-09-16: "we need all of the job files, photos, videos, audio files, etc to be available
// to us to see in a panel next to the map while we are building the interactive map, so that we can
// assign them to points of interest if we want to."
//
// Spec: docs/planning/in-progress/interactive-property-map-2026-09-16.md
//
// One request returns every file with a signed URL and its assignment state, because the panel is a
// to-do list — "what have I not placed yet?" — and that question is only answerable at a glance if
// "assigned" arrives as a property of the file rather than as something to cross-reference against
// the points. Signing is done in bulk per bucket, the same as the map's own load: a hundred photos
// is a hundred serial round trips otherwise, and this is the panel somebody sits in front of for an
// hour.
//
// It is deliberately NOT folded into the map's GET. The library changes when somebody uploads, the
// map changes when somebody draws, and a drag that assigns one photo should not re-download either
// the aerial's points or four hundred file rows.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { loadMapLibrary } from '@/lib/jobs/property-map-server';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export const GET = withErrorHandler<Ctx>(async (req: NextRequest, { params }: Ctx) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const mapId = new URL(req.url).searchParams.get('map_id');
  const files = await loadMapLibrary(params.id, mapId);
  return NextResponse.json({ files });
}, { routeName: 'admin/jobs/property-map/library' });
