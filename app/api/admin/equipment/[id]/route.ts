// app/api/admin/equipment/[id]/route.ts
//
// PATCH /api/admin/equipment/{id}
//
// Inline-edit endpoint — Phase F10.1d-i. The Equipment Manager
// edits any writable column on an existing inventory row. The
// F10.1d-ii edit-modal on the catalogue page is the primary
// caller; this endpoint stays generic so future surfaces (mobile
// drilldown, bulk-edit tooling) reuse it.
//
// Body: any subset of the F10.1c POST allow-list. Same enum +
// integer validators run; same 23505 → 409 translation on
// qr_code_id collisions. The endpoint REFUSES to set retired_at
// or retired_reason — those flow through the dedicated retire
// endpoint (F10.1e) so the audit trail can record the
// transition reason consistently.
//
// Auth: admin / developer / equipment_manager. tech_support is
// read-only; same posture as the POST.
//
// On success: returns the updated row in full. On not-found
// (no row matched the id): 404. On enum / integer validation
// failures: 400 with a typed `error` string.
//
// IMPORTANT — concurrency: this endpoint is last-write-wins.
// The §5.12.1 audit log (`equipment_events` from seeds/236)
// captures every change downstream so two admins editing the
// same row leave a paper trail; v1 doesn't add an `If-Match`
// ETag check (overkill for the cage manager use case).

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const ALLOWED_STATUSES = new Set([
  'available',
  'in_use',
  'maintenance',
  'loaned_out',
  'lost',
  'retired',
]);

const ALLOWED_ITEM_KINDS = new Set(['durable', 'consumable', 'kit']);

/** Subset of writable columns. Mirrors the POST allow-list MINUS
 *  retired_at / retired_reason (forced through F10.1e) and minus
 *  any audit / FK columns that should never be hand-edited via
 *  this surface (`created_at`, `updated_at` is set by the trigger
 *  / row-default; `id` obviously not). */
const ALLOWED_PATCH_KEYS = new Set([
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
  'service_contract_vendor',
  'last_serviced_at',
  'unit',
  'quantity_on_hand',
  'low_stock_threshold',
  'last_restocked_at',
  'vendor',
  'cost_per_unit_cents',
  'home_location',
  'vehicle_id',
  'is_personal',
  'owner_user_id',
  'serial_suspect',
]);

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

interface PatchBody {
  [key: string]: unknown;
}

export const PATCH = withErrorHandler(
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

    // Extract `[id]` from the URL pathname — Next.js route handler
    // params object varies between page-router and app-router so
    // pathname parsing is the most portable shape.
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const id = pathSegments[pathSegments.length - 1];
    if (!id || id === 'route.ts') {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }
    // UUID sanity-check — defends against accidental `/api/admin/equipment/inventory`
    // or similar typos getting fed as ids.
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
      return NextResponse.json(
        { error: 'id must be a UUID' },
        { status: 400 }
      );
    }

    let body: PatchBody;
    try {
      body = (await req.json()) as PatchBody;
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const update: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (ALLOWED_PATCH_KEYS.has(k) && v !== undefined) {
        update[k] = v;
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: 'No writable fields supplied' },
        { status: 400 }
      );
    }

    // Validate enums + integers — same checks as the POST so the
    // error messages match.
    if (update.item_kind !== undefined) {
      if (
        typeof update.item_kind !== 'string' ||
        !ALLOWED_ITEM_KINDS.has(update.item_kind)
      ) {
        return NextResponse.json(
          {
            error: 'item_kind must be one of: durable | consumable | kit',
          },
          { status: 400 }
        );
      }
    }
    if (update.current_status !== undefined) {
      if (
        typeof update.current_status !== 'string' ||
        !ALLOWED_STATUSES.has(update.current_status)
      ) {
        return NextResponse.json(
          {
            error:
              'current_status must be one of: ' +
              Array.from(ALLOWED_STATUSES).join(', '),
          },
          { status: 400 }
        );
      }
    }
    if (typeof update.name === 'string') {
      const trimmed = update.name.trim();
      if (!trimmed) {
        return NextResponse.json(
          { error: 'name cannot be empty' },
          { status: 400 }
        );
      }
      if (trimmed.length > 200) {
        return NextResponse.json(
          { error: 'name must be ≤200 characters' },
          { status: 400 }
        );
      }
      update.name = trimmed;
    }
    if (typeof update.qr_code_id === 'string') {
      const normalized = update.qr_code_id.trim().toUpperCase().slice(0, 64);
      if (!normalized) {
        return NextResponse.json(
          {
            error: 'qr_code_id cannot be cleared via PATCH; set a new value',
          },
          { status: 400 }
        );
      }
      update.qr_code_id = normalized;
    }
    for (const key of [
      'acquired_cost_cents',
      'cost_per_unit_cents',
      'quantity_on_hand',
      'low_stock_threshold',
      'useful_life_months',
    ] as const) {
      const v = update[key];
      if (v !== undefined && v !== null) {
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
          return NextResponse.json(
            { error: `${key} must be a non-negative integer` },
            { status: 400 }
          );
        }
      }
    }

    // Always stamp updated_at — the seeds/233 default fires only on
    // INSERT; UPDATEs need the application to refresh it.
    update.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('equipment_inventory')
      .update(update)
      .eq('id', id)
      .select(SELECT_COLUMNS)
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          {
            error: `qr_code_id "${update.qr_code_id ?? '(unknown)'}" is already taken`,
          },
          { status: 409 }
        );
      }
      console.error('[admin/equipment/:id] update failed', {
        id,
        error: error.message,
        admin_email: session.user.email,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Equipment row not found' },
        { status: 404 }
      );
    }

    console.log('[admin/equipment/:id] updated', {
      id,
      keys: Object.keys(update).filter((k) => k !== 'updated_at'),
      admin_email: session.user.email,
    });

    return NextResponse.json({ item: data });
  },
  { routeName: 'admin/equipment/:id#patch' }
);
