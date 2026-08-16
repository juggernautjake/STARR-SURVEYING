// app/api/admin/mileage/manual/route.ts — persist a MANUAL mileage entry.
//
// C0b3 of docs/planning/completed/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
//
// Owner, 2026-08-15: *"put in the starting address and the job address and the distance will be
// calculated and then that will use the miles per gallon to calculate the cost as well. So all
// mileage tracking will just be manually entered for each job/trip."*
//
// Distinct from the GPS-ping report at `/api/admin/mileage` (read-only): this WRITES one
// `mileage_entries` row per trip.
//
// ── THE BUG THIS ROUTE SHIPPED WITH, AND WHY THE TABLE IS EMPTY ─────────────────────────────────
//
// Until 2026-08-15 the insert below listed `total_cents`. That column is
// `GENERATED ALWAYS AS ((miles * rate_cents_per_mile)::INTEGER) STORED` (seed 282), and Postgres
// refuses any non-DEFAULT write to a generated column. So EVERY manual mileage save returned 500,
// and `mileage_entries` held 0 rows in production — verified against the live database on
// 2026-08-15, not inferred. The column is computed by the database; it is not ours to send.
//
// ── ONE WAY TO GET `miles`, AS OF C0b4 ──────────────────────────────────────────────────────────
//
// This route was built for `startReading`/`endReading` — the odometer path — and grew a `distance`
// branch when the owner respecified capture to addresses (D9). C0b4 retired the odometer half:
// C0g had already deleted the Work Mode shell that held its form, so nothing in the repo submitted
// those fields, and `mileage_entries` holds zero rows of any source, so there was no history to
// keep compatible. `distance_source` still records 'typed' vs 'lookup', and the DB check
// constraint still admits 'odometer' so an imported or restored row stays writable.
//
// The fuel cost is ADDITIVE and never replaces the reimbursement — see D9. `rate_cents_per_mile`
// stays the IRS figure that `/admin/payouts/tax-report` reads.
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { mileageReimbursement, MAX_REASONABLE_DAILY_MILES } from '@/lib/mileage/reimbursement';
import { IRS_BUSINESS_RATE_2025 } from '@/lib/mileage/summary';
import { estimateTripFuel } from '@/lib/mileage/fuel';

