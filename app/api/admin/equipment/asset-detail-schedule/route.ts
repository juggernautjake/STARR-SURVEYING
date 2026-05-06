// app/api/admin/equipment/asset-detail-schedule/route.ts
//
// GET /api/admin/equipment/asset-detail-schedule
//   ?tax_year=YYYY
//   &format=csv|html (default csv)
//
// Phase F10.9 — IRS-Schedule-C-shaped asset listing for a tax
// year. One row per active or disposed asset with cost basis,
// accumulated depreciation, this-year amount, and disposal
// info. The CPA imports the CSV directly into their tax-prep
// software; the HTML view is print-friendly so the bookkeeper
// can browser-print to PDF for the audit binder without
// dragging in a server-side PDF lib.
//
// Data comes from the same `loadEquipmentBlock`-style walk used
// by the F10.9 rollup endpoint + tax-summary block: locked rows
// from `equipment_tax_elections` for the year, falling back to
// live `depreciationForYear()` for unlocked assets. Disposed
// assets within the year ARE included so the gain/loss row
// shows up on the bookkeeper&apos;s schedule.
//
// Auth: admin / developer / bookkeeper / equipment_manager.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  depreciationForYear,
  type DepreciationMethod,
} from '@/lib/equipment/depreciation';

interface AssetRow {
  id: string;
  name: string | null;
  category: string | null;
  acquired_at: string | null;
  acquired_cost_cents: number | null;
  placed_in_service_at: string | null;
  useful_life_months: number | null;
  depreciation_method: DepreciationMethod;
  tax_year_locked_through: number | null;
  disposed_at: string | null;
  disposal_kind: string | null;
  disposal_proceeds_cents: number | null;
  retired_at: string | null;
}

interface ScheduleRow {
  asset_id: string;
  name: string;
  category: string;
  method: string;
  acquired_at: string;
  placed_in_service_at: string;
  cost_basis_cents: number;
  year_amount_cents: number;
  accumulated_through_year_cents: number;
  remaining_basis_cents: number;
  disposed_at: string;
  disposal_kind: string;
  disposal_proceeds_cents: string;
  is_locked: boolean;
}

