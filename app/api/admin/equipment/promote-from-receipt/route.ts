// app/api/admin/equipment/promote-from-receipt/route.ts
//
// POST /api/admin/equipment/promote-from-receipt
//   body: {
//     receipt_id: UUID,
//     name: string,
//     category?: string,
//     item_kind?: 'durable' | 'consumable' | 'kit',
//     useful_life_months?: number,
//     depreciation_method?: 'section_179' | 'straight_line' |
//                          'macrs_5yr' | 'macrs_7yr' |
//                          'bonus_first_year' | 'none',
//     placed_in_service_at?: ISO date,
//     notes?: string,
//   }
//
// Phase F10.9 (acquisition path) — promotes a bookkeeper-
// approved receipt into a capital asset row in
// equipment_inventory. The Batch QQ tax summary excludes
// promoted receipts on the receipts side so the dollars
// don&apos;t land twice on Schedule C — the depreciation worker
// reads `equipment_inventory` instead and computes per-year
// amounts via the elections table.
//
// Flow:
//   1. Validate the receipt exists, is approved (or exported),
//      and isn&apos;t already promoted.
//   2. Insert a new equipment_inventory row carrying:
//      acquired_cost_cents = receipt.total_cents,
//      acquired_at         = receipt.transaction_at ?? created_at,
//      linked_acquisition_receipt_id = receipt.id,
//      depreciation_method = body.depreciation_method or default.
//   3. Update receipts.promoted_to_equipment_id to point at the
//      new asset (the inverse cross-link).
//
// Fail safety: if the receipt update fails after the asset
// insert, we delete the just-created asset so the database
// doesn&apos;t carry a half-promoted row. This is a "compensating
// transaction" pattern since PostgREST doesn&apos;t expose a real
// transaction primitive from the worker.
//
// Auth: admin / developer / equipment_manager. Bookkeeper UI
// (slice B) drives this; manual cleanup workflows + admin
// rebooking can also call it.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const ALLOWED_ITEM_KINDS = new Set(['durable', 'consumable', 'kit']);
const ALLOWED_METHODS = new Set([
  'section_179',
  'straight_line',
  'macrs_5yr',
  'macrs_7yr',
  'bonus_first_year',
  'none',
]);
const PROMOTABLE_RECEIPT_STATUSES = new Set(['approved', 'exported']);

interface PromoteBody {
  receipt_id?: unknown;
  name?: unknown;
  category?: unknown;
  item_kind?: unknown;
  useful_life_months?: unknown;
  depreciation_method?: unknown;
  placed_in_service_at?: unknown;
  notes?: unknown;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
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

