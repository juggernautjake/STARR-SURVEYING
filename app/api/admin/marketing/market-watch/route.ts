// app/api/admin/marketing/market-watch/route.ts — who is about to need a survey? §I3.2
//
// GET                            → { subjects: [{ id, label, actOn }], coverage, counties }
// GET ?subject=development-pipeline → { status, report, steps, coverage }
//
// Fourth sibling of the same shape as the portal, regulatory and learning watches. Admin-only, on
// demand, read-only.
//
// ── THE COVERAGE NOTE IS RETURNED WITH EVERY RESPONSE, ON PURPOSE ───────────────────────────────
//
// This watch covers eleven of the firm's forty-six service-area counties — the ones within a short
// drive of Belton. Two queries each across all forty-six would be ninety-two searches a sweep to
// answer a question about places the firm rarely bids.
//
// A bounded sweep that does not say it is bounded is the dangerous kind. An empty result would read
// as "nothing is being platted in the service area" when it means "we looked at a quarter of it".
// So the note ships with the data rather than living in a comment somebody has to find.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  coverageNote,
  coveredCounties,
  marketSubjects,
  runMarketWatch,
  type MarketSubject,
} from '@/lib/leads/market-watch';

const VALID: MarketSubject[] = ['development-pipeline', 'competitor-activity'];

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const subject = new URL(req.url).searchParams.get('subject');

  if (!subject) {
    return NextResponse.json({
      subjects: marketSubjects(),
      coverage: coverageNote(),
      counties: coveredCounties(),
    });
  }

  if (!VALID.includes(subject as MarketSubject)) {
    return NextResponse.json({ error: `Unknown subject. Expected one of: ${VALID.join(', ')}.` }, { status: 400 });
  }

  const run = await runMarketWatch(subject as MarketSubject);

  return NextResponse.json({
    // Branch on this, never on `report.hits.length`. Here the distinction is commercial rather than
    // regulatory: "we looked and nothing is being platted" and "we never looked" are the difference
    // between a quiet market and a missed one.
    status: run.status,
    report: run.report,
    steps: run.steps,
    coverage: coverageNote(),
  });
}, { routeName: 'admin/marketing/market-watch' });
