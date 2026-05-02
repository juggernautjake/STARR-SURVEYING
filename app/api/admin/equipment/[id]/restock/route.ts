// app/api/admin/equipment/[id]/restock/route.ts
//
// POST /api/admin/equipment/[id]/restock
//
// Phase F10.6-d-iii-α — the §5.12.7.5 "Restock arrived" inline
// action. Increments `quantity_on_hand`, stamps
// `last_restocked_at`, optionally updates `vendor` and
// `cost_per_unit_cents` from the form.
//
// Body:
//   {
//     quantity_added: integer ≥ 1,
//     cost_cents?: integer ≥ 0,         // total cost paid for
//                                        // this restock; per-unit
//                                        // is total / quantity
//     vendor?: string,                   // updates inventory.vendor
//                                        // if provided
//     receipt_photo_url?: string,        // file-bucket URL — the
//                                        // EM mobile uploads first,
//                                        // then passes the URL.
//                                        // Stored on the audit
//                                        // event row so the
//                                        // bookkeeper can verify.
//     notes?: string
//   }
//
// Refuses 400 if:
//   * item_kind ≠ 'consumable' (durables don't restock — they
//     get repaired or replaced; this gate keeps the count
//     surface clean).
//   * retired_at IS NOT NULL.
//
// Returns the updated inventory row + the audit event id.
//
// Auth: admin / developer / equipment_manager.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

