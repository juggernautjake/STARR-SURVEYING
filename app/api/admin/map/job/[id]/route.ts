// app/api/admin/map/job/[id]/route.ts — where a job is, so the map can open on it.
//
// Owner, 2026-09-18: "if we are on a specific job page and the user clicks the interactive map
// button, then it will load the interactive map page, and the map will be taken and zoomed in on the
// given location automatically and the points for that location will already be rendered."
//
// One small read rather than the whole map: the page needs a centre and a zoom before it can ask for
// anything else, and making it wait for every point of every job to decide where to look would be
// the slowest possible order to do this in.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { loadJobPlace } from '@/lib/jobs/map-world-server';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export const GET = withErrorHandler<Ctx>(async (_req: NextRequest, { params }: Ctx) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const job = await loadJobPlace(params.id);
  if (!job) return NextResponse.json({ error: 'That job is not here.' }, { status: 404 });
  return NextResponse.json({ job });
}, { routeName: 'admin/map/job' });
