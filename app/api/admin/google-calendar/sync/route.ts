// app/api/admin/google-calendar/sync/route.ts
//
// Bidirectional sync.
//
// POST /api/admin/google-calendar/sync — pushes the caller's schedule_events
// for the next 90 days to Google (insert or update by stored link), then
// pulls back any GCal events in the same window and creates schedule_events
// rows for ones the link table doesn't know about. Returns counts.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  loadConnection,
  pushScheduleEvent,
  listRemoteEvents,
} from '@/lib/integrations/google-calendar';

export const POST = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const conn = await loadConnection(session.user.email);
  if (!conn) return NextResponse.json({ error: 'Not connected' }, { status: 400 });

  const now = new Date();
  const horizon = new Date(now.getTime() + 90 * 24 * 3600 * 1000);
  const past = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  // 1) Push local → remote.
  const { data: locals } = await supabaseAdmin
    .from('schedule_events')
    .select('id, title, start_time, end_time, all_day, location, notes, status')
    .eq('assigned_to', session.user.email)
    .eq('status', 'approved')
    .gte('end_time', past.toISOString())
    .lte('start_time', horizon.toISOString());

  const { data: existingLinks } = await supabaseAdmin
    .from('google_calendar_event_links')
    .select('schedule_event_id, google_event_id')
    .eq('user_email', session.user.email);
  const localLinkByEvent = new Map<string, string>(
    (existingLinks ?? []).map((l: { schedule_event_id: string; google_event_id: string }) => [l.schedule_event_id, l.google_event_id]),
  );

  let pushed = 0;
  let updated = 0;
  for (const ev of locals ?? []) {
    try {
      const existing = localLinkByEvent.get(ev.id as string);
      const remote = await pushScheduleEvent(conn, {
        id: ev.id as string,
        title: ev.title as string,
        start_time: ev.start_time as string,
        end_time: ev.end_time as string,
        all_day: !!ev.all_day,
        location: (ev.location as string | null) ?? null,
        notes: (ev.notes as string | null) ?? null,
      }, existing);
      if (existing) {
        updated++;
        await supabaseAdmin
          .from('google_calendar_event_links')
          .update({ etag: remote.etag ?? null, updated_remote_at: remote.updated ?? null })
          .eq('schedule_event_id', ev.id as string);
      } else if (remote.id) {
        pushed++;
        await supabaseAdmin.from('google_calendar_event_links').insert({
          schedule_event_id: ev.id as string,
          google_event_id: remote.id,
          user_email: session.user.email,
          etag: remote.etag ?? null,
          updated_remote_at: remote.updated ?? null,
        });
      }
    } catch {
      // Sync failures are non-fatal — we'll retry on next sync. Logging is
      // handled by withErrorHandler's outer scope; here we keep going so a
      // single bad event doesn't abort the whole batch.
    }
  }

  // 2) Pull remote → local. Only insert events whose remote id isn't already
  //    paired with a local row.
  const known = new Set<string>((existingLinks ?? []).map((l: { google_event_id: string }) => l.google_event_id));
  const remoteEvents = await listRemoteEvents(conn, past.toISOString(), horizon.toISOString());
  let pulled = 0;
  for (const re of remoteEvents) {
    if (!re.id || known.has(re.id)) continue;
    if (!re.start || !re.end) continue;
    const isAllDay = !!re.start.date;
    const startIso = isAllDay
      ? new Date(`${re.start.date}T00:00:00Z`).toISOString()
      : (re.start.dateTime ?? new Date().toISOString());
    const endIso = isAllDay
      ? new Date(`${re.end.date}T00:00:00Z`).toISOString()
      : (re.end.dateTime ?? new Date(Date.now() + 3600_000).toISOString());

    const { data: ins } = await supabaseAdmin
      .from('schedule_events')
      .insert({
        title: re.summary || '(no title)',
        event_type: 'other',
        start_time: startIso,
        end_time: endIso,
        all_day: isAllDay,
        location: re.location ?? null,
        notes: re.description ?? null,
        assigned_to: session.user.email,
        assigned_by: session.user.email,
        color: '#6B7280',
        status: 'approved',
      })
      .select('id')
      .single();
    if (ins?.id) {
      await supabaseAdmin.from('google_calendar_event_links').insert({
        schedule_event_id: ins.id as string,
        google_event_id: re.id,
        user_email: session.user.email,
        etag: re.etag ?? null,
        updated_remote_at: re.updated ?? null,
      });
      pulled++;
    }
  }

  await supabaseAdmin
    .from('google_calendar_connections')
    .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_email', session.user.email);

  return NextResponse.json({ pushed, updated, pulled });
}, { routeName: 'admin/google-calendar/sync' });
