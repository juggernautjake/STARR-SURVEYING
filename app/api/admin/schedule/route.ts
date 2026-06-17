// app/api/admin/schedule/route.ts
// Calendar events for /admin/schedule.
//
// GET    /api/admin/schedule?from=ISO&to=ISO   — events overlapping [from,to]
//          Non-admins see only their own events; admins see everyone's.
// POST   /api/admin/schedule                   — create (admin) { title, start_time, end_time, ... }
// PATCH  /api/admin/schedule                   — update { id, ... }
// DELETE /api/admin/schedule?id=<id>           — delete an event
//
// Storage: seeds/293_schedule_events.sql.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { expandRecurrence } from '@/lib/schedule/recurrence';

// Slice S2 — visibility + viewer_emails join the column list so every
// GET / POST / PATCH echoes the new fields.
const SELECT_COLS =
  'id, title, event_type, start_time, end_time, all_day, location, notes, job_id, assigned_to, assigned_by, color, created_at, recurrence_rule, recurrence_end, series_id, status, visibility, viewer_emails, reminder_minutes_before';

const EVENT_COLORS: Record<string, string> = {
  field_work: '#059669', office: '#1D3095', meeting: '#7C3AED', training: '#D97706',
  time_off: '#DC2626', deadline: '#991B1B', equipment: '#0891B2', other: '#6B7280',
};

// ─── GET ──────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const includeStatus = searchParams.get('status'); // optional 'pending' / 'approved' / 'denied' / 'all'

  let query = supabaseAdmin
    .from('schedule_events')
    .select(SELECT_COLS)
    .order('start_time', { ascending: true });

  // Non-admins see events they're assigned to OR events that are
  // visible to them — either flagged `all_users`, or
  // `specific_users` with their email in `viewer_emails`. Admins
  // continue to see everything.
  //
  // Slice S2 — implements the user's spec: "We can either include
  // specific users, or all users, or keep it private."
  if (!isAdmin(session.user.roles)) {
    const email = session.user.email;
    query = query.or(
      [
        `assigned_to.eq.${email}`,
        `visibility.eq.all_users`,
        `and(visibility.eq.specific_users,viewer_emails.cs.{${email}})`,
      ].join(','),
    );
  }
  // Status filter — default hides pending/denied so they don't clutter the
  // calendar; the time-off approval page asks for status='pending' explicitly.
  if (includeStatus && includeStatus !== 'all') {
    query = query.eq('status', includeStatus);
  } else if (!includeStatus) {
    query = query.eq('status', 'approved');
  }
  // Overlap filter for non-recurring rows. Recurring rows ignore the
  // start_time filter so their occurrences can fall inside the window even
  // when the source row starts before it.
  if (to) query = query.lte('start_time', to);
  if (from) query = query.gte('end_time', from);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Expand recurring rows into virtual occurrences. The window for expansion
  // is the requested [from,to]; if either is missing we cap at +/- 1 year so
  // we don't blow the response size open on a missing query param.
  const winFrom = from ? new Date(from) : new Date(Date.now() - 365 * 24 * 3600 * 1000);
  const winTo = to ? new Date(to) : new Date(Date.now() + 365 * 24 * 3600 * 1000);
  const expanded: typeof data = [];
  for (const row of data ?? []) {
    if (!row.recurrence_rule) { expanded.push(row); continue; }
    const occs = expandRecurrence(
      {
        start_time: row.start_time,
        end_time: row.end_time,
        recurrence_rule: row.recurrence_rule,
        recurrence_end: row.recurrence_end ?? null,
      },
      winFrom,
      winTo,
    );
    for (const occ of occs) {
      expanded.push({
        ...row,
        // Virtual id encodes the source id + occurrence index so the client
        // can still PATCH/DELETE the series (id before the colon).
        id: `${row.id}:${occ.occurrence_index}`,
        start_time: occ.start_time,
        end_time: occ.end_time,
      });
    }
  }
  return NextResponse.json({ events: expanded });
}, { routeName: 'admin/schedule' });

