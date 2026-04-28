// app/api/admin/finances/tax-summary/route.ts
//
// GET /api/admin/finances/tax-summary?year=YYYY&from=YYYY-MM-DD&to=YYYY-MM-DD&status=approved|exported|all&format=json|csv
//
// Tax-time financial summary that joins approved receipts + mileage
// + vehicles into a single Schedule-C-shaped report. Per the user's
// directive: *"For things dealing with receipts and finances, please
// build systems that keep track of everything and make it super
// easy to manage and export data. Make it so that we can use the
// data to keep really great track of everything and make dealing
// with taxes super easy!"*
//
// Anti-double-counting (user follow-up directive): receipts that have
// already been "used for their intended purpose" (status='exported',
// `exported_at` IS NOT NULL — see seeds/232) are reported alongside
// fresh approved rows but tagged distinctly so the bookkeeper can
// see at a glance:
//
//   * how many rows are *new* (status='approved', `exported_at` IS
//     NULL) and ready to be locked into a period;
//   * how many rows have *already been filed* (status='exported')
//     and must NOT be re-counted into a subsequent period.
//
// The summary still includes both buckets in the deductible totals
// (so the CPA can see the full picture for the period the user
// asked about), but the response carries a `by_status` breakdown
// so the UI can split them visually and only the approved-bucket
// rows feed the "Lock this period as exported" action.
//
// JSON response shape (Batch QQ):
//   {
//     period:    { year?, from, to },
//     irs_rate_cents_per_mile,           // env-overridable (default 67¢ — 2025 rate)
//     status_filter,                     // 'approved' | 'exported' | 'all'
//     receipts: {
//       total_cents, count,
//       by_status:      { approved:{count,total_cents,deductible_cents},
//                         exported:{count,total_cents,deductible_cents} },
//       by_category:    [{ category,         count, total_cents,
//                          deductible_cents, schedule_c_line }],
//       by_tax_flag:    [{ flag,             count, total_cents,
//                          deductible_cents }],
//       top_vendors:    [{ vendor_name,      count, total_cents }],
//       by_user:        [{ email, name,      count, total_cents }],
//       exported_periods: [{ exported_period, count, total_cents }],
//     },
//     mileage: {
//       total_miles, deduction_cents,
//       by_user:        [{ email,            miles, deduction_cents }],
//       by_vehicle:     [{ vehicle_id, name, miles, deduction_cents }],
//     },
//     totals: {
//       deductible_cents,                  // receipts deductible + mileage deduction
//       expense_cents                      // gross business expense (receipts only)
//     }
//   }
//
// CSV variant flattens to a tax-prep-friendly row-per-line layout
// (one row per Schedule C category + a totals row). Bookkeeper hands
// the CSV to the CPA.
//
// `?year=YYYY` is the common path. `?from=&to=` overrides for
// arbitrary windows (Q1, fiscal year, etc.). When both are absent,
// defaults to the current calendar year.
//
// `?status=approved` shows only rows that haven't been locked into
// any period yet — what the bookkeeper would put on the next return.
// `?status=exported` shows only rows already filed — useful for
// re-printing a prior period's report. `?status=all` (default) shows
// everything in the window with the by_status split so nothing is
// missed AND nothing is double-counted.
//
// Auth: admin / developer / tech_support. Soft-deleted receipts +
// rejected receipts are excluded — only approved/exported rows
// count toward deductions.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

/** IRS standard business mileage rate (cents/mile). 2025 rate is
 *  67¢; 2026 wasn't published when this was written. Override via
 *  `IRS_MILEAGE_CENTS_PER_MILE` env var when the IRS publishes an
 *  update. */
const DEFAULT_IRS_MILEAGE_CENTS_PER_MILE = 67;

/** Schedule C line-number mapping for our receipt categories.
 *  Reference: https://www.irs.gov/forms-pubs/about-schedule-c-form-1040
 *  These are intentional defaults — the bookkeeper can re-classify
 *  in QuickBooks before filing. */
