// app/api/cron/proactive-alerts/route.ts — the app tells you before you ask (audit §5, item 16).
//
// GET /api/cron/proactive-alerts — collect every situation the firm should know about, send the
// not-yet-announced ones to the people who can act on them, and record that they were sent.
//
// Auth: `Authorization: Bearer <CRON_SECRET>` (Vercel attaches it). Registered in vercel.json.
//
// ── WHY THIS IS A CRON AND NOT A PAGE LOAD ──────────────────────────────────────────────────────
//
// `lib/ai/proactive.ts` runs five queries across clock sessions, the compliance register, job
// estimates, AR aging and the equipment inventory. Doing that on every render of a dashboard is a
// lot of database work to produce, most of the time, nothing new — and it would tie "did anyone get
// told?" to "did anyone open the app?", which fails exactly on the day everybody is in the field.
//
// ── ONCE A DAY, IN THE MORNING ──────────────────────────────────────────────────────────────────
//
// 13:00 UTC is 7am or 8am in America/Chicago depending on the season. Every alert here is about
// something you would act on during a working day — a forgotten clock-out to fix before payroll, a
// licence to renew, an invoice to chase — so arriving before the day starts is the whole point.
// Hourly would be noise: none of these situations changes in an hour, and the dedupe ledger means
// the extra runs would deliver nothing while still doing the work.
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { deliverProactiveAlerts } from '@/lib/ai/proactive';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron/proactive-alerts] CRON_SECRET not set');
    return NextResponse.json({ error: 'CRON_SECRET not configured.' }, { status: 500 });
  }
  if ((req.headers.get('authorization') ?? '') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const report = await deliverProactiveAlerts();

  // `undeliverable` is returned rather than logged and forgotten: an alert with an audience nobody
  // could be resolved for is a real failure — the situation is true and nobody was told — and it is
  // invisible in every count that only reports what was sent.
  if (report.undeliverable.length > 0) {
    console.warn('[cron/proactive-alerts] no recipient could be resolved for:', report.undeliverable.join(', '));
  }

  return NextResponse.json({ ok: true, ...report });
});
