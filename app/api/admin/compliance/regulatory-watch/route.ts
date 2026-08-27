// app/api/admin/compliance/regulatory-watch/route.ts — has a rule we depend on changed? §I3.5
//
// GET               → { topics: [{ id, label, why }] }
// GET ?topic=tbpels → { status, report, steps }
//
// ── ADMIN-ONLY, LIKE THE REST OF THIS ROUTE TREE ────────────────────────────────────────────────
//
// `GET /api/admin/compliance` once answered any signed-in account with the whole register of
// licences, insurance and calibration; that boundary was closed and pinned by
// `__tests__/admin/compliance-access.test.ts`. A sibling that reads more slowly than that one would
// be a hole beside a door somebody already shut, so it is gated the same way from the start.
//
// ── ON DEMAND, ONE TOPIC AT A TIME ──────────────────────────────────────────────────────────────
//
// Not a cron. Rules change on the timescale of months and each topic spends two or three searches;
// running all of them on a schedule would bill continuously to answer a question nobody asked that
// morning. Somebody opening the compliance tab and pressing Check is the signal it is worth doing.
//
// It is READ-ONLY and never writes to the compliance register. A search result must not be able to
// change what the firm believes about its own licence.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  regulatoryTopics,
  runRegulatoryWatch,
  type RegulatoryTopic,
} from '@/lib/compliance/regulatory-watch';

const VALID: RegulatoryTopic[] = ['tbpels', 'flood-maps', 'recording-fees'];

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const topic = new URL(req.url).searchParams.get('topic');

  // No topic: describe what can be watched, so the client does not carry its own copy of the list.
  if (!topic) return NextResponse.json({ topics: regulatoryTopics() });

  if (!VALID.includes(topic as RegulatoryTopic)) {
    return NextResponse.json({ error: `Unknown topic. Expected one of: ${VALID.join(', ')}.` }, { status: 400 });
  }

  const run = await runRegulatoryWatch(topic as RegulatoryTopic);

  return NextResponse.json({
    // Branch on this, never on `report.hits.length`. "We checked and nothing changed" and "we never
    // checked" are opposite facts that produce the same empty list — and on a compliance surface
    // that is the difference that matters.
    status: run.status,
    report: run.report,
    steps: run.steps,
  });
}, { routeName: 'admin/compliance/regulatory-watch' });
