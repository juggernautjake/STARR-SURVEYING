// app/api/admin/map/locate/route.ts — find a place on the map for jobs that have none (owner, 2026-11-11).
//
// POST { skip? }       → locate the next few jobs with no place yet; the map calls this in the
//                        background on every visit, so it fills in over time. `skip` is what the
//                        previous call said to step past (jobs it could not find or mark).
// POST { jobId }       → locate that one job now (the "Job address" button on a job's map).
//
// The work is lib/jobs/locate-jobs.ts: the job's own address through Google, then an address Claude
// infers from the record, placed by Google, never outside Texas.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { jobsToLocate, loadLocateRecord, locateRecord, saveOutcome } from '@/lib/jobs/locate-jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** How many jobs one background call works through. Small: each can be a geocode and an AI call. */
const BATCH = 6;

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { jobId?: unknown; skip?: unknown };

  if (typeof body.jobId === 'string' && body.jobId) {
    const record = await loadLocateRecord(body.jobId);
    if (!record) return NextResponse.json({ error: 'That job is not here.' }, { status: 404 });
    const outcome = await locateRecord(record);
    await saveOutcome(record.id, outcome);
    return NextResponse.json(outcome.ok
      ? { located: { jobId: record.id, lat: outcome.lat, lng: outcome.lng, source: outcome.source, formatted: outcome.formatted } }
      : { located: null, reason: outcome.reason });
  }

  const skip = typeof body.skip === 'number' && Number.isFinite(body.skip) && body.skip > 0 ? Math.floor(body.skip) : 0;
  const { records, remaining } = await jobsToLocate(BATCH, skip);
  const located: Array<{ jobId: string; lat: number; lng: number; source: string; formatted: string }> = [];
  let failed = 0;
  let stillListed = 0;
  for (const r of records) {
    const outcome = await locateRecord(r);
    if (!(await saveOutcome(r.id, outcome))) stillListed += 1;
    if (outcome.ok) located.push({ jobId: r.id, lat: outcome.lat, lng: outcome.lng, source: outcome.source, formatted: outcome.formatted });
    else failed += 1;
  }
  return NextResponse.json({ located, failed, remaining, skip: skip + stillListed });
}, { routeName: 'admin/map/locate' });
