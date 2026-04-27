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
  job_time_entry_id: string | null;
}

/** Per-vehicle subtotal within a (user, date) bucket. Surfaced under
 *  each day so the bookkeeper can see "Jacob drove Truck 3 for 28 mi
 *  AND rode passenger in Truck 1 for 12 mi" — only the driver miles
 *  are IRS-deductible (per `is_driver`). */
export interface VehicleSubtotal {
  vehicle_id: string | null;
  vehicle_name: string | null;
  /** Most common is_driver flag for the pings in this subgroup —
   *  null when the user wasn't on a clock-in slice tied to a vehicle
   *  (rare; the boundary pings or vehicle-less entry types). */
  is_driver: boolean | null;
  miles: number;
  meters: number;
  ping_count: number;
  segment_count: number;
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
  /** Per-vehicle breakdown for this (user, date) bucket. Empty when
   *  no pings in the bucket had a vehicle attached. */
  by_vehicle: VehicleSubtotal[];
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

interface EntryMeta {
  vehicle_id: string | null;
  vehicle_name: string | null;
  is_driver: boolean | null;
}

/**
 * Group pings by (user_email, utcDate) and compute per-day totals,
 * plus a per-vehicle breakdown via the joined `entryMeta` map.
 * Pings within a group must arrive sorted by captured_at ASC for the
 * Haversine sum to be correct. The query below applies that ordering
 * before grouping.
 */
function aggregate(
  pings: PingRow[],
  entryMeta: Map<string, EntryMeta>
): MileageDayRow[] {
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
    // Per-vehicle accumulators, keyed by vehicle_id (or '' for null).
    const vehBuckets = new Map<
      string,
      {
        vehicle_id: string | null;
        vehicle_name: string | null;
        is_driver: boolean | null;
        meters: number;
        ping_count: number;
        segment_count: number;
      }
    >();
    const noteVehiclePing = (p: PingRow) => {
      const meta = p.job_time_entry_id
        ? entryMeta.get(p.job_time_entry_id)
        : null;
      const vid = meta?.vehicle_id ?? null;
      const key = vid ?? '';
      let v = vehBuckets.get(key);
      if (!v) {
        v = {
          vehicle_id: vid,
          vehicle_name: meta?.vehicle_name ?? null,
          is_driver: meta?.is_driver ?? null,
          meters: 0,
          ping_count: 0,
          segment_count: 0,
        };
        vehBuckets.set(key, v);
      }
      v.ping_count += 1;
      return v;
    };

    // First ping of the day — counts in vehicle ping_count but
    // contributes no segment distance (no predecessor).
    if (b.rows.length > 0) noteVehiclePing(b.rows[0]);

    for (let i = 1; i < b.rows.length; i++) {
      const prev = b.rows[i - 1];
      const cur = b.rows[i];
      const veh = noteVehiclePing(cur);
      const d = haversineMeters(prev.lat, prev.lon, cur.lat, cur.lon);
      if (d > MAX_PLAUSIBLE_JUMP_M) {
        droppedJumps += 1;
        continue;
      }
      meters += d;
      segmentCount += 1;
      veh.meters += d;
      veh.segment_count += 1;
    }

    const by_vehicle: VehicleSubtotal[] = [...vehBuckets.values()].map(
      (v) => ({
        vehicle_id: v.vehicle_id,
        vehicle_name: v.vehicle_name,
        is_driver: v.is_driver,
        miles: Math.round((v.meters / METERS_PER_MILE) * 100) / 100,
        meters: Math.round(v.meters),
        ping_count: v.ping_count,
        segment_count: v.segment_count,
      })
    );
    // Sort: driver miles first (descending miles), then passenger,
    // then no-vehicle bucket.
    by_vehicle.sort((a, b2) => {
      const aPriority = a.is_driver === true ? 0 : a.vehicle_id ? 1 : 2;
      const bPriority = b2.is_driver === true ? 0 : b2.vehicle_id ? 1 : 2;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return b2.miles - a.miles;
    });

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
      by_vehicle,
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
  // Two row types: a per-day total (vehicle_id blank) followed by
  // one row per vehicle subtotal under it. Bookkeepers can pivot
  // by vehicle in Excel/QuickBooks via the vehicle_id column.
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
    'vehicle_id',
    'vehicle_name',
    'is_driver',
  ];
  const lines = [header.join(',')];
  for (const d of days) {
    // Day-total row.
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
        '',
        '',
        '',
      ].join(',')
    );
    // Per-vehicle subgroup rows.
    for (const v of d.by_vehicle) {
      lines.push(
        [
          csvEscape(d.user_email),
          csvEscape(d.date),
          csvEscape(v.miles),
          csvEscape(v.meters),
          csvEscape(v.ping_count),
          csvEscape(v.segment_count),
          '',
          '',
          '',
          csvEscape(v.vehicle_id ?? ''),
          csvEscape(v.vehicle_name ?? ''),
          v.is_driver === true
            ? 'true'
            : v.is_driver === false
              ? 'false'
              : '',
        ].join(',')
      );
    }
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

  // Pull pings. We need lat/lon/captured_at, user_email, and the
  // job_time_entry_id so the per-vehicle subgrouping can join out
  // to vehicles. ASC by captured_at so the per-day Haversine sum
  // is deterministic.
  let query = supabaseAdmin
    .from('location_pings')
    .select('user_email, lat, lon, captured_at, job_time_entry_id')
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

  // Bulk-look-up job_time_entries → vehicles via the unique entry
  // ids in the ping set. One round trip each (entries, then
  // vehicles), regardless of ping count.
  const entryIds = [
    ...new Set(
      pings
        .map((p) => p.job_time_entry_id)
        .filter((id): id is string => !!id)
    ),
  ];
  const entryMeta = new Map<string, EntryMeta>();
  if (entryIds.length > 0) {
    const { data: entries, error: entriesErr } = await supabaseAdmin
      .from('job_time_entries')
      .select('id, vehicle_id, is_driver')
      .in('id', entryIds);
    if (entriesErr) {
      return NextResponse.json(
        { error: entriesErr.message },
        { status: 500 }
      );
    }
    type EntryRow = {
      id: string;
      vehicle_id: string | null;
      is_driver: boolean | null;
    };
    const vehicleIds = [
      ...new Set(
        ((entries ?? []) as EntryRow[])
          .map((e) => e.vehicle_id)
          .filter((id): id is string => !!id)
      ),
    ];
    const vehiclesById = new Map<string, string>();
    if (vehicleIds.length > 0) {
      const { data: vehicles, error: vehiclesErr } = await supabaseAdmin
        .from('vehicles')
        .select('id, name')
        .in('id', vehicleIds);
      if (vehiclesErr) {
        return NextResponse.json(
          { error: vehiclesErr.message },
          { status: 500 }
        );
      }
      for (const v of ((vehicles ?? []) as Array<{
        id: string;
        name: string | null;
      }>)) {
        vehiclesById.set(v.id, v.name ?? 'Unnamed');
      }
    }
    for (const e of (entries ?? []) as EntryRow[]) {
      entryMeta.set(e.id, {
        vehicle_id: e.vehicle_id,
        vehicle_name: e.vehicle_id
          ? (vehiclesById.get(e.vehicle_id) ?? null)
          : null,
        is_driver: e.is_driver,
      });
    }
  }

  const days = aggregate(pings, entryMeta);

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
