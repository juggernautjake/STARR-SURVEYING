// app/api/admin/marketing/spend/refresh/route.ts — pull the visible range from Google, now. A3.
//
// POST { from, to } → ImportResult
//
// Owner: *"It should just show all of that info by default in real time."*
//
// ── WHY A BUTTON EXISTS AT ALL WHEN A CRON ALREADY RUNS ─────────────────────────────────────────
//
// The nightly job ends at YESTERDAY, on purpose: today is still being counted, and freezing a
// half-day into the table as though it were final is worse than not having it. But "this month" read
// at 2pm on the 12th is then missing up to a day of spend, with nothing on the page saying so.
//
// So the current period gets a way to ask Google directly. `includesToday` comes back with the result
// and the page labels the figure as still moving, rather than implying it has settled.
//
// ── POST, NOT GET ───────────────────────────────────────────────────────────────────────────────
//
// It writes to `ad_spend_daily` and spends Google API quota. A GET that mutates gets prefetched by a
// browser, retried by a proxy, and warmed by a link preview.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { importSpendRange, todayIso } from '@/lib/integrations/google-ads/import-spend';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A person can ask for a wide range, but not for the whole account's history on every click. */
const MAX_DAYS = 400;

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const to = typeof body.to === 'string' && DATE_RE.test(body.to) ? body.to : todayIso();
  const from = typeof body.from === 'string' && DATE_RE.test(body.from) ? body.from : to;

  if (from > to) return NextResponse.json({ error: 'The range is backwards.' }, { status: 400 });

  const spanDays = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
  if (spanDays > MAX_DAYS) {
    return NextResponse.json(
      { error: `That range is ${spanDays} days. Refresh at most ${MAX_DAYS} at a time.` },
      { status: 400 },
    );
  }

  const result = await importSpendRange(from, to);

  // A Google failure is a 200 with the reason in the body, not a 500. The page shows the message
  // beside the button; a 500 would be swallowed by the generic error handler and read as "the app is
  // broken" when the real answer is usually "the developer token is not configured".
  return NextResponse.json(result);
}, { routeName: 'admin/marketing/spend/refresh' });
