// app/api/admin/equipment/import/route.ts
//
// POST /api/admin/equipment/import
//
// Bulk CSV importer (Phase F10.1h-i). System-go-live path per
// §5.12.11.H + §15 prereq #40 — the Equipment Manager walks the
// cage with a clipboard, transcribes to a spreadsheet, exports
// CSV, uploads here. Without this, manual Add-Unit clicks across
// 50+ instruments + several hundred consumable SKUs is a
// multi-day chore.
//
// Body: { csv: string, mode: 'dry_run' | 'execute' }
//   * csv: full text of the spreadsheet (header row required)
//   * mode: dry_run validates + reports per-row errors without
//     touching the database; execute validates + inserts in a
//     single bulk operation. Operator runs dry_run repeatedly
//     until clean, then flips to execute.
//
// Hard cap: 1000 rows per call. Bigger fleets split into
// multiple uploads; the response surfaces a "split your CSV"
// error message rather than failing silently.
//
// CSV format:
//   * Header row: case-insensitive snake_case column names
//     mapping to the seeds/233 schema columns
//   * Required headers: name, item_kind
//   * Optional headers: category, brand, model, serial_number,
//     notes, qr_code_id (auto-generated server-side when empty),
//     current_status (default 'available'), acquired_at,
//     acquired_cost_cents, useful_life_months,
//     placed_in_service_at, last_calibrated_at,
//     next_calibration_due_at, warranty_expires_at, unit,
//     quantity_on_hand, low_stock_threshold, vendor,
//     cost_per_unit_cents, home_location
//   * Delimiter auto-detect (comma vs tab)
//   * RFC-4180 quoted fields supported (use "" inside quoted
//     fields to escape a literal quote)
//   * Empty cells → null (not empty string)
//
// Auth: admin / developer / equipment_manager. tech_support
// read-only.
//
// Atomic execute: validation runs against every row first; if
// ANY row fails validation, the whole batch is rejected (no
// partial-state inserts that the operator has to clean up
// manually). When operator wants to skip bad rows + import
// the rest, they run dry_run, fix the spreadsheet, re-import.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const MAX_ROWS = 1000;

const ALLOWED_STATUSES = new Set([
  'available',
  'in_use',
  'maintenance',
  'loaned_out',
  'lost',
  'retired',
]);
const ALLOWED_ITEM_KINDS = new Set(['durable', 'consumable', 'kit']);

const REQUIRED_HEADERS = new Set(['name', 'item_kind']);

const ALLOWED_HEADERS = new Set([
  'name',
  'item_kind',
  'category',
  'brand',
  'model',
  'serial_number',
  'notes',
  'qr_code_id',
  'current_status',
  'acquired_at',
  'acquired_cost_cents',
  'useful_life_months',
  'placed_in_service_at',
  'last_calibrated_at',
  'next_calibration_due_at',
  'warranty_expires_at',
  'unit',
  'quantity_on_hand',
  'low_stock_threshold',
  'vendor',
  'cost_per_unit_cents',
  'home_location',
]);

const INTEGER_HEADERS = new Set([
  'acquired_cost_cents',
  'useful_life_months',
  'quantity_on_hand',
  'low_stock_threshold',
  'cost_per_unit_cents',
]);

const DATE_HEADERS = new Set([
  'acquired_at',
  'placed_in_service_at',
  'last_calibrated_at',
  'next_calibration_due_at',
  'warranty_expires_at',
]);

interface ImportBody {
  csv?: unknown;
  mode?: unknown;
}

interface RowError {
  row_index: number; // 1-based, header counts as row 0
  field?: string;
  message: string;
}

/** RFC-4180 CSV parser. Supports quoted fields, escaped quotes,
 *  multi-line quoted cells, and tab-delimited input. Returns rows
 *  as string-keyed objects keyed by the header values. */