const MAX_NOTES_LEN = 500;
const MAX_ADDRESS_LEN = 300;

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const email = session.user.email;

  const { data: user } = await supabaseAdmin
    .from('registered_users')
    .select('default_org_id')
    .eq('email', email)
    .maybeSingle();
  if (!user?.default_org_id) return NextResponse.json({ error: 'No org' }, { status: 403 });
  const orgId = user.default_org_id as string;

  const body = await req.json().catch(() => ({}));

  // ── Miles ─────────────────────────────────────────────────────────────────────────────────────
  // C0b4 retired the odometer alternative, so distance is now the only way in. The union no longer
  // admits 'odometer' — the DB check constraint still does, deliberately, so a row arriving from a
  // backup or an import stays writable and readable.
  let miles: number;
  let reimbursement: number;
  let rate: number;
  let distanceSource: 'typed' | 'lookup';

  if (body?.distance !== undefined && body?.distance !== null && body.distance !== '') {
    const d = Number(body.distance);
    if (!Number.isFinite(d) || d < 0) {
      return NextResponse.json({ error: 'Distance must be a positive number of miles.' }, { status: 400 });
    }
    if (d > MAX_REASONABLE_DAILY_MILES) {
      return NextResponse.json({ error: `That’s ${Math.round(d)} miles for one trip — check the distance.` }, { status: 400 });
    }
    miles = Math.round(d * 100) / 100;
    rate = IRS_BUSINESS_RATE_2025;
    const r = mileageReimbursement(miles, rate);
    if (r === null) return NextResponse.json({ error: 'Could not value that distance.' }, { status: 400 });
    reimbursement = r;
    // 'lookup' is claimed only when the client says the figure came from the distance provider;
    // anything else is a typed number, and the two must not be conflated in the audit trail.
    distanceSource = body?.distanceSource === 'lookup' ? 'lookup' : 'typed';
  } else {
    // C0b4 — the odometer branch is retired.
    //
    // It read `startReading`/`endReading` and resolved them through `resolveOdometerEntry`. The
    // owner respecified capture from odometer readings to addresses (D9); C0b3b shipped the
    // address form and C0g deleted the Work Mode shell that held the odometer one, so by the time
    // this row came up for retirement NOTHING in the repo submitted those two fields.
    //
    // The refusal names the field rather than saying "distance required", because a caller still
    // sending odometer readings — a stale bookmark, an old mobile build — otherwise gets a message
    // about a field it never heard of and no way to work out what changed. This is the C16 rule:
    // a refusal states the cause, it does not merely decline.
    const sentOdometer = body?.startReading !== undefined || body?.endReading !== undefined;
    return NextResponse.json(
      {
        error: sentOdometer
          ? 'Odometer readings are no longer accepted. Send the trip distance in miles as `distance`.'
          : 'A trip needs a distance in miles.',
      },
      { status: 400 },
    );
  }

  const jobId = typeof body?.jobId === 'string' && body.jobId.trim() ? body.jobId.trim() : null;
  const entryDate = typeof body?.entryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.entryDate)
    ? body.entryDate
    : new Date().toISOString().slice(0, 10);

  const startAddress = typeof body?.startAddress === 'string'
    ? body.startAddress.trim().slice(0, MAX_ADDRESS_LEN) || null : null;
  const endAddress = typeof body?.endAddress === 'string'
    ? body.endAddress.trim().slice(0, MAX_ADDRESS_LEN) || null : null;

  // ── Vehicle + fuel ────────────────────────────────────────────────────────────────────────────
  let vehicleId: string | null = null;
  let vehicleName: string | null = null;
  let vehicleMpg: number | null = null;
  if (typeof body?.vehicleId === 'string' && body.vehicleId.trim()) {
    const { data: veh } = await supabaseAdmin
      .from('vehicles')
      .select('id, name, mpg')
      .eq('id', body.vehicleId.trim())
      .maybeSingle();
    const row = veh as { id?: string; name?: string | null; mpg?: number | null } | null;
    if (row?.id) {
      vehicleId = row.id;
      vehicleName = row.name ?? null;
      vehicleMpg = row.mpg == null ? null : Number(row.mpg);
    }
  }

  // Org fuel price. A missing settings row is not an error — it means "no price configured", and
  // the trip saves with its reimbursement and no fuel estimate rather than failing.
  let fuelPriceCents: number | null = null;
  const { data: setting } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('key', 'mileage')
    .maybeSingle();
  const raw = (setting as { value?: { fuelPriceCents?: unknown } } | null)?.value?.fuelPriceCents;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) fuelPriceCents = raw;
  if (typeof body?.fuelPriceCents === 'number' && Number.isFinite(body.fuelPriceCents) && body.fuelPriceCents >= 0) {
    fuelPriceCents = body.fuelPriceCents; // per-trip override
  }

  const fuel = estimateTripFuel(miles, vehicleMpg, fuelPriceCents);

  const userNote = typeof body?.notes === 'string' ? body.notes.trim().slice(0, MAX_NOTES_LEN) : '';
  const notes = [vehicleName, userNote].filter(Boolean).join(' · ') || null;

  const { data, error } = await supabaseAdmin
    .from('mileage_entries')
    .insert({
      org_id: orgId,
      user_email: email,
      job_id: jobId,
      entry_date: entryDate,
      miles,
      rate_cents_per_mile: Math.round(rate * 100),
      // `total_cents` is intentionally absent — it is GENERATED ALWAYS. See the header.
      start_address: startAddress,
      end_address: endAddress,
      vehicle_id: vehicleId,
      mpg_snapshot: fuel?.mpg ?? null,
      fuel_price_cents: fuel?.fuelPriceCents ?? null,
      fuel_cost_cents: fuel?.fuelCostCents ?? null,
      distance_source: distanceSource,
      notes,
      source: 'manual',
      created_by: email,
    })
    .select('id, entry_date, miles, rate_cents_per_mile, total_cents, fuel_cost_cents, distance_source')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    entry: data,
    miles,
    reimbursement,
    rate,
    fuel: fuel
      ? { gallons: fuel.gallons, costCents: fuel.fuelCostCents, mpg: fuel.mpg, priceCents: fuel.fuelPriceCents }
      : null,
  }, { status: 201 });
}, { routeName: 'admin/mileage.manual.post' });
