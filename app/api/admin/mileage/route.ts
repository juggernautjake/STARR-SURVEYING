// app/api/admin/mileage/route.ts — IRS-grade mileage report
//
// Per plan §5.10.4: "auto-generate IRS-format mileage log" from the
// background GPS stream. This endpoint aggregates location_pings into
// per-(user, day) total miles using a Haversine sum across consecutive
// fixes, then optionally returns it as CSV for QuickBooks / tax import.
//
// Important caveats encoded in the calculation:
//
//   1. Pings only happen while clocked in (privacy contract per
//      §5.10.1). So total miles ≈ business miles by construction —
//      personal commute / off-clock driving never enters the dataset.
//
//   2. We bound the "max plausible jump" to 200 km between consecutive
//      pings (≈10 minutes at autobahn speed). Anything larger is a
//      fix glitch (cell-tower triangulation throwing the lat/lon
//      across town) and is dropped from the sum. The dropped
//      contribution shows up as `dropped_jump_count` in the response
//      so the dispatcher can audit.
//
//   3. We DON'T derive stops/segments here — that's the F6
//      stop-detection worker's job. This endpoint operates straight
//      from the raw pings so it works the moment data arrives,
//      without waiting on the worker pipeline.
//
// Auth: admin / developer / tech_support.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// ── Constants ────────────────────────────────────────────────────────────────

/** Earth's radius in meters — Haversine constant. */
const EARTH_RADIUS_M = 6_371_000;

/** Drop any single-segment jump larger than this. 200 km between two
 *  consecutive pings (≤120 s apart in normal cadence) is faster than
 *  jet airspeed at low altitude — it's a glitch, not real movement. */
const MAX_PLAUSIBLE_JUMP_M = 200_000;

/** 1 mile = 1609.344 meters. */
const METERS_PER_MILE = 1609.344;

/** Max date span the endpoint will accept (defends against an admin
 *  accidentally pulling 5 years of pings). */
const MAX_RANGE_DAYS = 92;

// ── Types ────────────────────────────────────────────────────────────────────

interface PingRow {
  user_email: string;
  lat: number;
  lon: number;
  captured_at: string; // ISO
}

