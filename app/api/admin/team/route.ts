// app/api/admin/team/route.ts — Field team status for the dispatcher.
//
// Powers /admin/team — the Starr Field "who's clocked in right now,
// for how long, and when did the last admin ping arrive?" view.
// Per the user's request: "The admin/dispatcher needs to be able to
// notify the user that they need to log their hours."
//
// One row per active employee (registered_users.is_approved = true,
// is_banned = false). Active job_time_entries (ended_at IS NULL) join
// in the open clock-in slice — when present, the row shows clock-in
// duration; when absent, the dispatcher sees the user is NOT clocked
// in (a likely candidate for the log_hours nudge).
//
// Most recent dispatcher ping (notifications row with
// source_type='log_hours') joins so the UI can show "last reminded:
// 35m ago — delivered ✓ — read ✗" for diagnostic clarity.
//
// Auth: admin / developer / tech_support roles. Dispatcher-without-
// admin role can be added later.
import { NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface ActiveEntry {
  id: string;
  user_email: string;
  job_id: string | null;
  started_at: string | null;
  duration_minutes: number | null;
  entry_type: string | null;
  clock_in_lat: number | null;
  clock_in_lon: number | null;
}

interface RegisteredUserLite {
  email: string;
  name: string | null;
  roles: string[];
  last_sign_in: string | null;
}

interface NotificationLite {
  id: string;
  user_email: string | null;
  source_type: string | null;
  title: string;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
}

interface LastPingLite {
  id: string;
  user_email: string;
  lat: number;
  lon: number;
  accuracy_m: number | null;
  battery_pct: number | null;
  is_charging: boolean | null;
  source: string;
  captured_at: string;
}

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.roles)) {
    // Tech support: read-only view of the team list. Same precedent
    // as /api/admin/users/route.ts above. Ping (POST notifications)
    // is admin-only by virtue of /api/admin/notifications gating.
    const userRoles = (session?.user as { roles?: string[] } | undefined)
      ?.roles ?? [];
    if (!userRoles.includes('tech_support')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // 1) Pull the field-eligible workforce. We deliberately include
  //    everyone with employee/field_crew/admin roles so a dispatcher
  //    can ping anyone (admin teams sometimes work in the field too).
  const { data: usersRaw, error: usersErr } = await supabaseAdmin
    .from('registered_users')
    .select('email, name, roles, last_sign_in')
    .eq('is_approved', true)
    .eq('is_banned', false)
    .order('name', { ascending: true });
  if (usersErr) {
    return NextResponse.json({ error: usersErr.message }, { status: 500 });
  }
  const users = (usersRaw ?? []) as RegisteredUserLite[];

  // 2) Open clock-in slices — one per user when they're on the clock.
  //    started_at present + ended_at null = "currently clocked in."
  const { data: activeRaw, error: activeErr } = await supabaseAdmin
    .from('job_time_entries')
    .select(
      'id, user_email, job_id, started_at, duration_minutes, entry_type, clock_in_lat, clock_in_lon'
    )
    .is('ended_at', null);
  if (activeErr) {
    return NextResponse.json({ error: activeErr.message }, { status: 500 });
  }
  const active = (activeRaw ?? []) as ActiveEntry[];

  // 3) Last dispatcher ping per user — drives the "last reminded"
  //    column. Only log_hours kind for now; the UI can add other
  //    kinds later.
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: pingsRaw, error: pingsErr } = await supabaseAdmin
    .from('notifications')
    .select(
      'id, user_email, source_type, title, delivered_at, read_at, created_at'
    )
    .eq('source_type', 'log_hours')
    .gte('created_at', since24h)
    .order('created_at', { ascending: false });
  if (pingsErr) {
    return NextResponse.json({ error: pingsErr.message }, { status: 500 });
  }
  const pings = (pingsRaw ?? []) as NotificationLite[];

  // 4) Most recent location ping per user — drives the "last seen"
  //    column on the dispatcher Team page. Privacy contract: pings
  //    only exist for clocked-in periods (mobile starts/stops the
  //    background task on clock boundaries). 12-hour window keeps
  //    the result set bounded; older rows live for F6 reporting.
  const since12h = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const { data: locationPingsRaw, error: locPingsErr } = await supabaseAdmin
    .from('location_pings')
    .select(
      'id, user_email, lat, lon, accuracy_m, battery_pct, is_charging, source, captured_at'
    )
    .gte('captured_at', since12h)
    .order('captured_at', { ascending: false });
  if (locPingsErr) {
    return NextResponse.json(
      { error: locPingsErr.message },
      { status: 500 }
    );
  }
  const locationPings = (locationPingsRaw ?? []) as LastPingLite[];

  // 5) Index helpers for O(1) per-user join.
  const activeByEmail = new Map<string, ActiveEntry>();
  for (const a of active) {
    if (a.user_email && !activeByEmail.has(a.user_email)) {
      activeByEmail.set(a.user_email, a);
    }
  }
  const lastPingByEmail = new Map<string, NotificationLite>();
  for (const p of pings) {
    if (p.user_email && !lastPingByEmail.has(p.user_email)) {
      lastPingByEmail.set(p.user_email, p);
    }
  }
  // Most-recent location ping per user. The query is already sorted
  // captured_at DESC so the first hit per email wins.
  const lastLocationByEmail = new Map<string, LastPingLite>();
  for (const lp of locationPings) {
    if (lp.user_email && !lastLocationByEmail.has(lp.user_email)) {
      lastLocationByEmail.set(lp.user_email, lp);
    }
  }

  // 6) Compose. clockedInMinutes is computed live; the row's
  //    duration_minutes is null while ended_at is null, so we derive
  //    from started_at.
  const now = Date.now();
  const team = users.map((u) => {
    const open = activeByEmail.get(u.email) ?? null;
    const lastPing = lastPingByEmail.get(u.email) ?? null;
    const lastLoc = lastLocationByEmail.get(u.email) ?? null;
    const clockedInMinutes =
      open?.started_at != null
        ? Math.floor((now - Date.parse(open.started_at)) / 60_000)
        : null;
    return {
      email: u.email,
      name: u.name,
      roles: u.roles,
      last_sign_in: u.last_sign_in,
      // null when not currently clocked in.
      active_entry: open
        ? {
            id: open.id,
            job_id: open.job_id,
            entry_type: open.entry_type,
            started_at: open.started_at,
            clocked_in_minutes: clockedInMinutes,
            clock_in_lat: open.clock_in_lat,
            clock_in_lon: open.clock_in_lon,
          }
        : null,
      // null when no log_hours ping in the last 24 h.
      last_log_hours_ping: lastPing
        ? {
            id: lastPing.id,
            title: lastPing.title,
            created_at: lastPing.created_at,
            delivered_at: lastPing.delivered_at,
            read_at: lastPing.read_at,
          }
        : null,
      // null when no location_pings in the last 12 h. Useful for the
      // dispatcher to spot "phone died at 2pm — last seen on the
      // Smith Job at 30%" or "still moving — currently I-35 north".
      last_location: lastLoc
        ? {
            lat: lastLoc.lat,
            lon: lastLoc.lon,
            accuracy_m: lastLoc.accuracy_m,
            battery_pct: lastLoc.battery_pct,
            is_charging: lastLoc.is_charging,
            source: lastLoc.source,
            captured_at: lastLoc.captured_at,
            staleness_minutes: Math.floor(
              (now - new Date(lastLoc.captured_at).getTime()) / 60_000
            ),
          }
        : null,
    };
  });

  return NextResponse.json({ team, server_now: new Date().toISOString() });
}, { routeName: 'admin/team' });
