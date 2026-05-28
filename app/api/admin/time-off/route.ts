// app/api/admin/time-off/route.ts
//
// Time-off requests built on top of schedule_events with status='pending'.
// Employees POST to create a pending request; admins PATCH to approve/deny.
//
// GET   /api/admin/time-off                        — current user's requests
// GET   /api/admin/time-off?queue=1                — admin: every pending request
// POST  /api/admin/time-off                        — employee: create pending
// PATCH /api/admin/time-off                        — admin: { id, status: 'approved' | 'denied' }
//
// Storage: public.schedule_events (seeds/293 + seeds/296 status column).

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const SELECT_COLS =
  'id, title, event_type, start_time, end_time, all_day, location, notes, assigned_to, assigned_by, color, created_at, status';

const TIME_OFF_COLOR = '#DC2626';
const PTO_HOURS_PER_WORKDAY = 8;

// Mon-Fri count between two UTC instants (inclusive of any calendar day either
// timestamp falls on). All-day requests are stored as `00:00 → 23:59` so the
// raw duration would be ~24h per day and weekend days would be charged too;
// this gives a real eight-hour-per-weekday deduction instead.
function countWeekdaysUtc(startIso: string, endIso: string): number {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const startDay = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
  const endDay = Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate());
  if (endDay < startDay) return 0;
  const DAY_MS = 86_400_000;
  let count = 0;
  for (let t = startDay; t <= endDay; t += DAY_MS) {
    const d = new Date(t).getUTCDay(); // 0=Sun, 6=Sat
    if (d !== 0 && d !== 6) count++;
  }
  return count;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const queue = searchParams.get('queue') === '1';
  const onlyStatus = searchParams.get('status');

  let q = supabaseAdmin.from('schedule_events').select(SELECT_COLS)
    .eq('event_type', 'time_off')
    .order('start_time', { ascending: true });

  if (queue) {
    if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    q = q.eq('status', onlyStatus ?? 'pending');
  } else {
    q = q.eq('assigned_to', session.user.email);
    if (onlyStatus) q = q.eq('status', onlyStatus);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data ?? [] });
}, { routeName: 'admin/time-off' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    start_date?: string; end_date?: string; all_day?: boolean;
    start_time?: string; end_time?: string; notes?: string; title?: string;
  };
  if (!body.start_date || !body.end_date) {
    return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 });
  }
  const allDay = body.all_day !== false;
  const startIso = allDay
    ? new Date(`${body.start_date}T00:00`).toISOString()
    : new Date(`${body.start_date}T${body.start_time ?? '08:00'}`).toISOString();
  const endIso = allDay
    ? new Date(`${body.end_date}T23:59`).toISOString()
    : new Date(`${body.end_date}T${body.end_time ?? '17:00'}`).toISOString();
  if (new Date(endIso).getTime() < new Date(startIso).getTime()) {
    return NextResponse.json({ error: 'end_date must be on or after start_date' }, { status: 400 });
  }

  const title = (body.title?.trim()) || `Time off — ${session.user.name ?? session.user.email}`;

  const { data, error } = await supabaseAdmin
    .from('schedule_events')
    .insert({
      title, event_type: 'time_off',
      start_time: startIso, end_time: endIso, all_day: allDay,
      notes: body.notes || null, assigned_to: session.user.email,
      assigned_by: session.user.email, color: TIME_OFF_COLOR,
      status: 'pending',
    })
    .select(SELECT_COLS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ request: data }, { status: 201 });
}, { routeName: 'admin/time-off' });

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as { id?: string; status?: 'approved' | 'denied'; notes?: string };
  if (!body.id || (body.status !== 'approved' && body.status !== 'denied')) {
    return NextResponse.json({ error: 'id and status (approved|denied) are required' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { status: body.status };
  if (body.notes !== undefined) patch.notes = body.notes;

  const { data, error } = await supabaseAdmin
    .from('schedule_events')
    .update(patch)
    .eq('id', body.id)
    .eq('event_type', 'time_off')
    .select(SELECT_COLS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

  // PTO deduction — approved requests draw down the employee's balance
  // (Slice 30). Only credit a transaction once per event; if the employee's
  // balance row doesn't exist yet we auto-create it.
  if (body.status === 'approved') {
    const startIso = data.start_time as string;
    const endIso = data.end_time as string;
    const allDay = data.all_day === true;
    const hours = allDay
      ? PTO_HOURS_PER_WORKDAY * countWeekdaysUtc(startIso, endIso)
      : Math.max(0, (new Date(endIso).getTime() - new Date(startIso).getTime()) / 3_600_000);
    const hoursDelta = -hours;
    if (hoursDelta < 0) {
      const { data: alreadyLogged } = await supabaseAdmin
        .from('pto_transactions')
        .select('id')
        .eq('schedule_event_id', data.id as string)
        .maybeSingle();
      if (!alreadyLogged) {
        const employee = data.assigned_to as string;
        await supabaseAdmin.from('pto_balances')
          .upsert({ user_email: employee }, { onConflict: 'user_email', ignoreDuplicates: true });
        const { data: bal } = await supabaseAdmin
          .from('pto_balances')
          .select('balance_hours')
          .eq('user_email', employee)
          .maybeSingle();
        const next = Number(bal?.balance_hours ?? 0) + hoursDelta;
        await supabaseAdmin.from('pto_balances')
          .update({ balance_hours: next, updated_at: new Date().toISOString() })
          .eq('user_email', employee);
        await supabaseAdmin.from('pto_transactions').insert({
          user_email: employee,
          delta_hours: hoursDelta,
          kind: 'time_off',
          reason: `Approved time off: ${data.title ?? ''}`,
          schedule_event_id: data.id as string,
          created_by: session.user.email,
        });
      }
    }
  }
  return NextResponse.json({ request: data });
}, { routeName: 'admin/time-off' });
