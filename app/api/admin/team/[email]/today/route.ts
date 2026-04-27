// app/api/admin/team/[email]/today/route.ts
//
// GET /api/admin/team/{email}/today?date=YYYY-MM-DD
//
// One round trip that aggregates everything the dispatcher needs to
// answer "what's Lance up to today?" — clock state, miles, today's
// stops, recent captures, recent receipts, recent admin pings sent.
// Powers the per-user drilldown at `/admin/team/{email}`.
//
// Why one endpoint instead of N parallel client fetches?
//   - The drilldown page renders five sections; doing five fetches
//     means five spinners + five chances to fail.
//   - Server-side parallelism via Promise.all is faster than
//     serialised round-trips through the network from the browser.
//   - Single auth check + single user-id resolution cost.
//
// Date defaults to "today" in the server's local time. Callers can
// override via `?date=YYYY-MM-DD` for the future per-day paging
// when the page grows a date scrubber. Lookback windows on
// pings / captures / receipts use the same ISO day so a 6:00 AM
// clock-in shows up immediately without UTC-skew weirdness.
//
// Auth: admin / developer / tech_support.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const PHOTO_BUCKET = 'starr-field-photos';
const SIGNED_URL_TTL_SEC = 60 * 60;

// Cap so a wedged user with hundreds of captures + receipts in one
// day doesn't bloat the response. The drilldown page links out to
// the full list view (/admin/field-data?user_email=, etc.) for the
// long tail.
const SECTION_LIMIT = 12;

interface ClockEntry {
  id: string;
  job_id: string | null;
  job_name: string | null;
  job_number: string | null;
  entry_type: string | null;
  started_at: string | null;
  ended_at: string | null;
  /** Server-side derived for currently-open entries; the column is
   *  null until the row closes. */
  duration_minutes: number | null;
  clock_in_lat: number | null;
  clock_in_lon: number | null;
  is_active: boolean;
}

interface CaptureRow {
  point_id: string;
  point_name: string;
  job_id: string | null;
  job_name: string | null;
  code_category: string | null;
  created_at: string;
  is_offset: boolean | null;
  is_correction: boolean | null;
  thumb_signed_url: string | null;
  media_count: number;
}

interface ReceiptRow {
  id: string;
  vendor_name: string | null;
  category: string | null;
  total_cents: number | null;
  status: string;
  created_at: string;
  job_id: string | null;
}

interface DispatcherPingRow {
  id: string;
  source_type: string | null;
  title: string;
  body: string | null;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
}

interface PingRowLite {
  id: string;
  lat: number;
  lon: number;
  accuracy_m: number | null;
  battery_pct: number | null;
  is_charging: boolean | null;
  captured_at: string;
}

interface UserHeader {
  email: string;
  name: string | null;
  roles: string[];
  last_sign_in: string | null;
}

interface TodayPayload {
  date: string;
  is_clocked_in: boolean;
  /** When clocked in, the open entry; null otherwise. */
  active_entry: ClockEntry | null;
  /** Every clock-in for the day (closed + open). Sorted earliest
   *  → latest so the timeline reads top-down. */
  entries: ClockEntry[];
  /** Total minutes worked today across all entries. Closed rows
   *  use stored `duration_minutes`; the open row uses now() -
   *  started_at. */
  total_minutes: number;
  /** Today's last GPS ping for the live "where are they" pin. */
  last_ping: PingRowLite | null;
  /** Sample of today's pings (capped at SECTION_LIMIT, newest
   *  first) — feeds the mini-track viz. */
  pings: PingRowLite[];
  ping_count: number;
  /** Today's stops + segments only as counts; full details live
   *  on /admin/timeline. */
  stop_count: number;
  /** Total miles today (sum of segment.distance_meters). */
  miles: number;
  captures: CaptureRow[];
  capture_count: number;
  receipts: ReceiptRow[];
  receipt_count: number;
  dispatcher_pings: DispatcherPingRow[];
}

/** Today's start in the server's local timezone, ISO-formatted.
 *  Returns `[startIso, endIso]` covering the 24-hour window. */
