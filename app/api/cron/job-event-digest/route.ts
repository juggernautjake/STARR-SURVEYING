// app/api/cron/job-event-digest/route.ts — slice N4 of
// docs/planning/in-progress/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md
//
// GET /api/cron/job-event-digest — hourly. Folds each user's queued job events into ONE
// notification, at the hour that user chose.
//
// ── WHY HOURLY FOR A DAILY DIGEST ───────────────────────────────────────────────────────────────
//
// `digest_hour` is per user (the office and the field keep different days), so there is no single
// time to run at. Running every hour and asking "is it 5pm for this person" is the cheap version of
// per-user scheduling: the query is one indexed read of unsent rows, and it costs nothing on the 23
// hours where nobody is due.
//
// ── WHY sent_at IS STAMPED BEFORE THE NOTIFICATION IS SENT ──────────────────────────────────────
//
// The two failure modes are not equal. Stamp-then-send can lose a digest if the send fails after the
// stamp — annoying, and the rows are still there to read. Send-then-stamp can send the SAME digest
// twice if the stamp fails, which is a phone buzzing at 5pm and again at 6pm with identical content,
// on the one feature whose entire purpose is not doing that.
//
// Vercel cron config (vercel.json): { "path": "/api/cron/job-event-digest", "schedule": "0 * * * *" }

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notify } from '@/lib/notifications';
import { composeDigest, isDigestHour, type DigestLine, type JobNotificationPrefRow } from '@/lib/notifications/job-prefs';

export const runtime = 'nodejs';

/** The firm is in Texas and has one office. Central time is the day everyone here keeps, and
 *  storing a per-user timezone to serve one timezone would be a column nobody maintains. */
const DIGEST_TZ = 'America/Chicago';

/** Nothing older than this is folded in. A queue row from three days ago is not "today's update";
 *  sending it in tonight's digest reads as the system having been broken, which it was. */
const MAX_AGE_HOURS = 36;

interface QueueRow {
  id: string; user_email: string; kind: string;
  title: string; body: string | null; link: string | null; created_at: string;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron/job-event-digest] CRON_SECRET not set');
    return NextResponse.json({ error: 'CRON_SECRET not configured.' }, { status: 500 });
  }
  if ((req.headers.get('authorization') ?? '') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // The current hour in Central, taken from the formatter rather than by subtracting six — the
  // offset is five for half the year, and a digest that goes out an hour early in November is the
  // kind of bug that gets blamed on the phone.
  const nowHour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: DIGEST_TZ, hour: 'numeric', hour12: false })
      .format(new Date()),
  ) % 24;

  const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 3600_000).toISOString();

  const { data: pending, error } = await supabaseAdmin
    .from('job_notification_digest_queue')
    .select('id, user_email, kind, title, body, link, created_at')
    .is('sent_at', null)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[cron/job-event-digest] queue read failed', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (pending ?? []) as QueueRow[];
  if (rows.length === 0) return NextResponse.json({ hour: nowHour, users: 0, sent: 0, lines: 0 });

  const byUser = new Map<string, QueueRow[]>();
  for (const r of rows) {
    byUser.set(r.user_email, [...(byUser.get(r.user_email) ?? []), r]);
  }

  const { data: prefRows } = await supabaseAdmin
    .from('job_notification_prefs')
    .select('user_email, channels, digest_hour')
    .in('user_email', [...byUser.keys()]);
  const prefs = new Map(
    ((prefRows ?? []) as JobNotificationPrefRow[]).map((p) => [p.user_email.trim().toLowerCase(), p]),
  );

  let sent = 0;
  let lines = 0;
  for (const [email, queued] of byUser) {
    if (!isDigestHour(nowHour, prefs.get(email.trim().toLowerCase()))) continue;

    const digest = composeDigest(queued as DigestLine[]);
    if (!digest) continue;

    // Claim first. See the header: a duplicate digest is worse than a missed one on the one feature
    // whose whole purpose is not sending the same thing twice.
    const { error: claimErr } = await supabaseAdmin
      .from('job_notification_digest_queue')
      .update({ sent_at: new Date().toISOString() })
      .in('id', queued.map((q) => q.id))
      // Only rows still unclaimed, so two overlapping runs cannot both take the same batch.
      .is('sent_at', null);
    if (claimErr) {
      console.error('[cron/job-event-digest] could not claim rows; skipping this user', {
        user: email, rows: queued.length, error: claimErr.message,
      });
      continue;
    }

    await notify({
      user_email: email,
      type: 'job_digest',
      title: digest.title,
      body: digest.body,
      link: digest.link ?? '/admin/jobs',
      source_type: 'job_digest',
      // Ambient by definition — this is the batch of things that were explicitly judged not worth
      // interrupting for. Marking a digest `high` would undo the whole slice.
      escalation_level: 'low',
    });
    sent += 1;
    lines += queued.length;
  }

  return NextResponse.json({ hour: nowHour, users: byUser.size, sent, lines });
}, { routeName: 'cron/job-event-digest' });