export interface MileageDayRow {
  user_email: string;
  date: string; // YYYY-MM-DD (UTC, see note below)
  miles: number;
  meters: number;
  ping_count: number;
  /** Pings that contributed a real distance (i.e. excluding the first
   *  ping each day, which has no predecessor, and any glitched ones). */
  segment_count: number;
  /** Single-segment jumps dropped as implausible. */
  dropped_jump_count: number;
  first_ping_at: string;
  last_ping_at: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/**
 * UTC date of an ISO timestamp. We deliberately bucket by UTC rather
 * than the surveyor's local TZ for the v1 export — tax mileage is
 * customarily logged in the IRS sense (date the trip occurred), and
 * most field crews work within a single TZ anyway. A future
 * enhancement could take a `tz` param.
 */
function utcDate(iso: string): string {
  return iso.slice(0, 10);
}

function csvEscape(s: string | number): string {
  const v = String(s ?? '');
  if (/[",\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

// ── Aggregation ──────────────────────────────────────────────────────────────

/**
 * Group pings by (user_email, utcDate) and compute per-day totals.
 * Pings within a group must arrive sorted by captured_at ASC for the
 * Haversine sum to be correct. The query below applies that ordering
 * before grouping.
 */
function aggregate(pings: PingRow[]): MileageDayRow[] {
  // Group key: `${email}|${utcDate}`
  type Bucket = {
    user_email: string;
    date: string;
    rows: PingRow[];
  };
  const buckets = new Map<string, Bucket>();
  for (const p of pings) {
    const date = utcDate(p.captured_at);
    const key = `${p.user_email}|${date}`;
    let b = buckets.get(key);
    if (!b) {
      b = { user_email: p.user_email, date, rows: [] };
      buckets.set(key, b);
    }
    b.rows.push(p);
  }

  const result: MileageDayRow[] = [];
  for (const b of buckets.values()) {
    let meters = 0;
    let segmentCount = 0;
    let droppedJumps = 0;
    for (let i = 1; i < b.rows.length; i++) {
      const prev = b.rows[i - 1];
      const cur = b.rows[i];
      const d = haversineMeters(prev.lat, prev.lon, cur.lat, cur.lon);
      if (d > MAX_PLAUSIBLE_JUMP_M) {
        droppedJumps += 1;
        continue;
      }
      meters += d;
      segmentCount += 1;
    }
    result.push({
      user_email: b.user_email,
      date: b.date,
      miles: Math.round((meters / METERS_PER_MILE) * 100) / 100,
      meters: Math.round(meters),
      ping_count: b.rows.length,
      segment_count: segmentCount,
      dropped_jump_count: droppedJumps,
      first_ping_at: b.rows[0]?.captured_at ?? '',
      last_ping_at: b.rows[b.rows.length - 1]?.captured_at ?? '',
    });
  }

  // Stable sort: user_email ASC, date ASC. Drives the table and the
  // IRS-export ordering expectation.
  result.sort((a, b) => {
    if (a.user_email < b.user_email) return -1;
    if (a.user_email > b.user_email) return 1;
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  });

  return result;
}

function toCsv(days: MileageDayRow[]): string {
  const header = [
    'user_email',
    'date',
    'miles',
    'meters',
    'ping_count',
    'segment_count',
    'dropped_jump_count',
    'first_ping_at',
    'last_ping_at',
  ];
  const lines = [header.join(',')];
  for (const d of days) {
    lines.push(
      [
        csvEscape(d.user_email),
        csvEscape(d.date),
        csvEscape(d.miles),
        csvEscape(d.meters),
        csvEscape(d.ping_count),
        csvEscape(d.segment_count),
        csvEscape(d.dropped_jump_count),
        csvEscape(d.first_ping_at),
        csvEscape(d.last_ping_at),
      ].join(',')
    );
  }
  return lines.join('\n') + '\n';
}

// ── Handler ──────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Same auth pattern as /api/admin/team — admins + tech_support read.
  const userRoles = (session.user as { roles?: string[] } | undefined)
    ?.roles ?? [];
  if (!isAdmin(session.user.roles) && !userRoles.includes('tech_support')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userEmail = searchParams.get('user_email');
  const from = searchParams.get('from'); // ISO date
  const to = searchParams.get('to'); // ISO date
  const format = searchParams.get('format') === 'csv' ? 'csv' : 'json';

  // Validate range — server-bounded so a runaway export doesn't drag
  // the dashboard down.
  if (!from || !to) {
    return NextResponse.json(
      { error: 'from and to (YYYY-MM-DD) are required' },
      { status: 400 }
    );
  }
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T23:59:59Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) {
    return NextResponse.json(
      { error: 'from and to must be valid ISO dates with from <= to' },
      { status: 400 }
    );
  }
  const spanDays = Math.ceil((toMs - fromMs) / (24 * 60 * 60 * 1000));
  if (spanDays > MAX_RANGE_DAYS) {
    return NextResponse.json(
      {
        error: `Range too large (${spanDays} days). Max ${MAX_RANGE_DAYS} days per request.`,
      },
      { status: 400 }
    );
  }

  // Pull pings. We need lat/lon/captured_at and user_email; sort
  // ASC by captured_at so the per-day Haversine sum is deterministic.
  let query = supabaseAdmin
    .from('location_pings')
    .select('user_email, lat, lon, captured_at')
    .gte('captured_at', new Date(fromMs).toISOString())
    .lte('captured_at', new Date(toMs).toISOString())
    .order('user_email', { ascending: true })
    .order('captured_at', { ascending: true });

  if (userEmail) {
    query = query.eq('user_email', userEmail.toLowerCase().trim());
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pings = (data ?? []) as PingRow[];
  const days = aggregate(pings);

  if (format === 'csv') {
    const csv = toCsv(days);
    const filename =
      userEmail
        ? `mileage_${userEmail.replace(/[^a-z0-9_.-]/gi, '_')}_${from}_to_${to}.csv`
        : `mileage_${from}_to_${to}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        // Don't cache mileage exports — every request reflects the
        // current state of the pings table.
        'Cache-Control': 'no-store',
      },
    });
  }

  // JSON response. Total at the top so the UI doesn't have to re-sum.
  const totalMiles =
    Math.round(days.reduce((s, d) => s + d.miles, 0) * 100) / 100;
  return NextResponse.json({
    days,
    total_miles: totalMiles,
    range: { from, to },
    user_email: userEmail ?? null,
    server_now: new Date().toISOString(),
  });
}, { routeName: 'admin/mileage' });