const SCHEDULE_C_LINE: Record<string, string> = {
  fuel: '9 — Car & truck',
  meals: '24b — Meals (50%)',
  supplies: '22 — Supplies',
  equipment: '13 — Depreciation / §179',
  tolls: '9 — Car & truck',
  parking: '9 — Car & truck',
  lodging: '24a — Travel',
  professional_services: '17 — Legal & professional',
  office_supplies: '18 — Office expense',
  client_entertainment: '27a — Other (entertainment, post-2018)',
  other: '27a — Other expenses',
};

/** Fraction of `total_cents` that's deductible per the IRS
 *  tax_deductible_flag. Mirrors the schema's CHECK enum. */
function deductibleFraction(flag: string | null | undefined): number {
  switch (flag) {
    case 'full':
      return 1.0;
    case 'partial_50':
      return 0.5;
    case 'none':
      return 0.0;
    case 'review':
    default:
      // 'review' rows aren't booked yet — treat as 0 toward the
      // deduction summary so the bookkeeper sees a conservative
      // total. The CPA can re-classify after review.
      return 0.0;
  }
}

interface ReceiptRow {
  id: string;
  user_id: string | null;
  vendor_name: string | null;
  category: string | null;
  tax_deductible_flag: string | null;
  total_cents: number | null;
  status: string | null;
  deleted_at: string | null;
  transaction_at: string | null;
  created_at: string | null;
  exported_at: string | null;
  exported_period: string | null;
}

interface SegmentRow {
  user_id: string;
  vehicle_id: string | null;
  distance_meters: number | null;
  is_business: boolean | null;
}

interface UserLite {
  id: string;
  email: string;
  name: string | null;
}

interface VehicleLite {
  id: string;
  name: string | null;
  license_plate: string | null;
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

  const { searchParams } = new URL(req.url);
  const yearRaw = searchParams.get('year');
  const fromRaw = searchParams.get('from');
  const toRaw = searchParams.get('to');
  const format = (searchParams.get('format') ?? 'json').toLowerCase();
  const statusRaw = (searchParams.get('status') ?? 'all').toLowerCase();
  const statusFilter: 'approved' | 'exported' | 'all' =
    statusRaw === 'approved' || statusRaw === 'exported' ? statusRaw : 'all';

  const window = resolveWindow(yearRaw, fromRaw, toRaw);
  if (!window.ok) {
    return NextResponse.json({ error: window.error }, { status: 400 });
  }

  const irsRateRaw = process.env.IRS_MILEAGE_CENTS_PER_MILE;
  const irsRate =
    irsRateRaw && /^\d+$/.test(irsRateRaw)
      ? parseInt(irsRateRaw, 10)
      : DEFAULT_IRS_MILEAGE_CENTS_PER_MILE;

  // Build the receipts query incrementally so the status filter
  // narrows the SQL where-clause when the caller asks for one
  // specific bucket. Default ('all') still pulls approved + exported.
  const statusSet =
    statusFilter === 'approved'
      ? ['approved']
      : statusFilter === 'exported'
        ? ['exported']
        : ['approved', 'exported'];

  // ── Parallel fetch ─────────────────────────────────────────────────────
  const [receiptsRes, segmentsRes, usersRes, vehiclesRes] = await Promise.all([
    supabaseAdmin
      .from('receipts')
      // Soft-deleted (Batch CC) + rejected + pending excluded — only
      // approved/exported rows count toward deductions.
      .select(
        'id, user_id, vendor_name, category, tax_deductible_flag, total_cents, status, deleted_at, transaction_at, created_at, exported_at, exported_period'
      )
      .in('status', statusSet)
      .is('deleted_at', null)
      .gte('created_at', window.fromIso)
      .lte('created_at', window.toIso),
    supabaseAdmin
      .from('location_segments')
      .select('user_id, vehicle_id, distance_meters, is_business')
      .gte('started_at', window.fromIso)
      .lte('started_at', window.toIso),
    supabaseAdmin.from('registered_users').select('id, email, name'),
    supabaseAdmin.from('vehicles').select('id, name, license_plate'),
  ]);

