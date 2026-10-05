// app/api/admin/time-logs/history/route.ts — the life of every hours entry, and getting one back.
//
//   GET  ?email=&from=&to=&action=&log_id=&limit=  → events, newest first
//   POST { event_id }                              → restore a deleted entry exactly as it was
//
// Owner, 2026-10-05: "We need to know who posts their hours, and then who reviews them and makes
// the decisions for them" … "We also need to be able to retrieve the hours if deleted too."
//
// The events are written by a database trigger (seeds/664), so nothing that changes an hours entry
// can skip this log. Pay decisions keep their own history table (seeds/574) and are merged in here,
// so "who decided what this day was worth" is answered on the same screen as "who approved it".
//
// An employee may read the history of their OWN hours — who approved them, who changed them, and
// why is theirs to know. Everything else, and every restore, is admin only.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { auditStamp } from '@/lib/hours/audit';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Columns that describe the last write rather than the entry. Never copied back on a restore. */
const STAMP_COLUMNS = ['last_actor', 'last_action', 'last_stamp_at'];

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = isAdmin(session.user.roles);
  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email')?.trim().toLowerCase() || null;
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const action = searchParams.get('action');
  const logId = searchParams.get('log_id');
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 200, 1), 1000);

  if ((from && !ISO_DATE.test(from)) || (to && !ISO_DATE.test(to))) {
    return NextResponse.json({ error: 'from / to must be YYYY-MM-DD' }, { status: 400 });
  }
  const self = session.user.email.toLowerCase();
  if (!admin && email && email !== self) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const who = admin ? email : self;

  // `from` / `to` are about the DAY WORKED, which is what anybody asking "what happened to Tuesday"
  // means — not when the event was recorded.
  let q = supabaseAdmin
    .from('time_log_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (who) q = q.eq('employee_email', who);
  if (from) q = q.gte('log_date', from);
  if (to) q = q.lte('log_date', to);
  if (action) q = q.in('action', action.split(',').map((a) => a.trim()).filter(Boolean));
  if (logId) q = q.eq('time_log_id', logId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Pay decisions, from their own history. Best-effort: a failure here still returns the events.
  let payEvents: Record<string, unknown>[] = [];
  if (!action || action.split(',').includes('pay_decided')) {
    try {
      let pq = supabaseAdmin
        .from('time_log_pay_decision_history')
        .select('id, time_log_id, user_email, total_hours, total_pay, undecided_hours, payout_note, decided_by, decided_at, superseded_at')
        .order('decided_at', { ascending: false })
        .limit(limit);
      if (who) pq = pq.eq('user_email', who);
      if (logId) pq = pq.eq('time_log_id', logId);
      const { data: rows } = await pq;
      type PayRow = {
        id: string; time_log_id: string; user_email: string; total_hours: number | null; total_pay: number | null;
        undecided_hours: number | null; payout_note: string | null; decided_by: string | null; decided_at: string;
        superseded_at: string | null;
      };
      payEvents = ((rows ?? []) as PayRow[]).map((r) => ({
        id: `pay:${r.id}`,
        time_log_id: r.time_log_id,
        employee_email: r.user_email,
        actor_email: r.decided_by,
        action: 'pay_decided',
        log_date: null,
        hours_before: null,
        hours_after: r.total_hours,
        status_before: null,
        status_after: null,
        note: r.payout_note,
        total_pay: r.total_pay,
        undecided_hours: r.undecided_hours,
        superseded_at: r.superseded_at,
        created_at: r.decided_at,
      }));
    } catch { /* events alone are still the answer */ }
  }

  const events = [...(data ?? []), ...payEvents]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, limit);

  // Names for the people involved, so the screen can say "Hank approved" rather than an address.
  const emails = [...new Set(events.flatMap((e) => [e.employee_email, e.actor_email]).filter(Boolean) as string[])];
  const names: Record<string, string> = {};
  if (emails.length) {
    const { data: people } = await supabaseAdmin.from('registered_users').select('email, name').in('email', emails);
    for (const p of people ?? []) if (p.name) names[String(p.email).toLowerCase()] = p.name;
  }

  return NextResponse.json({ events, names });
}, { routeName: 'time-logs/history' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Only an admin can restore hours.' }, { status: 403 });

  const { event_id: eventId } = (await req.json().catch(() => ({}))) as { event_id?: string };
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 });

  const { data: event, error: evError } = await supabaseAdmin
    .from('time_log_events')
    .select('*')
    .eq('id', eventId)
    .maybeSingle();
  if (evError) return NextResponse.json({ error: evError.message }, { status: 500 });
  if (!event) return NextResponse.json({ error: 'No such event.' }, { status: 404 });
  if (!['deleted', 'replaced'].includes(event.action) || !event.before_row) {
    return NextResponse.json({ error: 'Only a deleted entry can be restored.' }, { status: 400 });
  }
  if (event.restored_at) {
    return NextResponse.json({ error: `Already restored by ${event.restored_by} on ${event.restored_at}.` }, { status: 409 });
  }

  const row = { ...(event.before_row as Record<string, unknown>) };
  for (const c of STAMP_COLUMNS) delete row[c];
  // The device key belongs to the original arrival; a restored copy must not collide with a retry.
  delete row.client_submission_id;

  const { data: exists } = await supabaseAdmin.from('daily_time_logs').select('id').eq('id', row.id as string).maybeSingle();
  if (exists) return NextResponse.json({ error: 'That entry already exists — nothing to restore.' }, { status: 409 });

  // Same id, same status, same notes, same pay — exactly as it was. Links that pointed at it
  // (notifications, pay decisions) work again.
  const { data: restored, error } = await supabaseAdmin
    .from('daily_time_logs')
    .insert({ ...row, ...auditStamp(session.user.email, 'restored') })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin
    .from('time_log_events')
    .update({ restored_at: new Date().toISOString(), restored_by: session.user.email.toLowerCase() })
    .eq('id', eventId);

  return NextResponse.json({ log: restored });
}, { routeName: 'time-logs/history' });