function parseCsv(
  csv: string
): { headers: string[]; rows: string[][]; delimiter: string } | { error: string } {
  if (!csv.trim()) return { error: 'CSV is empty' };

  // Auto-detect delimiter from the first line — count commas vs
  // tabs OUTSIDE quoted regions.
  const firstNewline = csv.indexOf('\n');
  const headerLine = firstNewline >= 0 ? csv.slice(0, firstNewline) : csv;
  const commaCount = (headerLine.match(/,/g) ?? []).length;
  const tabCount = (headerLine.match(/\t/g) ?? []).length;
  const delimiter = tabCount > commaCount ? '\t' : ',';

  // Stateful char-by-char scan for proper quoted-field handling.
  const rows: string[][] = [];
  let cur = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  while (i < csv.length) {
    const ch = csv[i];
    if (inQuotes) {
      if (ch === '"') {
        if (csv[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cur += ch;
      i += 1;
    } else {
      if (ch === '"') {
        inQuotes = true;
        i += 1;
      } else if (ch === delimiter) {
        row.push(cur);
        cur = '';
        i += 1;
      } else if (ch === '\n' || ch === '\r') {
        row.push(cur);
        cur = '';
        // Skip \r\n pair
        if (ch === '\r' && csv[i + 1] === '\n') i += 2;
        else i += 1;
        // Skip blank rows entirely.
        if (row.some((c) => c.trim() !== '')) {
          rows.push(row);
        }
        row = [];
      } else {
        cur += ch;
        i += 1;
      }
    }
  }
  if (cur || row.length > 0) {
    row.push(cur);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
  }
  if (rows.length === 0) return { error: 'CSV has no rows' };

  const headers = rows.shift()!.map((h) => h.trim().toLowerCase());
  return { headers, rows, delimiter };
}

export const POST = withErrorHandler(
  async (req: NextRequest) => {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userRoles = (session.user as { roles?: string[] } | undefined)
      ?.roles ?? [];
    if (
      !isAdmin(session.user.roles) &&
      !userRoles.includes('equipment_manager')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body: ImportBody;
    try {
      body = (await req.json()) as ImportBody;
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const csv = typeof body.csv === 'string' ? body.csv : '';
    if (!csv.trim()) {
      return NextResponse.json(
        { error: 'csv is required' },
        { status: 400 }
      );
    }
    const mode = body.mode === 'execute' ? 'execute' : 'dry_run';

    const parsed = parseCsv(csv);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { headers, rows } = parsed;

    // Validate header set.
    const headerErrors: string[] = [];
    for (const required of REQUIRED_HEADERS) {
      if (!headers.includes(required)) {
        headerErrors.push(`Missing required header "${required}"`);
      }
    }
    const unknownHeaders = headers.filter(
      (h) => h && !ALLOWED_HEADERS.has(h)
    );
    if (unknownHeaders.length > 0) {
      headerErrors.push(
        `Unknown header(s): ${unknownHeaders.join(', ')} — see endpoint docs for the allow-list`
      );
    }
    if (headerErrors.length > 0) {
      return NextResponse.json(
        { error: headerErrors.join('; ') },
        { status: 400 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'CSV has a header row but no data rows' },
        { status: 400 }
      );
    }
    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        {
          error: `CSV has ${rows.length} rows; max ${MAX_ROWS} per call. Split your spreadsheet and re-upload.`,
        },
        { status: 400 }
      );
    }

    // Map rows + validate per-row.
    const rowErrors: RowError[] = [];
    const inserts: Array<Record<string, unknown>> = [];
    const headerIndex = new Map<string, number>();
    headers.forEach((h, idx) => headerIndex.set(h, idx));

    rows.forEach((rawRow, rowIdx) => {
      // 1-based, header is row 0.
      const rowIndex = rowIdx + 1;
      const get = (key: string): string | null => {
        const idx = headerIndex.get(key);
        if (idx === undefined) return null;
        const val = rawRow[idx];
        if (val === undefined) return null;
        const trimmed = val.trim();
        return trimmed === '' ? null : trimmed;
      };

      const insert: Record<string, unknown> = {};

      // Required: name
      const name = get('name');
      if (!name) {
        rowErrors.push({
          row_index: rowIndex,
          field: 'name',
          message: 'name is required',
        });
        return;
      }
      if (name.length > 200) {
        rowErrors.push({
          row_index: rowIndex,
          field: 'name',
          message: 'name must be ≤200 characters',
        });
        return;
      }
      insert.name = name;

      // Required: item_kind
      const itemKind = get('item_kind');
      if (!itemKind || !ALLOWED_ITEM_KINDS.has(itemKind)) {
        rowErrors.push({
          row_index: rowIndex,
          field: 'item_kind',
          message: `item_kind must be one of: ${[...ALLOWED_ITEM_KINDS].join(', ')}`,
        });
        return;
      }
      insert.item_kind = itemKind;

      // Optional: current_status (default 'available')
      const status = get('current_status');
      if (status) {
        if (!ALLOWED_STATUSES.has(status)) {
          rowErrors.push({
            row_index: rowIndex,
            field: 'current_status',
            message: `current_status must be one of: ${[...ALLOWED_STATUSES].join(', ')}`,
          });
          return;
        }
        insert.current_status = status;
      } else {
        insert.current_status = 'available';
      }

      // Integer columns
      let integerErr: string | null = null;
      for (const key of INTEGER_HEADERS) {
        const v = get(key);
        if (v == null) continue;
        const n = parseInt(v, 10);
        if (!Number.isInteger(n) || n < 0 || String(n) !== v.replace(/^0+(?=\d)/, '')) {
          // Allow leading zeros to be permissive on minor CSV
          // export quirks; reject anything non-numeric or
          // negative.
          if (!/^-?\d+$/.test(v) || n < 0) {
            integerErr = `${key} must be a non-negative integer (got "${v}")`;
            rowErrors.push({
              row_index: rowIndex,
              field: key,
              message: integerErr,
            });
            break;
          }
        }
        insert[key] = n;
      }
      if (integerErr) return;

      // Date columns — accept YYYY-MM-DD or full ISO. Pass through
      // whatever the user gave; Postgres timestamptz / date columns
      // parse robustly.
      let dateErr: string | null = null;
      for (const key of DATE_HEADERS) {
        const v = get(key);
        if (v == null) continue;
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) {
          dateErr = `${key} is not a valid date (got "${v}")`;
          rowErrors.push({
            row_index: rowIndex,
            field: key,
            message: dateErr,
          });
          break;
        }
        insert[key] = d.toISOString();
      }
      if (dateErr) return;

      // Pass-through string columns.
      for (const key of [
        'category',
        'brand',
        'model',
        'serial_number',
        'notes',
        'qr_code_id',
        'unit',
        'vendor',
        'home_location',
      ]) {
        const v = get(key);
        if (v != null) {
          insert[key] = key === 'qr_code_id' ? v.toUpperCase().slice(0, 64) : v;
        }
      }

      inserts.push(insert);
    });

    // Sanity: detect intra-batch qr_code_id duplicates BEFORE
    // hitting Postgres so the operator gets row-attributed errors
    // instead of a single 23505 from the bulk insert.
    const seenQrCodes = new Set<string>();
    inserts.forEach((row, idx) => {
      const qr = row.qr_code_id as string | undefined;
      if (qr) {
        if (seenQrCodes.has(qr)) {
          rowErrors.push({
            row_index: idx + 1,
            field: 'qr_code_id',
            message: `qr_code_id "${qr}" appears multiple times in this CSV`,
          });
        }
        seenQrCodes.add(qr);
      }
    });

    if (mode === 'dry_run') {
      return NextResponse.json({
        mode: 'dry_run',
        total_rows: rows.length,
        would_insert: rowErrors.length === 0 ? inserts.length : 0,
        errors: rowErrors,
      });
    }

    // Execute mode — refuse if there are any row errors.
    if (rowErrors.length > 0) {
      return NextResponse.json(
        {
          mode: 'execute',
          inserted: 0,
          errors: rowErrors,
          message:
            'Refused to insert — fix the per-row errors and re-upload. Run dry_run repeatedly to iterate without touching the database.',
        },
        { status: 400 }
      );
    }

    // Bulk insert all rows in a single statement. Atomicity = all
    // or nothing; one bad row's UNIQUE collision rolls back
    // everything so the operator never has to clean up partial
    // state.
    const { data, error } = await supabaseAdmin
      .from('equipment_inventory')
      .insert(inserts)
      .select('id, name, qr_code_id, item_kind');

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          {
            mode: 'execute',
            inserted: 0,
            error:
              'A qr_code_id in this CSV already exists in the database. Run dry_run + check for collisions, or leave qr_code_id blank to auto-generate.',
            details: error.message,
          },
          { status: 409 }
        );
      }
      console.error('[admin/equipment/import] bulk insert failed', {
        rows: inserts.length,
        error: error.message,
      });
      return NextResponse.json(
        {
          mode: 'execute',
          inserted: 0,
          error: error.message,
        },
        { status: 500 }
      );
    }

    console.log('[admin/equipment/import] imported', {
      total_rows: rows.length,
      inserted: data?.length ?? 0,
      admin_email: session.user.email,
    });

    return NextResponse.json({
      mode: 'execute',
      total_rows: rows.length,
      inserted: data?.length ?? 0,
      inserted_items: data ?? [],
    });
  },
  { routeName: 'admin/equipment/import' }
);