  if (receiptsRes.error) {
    return NextResponse.json(
      { error: `receipts fetch: ${receiptsRes.error.message}` },
      { status: 500 }
    );
  }
  if (segmentsRes.error) {
    return NextResponse.json(
      { error: `segments fetch: ${segmentsRes.error.message}` },
      { status: 500 }
    );
  }
  if (usersRes.error) {
    return NextResponse.json(
      { error: `users fetch: ${usersRes.error.message}` },
      { status: 500 }
    );
  }
  if (vehiclesRes.error) {
    return NextResponse.json(
      { error: `vehicles fetch: ${vehiclesRes.error.message}` },
      { status: 500 }
    );
  }

  const receipts = (receiptsRes.data ?? []) as ReceiptRow[];
  const segments = (segmentsRes.data ?? []) as SegmentRow[];
  const usersById = new Map<string, UserLite>(
    ((usersRes.data ?? []) as UserLite[]).map((u) => [u.id, u])
  );
  const vehiclesById = new Map<string, VehicleLite>(
    ((vehiclesRes.data ?? []) as VehicleLite[]).map((v) => [v.id, v])
  );

  // ── Receipt aggregations ──────────────────────────────────────────────
  let receiptTotalCents = 0;
  const byCategory = new Map<
    string,
    { count: number; total_cents: number; deductible_cents: number }
  >();
  const byTaxFlag = new Map<
    string,
    { count: number; total_cents: number; deductible_cents: number }
  >();
  const byVendor = new Map<
    string,
    { count: number; total_cents: number }
  >();
  const byUserReceipts = new Map<
    string,
    { count: number; total_cents: number }
  >();
  // Anti-double-counting split. 'approved' = ready to be locked into
  // a period; 'exported' = already filed (don't re-count next time).
  const byStatus = {
    approved: { count: 0, total_cents: 0, deductible_cents: 0 },
    exported: { count: 0, total_cents: 0, deductible_cents: 0 },
  };
  // Audit hint — which prior periods are these exported rows tagged
  // to? Lets the bookkeeper spot mis-tags ("why is a 2024-Q1 receipt
  // showing in this 2025 export?") without leaving the page.
  const byExportedPeriod = new Map<
    string,
    { count: number; total_cents: number }
  >();

  for (const r of receipts) {
    const total = r.total_cents ?? 0;
    receiptTotalCents += total;

    const cat = (r.category ?? 'other').trim() || 'other';
    const ded = Math.round(total * deductibleFraction(r.tax_deductible_flag));

    const catBucket =
      byCategory.get(cat) ?? { count: 0, total_cents: 0, deductible_cents: 0 };
    catBucket.count += 1;
    catBucket.total_cents += total;
    catBucket.deductible_cents += ded;
    byCategory.set(cat, catBucket);

    const flag = (r.tax_deductible_flag ?? 'review').trim() || 'review';
    const flagBucket =
      byTaxFlag.get(flag) ?? { count: 0, total_cents: 0, deductible_cents: 0 };
    flagBucket.count += 1;
    flagBucket.total_cents += total;
    flagBucket.deductible_cents += ded;
    byTaxFlag.set(flag, flagBucket);

    const vendor = (r.vendor_name ?? '').trim();
    if (vendor) {
      const vBucket = byVendor.get(vendor) ?? { count: 0, total_cents: 0 };
      vBucket.count += 1;
      vBucket.total_cents += total;
      byVendor.set(vendor, vBucket);
    }

    if (r.user_id) {
      const u = byUserReceipts.get(r.user_id) ?? { count: 0, total_cents: 0 };
      u.count += 1;
      u.total_cents += total;
      byUserReceipts.set(r.user_id, u);
    }

    // Status bucket — treat status='exported' as locked even if the
    // exported_at column is somehow null (shouldn't happen post-232,
    // but defensive). Anything else (status='approved') falls into
    // the "ready to lock" bucket.
    const isExported = r.status === 'exported';
    const sBucket = isExported ? byStatus.exported : byStatus.approved;
    sBucket.count += 1;
    sBucket.total_cents += total;
    sBucket.deductible_cents += ded;

    if (isExported) {
      const periodKey = (r.exported_period ?? '(unlabeled)').trim() || '(unlabeled)';
      const pBucket =
        byExportedPeriod.get(periodKey) ?? { count: 0, total_cents: 0 };
      pBucket.count += 1;
      pBucket.total_cents += total;
      byExportedPeriod.set(periodKey, pBucket);
    }
  }