// ─── POST — create (admin) ────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as {
    title?: string; event_type?: string; start_time?: string; end_time?: string;
    all_day?: boolean; location?: string; notes?: string; job_id?: string | null; assigned_to?: string;
    recurrence_rule?: string | null; recurrence_end?: string | null; status?: 'approved' | 'pending' | 'denied';
    // Slice S2 — visibility model.
    visibility?: 'private' | 'specific_users' | 'all_users';
    viewer_emails?: string[];
    // Slice S3 — per-event reminder lead times (minutes).
    reminder_minutes_before?: number[];
  };
  const title = (body.title ?? '').trim();
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  if (!body.start_time || !body.end_time) {
    return NextResponse.json({ error: 'start_time and end_time are required' }, { status: 400 });
  }
  const eventType = body.event_type || 'other';
  const assignedTo = body.assigned_to || session.user.email;

  // Conflict detection — admin can still force-create by passing
  // ?force=1 (the client surfaces the conflict first so the user
  // makes an informed call). Overlap rule: existing.start < new.end
  // AND existing.end > new.start for the same assignee.
  const force = new URL(req.url).searchParams.get('force') === '1';
  if (!force) {
    const conflicts = await findConflicts(assignedTo, body.start_time, body.end_time);
    if (conflicts.length > 0) {
      return NextResponse.json({ error: 'schedule_conflict', conflicts }, { status: 409 });
    }
  }

  // Slice S2 — accept visibility + viewer_emails. Defaults to
  // 'private' so a legacy client that doesn't send the field
  // still lands on the safest setting; viewer_emails is force-
  // emptied unless the row is `specific_users` so we can't
  // silently expose an event via a stale array on the body.
  const visibility = (body.visibility ?? 'private') as 'private' | 'specific_users' | 'all_users';
  if (!['private', 'specific_users', 'all_users'].includes(visibility)) {
    return NextResponse.json({ error: 'Invalid visibility' }, { status: 400 });
  }
  const viewerEmails = visibility === 'specific_users'
    ? Array.from(new Set((body.viewer_emails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean)))
    : [];

  // Slice S3 — sanitize reminder leads on the server too so a
  // legacy client or a hand-rolled curl can't smuggle in negative
  // numbers or duplicates. Defaults to `[60]` when the field is
  // omitted (matches the DB column default + the form default).
  const reminderMinutesBefore = Array.isArray(body.reminder_minutes_before)
    ? Array.from(new Set(
        body.reminder_minutes_before
          .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0)
          .map((n) => Math.round(n)),
      )).sort((a, b) => a - b)
    : [60];

  const { data, error } = await supabaseAdmin
    .from('schedule_events')
    .insert({
      title,
      event_type: eventType,
      start_time: body.start_time,
      end_time: body.end_time,
      all_day: body.all_day === true,
      location: body.location || null,
      notes: body.notes || null,
      job_id: body.job_id || null,
      assigned_to: assignedTo,
      assigned_by: session.user.email,
      color: EVENT_COLORS[eventType] ?? EVENT_COLORS.other,
      recurrence_rule: body.recurrence_rule || null,
      recurrence_end: body.recurrence_end || null,
      status: body.status ?? 'approved',
      visibility,
      viewer_emails: viewerEmails,
      reminder_minutes_before: reminderMinutesBefore,
    })
    .select(SELECT_COLS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data }, { status: 201 });
}, { routeName: 'admin/schedule' });

// Helper — returns events overlapping the window for the assignee. Excludes
// the optional `excludeId` so PATCHing an event doesn't conflict with itself.
async function findConflicts(
  assignedTo: string,
  startTime: string,
  endTime: string,
  excludeId?: string,
): Promise<Array<{ id: string; title: string; start_time: string; end_time: string }>> {
  let q = supabaseAdmin
    .from('schedule_events')
    .select('id, title, start_time, end_time')
    .eq('assigned_to', assignedTo)
    .lt('start_time', endTime)
    .gt('end_time', startTime);
  if (excludeId) q = q.neq('id', excludeId);
  const { data } = await q;
  return data ?? [];
}

