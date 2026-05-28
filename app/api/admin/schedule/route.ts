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

const SELECT_COLS =
  'id, title, event_type, start_time, end_time, all_day, location, notes, job_id, assigned_to, assigned_by, color, created_at';

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

  let query = supabaseAdmin
    .from('schedule_events')
    .select(SELECT_COLS)
    .order('start_time', { ascending: true });

  // Non-admins only see events assigned to them.
  if (!isAdmin(session.user.roles)) query = query.eq('assigned_to', session.user.email);
  // Overlap filter: event starts before `to` AND ends after `from`.
  if (to) query = query.lte('start_time', to);
  if (from) query = query.gte('end_time', from);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}, { routeName: 'admin/schedule' });

// ─── POST — create (admin) ────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as {
    title?: string; event_type?: string; start_time?: string; end_time?: string;
    all_day?: boolean; location?: string; notes?: string; job_id?: string | null; assigned_to?: string;
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

  const patch: Record<string, unknown> = {};
  for (const f of ['title', 'event_type', 'start_time', 'end_time', 'all_day', 'location', 'notes', 'job_id', 'assigned_to']) {
    if (body[f] !== undefined) patch[f] = body[f] === '' ? null : body[f];
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
      const conflicts = await findConflicts(assignedTo, startTime, endTime, body.id);
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
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing required query param: id' }, { status: 400 });

  const { error } = await supabaseAdmin.from('schedule_events').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}, { routeName: 'admin/schedule' });
