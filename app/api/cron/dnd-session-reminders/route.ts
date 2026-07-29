// app/api/cron/dnd-session-reminders/route.ts — "we play tomorrow" into Discord (P10-4b).
//
// GET /api/cron/dnd-session-reminders — fires once a day. For every scheduled, not-yet-done session
// falling today or tomorrow in America/Chicago, post a reminder to that campaign's Discord webhook, with
// the RSVP tally attached.
//
// Schedule (vercel.json): `0 15 * * *` = 10am Central. Late enough that a reminder is read, early enough
// that "today" is still actionable.
//
// Auth: `Authorization: Bearer <CRON_SECRET>`, the same as every other cron here.
//
// IDEMPOTENCY IS THE SCHEDULE. Running twice in a day sends two reminders — see the note in
// `sessionsToRemind`. `phase-reminders` has the same property and it has been fine; it is written down in
// both places rather than assumed.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { sendToDiscord } from '@/lib/dnd/discord';
import { sessionsToRemind, reminderToDiscordMessage, type ReminderSession } from '@/lib/dnd/session-reminder';
import { tallyRsvps, type RsvpRow, type RsvpTally } from '@/lib/dnd/rsvp';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron/dnd-session-reminders] CRON_SECRET not set');
    return NextResponse.json({ error: 'CRON_SECRET not configured.' }, { status: 500 });
  }
  if ((req.headers.get('authorization') ?? '') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  // A ±2 day pull, not the whole table: the bucket logic only ever fires on today or tomorrow, and the pad
  // covers the timezone offset at either end. Same shape as `phase-reminders`.
  const fromIso = new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString();
  const toIso = new Date(now.getTime() + 2 * 24 * 3600 * 1000).toISOString();

  const { data: sessionRows, error } = await supabaseAdmin
    .from('dnd_sessions')
    .select('id, campaign_id, title, scheduled_at, status')
    .gte('scheduled_at', fromIso)
    .lte('scheduled_at', toIso);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const due = sessionsToRemind((sessionRows ?? []) as ReminderSession[], now);
  if (!due.length) return NextResponse.json({ candidates: sessionRows?.length ?? 0, sent: 0 });

  // Only campaigns that have actually configured a webhook. Fetched in one query for the whole batch
  // rather than per session, because a Saturday can easily have a dozen tables playing.
  const campaignIds = [...new Set(due.map((d) => d.campaignId))];
  let campaigns: { id: string; name: string; discord_webhook_url: string | null }[] = [];
  try {
    const { data } = await supabaseAdmin
      .from('dnd_campaigns').select('id, name, discord_webhook_url').in('id', campaignIds);
    campaigns = (data ?? []) as typeof campaigns;
  } catch {
    // Seed 461 not applied — nothing can be sent, and that is not an error worth a 500 on a cron.
    return NextResponse.json({ candidates: sessionRows?.length ?? 0, sent: 0, note: 'discord_webhook_url column missing' });
  }
  const byCampaign = new Map(campaigns.map((c) => [c.id, c]));

  // Members and RSVPs, for the tally. Both are best-effort: the reminder is worth sending without them,
  // and `reminderToDiscordMessage` omits the line rather than printing "0 yes", which would read as
  // nobody coming.
  const memberIdsBy = new Map<string, string[]>();
  const rsvpBy = new Map<string, RsvpRow[]>();
  try {
    const { data: mems } = await supabaseAdmin
      .from('dnd_campaign_members').select('campaign_id, user_id').in('campaign_id', campaignIds);
    for (const m of (mems ?? []) as { campaign_id: string; user_id: string }[]) {
      memberIdsBy.set(m.campaign_id, [...(memberIdsBy.get(m.campaign_id) ?? []), m.user_id]);
    }
    const { data: rsvps } = await supabaseAdmin
      .from('dnd_session_rsvps').select('session_id, user_id, status').in('session_id', due.map((d) => d.sessionId));
    for (const r of (rsvps ?? []) as (RsvpRow & { session_id: string })[]) {
      rsvpBy.set(r.session_id, [...(rsvpBy.get(r.session_id) ?? []), r]);
    }
  } catch {
    /* seed 460 not applied — the reminder goes out without a tally */
  }

  let sent = 0;
  for (const reminder of due) {
    const campaign = byCampaign.get(reminder.campaignId);
    if (!campaign?.discord_webhook_url) continue;
    const memberIds = memberIdsBy.get(reminder.campaignId) ?? [];
    const tally: RsvpTally | null = memberIds.length
      ? tallyRsvps(rsvpBy.get(reminder.sessionId) ?? [], memberIds)
      : null;
    sendToDiscord(
      campaign.discord_webhook_url,
      reminderToDiscordMessage(reminder, { campaignName: campaign.name, tally }),
    );
    sent += 1;
  }

  return NextResponse.json({ candidates: sessionRows?.length ?? 0, due: due.length, sent });
}, { routeName: 'cron/dnd-session-reminders' });
