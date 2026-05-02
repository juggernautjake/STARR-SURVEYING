// app/api/admin/personnel/crew-calendar/route.ts
//
// GET /api/admin/personnel/crew-calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Phase F10.6-e-i — the §5.12.7.6 crew capacity-calendar
// aggregator. Returns a week's worth of (user × day) cells with
// state derivations so the F10.6-e-ii heatmap renders without
// per-cell roundtrips. Default window: Mon → Sun of the
// current week.
//
// Cell state derivation per (user, day):
//   unavailable          any personnel_unavailability row
//                        overlaps the day → grey (PTO/sick/
//                        training/doctor)
//   confirmed            ≥1 confirmed assignment, no others
//                        → solid green
//   split_shift          ≥2 active rows on the day (any mix
//                        of proposed + confirmed) → yellow
//   proposed             ≥1 proposed assignment, no confirmed
//                        → light green; escalates to:
//   unconfirmed_overdue  proposed AND `now() - created_at >
//                        24h` AND no response → red
//   open                 nothing on the day → white
//
// Auth: EQUIPMENT_ROLES (the dispatcher / EM lens; surveyors
// see their own schedule via the existing /admin/schedule
// page).

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const NOTIFICATION_GRACE_MS = 24 * 60 * 60 * 1000; // 24h

type CellState =
  | 'open'
  | 'proposed'
  | 'confirmed'
  | 'split_shift'
  | 'unavailable'
  | 'unconfirmed_overdue';

interface CalendarCell {
  state: CellState;
  assignment_count: number;
  unavailability_count: number;
  /** First assignment id on this day for the drilldown drawer. */
  primary_assignment_id: string | null;
  primary_unavailability_id: string | null;
}

interface CalendarUser {
  user_email: string;
  user_name: string | null;
  cells: Record<string, CalendarCell>;
}

interface AssignmentRow {
  id: string;
  user_email: string | null;
  state: string;
  assigned_from: string;
  assigned_to: string;
  created_at: string;
  confirmed_at: string | null;
}

