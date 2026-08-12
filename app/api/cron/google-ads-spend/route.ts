// app/api/cron/google-ads-spend/route.ts — pull yesterday's ad spend. A11.
//
// Auth: `Authorization: Bearer <CRON_SECRET>`, the same as every other cron here.
//
// Separate from `google-ads-upload` on purpose. They share credentials and a schedule but not a failure
// mode: uploading conversions WRITES to the ad account, importing spend only READS. Folding them together
// means a reporting hiccup shows up as "the conversion upload failed", and someone spends an evening
// looking at the wrong system.
//
// ── WHY IT RE-IMPORTS A WINDOW RATHER THAN JUST YESTERDAY ──────────────────────────────────────────
//
// Google **restates recent spend**: invalid-click credits and conversion attribution land days after the
// fact, so yesterday's number is not final for about a week. Importing only yesterday would freeze the
// first, wrongest version of every day forever.
//
// So it re-imports a trailing window and UPSERTS on the table's grain. The unique index makes that safe;
// without it, a re-import would double every day in the window.

// A3: the import itself now lives in `lib/integrations/google-ads/import-spend.ts`, shared with the
// on-demand refresh button. The dangerous part of that code is the grain — `campaign_id: ''`, the
// four-column conflict target, `source: 'api'` — and a second copy of it would not fail, it would
// silently double the month. This route is now the schedule and the auth, nothing else.

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { importSpendRange } from '@/lib/integrations/google-ads/import-spend';

/** Long enough to catch Google's restatements, short enough that a nightly run stays cheap. */
const RESTATEMENT_WINDOW_DAYS = 10;

const isoDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export const GET = withErrorHandler(async (req: NextRequest) => {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron/google-ads-spend] CRON_SECRET not set');
    return NextResponse.json({ error: 'CRON_SECRET not configured.' }, { status: 500 });
  }
  if ((req.headers.get('authorization') ?? '') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const from = isoDate(now - RESTATEMENT_WINDOW_DAYS * day);
  const to = isoDate(now - day); // yesterday; today is incomplete and importing it stores a partial day

  const result = await importSpendRange(from, to, now);

  // A skipped run (no developer token) and a broken one are both 200: a cron that 500s gets retried
  // and alerted on, and "the token has not arrived" is neither retryable nor news. A real Google
  // error is reported in the body, which is where the cron log looks.
  return NextResponse.json(result);
}, { routeName: 'cron/google-ads-spend' });