  let receiptDeductibleCents = 0;
  const byCategoryArr = [...byCategory.entries()]
    .map(([category, b]) => {
      receiptDeductibleCents += b.deductible_cents;
      return {
        category,
        count: b.count,
        total_cents: b.total_cents,
        deductible_cents: b.deductible_cents,
        schedule_c_line: SCHEDULE_C_LINE[category] ?? '27a — Other expenses',
      };
    })
    .sort((a, b) => b.total_cents - a.total_cents);

  const byTaxFlagArr = [...byTaxFlag.entries()]
    .map(([flag, b]) => ({
      flag,
      count: b.count,
      total_cents: b.total_cents,
      deductible_cents: b.deductible_cents,
    }))
    .sort((a, b) => b.total_cents - a.total_cents);

  const topVendorsArr = [...byVendor.entries()]
    .map(([vendor_name, b]) => ({
      vendor_name,
      count: b.count,
      total_cents: b.total_cents,
    }))
    .sort((a, b) => b.total_cents - a.total_cents)
    .slice(0, 10);

  const byUserReceiptsArr = [...byUserReceipts.entries()]
    .map(([user_id, b]) => {
      const u = usersById.get(user_id);
      return {
        email: u?.email ?? '(unknown)',
        name: u?.name ?? null,
        count: b.count,
        total_cents: b.total_cents,
      };
    })
    .sort((a, b) => b.total_cents - a.total_cents);

  const exportedPeriodsArr = [...byExportedPeriod.entries()]
    .map(([exported_period, b]) => ({
      exported_period,
      count: b.count,
      total_cents: b.total_cents,
    }))
    .sort((a, b) => b.total_cents - a.total_cents);

  // ── Mileage aggregation ───────────────────────────────────────────────
  const METERS_PER_MILE = 1609.344;
  let totalMeters = 0;
  const milesByUser = new Map<string, number>();
  const milesByVehicle = new Map<string, number>();
  for (const s of segments) {
    if (s.is_business === false) continue; // explicit non-business skip
    const m = s.distance_meters ?? 0;
    if (m <= 0) continue;
    totalMeters += m;
    if (s.user_id) {
      milesByUser.set(s.user_id, (milesByUser.get(s.user_id) ?? 0) + m);
    }
    if (s.vehicle_id) {
      milesByVehicle.set(
        s.vehicle_id,
        (milesByVehicle.get(s.vehicle_id) ?? 0) + m
      );
    }
  }
  const metersToMiles = (m: number) => m / METERS_PER_MILE;
  const milesToCents = (mi: number) => Math.round(mi * irsRate);

  const totalMiles = metersToMiles(totalMeters);
  const mileageDeductionCents = milesToCents(totalMiles);

  const mileageByUserArr = [...milesByUser.entries()]
    .map(([user_id, m]) => {
      const miles = metersToMiles(m);
      const u = usersById.get(user_id);
      return {
        email: u?.email ?? '(unknown)',
        miles: round2(miles),
        deduction_cents: milesToCents(miles),
      };
    })
    .sort((a, b) => b.miles - a.miles);

  const mileageByVehicleArr = [...milesByVehicle.entries()]
    .map(([vehicle_id, m]) => {
      const miles = metersToMiles(m);
      const v = vehiclesById.get(vehicle_id);
      return {
        vehicle_id,
        name: v?.name ?? '(deleted vehicle)',
        miles: round2(miles),
        deduction_cents: milesToCents(miles),
      };
    })
    .sort((a, b) => b.miles - a.miles);

  // ── Compose response ──────────────────────────────────────────────────
  const payload = {
    period: {
      year: window.year,
      from: window.fromIso,
      to: window.toIso,
    },
    irs_rate_cents_per_mile: irsRate,
    status_filter: statusFilter,
    receipts: {
      total_cents: receiptTotalCents,
      count: receipts.length,
      by_status: byStatus,
      by_category: byCategoryArr,
      by_tax_flag: byTaxFlagArr,
      top_vendors: topVendorsArr,
      by_user: byUserReceiptsArr,
      exported_periods: exportedPeriodsArr,
    },
    mileage: {
      total_miles: round2(totalMiles),
      deduction_cents: mileageDeductionCents,
      by_user: mileageByUserArr,
      by_vehicle: mileageByVehicleArr,
    },
    totals: {
      deductible_cents: receiptDeductibleCents + mileageDeductionCents,
      expense_cents: receiptTotalCents,
    },
  };