// ─── PATCH — update (admin) ────────────────────────────────────────────────────

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as Record<string, unknown>;
  if (typeof body.id !== 'string') return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 });
  // Strip virtual occurrence suffix (e.g. <uuid>:3 → <uuid>) so series-level
  // edits land on the source row. Per-occurrence overrides are out of scope.
  body.id = (body.id as string).split(':')[0];

  const patch: Record<string, unknown> = {};
  for (const f of ['title', 'event_type', 'start_time', 'end_time', 'all_day', 'location', 'notes', 'job_id', 'assigned_to', 'recurrence_rule', 'recurrence_end', 'status', 'visibility', 'viewer_emails', 'reminder_minutes_before']) {
    if (body[f] !== undefined) patch[f] = body[f] === '' ? null : body[f];
  }
  // Slice S3 — same lead sanitization as POST on a PATCH so the
  // PATCH path can't bypass it.
  if (Array.isArray(patch.reminder_minutes_before)) {
    patch.reminder_minutes_before = Array.from(new Set(
      (patch.reminder_minutes_before as unknown[])
        .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0)
        .map((n) => Math.round(n)),
    )).sort((a, b) => a - b);
  }
  // Slice S2 — patches keep visibility ↔ viewer_emails coherent:
  // toggling AWAY from specific_users empties viewer_emails so the
  // row can't leak; toggling INTO specific_users with no
  // viewer_emails leaves the array empty (the API caller is
  // expected to also patch viewer_emails in the same request).
  if (patch.visibility !== undefined && patch.visibility !== 'specific_users') {
    patch.viewer_emails = [];
  }
  if (Array.isArray(patch.viewer_emails)) {
    patch.viewer_emails = Array.from(
      new Set((patch.viewer_emails as string[]).map((e) => e.trim().toLowerCase()).filter(Boolean)),
    );
  }
  if (typeof patch.event_type === 'string') patch.color = EVENT_COLORS[patch.event_type] ?? EVENT_COLORS.other;
  if ('title' in patch && !String(patch.title).trim()) {
    return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  // Conflict check on time / assignee changes. ?force=1 to bypass.
  const force = new URL(req.url).searchParams.get('force') === '1';
  const willChangeWindow = 'start_time' in patch || 'end_time' in patch || 'assigned_to' in patch;
  if (!force && willChangeWindow) {
    // Need the current row to know the unchanged fields.
    const { data: existing } = await supabaseAdmin
      .from('schedule_events')
      .select('start_time, end_time, assigned_to')
      .eq('id', body.id)
      .maybeSingle();
    if (existing) {
      const startTime = (patch.start_time as string) ?? existing.start_time;
      const endTime = (patch.end_time as string) ?? existing.end_time;
      const assignedTo = (patch.assigned_to as string) ?? existing.assigned_to;
      const conflicts = await findConflicts(assignedTo, startTime, endTime, body.id as string);
      if (conflicts.length > 0) {
        return NextResponse.json({ error: 'schedule_conflict', conflicts }, { status: 409 });
      }
    }
  }

  const { data, error } = await supabaseAdmin
    .from('schedule_events')
    .update(patch)
    .eq('id', body.id)
    .select(SELECT_COLS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  return NextResponse.json({ event: data });
}, { routeName: 'admin/schedule' });

// ─── DELETE (admin) ─────────────────────────────────────────────────────────────

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const idRaw = searchParams.get('id');
  if (!idRaw) return NextResponse.json({ error: 'Missing required query param: id' }, { status: 400 });
  // Same virtual-occurrence stripping as PATCH — deleting any occurrence
  // removes the whole series.
  const id = idRaw.split(':')[0];

  const { error } = await supabaseAdmin.from('schedule_events').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}, { routeName: 'admin/schedule' });
