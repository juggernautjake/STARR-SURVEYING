// app/api/cron/daily-briefing/route.ts
//
// GET /api/cron/daily-briefing
//
// notifications-completeness-pass Slice 4 — fires the "Good morning,
// {firstName}" briefing notification each weekday morning to every
// active user. The briefing condenses what the daily-briefing widget
// already pulls (schedule events for today + tasks due today through
// the next 5 business days + admin notes / @-mentions from the last
// 24h) into ONE bell payload so the surveyor sees the summary even if
// the hub isn't open.
//
// Per-user empty days are skipped (the composer returns null) so the
// bell doesn't fill up on quiet days.
//
// Auth: `Authorization: Bearer <CRON_SECRET>` (same as the other crons;
// Vercel attaches it automatically). Register in vercel.json.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notify } from '@/lib/notifications';
import {
  buildDailyBriefingNotification,
  fiveBusinessDayWindow,
  type BriefingMention,
} from '@/lib/notifications/daily-briefing';
import { detectMentions, type MentionMessage } from '@/lib/messages/mentions';

interface UserRow {
  email: string;
  name: string | null;
}
interface ScheduleEventRow {
  title: string | null;
  start_time: string | null;
  all_day: boolean | null;
  assigned_to: string | null;
}
interface AssignmentRow {
  title: string | null;
  due_date: string | null;
  assigned_to: string | null;
  status: string | null;
}
interface MessageRow {
  id: string;
  conversation_id: string | null;
  sender_email: string | null;
  content: string | null;
  created_at: string | null;
}

const firstName = (name: string | null): string => {
  if (!name) return 'there';
  return name.trim().split(/\s+/)[0] || 'there';
};

export const GET = withErrorHandler(async (req: NextRequest) => {
  const authHeader = req.headers.get('authorization') ?? '';
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron/daily-briefing] CRON_SECRET not set');
    return NextResponse.json({ error: 'CRON_SECRET not configured.' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const window = fiveBusinessDayWindow(now);
  const last24hIso = new Date(now.getTime() - 86_400_000).toISOString();
  const todayIso = window.fromIso;
  const tomorrowIso = new Date(new Date(todayIso).getTime() + 86_400_000).toISOString();

  // Active users (the ones with a registered_users row are addressable).
  const { data: users, error: usersErr } = await supabaseAdmin
    .from('registered_users')
    .select('email, name');
  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 });

  // Today's schedule events (one query — partitioned per user below).
  const { data: events } = await supabaseAdmin
    .from('schedule_events')
    .select('title, start_time, all_day, assigned_to')
    .eq('status', 'approved')
    .gte('start_time', todayIso)
    .lt('start_time', tomorrowIso);

  // Tasks due today through the next 5 business days.
  const { data: tasks } = await supabaseAdmin
    .from('assignments')
    .select('title, due_date, assigned_to, status')
    .eq('status', 'pending')
    .gte('due_date', todayIso.slice(0, 10))
    .lt('due_date', window.toIso.slice(0, 10));

  // Last-24h messages, scanned for @-mentions per recipient below.
  const { data: messages } = await supabaseAdmin
    .from('messages')
    .select('id, conversation_id, sender_email, content, created_at')
    .gte('created_at', last24hIso);

  const eventsByUser = bucketBy((events ?? []) as ScheduleEventRow[], (r) => r.assigned_to);
  const tasksByUser = bucketBy((tasks ?? []) as AssignmentRow[], (r) => r.assigned_to);

  let sent = 0;
  let skipped = 0;
  for (const user of (users ?? []) as UserRow[]) {
    const email = user.email?.trim().toLowerCase();
    if (!email) continue;

    const today_events = eventsByUser.get(email) ?? [];
    const upcoming_tasks = tasksByUser.get(email) ?? [];
    const mentions = detectMentions(
      ((messages ?? []) as MessageRow[]).filter((m) => m.sender_email !== email),
      email,
    );
    const recent_notes: BriefingMention[] = mentions.map((m) => ({
      author_email: m.author_email,
      body_preview: m.body_preview,
    }));

    const notice = buildDailyBriefingNotification({
      user_email: email,
      first_name: firstName(user.name),
      today_events,
      upcoming_tasks,
      recent_notes,
    });

    if (!notice) {
      skipped += 1;
      continue;
    }
    try {
      await notify(notice);
      sent += 1;
    } catch {
      // Best-effort — one bad row mustn't sink the batch.
    }
  }

  return NextResponse.json({
    users: users?.length ?? 0,
    sent,
    skipped,
    window: { from: window.fromIso, to: window.toIso },
  });
}, { routeName: 'cron/daily-briefing' });

function bucketBy<T>(rows: T[], key: (r: T) => string | null | undefined): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r)?.trim().toLowerCase();
    if (!k) continue;
    const bucket = out.get(k) ?? [];
    bucket.push(r);
    out.set(k, bucket);
  }
  return out;
}