interface ElectionRow {
  equipment_id: string;
  tax_year: number;
  depreciation_amount_cents: number;
  depreciation_method: DepreciationMethod;
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
    !userRoles.includes('equipment_manager') &&
    !userRoles.includes('bookkeeper')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const taxYearRaw = url.searchParams.get('tax_year');
  const taxYear = taxYearRaw
    ? Number.parseInt(taxYearRaw, 10)
    : new Date().getUTCFullYear();
  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2100) {
    return NextResponse.json(
      { error: '`tax_year` must be a year between 2000 and 2100.' },
      { status: 400 }
    );
  }

  const format = (url.searchParams.get('format') ?? 'csv').toLowerCase();
  if (format !== 'csv' && format !== 'html') {
    return NextResponse.json(
      { error: '`format` must be one of: csv, html.' },
      { status: 400 }
    );
  }

  // ── Read every depreciable asset (active OR disposed in/before
  //    the tax year so the schedule covers in-year disposals) ──
  const { data: assets, error: assetsErr } = await supabaseAdmin
    .from('equipment_inventory')
    .select(
      'id, name, category, acquired_at, acquired_cost_cents, ' +
        'placed_in_service_at, useful_life_months, ' +
        'depreciation_method, tax_year_locked_through, ' +
        'disposed_at, disposal_kind, disposal_proceeds_cents, ' +
        'retired_at'
    )
    .neq('depreciation_method', 'none')
    .gt('acquired_cost_cents', 0);
  if (assetsErr) {
    return NextResponse.json(
      { error: assetsErr.message },
      { status: 500 }
    );
  }
  const assetRows = (assets ?? []) as AssetRow[];

  // Pre-load every locked election row through this tax_year so
  // accumulated depreciation reconciles exactly with what the
  // bookkeeper sees on the fleet valuation page.
  const assetIds = assetRows.map((r) => r.id);
  const electionsByAsset = new Map<string, ElectionRow[]>();
  if (assetIds.length > 0) {
    const { data: elections } = await supabaseAdmin
      .from('equipment_tax_elections')
      .select(
        'equipment_id, tax_year, depreciation_amount_cents, depreciation_method'
      )
      .in('equipment_id', assetIds)
      .lte('tax_year', taxYear);
    for (const e of (elections ?? []) as ElectionRow[]) {
      const list = electionsByAsset.get(e.equipment_id) ?? [];
      list.push(e);
      electionsByAsset.set(e.equipment_id, list);
    }
  }

  // ── Build schedule rows ─────────────────────────────────────
  const rows: ScheduleRow[] = [];
  for (const asset of assetRows) {
    if (!asset.acquired_cost_cents || asset.acquired_cost_cents <= 0) {
      continue;
    }
    const placedAt =
      asset.placed_in_service_at ?? asset.acquired_at ?? null;
    if (!placedAt) continue;

    // Skip rows whose acquisition is in a future year — the
    // schedule only covers years where depreciation actually
    // lands on Schedule C.
    const placedYear = new Date(placedAt).getUTCFullYear();
    if (placedYear > taxYear) continue;

    // Skip rows that were disposed BEFORE this tax year.
    if (asset.disposed_at) {
      const disposedYear = new Date(asset.disposed_at).getUTCFullYear();
      if (disposedYear < taxYear) continue;
    }

    const lockedThrough = asset.tax_year_locked_through ?? 0;
    const elections = electionsByAsset.get(asset.id) ?? [];

    let yearAmount = 0;
    let yearMethod: string = asset.depreciation_method;
    let isLocked = false;

    const lockedThisYear = elections.find((e) => e.tax_year === taxYear);
    if (lockedThisYear) {
      yearAmount = lockedThisYear.depreciation_amount_cents;
      yearMethod = lockedThisYear.depreciation_method;
      isLocked = true;
    } else {
      const yearRow = depreciationForYear(
        {
          acquired_cost_cents: asset.acquired_cost_cents,
          placed_in_service_at: placedAt,
          depreciation_method: asset.depreciation_method,
          useful_life_months: asset.useful_life_months,
        },
        taxYear
      );
      if (yearRow) {
        yearAmount = yearRow.amount_cents;
        yearMethod = yearRow.method;
      }
    }

    // Accumulated through tax year = sum of locked prior + live-
    // computed prior + this year's amount.
    const lockedPriorTotal = elections
      .filter((e) => e.tax_year < taxYear)
      .reduce((sum, e) => sum + e.depreciation_amount_cents, 0);
    const fullSchedule = depreciationFullScheduleSafe(asset);
    const livePriorTotal = fullSchedule
      .filter((r) => r.tax_year > lockedThrough && r.tax_year < taxYear)
      .reduce((sum, r) => sum + r.amount_cents, 0);
    const accumulated = lockedPriorTotal + livePriorTotal + yearAmount;
    const remaining = Math.max(0, asset.acquired_cost_cents - accumulated);

    rows.push({
      asset_id: asset.id,
      name: asset.name ?? '(unnamed)',
      category: asset.category ?? '',
      method: methodLabel(yearMethod),
      acquired_at: (asset.acquired_at ?? '').slice(0, 10),
      placed_in_service_at: placedAt.slice(0, 10),
      cost_basis_cents: asset.acquired_cost_cents,
      year_amount_cents: yearAmount,
      accumulated_through_year_cents: accumulated,
      remaining_basis_cents: remaining,
      disposed_at: (asset.disposed_at ?? '').slice(0, 10),
      disposal_kind: asset.disposal_kind ?? '',
      disposal_proceeds_cents:
        asset.disposal_proceeds_cents !== null
          ? asset.disposal_proceeds_cents.toString()
          : '',
      is_locked: isLocked,
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));

  if (format === 'csv') {
    const csv = renderCsv(taxYear, rows);
    const filename = `asset_detail_schedule_${taxYear}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // format === 'html'
  const html = renderHtml(taxYear, rows);
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}, { routeName: 'admin/equipment/asset-detail-schedule#get' });

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function depreciationFullScheduleSafe(asset: AssetRow): Array<{
  tax_year: number;
  amount_cents: number;
}> {
  const placedAt =
    asset.placed_in_service_at ?? asset.acquired_at ?? null;
  if (!placedAt) return [];
  if (!asset.acquired_cost_cents || asset.acquired_cost_cents <= 0) {
    return [];
  }
  // We need only the tax_year + amount_cents shape; reuse the
  // per-year resolver iteratively rather than recomputing the
  // whole schedule each call. For small N this is fine; if the
  // schedule lengths blow up we&apos;ll memo at the lib layer.
  const startYear = new Date(placedAt).getUTCFullYear();
  const out: Array<{ tax_year: number; amount_cents: number }> = [];
  for (let y = startYear; y < startYear + 40; y += 1) {
    const r = depreciationForYear(
      {
        acquired_cost_cents: asset.acquired_cost_cents,
        placed_in_service_at: placedAt,
        depreciation_method: asset.depreciation_method,
        useful_life_months: asset.useful_life_months,
      },
      y
    );
    if (!r) {
      // No row at this year. The schedule may be short — break
      // when we hit a year with no row AFTER the start year.
      if (y > startYear) break;
      continue;
    }
    out.push({ tax_year: r.tax_year, amount_cents: r.amount_cents });
  }
  return out;
}

function methodLabel(method: string): string {
  const map: Record<string, string> = {
    section_179: 'Section 179',
    straight_line: 'Straight-line',
    macrs_5yr: 'MACRS 5-yr',
    macrs_7yr: 'MACRS 7-yr',
    bonus_first_year: 'Bonus 1st-yr',
    none: 'None',
  };
  return map[method] ?? method;
}

function formatCents(cents: number): string {
  if (cents === 0) return '$0.00';
  return `$${(cents / 100).toFixed(2)}`;
}

function renderCsv(taxYear: number, rows: ScheduleRow[]): string {
  const header = [
    'asset_id',
    'name',
    'category',
    'method',
    'acquired_at',
    'placed_in_service_at',
    'cost_basis',
    `${taxYear}_depreciation`,
    'accumulated_through_year',
    'remaining_basis',
    'disposed_at',
    'disposal_kind',
    'disposal_proceeds',
    'locked',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.asset_id),
        csvEscape(r.name),
        csvEscape(r.category),
        csvEscape(r.method),
        csvEscape(r.acquired_at),
        csvEscape(r.placed_in_service_at),
        (r.cost_basis_cents / 100).toFixed(2),
        (r.year_amount_cents / 100).toFixed(2),
        (r.accumulated_through_year_cents / 100).toFixed(2),
        (r.remaining_basis_cents / 100).toFixed(2),
        csvEscape(r.disposed_at),
        csvEscape(r.disposal_kind),
        r.disposal_proceeds_cents
          ? (Number.parseInt(r.disposal_proceeds_cents, 10) / 100).toFixed(2)
          : '',
        r.is_locked ? 'locked' : 'live',
      ].join(',')
    );
  }
  // Footer totals row.
  const totals = rows.reduce(
    (acc, r) => ({
      cost: acc.cost + r.cost_basis_cents,
      year: acc.year + r.year_amount_cents,
      accum: acc.accum + r.accumulated_through_year_cents,
      remaining: acc.remaining + r.remaining_basis_cents,
    }),
    { cost: 0, year: 0, accum: 0, remaining: 0 }
  );
  lines.push(
    [
      '',
      `TOTAL (${rows.length} assets)`,
      '',
      '',
      '',
      '',
      (totals.cost / 100).toFixed(2),
      (totals.year / 100).toFixed(2),
      (totals.accum / 100).toFixed(2),
      (totals.remaining / 100).toFixed(2),
      '',
      '',
      '',
      '',
    ].join(',')
  );
  return lines.join('\n') + '\n';
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function renderHtml(taxYear: number, rows: ScheduleRow[]): string {
  const totals = rows.reduce(
    (acc, r) => ({
      cost: acc.cost + r.cost_basis_cents,
      year: acc.year + r.year_amount_cents,
      accum: acc.accum + r.accumulated_through_year_cents,
      remaining: acc.remaining + r.remaining_basis_cents,
    }),
    { cost: 0, year: 0, accum: 0, remaining: 0 }
  );
  const generatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const tableRows = rows
    .map((r) => {
      const disposed = r.disposed_at
        ? `<div style="color:#7F1D1D;font-size:11px">disposed ${r.disposed_at} (${r.disposal_kind})${
            r.disposal_proceeds_cents
              ? ` · ${formatCents(Number.parseInt(r.disposal_proceeds_cents, 10))}`
              : ''
          }</div>`
        : '';
      return `
        <tr>
          <td><strong>${escapeHtml(r.name)}</strong>${disposed}</td>
          <td>${escapeHtml(r.category)}</td>
          <td>${escapeHtml(r.method)}${
        r.is_locked
          ? ' <span style="background:#FEE2E2;color:#7F1D1D;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700;text-transform:uppercase;">locked</span>'
          : ''
      }</td>
          <td>${escapeHtml(r.placed_in_service_at)}</td>
          <td style="text-align:right">${formatCents(r.cost_basis_cents)}</td>
          <td style="text-align:right"><strong>${formatCents(r.year_amount_cents)}</strong></td>
          <td style="text-align:right">${formatCents(r.accumulated_through_year_cents)}</td>
          <td style="text-align:right">${formatCents(r.remaining_basis_cents)}</td>
        </tr>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Asset Detail Schedule — ${taxYear}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 24px; max-width: 1100px; margin: 0 auto; color: #111827; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .subtitle { font-size: 13px; color: #6B7280; margin: 0 0 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; padding: 8px 10px; background: #F9FAFB; border-bottom: 2px solid #E2E5EB; font-size: 11px; color: #6B7280; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
    td { padding: 8px 10px; border-bottom: 1px solid #F1F2F4; vertical-align: top; }
    tfoot td { font-weight: 700; background: #F9FAFB; border-top: 2px solid #E2E5EB; }
    .footer { margin-top: 24px; font-size: 11px; color: #9CA3AF; font-style: italic; }
    @media print {
      body { padding: 12px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <h1>Asset Detail Schedule — Tax Year ${taxYear}</h1>
  <p class="subtitle">${rows.length} asset${rows.length === 1 ? '' : 's'} · IRS Schedule C, Line 13 (Depreciation and §179 expense). Locked rows read from <code>equipment_tax_elections</code>; live rows compute via §179 / MACRS / straight-line.</p>
  <table>
    <thead>
      <tr>
        <th>Asset</th>
        <th>Category</th>
        <th>Method</th>
        <th>In Service</th>
        <th style="text-align:right">Cost Basis</th>
        <th style="text-align:right">${taxYear} Amount</th>
        <th style="text-align:right">Accumulated</th>
        <th style="text-align:right">Remaining</th>
      </tr>
    </thead>
    <tbody>
${tableRows}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="4">TOTAL (${rows.length} assets)</td>
        <td style="text-align:right">${formatCents(totals.cost)}</td>
        <td style="text-align:right">${formatCents(totals.year)}</td>
        <td style="text-align:right">${formatCents(totals.accum)}</td>
        <td style="text-align:right">${formatCents(totals.remaining)}</td>
      </tr>
    </tfoot>
  </table>
  <p class="footer">Generated ${generatedAt}. Browser-print to PDF for the audit binder.</p>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