  if (format === 'csv') {
    const csv = renderCsv(payload);
    const filename = `tax_summary_${window.label}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.json(payload);
}, { routeName: 'admin/finances/tax-summary' });

// ── Helpers ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function csvEscape(s: string | number | null | undefined): string {
  const v = String(s ?? '');
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

interface WindowOk {
  ok: true;
  year: number | null;
  fromIso: string;
  toIso: string;
  label: string;
}
interface WindowErr {
  ok: false;
  error: string;
}

function resolveWindow(
  yearRaw: string | null,
  fromRaw: string | null,
  toRaw: string | null
): WindowOk | WindowErr {
  // ?from=&to= overrides ?year= when both shapes are present.
  if (fromRaw && toRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromRaw) || !/^\d{4}-\d{2}-\d{2}$/.test(toRaw)) {
      return {
        ok: false,
        error: '`from` and `to` must be YYYY-MM-DD.',
      };
    }
    return {
      ok: true,
      year: null,
      fromIso: `${fromRaw}T00:00:00.000Z`,
      toIso: `${toRaw}T23:59:59.999Z`,
      label: `${fromRaw}_to_${toRaw}`,
    };
  }
  const year = yearRaw && /^\d{4}$/.test(yearRaw)
    ? parseInt(yearRaw, 10)
    : new Date().getFullYear();
  if (year < 2000 || year > 2100) {
    return { ok: false, error: 'Invalid year.' };
  }
  return {
    ok: true,
    year,
    fromIso: `${year}-01-01T00:00:00.000Z`,
    toIso: `${year}-12-31T23:59:59.999Z`,
    label: String(year),
  };
}

interface CsvPayload {
  period: { year: number | null; from: string; to: string };
  irs_rate_cents_per_mile: number;
  status_filter: 'approved' | 'exported' | 'all';
  receipts: {
    total_cents: number;
    count: number;
    by_status: {
      approved: { count: number; total_cents: number; deductible_cents: number };
      exported: { count: number; total_cents: number; deductible_cents: number };
    };
    by_category: Array<{
      category: string;
      count: number;
      total_cents: number;
      deductible_cents: number;
      schedule_c_line: string;
    }>;
    by_tax_flag: Array<{
      flag: string;
      count: number;
      total_cents: number;
      deductible_cents: number;
    }>;
    top_vendors: Array<{
      vendor_name: string;
      count: number;
      total_cents: number;
    }>;
    by_user: Array<{
      email: string;
      name: string | null;
      count: number;
      total_cents: number;
    }>;
    exported_periods: Array<{
      exported_period: string;
      count: number;
      total_cents: number;
    }>;
  };
  mileage: {
    total_miles: number;
    deduction_cents: number;
    by_user: Array<{ email: string; miles: number; deduction_cents: number }>;
    by_vehicle: Array<{
      vehicle_id: string;
      name: string;
      miles: number;
      deduction_cents: number;
    }>;
  };
  totals: { deductible_cents: number; expense_cents: number };
}

function renderCsv(p: CsvPayload): string {
  const lines: string[] = [];
  // Header block — period + rate context for the CPA.
  lines.push(`# Starr Field tax summary`);
  lines.push(`# Period,${csvEscape(p.period.from)},${csvEscape(p.period.to)}`);
  lines.push(`# IRS mileage rate (cents per mile),${p.irs_rate_cents_per_mile}`);
  lines.push(`# Status filter,${csvEscape(p.status_filter)}`);
  lines.push('');

  // Section: anti-double-counting status split. Always emitted so
  // whoever reads the CSV downstream can see at a glance how many
  // rows are new vs already filed.
  lines.push('Section,Status,,Count,Total ($),Deductible ($)');
  lines.push(
    [
      'By status',
      'approved (new, ready to lock)',
      '',
      p.receipts.by_status.approved.count,
      dollars(p.receipts.by_status.approved.total_cents),
      dollars(p.receipts.by_status.approved.deductible_cents),
    ].join(',')
  );
  lines.push(
    [
      'By status',
      'exported (already filed)',
      '',
      p.receipts.by_status.exported.count,
      dollars(p.receipts.by_status.exported.total_cents),
      dollars(p.receipts.by_status.exported.deductible_cents),
    ].join(',')
  );
  lines.push('');

  // Section: Receipts by Schedule C line.
  lines.push('Section,Schedule C line,Category,Count,Total ($),Deductible ($)');
  for (const c of p.receipts.by_category) {
    lines.push(
      [
        'Receipts',
        csvEscape(c.schedule_c_line),
        csvEscape(c.category),
        c.count,
        dollars(c.total_cents),
        dollars(c.deductible_cents),
      ].join(',')
    );
  }
  lines.push(
    [
      'Receipts',
      'TOTAL',
      'all',
      p.receipts.count,
      dollars(p.receipts.total_cents),
      dollars(
        p.receipts.by_category.reduce((s, c) => s + c.deductible_cents, 0)
      ),
    ].join(',')
  );
  lines.push('');

  // Section: receipts by tax_deductible_flag (audit cross-check).
  lines.push('Section,Tax flag,,Count,Total ($),Deductible ($)');
  for (const f of p.receipts.by_tax_flag) {
    lines.push(
      [
        'Receipts',
        csvEscape(f.flag),
        '',
        f.count,
        dollars(f.total_cents),
        dollars(f.deductible_cents),
      ].join(',')
    );
  }
  lines.push('');

  // Section: top vendors.
  lines.push('Section,Vendor,,Count,Total ($)');
  for (const v of p.receipts.top_vendors) {
    lines.push(
      [
        'Vendors',
        csvEscape(v.vendor_name),
        '',
        v.count,
        dollars(v.total_cents),
      ].join(',')
    );
  }
  lines.push('');

  // Section: receipts per user.
  lines.push('Section,Submitter email,Name,Count,Total ($)');
  for (const u of p.receipts.by_user) {
    lines.push(
      [
        'Per-user',
        csvEscape(u.email),
        csvEscape(u.name),
        u.count,
        dollars(u.total_cents),
      ].join(',')
    );
  }
  lines.push('');

  // Section: prior-period traceback for any exported rows in the
  // window — empty if no rows have been locked yet.
  if (p.receipts.exported_periods.length > 0) {
    lines.push('Section,Prior export period,,Count,Total ($)');
    for (const ep of p.receipts.exported_periods) {
      lines.push(
        [
          'Prior export',
          csvEscape(ep.exported_period),
          '',
          ep.count,
          dollars(ep.total_cents),
        ].join(',')
      );
    }
    lines.push('');
  }

  // Section: mileage.
  lines.push('Section,Subject,,Miles,Deduction ($)');
  lines.push(
    [
      'Mileage',
      'TOTAL',
      '',
      p.mileage.total_miles.toFixed(2),
      dollars(p.mileage.deduction_cents),
    ].join(',')
  );
  for (const u of p.mileage.by_user) {
    lines.push(
      [
        'Mileage by user',
        csvEscape(u.email),
        '',
        u.miles.toFixed(2),
        dollars(u.deduction_cents),
      ].join(',')
    );
  }
  for (const v of p.mileage.by_vehicle) {
    lines.push(
      [
        'Mileage by vehicle',
        csvEscape(v.name),
        '',
        v.miles.toFixed(2),
        dollars(v.deduction_cents),
      ].join(',')
    );
  }
  lines.push('');

  // Bottom-line totals.
  lines.push('Section,,,,,');
  lines.push(
    [
      'GRAND TOTAL',
      '',
      'Total deductible',
      '',
      dollars(p.totals.deductible_cents),
      dollars(p.totals.deductible_cents),
    ].join(',')
  );
  lines.push(
    [
      'GRAND TOTAL',
      '',
      'Total expense (gross)',
      '',
      dollars(p.totals.expense_cents),
      '',
    ].join(',')
  );

  return lines.join('\n') + '\n';
}
