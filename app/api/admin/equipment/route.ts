// app/api/admin/equipment/route.ts
//
// GET /api/admin/equipment?status=&category=&include_retired=1&item_kind=&q=&limit=
//
// Inventory catalogue read endpoint — Phase F10.1a, the read-side
// foundation that the F10.1b admin page + F10.1i mobile scanner
// resolver both consume.
//
// Reads the seeds/233 columns landed in Phase F10.0a-i. The
// existing /api/admin/jobs/equipment route's `?inventory=true`
// branch returns the SAME table but with the legacy column set;
// keeping that route alive for the existing job-detail loadout
// surface while this new namespace owns the F10.1+ admin UI.
//
// Filters:
//   * `status` — narrow to one current_status value (available,
//     in_use, maintenance, loaned_out, lost, retired)
//   * `category` — narrow to one category string
//   * `item_kind` — durable | consumable | kit
//   * `include_retired=1` — by default we filter retired_at IS
//     NULL; pass this flag to include tombstoned rows for the
//     audit-trail toggle on the admin page
//   * `q` — case-insensitive substring match on name OR
//     serial_number OR model
//   * `limit` — default 200, max 1000 (sanity-cap for the grid view)
//
// Response: `{ items: EquipmentRow[], total_count, filters_applied }`.
// total_count is the unfiltered count (pre-q, pre-status); helps
// the page render "Showing N of M" without a second roundtrip.
//
// Auth: admin / developer / tech_support / equipment_manager.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const ALLOWED_STATUSES = new Set([
  'available',
  'in_use',
  'maintenance',
  'loaned_out',
  'lost',
  'retired',
]);

const ALLOWED_ITEM_KINDS = new Set(['durable', 'consumable', 'kit']);

interface EquipmentRow {
  id: string;
  name: string | null;
  category: string | null;
  item_kind: string | null;
  current_status: string | null;
  qr_code_id: string | null;
  manufacturer?: string | null;
  brand?: string | null;
  model?: string | null;
  serial_number?: string | null;
  notes?: string | null;
  // Cost basis (seeds/233)
  acquired_at: string | null;
  acquired_cost_cents: number | null;
  useful_life_months: number | null;
  placed_in_service_at: string | null;
  // Calibration / warranty (seeds/233)
  last_calibrated_at: string | null;
  next_calibration_due_at: string | null;
  warranty_expires_at: string | null;
  service_contract_vendor: string | null;
  last_serviced_at: string | null;
  // Consumable accounting (seeds/233)
  unit: string | null;
  quantity_on_hand: number | null;
  low_stock_threshold: number | null;
  last_restocked_at: string | null;
  vendor: string | null;
  cost_per_unit_cents: number | null;
  // Location (seeds/233)
  home_location: string | null;
  vehicle_id: string | null;
  // Personal kit (seeds/233 / §5.12.9.4)
  is_personal: boolean;
  owner_user_id: string | null;
  // Soft-delete (seeds/233)
  retired_at: string | null;
  retired_reason: string | null;
  serial_suspect: boolean;
  // Audit
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS =
  'id, name, category, item_kind, current_status, qr_code_id, ' +
  'brand, model, serial_number, notes, ' +
  'acquired_at, acquired_cost_cents, useful_life_months, ' +
  'placed_in_service_at, ' +
  'last_calibrated_at, next_calibration_due_at, warranty_expires_at, ' +
  'service_contract_vendor, last_serviced_at, ' +
  'unit, quantity_on_hand, low_stock_threshold, last_restocked_at, ' +
  'vendor, cost_per_unit_cents, ' +
  'home_location, vehicle_id, ' +
  'is_personal, owner_user_id, ' +
  'retired_at, retired_reason, serial_suspect, ' +
  'created_at, updated_at';

export const GET = withErrorHandler(
  async (req: NextRequest) => {
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
    const statusRaw = searchParams.get('status');
    const categoryRaw = searchParams.get('category');
    const itemKindRaw = searchParams.get('item_kind');
    const includeRetired = searchParams.get('include_retired') === '1';
    const qRaw = searchParams.get('q');
    const limitRaw = searchParams.get('limit');

    const limit = (() => {
      if (!limitRaw) return DEFAULT_LIMIT;
      const n = parseInt(limitRaw, 10);
      if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
      return Math.min(n, MAX_LIMIT);
    })();

    // Build the query incrementally so we can apply filters
    // conditionally + still answer total_count via a count() probe
    // against the same WHERE shape sans `q` / status (so the
    // bookkeeper sees stable "Showing N of M" totals when they
    // narrow the search).
    let query = supabaseAdmin
      .from('equipment_inventory')
      .select(SELECT_COLUMNS)
      .order('name', { ascending: true })
      .limit(limit);

    if (!includeRetired) {
      query = query.is('retired_at', null);
    }

    if (statusRaw && ALLOWED_STATUSES.has(statusRaw)) {
      query = query.eq('current_status', statusRaw);
    }
    if (categoryRaw) {
      query = query.eq('category', categoryRaw);
    }
    if (itemKindRaw && ALLOWED_ITEM_KINDS.has(itemKindRaw)) {
      query = query.eq('item_kind', itemKindRaw);
    }
    if (qRaw && qRaw.trim()) {
      // Case-insensitive substring across name + model + serial.
      // Supabase OR uses comma-separated PostgREST filter strings.
      const escaped = qRaw.trim().replace(/[%,]/g, '');
      query = query.or(
        `name.ilike.%${escaped}%,model.ilike.%${escaped}%,serial_number.ilike.%${escaped}%`
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error('[admin/equipment] read failed', {
        error: error.message,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // total_count probe — visible-rows count w/ retired filter only
    // (so narrowing by status doesn't move the denominator). One
    // round-trip; bookkeeper reads "Showing N of M" without a
    // separate page hit.
    let totalCount: number | null = null;
    {
      let countQuery = supabaseAdmin
        .from('equipment_inventory')
        .select('id', { count: 'exact', head: true });
      if (!includeRetired) {
        countQuery = countQuery.is('retired_at', null);
      }
      const { count, error: countErr } = await countQuery;
      if (!countErr) totalCount = count;
    }

    return NextResponse.json({
      items: (data ?? []) as EquipmentRow[],
      total_count: totalCount,
      filters_applied: {
        status: statusRaw && ALLOWED_STATUSES.has(statusRaw) ? statusRaw : null,
        category: categoryRaw ?? null,
        item_kind:
          itemKindRaw && ALLOWED_ITEM_KINDS.has(itemKindRaw)
            ? itemKindRaw
            : null,
        include_retired: includeRetired,
        q: qRaw ?? null,
      },
      limit,
    });
  },
  { routeName: 'admin/equipment' }
);
