// app/api/admin/learn/content-freshness/route.ts — has the material we TEACH been revised? §I3.4
//
// GET                        → { subjects: [{ id, label, affects }] }
// GET ?subject=ncees-handbook → { status, report, steps }
//
// Third sibling of the same shape as `admin/research/portal-watch` (§I3.3) and
// `admin/compliance/regulatory-watch` (§I3.5). Admin-only, on demand, read-only.
//
// ── READ-ONLY IS LOAD-BEARING HERE, NOT BOILERPLATE ─────────────────────────────────────────────
//
// The plan states the risk before it states the feature: **exam content must not be auto-edited
// from search results.** This route returns a review queue and has no write path at all. A wrong
// practice question is not a visible outage — it is a plausible question with a wrong answer, which
// a candidate then learns. That is the worst artefact this repo could produce, and the cheapest
// place to make it impossible is here, by never giving the endpoint a way to write.
//
// ── ON DEMAND, ONE SUBJECT AT A TIME ────────────────────────────────────────────────────────────
//
// Not a cron. A handbook edition turns over on a multi-year cycle and a statute on a legislative
// one; billing two searches per subject every night to answer a question that changes twice a
// decade is money spent to feel thorough. Somebody opening the tab and pressing Check is the signal.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  learnSubjects,
  runLearnFreshnessWatch,
  type LearnSubject,
} from '@/lib/learn/content-freshness-watch';

const VALID: LearnSubject[] = ['ncees-handbook', 'practice-act', 'tbpels-standards', 'recording-platting'];

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const subject = new URL(req.url).searchParams.get('subject');

  // No subject: describe what can be watched, so the client does not carry its own copy of the list.
  if (!subject) return NextResponse.json({ subjects: learnSubjects() });

  if (!VALID.includes(subject as LearnSubject)) {
    return NextResponse.json({ error: `Unknown subject. Expected one of: ${VALID.join(', ')}.` }, { status: 400 });
  }

  const run = await runLearnFreshnessWatch(subject as LearnSubject);

  return NextResponse.json({
    // Branch on this, never on `report.hits.length`. "We checked and the handbook has not moved"
    // and "we never checked" produce the same empty list, and on a study surface the second one
    // silently promises a currency nothing verified.
    status: run.status,
    report: run.report,
    steps: run.steps,
  });
}, { routeName: 'admin/learn/content-freshness' });
