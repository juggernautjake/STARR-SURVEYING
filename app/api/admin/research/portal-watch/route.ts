// app/api/admin/research/portal-watch/route.ts — is a county about to move its records portal? §I3.3
//
// GET ?county=Bell[&vendor=Kofile] → { status, report, steps }
//
// ── THE LEADING HALF OF SELF-HEAL ───────────────────────────────────────────────────────────────
//
// The sweep next door answers "did an adapter break?" by probing it. That is lagging by
// construction: something has to break before it can say so, and by then a research run has already
// failed. Counties announce these migrations weeks ahead on a .gov page. This asks the same question
// earlier, so an adapter update can be planned instead of triaged.
//
// ── ON DEMAND, ONE COUNTY AT A TIME ─────────────────────────────────────────────────────────────
//
// Not a cron, and not a sweep over all 254 counties. Four searches per county times 254 is a bill
// nobody approved, on a free tier, to answer a question that changes on the timescale of months. The
// sweep already knows which adapters are degraded; this is the tool you point at one of them when
// you want to know whether the cause is a migration.
//
// Should this become scheduled later, the natural trigger is not the calendar — it is the sweep
// itself flagging an adapter `degraded`, at which point the watch has a reason to run and a specific
// county to run against.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { runPortalWatch } from '@/lib/research/portal-watch';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const params = new URL(req.url).searchParams;
  const county = (params.get('county') ?? '').trim();
  if (!county) return NextResponse.json({ error: 'A county is required.' }, { status: 400 });

  const vendor = (params.get('vendor') ?? '').trim() || undefined;

  const run = await runPortalWatch({ county, currentVendor: vendor });

  return NextResponse.json({
    // The caller must branch on this. An empty hit list from a watch that ran is reassuring; the
    // same empty list from a watch with no API key is not, and they are otherwise identical.
    status: run.status,
    report: run.report,
    steps: run.steps,
  });
}, { routeName: 'admin/research/portal-watch' });