interface InventoryRow {
  id: string;
  item_kind: string | null;
  retired_at: string | null;
  quantity_on_hand: number | null;
  vendor: string | null;
  cost_per_unit_cents: number | null;
  name: string | null;
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
  const actorUserId =
    (session.user as { id?: string } | undefined)?.id ?? null;

  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const id = segments[segments.length - 2]; // /equipment/[id]/restock
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json(
      { error: 'Equipment id must be a UUID.' },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Body must be a JSON object.' },
      { status: 400 }
    );
  }

  if (
    typeof body.quantity_added !== 'number' ||
    !Number.isInteger(body.quantity_added) ||
    body.quantity_added < 1
  ) {
    return NextResponse.json(
      { error: '`quantity_added` must be a positive integer (≥1).' },
      { status: 400 }
    );
  }
  const quantityAdded = body.quantity_added;

  let costCents: number | null = null;
  if (body.cost_cents !== undefined && body.cost_cents !== null) {
    if (
      typeof body.cost_cents !== 'number' ||
      !Number.isInteger(body.cost_cents) ||
      body.cost_cents < 0
    ) {
      return NextResponse.json(
        { error: '`cost_cents` must be a non-negative integer when present.' },
        { status: 400 }
      );
    }
    costCents = body.cost_cents;
  }

  let vendor: string | null = null;
  if (body.vendor !== undefined && body.vendor !== null) {
    if (typeof body.vendor !== 'string') {
      return NextResponse.json(
        { error: '`vendor` must be a string.' },
        { status: 400 }
      );
    }
    const trimmed = body.vendor.trim();
    vendor = trimmed.length > 0 ? trimmed : null;
  }

  let photoUrl: string | null = null;
  if (
    body.receipt_photo_url !== undefined &&
    body.receipt_photo_url !== null
  ) {
    if (typeof body.receipt_photo_url !== 'string') {
      return NextResponse.json(
        { error: '`receipt_photo_url` must be a string when present.' },
        { status: 400 }
      );
    }
    const trimmed = body.receipt_photo_url.trim();
    photoUrl = trimmed.length > 0 ? trimmed : null;
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

  // ── Read inventory row + gate ───────────────────────────────
  const { data: invData, error: readErr } = await supabaseAdmin
    .from('equipment_inventory')
    .select(
      'id, item_kind, retired_at, quantity_on_hand, vendor, ' +
        'cost_per_unit_cents, name'
    )
    .eq('id', id)
    .maybeSingle();
  if (readErr) {
    console.error(
      '[admin/equipment/restock] inventory read failed',
      { id, error: readErr.message }
    );
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!invData) {
    return NextResponse.json(
      { error: 'Equipment not found.' },
      { status: 404 }
    );
  }
  const inv = invData as InventoryRow;
  if (inv.item_kind !== 'consumable') {
    return NextResponse.json(
      {
        error:
          `Equipment '${inv.name ?? inv.id}' is not a consumable; ` +
          'restock-arrived only applies to item_kind=consumable. ' +
          'Durables get repaired or replaced via the maintenance flow.',
        code: 'not_consumable',
      },
      { status: 400 }
    );
  }
  if (inv.retired_at) {
    return NextResponse.json(
      {
        error:
          `Equipment was retired on ${inv.retired_at}; restock refused.`,
        code: 'retired',
      },
      { status: 409 }
    );
  }

  // ── Compute updates ─────────────────────────────────────────
  const previousOnHand = inv.quantity_on_hand ?? 0;
  const newOnHand = previousOnHand + quantityAdded;
  const perUnitCents =
    costCents !== null && quantityAdded > 0
      ? Math.round(costCents / quantityAdded)
      : null;

  const updateBody: Record<string, unknown> = {
    quantity_on_hand: newOnHand,
    last_restocked_at: new Date().toISOString(),
  };
  if (vendor) updateBody.vendor = vendor;
  if (perUnitCents !== null) updateBody.cost_per_unit_cents = perUnitCents;

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('equipment_inventory')
    .update(updateBody)
    .eq('id', id)
    .eq('item_kind', 'consumable')
    .is('retired_at', null)
    .select(
      'id, name, item_kind, quantity_on_hand, low_stock_threshold, ' +
        'vendor, cost_per_unit_cents, last_restocked_at, unit'
    )
    .maybeSingle();
  if (updateErr) {
    console.error(
      '[admin/equipment/restock] inventory update failed',
      { id, error: updateErr.message }
    );
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json(
      {
        error:
          'Equipment state changed between read and write. Refetch and ' +
          'retry.',
      },
      { status: 409 }
    );
  }

  // ── Audit event ─────────────────────────────────────────────
  // Best-effort — equipment_events is the chain-of-custody log
  // (§5.12.1). Failure logs but doesn't roll back the restock.
  // The events table only has a `notes` text column (no
  // dedicated summary/photo columns yet — those are §5.12.11
  // polish), so we pack restock context into structured notes.
  let auditEventId: string | null = null;
  const auditLines: string[] = [
    `Restock arrived: +${quantityAdded}`,
    perUnitCents !== null
      ? `@ $${(perUnitCents / 100).toFixed(2)}/unit`
      : null,
    vendor ? `from ${vendor}` : null,
    `${previousOnHand} → ${newOnHand}`,
    photoUrl ? `receipt: ${photoUrl}` : null,
    notes ? `notes: ${notes}` : null,
  ].filter((line): line is string => !!line);
  try {
    const { data: evt, error: evtErr } = await supabaseAdmin
      .from('equipment_events')
      .insert({
        equipment_inventory_id: id,
        event_type: 'restock',
        actor_user_id: actorUserId,
        notes: auditLines.join('. '),
      })
      .select('id')
      .maybeSingle();
    if (evtErr) {
      console.warn(
        '[admin/equipment/restock] audit event insert failed',
        { id, error: evtErr.message }
      );
    } else {
      auditEventId = (evt as { id: string } | null)?.id ?? null;
    }
  } catch (err) {
    console.warn(
      '[admin/equipment/restock] audit event insert threw',
      { id, error: (err as Error).message }
    );
  }

  console.log('[admin/equipment/restock POST] ok', {
    equipment_id: id,
    quantity_added: quantityAdded,
    previous_on_hand: previousOnHand,
    new_on_hand: newOnHand,
    cost_cents: costCents,
    audit_event_id: auditEventId,
    actor_email: session.user.email,
  });

  return NextResponse.json({
    inventory: updated,
    previous_quantity_on_hand: previousOnHand,
    new_quantity_on_hand: newOnHand,
    audit_event_id: auditEventId,
  });
}, { routeName: 'admin/equipment/:id/restock#post' });