interface UnavailabilityRow {
  id: string;
  user_email: string;
  unavailable_from: string;
  unavailable_to: string;
  kind: string;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfMondayUtc(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  // toUTCDay: 0 = Sun, 1 = Mon, ... — back up to Monday.
  const dow = out.getUTCDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  out.setUTCDate(out.getUTCDate() + offset);
  return out;
}

function dayList(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const from = new Date(`${fromIso}T00:00:00.000Z`);
  const to = new Date(`${toIso}T00:00:00.000Z`);
  for (
    let d = new Date(from);
    d.getTime() <= to.getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    out.push(isoDay(d));
  }
  return out;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userRoles = (session.user as { roles?: string[] } | undefined)
    ?.roles ?? [];
  if (
    !isAdmin(session.user.roles) &&
    !userRoles.includes('tech_support') &&
    !userRoles.includes('equipment_manager')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const fromRaw = searchParams.get('from');
  const toRaw = searchParams.get('to');

  // Default — current week's Mon → Sun.
  const today = new Date();
  const monday = startOfMondayUtc(today);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  let fromIso = isoDay(monday);
  let toIso = isoDay(sunday);

  if (fromRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromRaw)) {
      return NextResponse.json(
        { error: '`from` must be YYYY-MM-DD when present.' },
        { status: 400 }
      );
    }
    fromIso = fromRaw;
  }
  if (toRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(toRaw)) {
      return NextResponse.json(
        { error: '`to` must be YYYY-MM-DD when present.' },
        { status: 400 }
      );
    }
    toIso = toRaw;
  }
  if (toIso < fromIso) {
    return NextResponse.json(
      { error: '`to` must be on/after `from`.' },
      { status: 400 }
    );
  }
  const dayStart = `${fromIso}T00:00:00.000Z`;
  const dayEnd = `${toIso}T23:59:59.999Z`;
  const days = dayList(fromIso, toIso);
  const nowMs = Date.now();

  // ── Internal users — exclude guest/student ──────────────────
  const { data: usersData, error: usersErr } = await supabaseAdmin
    .from('registered_users')
    .select('email, name, roles')
    .order('name', { ascending: true });
  if (usersErr) {
    return NextResponse.json(
      { error: usersErr.message },
      { status: 500 }
    );
  }
  type RuRow = { email: string | null; name: string | null; roles: string[] | null };
  const allUsers = (usersData ?? []) as RuRow[];
  const internalUsers = allUsers.filter((r) => {
    if (!r.email) return false;
    const roles = r.roles ?? [];
    if (roles.length === 0) return false;
    if (roles.every((role) => role === 'guest' || role === 'student')) {
      return false;
    }
    return true;
  });
  if (internalUsers.length === 0) {
    return NextResponse.json({
      window: { from: fromIso, to: toIso },
      days,
      users: [],
      summary: { user_count: 0, day_count: days.length, by_state: {} },
    });
  }
  const internalEmails = internalUsers.map((u) => u.email as string);

  // ── Active assignments overlapping the window ───────────────
  const { data: asgData, error: asgErr } = await supabaseAdmin
    .from('job_team')
    .select(
      'id, user_email, state, assigned_from, assigned_to, created_at, confirmed_at'
    )
    .in('state', ['proposed', 'confirmed'])
    .in('user_email', internalEmails)
    .not('assigned_from', 'is', null)
    .not('assigned_to', 'is', null)
    .lt('assigned_from', dayEnd)
    .gt('assigned_to', dayStart);
  if (asgErr) {
    console.warn(
      '[admin/personnel/crew-calendar] assignments read failed',
      { error: asgErr.message }
    );
  }
  const assignments = (asgData ?? []) as AssignmentRow[];

  const { data: unavData, error: unavErr } = await supabaseAdmin
    .from('personnel_unavailability')
    .select('id, user_email, unavailable_from, unavailable_to, kind')
    .in('user_email', internalEmails)
    .lt('unavailable_from', dayEnd)
    .gt('unavailable_to', dayStart);
  if (unavErr) {
    console.warn(
      '[admin/personnel/crew-calendar] unavailability read failed',
      { error: unavErr.message }
    );
  }
  const unavailabilities = (unavData ?? []) as UnavailabilityRow[];

  // ── Per-(user × day) cell derivation ────────────────────────
  const userMap = new Map<string, CalendarUser>();
  for (const u of internalUsers) {
    const email = u.email as string;
    const cells: Record<string, CalendarCell> = {};
    for (const day of days) {
      cells[day] = {
        state: 'open',
        assignment_count: 0,
        unavailability_count: 0,
        primary_assignment_id: null,
        primary_unavailability_id: null,
      };
    }
    userMap.set(email, { user_email: email, user_name: u.name, cells });
  }

  function dayMs(dayIso: string, tail: 'start' | 'end'): number {
    return Date.parse(
      tail === 'start'
        ? `${dayIso}T00:00:00.000Z`
        : `${dayIso}T23:59:59.999Z`
    );
  }

  for (const a of assignments) {
    if (!a.user_email) continue;
    const user = userMap.get(a.user_email);
    if (!user) continue;
    const fromMs = Date.parse(a.assigned_from);
    const toMs = Date.parse(a.assigned_to);
    for (const day of days) {
      const startMs = dayMs(day, 'start');
      const endMs = dayMs(day, 'end');
      if (fromMs >= endMs || toMs <= startMs) continue;
      const cell = user.cells[day];
      cell.assignment_count++;
      if (!cell.primary_assignment_id) cell.primary_assignment_id = a.id;
      // State derivation: confirmed > proposed > overdue.
      const isOverdue =
        a.state === 'proposed' &&
        nowMs - Date.parse(a.created_at) > NOTIFICATION_GRACE_MS;
      if (a.state === 'confirmed') {
        cell.state =
          cell.state === 'open' || cell.state === 'proposed' || cell.state === 'unconfirmed_overdue'
            ? 'confirmed'
            : cell.state === 'confirmed' && cell.assignment_count > 1
            ? 'split_shift'
            : 'split_shift';
      } else if (a.state === 'proposed') {
        if (cell.state === 'open') {
          cell.state = isOverdue ? 'unconfirmed_overdue' : 'proposed';
        } else if (cell.state === 'proposed' || cell.state === 'unconfirmed_overdue') {
          cell.state = 'split_shift';
        } else if (cell.state === 'confirmed') {
          cell.state = 'split_shift';
        }
      }
    }
  }

  for (const u of unavailabilities) {
    const user = userMap.get(u.user_email);
    if (!user) continue;
    const fromMs = Date.parse(u.unavailable_from);
    const toMs = Date.parse(u.unavailable_to);
    for (const day of days) {
      const startMs = dayMs(day, 'start');
      const endMs = dayMs(day, 'end');
      if (fromMs >= endMs || toMs <= startMs) continue;
      const cell = user.cells[day];
      cell.unavailability_count++;
      if (!cell.primary_unavailability_id) {
        cell.primary_unavailability_id = u.id;
      }
      // unavailable beats every other state — PTO/sick is a
      // hard floor regardless of any racing assignment.
      cell.state = 'unavailable';
    }
  }

  // Roll-up summary.
  const byState: Record<CellState, number> = {
    open: 0,
    proposed: 0,
    confirmed: 0,
    split_shift: 0,
    unavailable: 0,
    unconfirmed_overdue: 0,
  };
  const users = Array.from(userMap.values());
  for (const u of users) {
    for (const day of days) {
      byState[u.cells[day].state]++;
    }
  }

  return NextResponse.json({
    window: { from: fromIso, to: toIso },
    days,
    users,
    summary: {
      user_count: users.length,
      day_count: days.length,
      by_state: byState,
    },
  });
}, { routeName: 'admin/personnel/crew-calendar#get' });