  const body = (await req.json().catch(() => null)) as PromoteBody | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Body must be a JSON object.' },
      { status: 400 }
    );
  }

  // ── Required: receipt_id ────────────────────────────────────
  if (
    typeof body.receipt_id !== 'string' ||
    !UUID_RE.test(body.receipt_id)
  ) {
    return NextResponse.json(
      { error: '`receipt_id` must be a valid UUID.' },
      { status: 400 }
    );
  }
  const receiptId = body.receipt_id;

  // ── Required: name ──────────────────────────────────────────
  if (typeof body.name !== 'string' || body.name.trim().length === 0) {
    return NextResponse.json(
      { error: '`name` is required.' },
      { status: 400 }
    );
  }
  const name = body.name.trim();

  // ── Optional fields ────────────────────────────────────────
  let category: string | null = null;
  if (body.category !== undefined && body.category !== null) {
    if (typeof body.category !== 'string') {
      return NextResponse.json(
        { error: '`category` must be a string when present.' },
        { status: 400 }
      );
    }
    const trimmed = body.category.trim();
    category = trimmed.length > 0 ? trimmed : null;
  }

  let itemKind: string = 'durable';
  if (body.item_kind !== undefined && body.item_kind !== null) {
    if (
      typeof body.item_kind !== 'string' ||
      !ALLOWED_ITEM_KINDS.has(body.item_kind)
    ) {
      return NextResponse.json(
        { error: '`item_kind` must be one of: durable, consumable, kit.' },
        { status: 400 }
      );
    }
    itemKind = body.item_kind;
  }

  let usefulLifeMonths: number | null = null;
  if (
    body.useful_life_months !== undefined &&
    body.useful_life_months !== null
  ) {
    if (
      typeof body.useful_life_months !== 'number' ||
      !Number.isInteger(body.useful_life_months) ||
      body.useful_life_months <= 0
    ) {
      return NextResponse.json(
        { error: '`useful_life_months` must be a positive integer.' },
        { status: 400 }
      );
    }
    usefulLifeMonths = body.useful_life_months;
  }

  let depreciationMethod: string = 'straight_line';
  if (
    body.depreciation_method !== undefined &&
    body.depreciation_method !== null
  ) {
    if (
      typeof body.depreciation_method !== 'string' ||
      !ALLOWED_METHODS.has(body.depreciation_method)
    ) {
      return NextResponse.json(
        {
          error:
            '`depreciation_method` must be one of: ' +
            Array.from(ALLOWED_METHODS).join(', '),
        },
        { status: 400 }
      );
    }
    depreciationMethod = body.depreciation_method;
  }

  let placedInServiceAt: string | null = null;
  if (
    body.placed_in_service_at !== undefined &&
    body.placed_in_service_at !== null
  ) {
    if (typeof body.placed_in_service_at !== 'string') {
      return NextResponse.json(
        { error: '`placed_in_service_at` must be an ISO date string.' },
        { status: 400 }
      );
    }
    const ms = Date.parse(body.placed_in_service_at);
    if (!Number.isFinite(ms)) {
      return NextResponse.json(
        { error: '`placed_in_service_at` must parse to a valid date.' },
        { status: 400 }
      );
    }
    placedInServiceAt = new Date(ms).toISOString().slice(0, 10);
  }

  let notes: string | null = null;
  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== 'string') {
      return NextResponse.json(
        { error: '`notes` must be a string when present.' },
        { status: 400 }
      );
    }
    const trimmed = body.notes.trim();
    notes = trimmed.length > 0 ? trimmed : null;
  }

  // ── Read the receipt row + guards ──────────────────────────
  const { data: receiptRow, error: readErr } = await supabaseAdmin
    .from('receipts')
    .select(
      'id, total_cents, transaction_at, created_at, status, ' +
        'category, vendor_name, promoted_to_equipment_id'
    )
    .eq('id', receiptId)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json(
      { error: readErr.message },
      { status: 500 }
    );
  }
  if (!receiptRow) {
    return NextResponse.json(
      { error: 'Receipt not found.' },
      { status: 404 }
    );
  }
  const receipt = receiptRow as {
    id: string;
    total_cents: number | null;
    transaction_at: string | null;
    created_at: string;
    status: string;
    category: string | null;
    vendor_name: string | null;
    promoted_to_equipment_id: string | null;
  };

  if (!PROMOTABLE_RECEIPT_STATUSES.has(receipt.status)) {
    return NextResponse.json(
      {
        error:
          `Receipt is in state "${receipt.status}"; only approved or exported ` +
          'receipts can be promoted to assets.',
        code: 'receipt_not_promotable',
      },
      { status: 409 }
    );
  }
  if (receipt.promoted_to_equipment_id) {
    return NextResponse.json(
      {
        error:
          `Receipt is already promoted to equipment ${receipt.promoted_to_equipment_id}.`,
        code: 'receipt_already_promoted',
        equipment_id: receipt.promoted_to_equipment_id,
      },
      { status: 409 }
    );
  }
  if (receipt.total_cents === null || receipt.total_cents <= 0) {
    return NextResponse.json(
      {
        error:
          'Receipt total_cents is missing or zero; refusing to promote a ' +
          '$0 capital asset.',
        code: 'missing_total_cents',
      },
      { status: 400 }
    );
  }

  // ── Insert the asset row ───────────────────────────────────
  const acquiredAt = receipt.transaction_at ?? receipt.created_at;
  const { data: insertedAsset, error: insertErr } = await supabaseAdmin
    .from('equipment_inventory')
    .insert({
      name,
      category,
      item_kind: itemKind,
      current_status: 'available',
      acquired_at: acquiredAt,
      acquired_cost_cents: receipt.total_cents,
      useful_life_months: usefulLifeMonths,
      placed_in_service_at: placedInServiceAt,
      depreciation_method: depreciationMethod,
      linked_acquisition_receipt_id: receipt.id,
      notes,
    })
    .select(
      'id, name, category, item_kind, current_status, ' +
        'acquired_at, acquired_cost_cents, useful_life_months, ' +
        'placed_in_service_at, depreciation_method, ' +
        'linked_acquisition_receipt_id'
    )
    .maybeSingle();
  if (insertErr) {
    console.error(
      '[admin/equipment/promote-from-receipt] asset insert failed',
      { receipt_id: receiptId, error: insertErr.message }
    );
    return NextResponse.json(
      { error: insertErr.message ?? 'Asset insert failed.' },
      { status: 500 }
    );
  }
  const newAsset = insertedAsset as { id: string };

  // ── Cross-link the receipt → asset ─────────────────────────
  // If this update fails, we must delete the freshly-inserted
  // asset so a half-promoted row doesn&apos;t survive. The
  // alternative (leaving the asset orphaned) would mean the next
  // tax summary would skip the receipt AND not have a matching
  // asset to depreciate — silent dollars vanishing. The
  // compensating delete is the safer story.
  const { error: linkErr } = await supabaseAdmin
    .from('receipts')
    .update({ promoted_to_equipment_id: newAsset.id })
    .eq('id', receiptId);
  if (linkErr) {
    console.error(
      '[admin/equipment/promote-from-receipt] receipt link failed; rolling back asset',
      { receipt_id: receiptId, asset_id: newAsset.id, error: linkErr.message }
    );
    await supabaseAdmin
      .from('equipment_inventory')
      .delete()
      .eq('id', newAsset.id);
    return NextResponse.json(
      {
        error:
          'Receipt cross-link failed; asset rolled back. Try again — the ' +
          'inventory state matches before the call.',
      },
      { status: 500 }
    );
  }

  console.log('[admin/equipment/promote-from-receipt] ok', {
    receipt_id: receiptId,
    asset_id: newAsset.id,
    cents: receipt.total_cents,
    method: depreciationMethod,
    actor_email: session.user.email,
  });

  return NextResponse.json({
    asset: insertedAsset,
    receipt: { id: receiptId, promoted_to_equipment_id: newAsset.id },
  });
}, { routeName: 'admin/equipment/promote-from-receipt#post' });