function dayWindow(date: string | null): {
  startIso: string;
  endIso: string;
  date: string;
} {
  const base = date ? new Date(`${date}T00:00:00`) : new Date();
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  const yyyy = start.getFullYear();
  const mm = String(start.getMonth() + 1).padStart(2, '0');
  const dd = String(start.getDate()).padStart(2, '0');
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    date: `${yyyy}-${mm}-${dd}`,
  };
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userRoles = (session.user as { roles?: string[] } | undefined)
    ?.roles ?? [];
  if (!isAdmin(session.user.roles) && !userRoles.includes('tech_support')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Path: /api/admin/team/{email}/today — email is third-from-last,
  // URL-decoded by the parser.
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const emailRaw = segments[segments.length - 2];
  const email = emailRaw ? decodeURIComponent(emailRaw).toLowerCase().trim() : '';
  if (!email || !email.includes('@')) {
    return NextResponse.json(
      { error: 'Invalid email in URL' },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(req.url);
  const window = dayWindow(searchParams.get('date'));

  // 1. Resolve user header (email → registered_users row + auth.uid()).
  const { data: userRow, error: userErr } = await supabaseAdmin
    .from('registered_users')
    .select('id, email, name, roles, last_sign_in')
    .eq('email', email)
    .maybeSingle();
  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 500 });
  }
  if (!userRow) {
    return NextResponse.json(
      { error: 'No registered user with that email.' },
      { status: 404 }
    );
  }
  const u = userRow as {
    id: string;
    email: string;
    name: string | null;
    roles: string[] | null;
    last_sign_in: string | null;
  };

  const userHeader: UserHeader = {
    email: u.email,
    name: u.name,
    roles: u.roles ?? [],
    last_sign_in: u.last_sign_in,
  };

  // 2. Parallel fetch — every section runs at once.
  const [
    entriesRes,
    pingsRes,
    pingCountRes,
    stopsRes,
    segmentsRes,
    capturesRes,
    captureCountRes,
    receiptsRes,
    receiptCountRes,
    dispatcherPingsRes,
  ] = await Promise.all([
    supabaseAdmin
      .from('job_time_entries')
      .select(
        'id, job_id, entry_type, started_at, ended_at, duration_minutes, clock_in_lat, clock_in_lon'
      )
      .eq('user_email', email)
      .gte('started_at', window.startIso)
      .lt('started_at', window.endIso)
      .order('started_at', { ascending: true }),
    supabaseAdmin
      .from('location_pings')
      .select(
        'id, lat, lon, accuracy_m, battery_pct, is_charging, captured_at'
      )
      .eq('user_id', u.id)
      .gte('captured_at', window.startIso)
      .lt('captured_at', window.endIso)
      .order('captured_at', { ascending: false })
      .limit(SECTION_LIMIT),
    supabaseAdmin
      .from('location_pings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', u.id)
      .gte('captured_at', window.startIso)
      .lt('captured_at', window.endIso),
    supabaseAdmin
      .from('location_stops')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', u.id)
      .gte('arrived_at', window.startIso)
      .lt('arrived_at', window.endIso),
    supabaseAdmin
      .from('location_segments')
      .select('distance_meters')
      .eq('user_id', u.id)
      .gte('started_at', window.startIso)
      .lt('started_at', window.endIso),
    supabaseAdmin
      .from('field_data_points')
      .select(
        'id, name, code_category, job_id, created_at, is_offset, is_correction'
      )
      .eq('created_by', u.id)
      .gte('created_at', window.startIso)
      .lt('created_at', window.endIso)
      .order('created_at', { ascending: false })
      .limit(SECTION_LIMIT),
    supabaseAdmin
      .from('field_data_points')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', u.id)
      .gte('created_at', window.startIso)
      .lt('created_at', window.endIso),
    supabaseAdmin
      .from('receipts')
      .select(
        'id, vendor_name, category, total_cents, status, created_at, job_id'
      )
      .eq('user_id', u.id)
      .gte('created_at', window.startIso)
      .lt('created_at', window.endIso)
      .order('created_at', { ascending: false })
      .limit(SECTION_LIMIT),
    supabaseAdmin
      .from('receipts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', u.id)
      .gte('created_at', window.startIso)
      .lt('created_at', window.endIso),
    supabaseAdmin
      .from('notifications')
      .select(
        'id, source_type, title, body, created_at, delivered_at, read_at'
      )
      .eq('target_user_id', u.id)
      .gte('created_at', window.startIso)
      .lt('created_at', window.endIso)
      .order('created_at', { ascending: false })
      .limit(SECTION_LIMIT),
  ]);

  // Hard-fail on any errored response — partial data here would be
  // confusing for the dispatcher (e.g. "0 receipts" when really the
  // query 5xx'd). Surface the first error so logs can correlate.
  for (const res of [
    entriesRes,
    pingsRes,
    pingCountRes,
    stopsRes,
    segmentsRes,
    capturesRes,
    captureCountRes,
    receiptsRes,
    receiptCountRes,
    dispatcherPingsRes,
  ]) {
    if (res.error) {
      console.error('[admin/team/:email/today] section query failed', {
        email,
        error: res.error.message,
      });
      return NextResponse.json(
        { error: res.error.message },
        { status: 500 }
      );
    }
  }

  // 3. Resolve job names for every clock-in entry + every capture
  //    in one bulk lookup. Set semantics dedupe.
  const jobIds = [
    ...new Set(
      [
        ...((entriesRes.data ?? []) as Array<{ job_id: string | null }>),
        ...((capturesRes.data ?? []) as Array<{ job_id: string | null }>),
      ]
        .map((r) => r.job_id)
        .filter((id): id is string => !!id)
    ),
  ];
  const jobsById = new Map<
    string,
    { name: string | null; job_number: string | null }
  >();
  if (jobIds.length > 0) {
    const { data: jobsData, error: jobsErr } = await supabaseAdmin
      .from('jobs')
      .select('id, name, job_number')
      .in('id', jobIds);
    if (jobsErr) {
      console.warn('[admin/team/:email/today] jobs lookup failed', {
        error: jobsErr.message,
      });
    } else {
      for (const j of (jobsData ?? []) as Array<{
        id: string;
        name: string | null;
        job_number: string | null;
      }>) {
        jobsById.set(j.id, { name: j.name, job_number: j.job_number });
      }
    }
  }

  // 4. Build clock-in entries with derived duration for the open
  //    entry. Closed rows use the stored value; open rows compute
  //    from started_at → now().
  const nowMs = Date.now();
  type RawEntry = {
    id: string;
    job_id: string | null;
    entry_type: string | null;
    started_at: string | null;
    ended_at: string | null;
    duration_minutes: number | null;
    clock_in_lat: number | null;
    clock_in_lon: number | null;
  };
  const entries: ClockEntry[] = ((entriesRes.data ?? []) as RawEntry[]).map(
    (e) => {
      const isActive = !e.ended_at;
      const startedMs = e.started_at ? Date.parse(e.started_at) : NaN;
      const derivedMin =
        e.duration_minutes ??
        (isActive && Number.isFinite(startedMs)
          ? Math.max(0, Math.floor((nowMs - startedMs) / 60_000))
          : null);
      const job = e.job_id ? jobsById.get(e.job_id) : undefined;
      return {
        id: e.id,
        job_id: e.job_id,
        job_name: job?.name ?? null,
        job_number: job?.job_number ?? null,
        entry_type: e.entry_type,
        started_at: e.started_at,
        ended_at: e.ended_at,
        duration_minutes: derivedMin,
        clock_in_lat: e.clock_in_lat,
        clock_in_lon: e.clock_in_lon,
        is_active: isActive,
      };
    }
  );

  const activeEntry = entries.find((e) => e.is_active) ?? null;
  const totalMinutes = entries.reduce(
    (sum, e) => sum + (e.duration_minutes ?? 0),
    0
  );

  // 5. Mileage from segment distances. Same Haversine source as
  //    /api/admin/mileage but no need to recompute — we read the
  //    derived `location_segments.distance_meters` directly. When
  //    `derive_location_timeline` hasn't run yet for today, this
  //    will read 0; the dispatcher hits "Recompute" on
  //    /admin/timeline to populate.
  const totalMeters = (
    (segmentsRes.data ?? []) as Array<{ distance_meters: number | null }>
  ).reduce((sum, r) => sum + (r.distance_meters ?? 0), 0);
  const miles = totalMeters / 1609.344;

  // 6. Captures — grab a thumbnail signed URL per point in
  //    parallel. usePointMedia-equivalent: pull the first photo per
  //    point in one bulk query, then sign the path.
  type RawPoint = {
    id: string;
    name: string;
    code_category: string | null;
    job_id: string | null;
    created_at: string;
    is_offset: boolean | null;
    is_correction: boolean | null;
  };
  const points = (capturesRes.data ?? []) as RawPoint[];
  const pointIds = points.map((p) => p.id);
  let mediaByPoint = new Map<string, { storage_url: string; count: number }>();
  if (pointIds.length > 0) {
    const { data: mediaRows } = await supabaseAdmin
      .from('field_media')
      .select('data_point_id, storage_url, position')
      .in('data_point_id', pointIds)
      .eq('media_type', 'photo');
    type RawMedia = {
      data_point_id: string | null;
      storage_url: string | null;
      position: number | null;
    };
    const counts = new Map<string, number>();
    const firstByPoint = new Map<string, RawMedia>();
    for (const m of (mediaRows ?? []) as RawMedia[]) {
      if (!m.data_point_id) continue;
      counts.set(m.data_point_id, (counts.get(m.data_point_id) ?? 0) + 1);
      const cur = firstByPoint.get(m.data_point_id);
      const curPos = cur?.position ?? Number.POSITIVE_INFINITY;
      const newPos = m.position ?? Number.POSITIVE_INFINITY;
      if (!cur || newPos < curPos) {
        firstByPoint.set(m.data_point_id, m);
      }
    }
    mediaByPoint = new Map(
      [...firstByPoint.entries()]
        .filter(([, m]) => !!m.storage_url)
        .map(([pid, m]) => [
          pid,
          { storage_url: m.storage_url as string, count: counts.get(pid) ?? 1 },
        ])
    );
  }

  const captures: CaptureRow[] = await Promise.all(
    points.map(async (p) => {
      const slot = mediaByPoint.get(p.id);
      let thumb: string | null = null;
      if (slot?.storage_url) {
        const { data, error } = await supabaseAdmin.storage
          .from(PHOTO_BUCKET)
          .createSignedUrl(slot.storage_url, SIGNED_URL_TTL_SEC);
        if (error) {
          console.warn('[admin/team/:email/today] thumb sign failed', {
            point_id: p.id,
            error: error.message,
          });
        } else {
          thumb = data?.signedUrl ?? null;
        }
      }
      const job = p.job_id ? jobsById.get(p.job_id) : undefined;
      return {
        point_id: p.id,
        point_name: p.name,
        job_id: p.job_id,
        job_name: job?.name ?? null,
        code_category: p.code_category,
        created_at: p.created_at,
        is_offset: p.is_offset,
        is_correction: p.is_correction,
        thumb_signed_url: thumb,
        media_count: slot?.count ?? 0,
      };
    })
  );

  // 7. Build the rest of the payload. Receipts + dispatcher pings
  //    pass through more or less verbatim.
  const receipts: ReceiptRow[] = (
    (receiptsRes.data ?? []) as Array<{
      id: string;
      vendor_name: string | null;
      category: string | null;
      total_cents: number | null;
      status: string | null;
      created_at: string;
      job_id: string | null;
    }>
  ).map((r) => ({
    id: r.id,
    vendor_name: r.vendor_name,
    category: r.category,
    total_cents: r.total_cents,
    status: r.status ?? 'pending',
    created_at: r.created_at,
    job_id: r.job_id,
  }));

  const dispatcherPings: DispatcherPingRow[] = (
    (dispatcherPingsRes.data ?? []) as Array<{
      id: string;
      source_type: string | null;
      title: string;
      body: string | null;
      created_at: string;
      delivered_at: string | null;
      read_at: string | null;
    }>
  ).map((p) => ({
    id: p.id,
    source_type: p.source_type,
    title: p.title,
    body: p.body,
    created_at: p.created_at,
    delivered_at: p.delivered_at,
    read_at: p.read_at,
  }));

  const pings: PingRowLite[] = (
    (pingsRes.data ?? []) as Array<{
      id: string;
      lat: number;
      lon: number;
      accuracy_m: number | null;
      battery_pct: number | null;
      is_charging: boolean | null;
      captured_at: string;
    }>
  ).map((p) => ({
    id: p.id,
    lat: p.lat,
    lon: p.lon,
    accuracy_m: p.accuracy_m,
    battery_pct: p.battery_pct,
    is_charging: p.is_charging,
    captured_at: p.captured_at,
  }));

  const today: TodayPayload = {
    date: window.date,
    is_clocked_in: !!activeEntry,
    active_entry: activeEntry,
    entries,
    total_minutes: totalMinutes,
    last_ping: pings[0] ?? null,
    pings,
    ping_count: pingCountRes.count ?? 0,
    stop_count: stopsRes.count ?? 0,
    miles,
    captures,
    capture_count: captureCountRes.count ?? 0,
    receipts,
    receipt_count: receiptCountRes.count ?? 0,
    dispatcher_pings: dispatcherPings,
  };

  return NextResponse.json({ user: userHeader, today });
}, { routeName: 'admin/team/:email/today' });
