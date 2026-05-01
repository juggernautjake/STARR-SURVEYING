// app/api/admin/equipment/check-in/route.ts
//
// POST /api/admin/equipment/check-in
//
// Phase F10.5-c — the evening-scan endpoint, symmetric to
// F10.5-b /check-out. Flips a single reservation
// `state='checked_out' → 'returned'` and stamps the seeds/242
// return-side columns (returned_by, condition, photo, notes,
// consumed_quantity).
//
// Two entry points (XOR — same as /check-out):
//   * `qr_code_id` — mobile-scanner / office-walk-up. Resolves
//     QR → equipment_inventory_id → unique checked_out
//     reservation. Multiple checked_out rows for one
//     instrument are forbidden by the seeds/239 GiST EXCLUDE
//     so the disambiguation path here is rare in practice.
//   * `reservation_id` — direct row pick.
//
// Body:
//   {
//     (qr_code_id | reservation_id),
//     condition: 'good' | 'fair' | 'damaged' | 'lost',
//     photo_url?,         // required when condition ≠ 'good'
//     notes?,
//     consumed_quantity?, // consumables only; ≥ 0; ≤ reserved
//                         // quantity. Required when item_kind=
//                         // 'consumable'.
//   }
//
// Consumables: when the underlying item is a consumable, the
// handler atomically:
//   1. Updates the reservation row (state, returned_*).
//   2. Decrements equipment_inventory.quantity_on_hand by
//      consumed_quantity (so the §5.12.7 low-stock dashboard
//      reflects field consumption immediately).
//
// Step 2 is a separate UPDATE — Postgres doesn't expose a
// cross-table transaction through PostgREST, but the §5.12.6
// invariant only needs the decrement to be visible WITHIN A
// FEW SECONDS, not strictly atomic with the state flip. Step 2
// failure logs loudly + returns 200 with a warning so the
// audit trail still anchors and the EM can reconcile manually.
//
// Damage / lost triage on condition ∈ damaged | lost is NOT
// wired in this batch — that lands in F10.5-g (maintenance
// event creation, status flip, lost_equipment notification
// with location_pings cluster, etc.). For v1 the column is
// persisted; the orchestration is layered on top.
//
// Kit batch flow (parent QR returns all children atomically) →
// F10.5-e.
//
// Auth: admin / developer / equipment_manager.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const ALLOWED_CONDITIONS = new Set(['good', 'fair', 'damaged', 'lost']);

interface ReservationRow {
  id: string;
  equipment_inventory_id: string;
  job_id: string;
  reserved_from: string;
  reserved_to: string;
  state: string;
  is_override: boolean;
  notes: string | null;
}

interface InventoryShape {
  id: string;
  item_kind: string | null;
  quantity_on_hand: number | null;
  retired_at: string | null;
  qr_code_id: string | null;
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
    const actorUserId =
      (session.user as { id?: string } | undefined)?.id ?? null;
    if (!actorUserId) {
      return NextResponse.json(
        { error: 'Session is missing user id; cannot author check-in.' },
        { status: 500 }
      );
    }

    const body = (await req.json().catch(() => null)) as
      | {
          qr_code_id?: unknown;
          reservation_id?: unknown;
          condition?: unknown;
          photo_url?: unknown;
          notes?: unknown;
          consumed_quantity?: unknown;
        }
      | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Body must be a JSON object.' },
        { status: 400 }
      );
    }

    const qrCodeRaw =
      typeof body.qr_code_id === 'string' ? body.qr_code_id.trim() : '';
    const reservationIdRaw =
      typeof body.reservation_id === 'string'
        ? body.reservation_id.trim()
        : '';
    const hasQr = qrCodeRaw.length > 0;
    const hasReservationId = reservationIdRaw.length > 0;
    if (hasQr === hasReservationId) {
      return NextResponse.json(
        {
          error:
            'Provide exactly one of `qr_code_id` (scanner path) or ' +
            '`reservation_id` (dispatcher walk-up path).',
        },
        { status: 400 }
      );
    }
    if (hasReservationId && !UUID_RE.test(reservationIdRaw)) {
      return NextResponse.json(
        { error: '`reservation_id` must be a valid UUID.' },
        { status: 400 }
      );
    }

    const condition =
      typeof body.condition === 'string' ? body.condition.trim() : '';
    if (!ALLOWED_CONDITIONS.has(condition)) {
      return NextResponse.json(
        {
          error:
            '`condition` must be one of: ' +
            Array.from(ALLOWED_CONDITIONS).join(', '),
        },
        { status: 400 }
      );
    }

    let photoUrl: string | null = null;
    if (body.photo_url !== undefined && body.photo_url !== null) {
      if (typeof body.photo_url !== 'string') {
        return NextResponse.json(
          { error: '`photo_url` must be a string.' },
          { status: 400 }
        );
      }
      const trimmed = body.photo_url.trim();
      if (trimmed.length > 0) photoUrl = trimmed;
    }
    if (condition !== 'good' && !photoUrl) {
      return NextResponse.json(
        {
          error:
            `condition='${condition}' requires a photo_url for the ` +
            'audit trail.',
        },
        { status: 400 }
      );
    }

    let notes: string | null = null;
    if (body.notes !== undefined && body.notes !== null) {
      if (typeof body.notes !== 'string') {
        return NextResponse.json(
          { error: '`notes` must be a string.' },
          { status: 400 }
        );
      }
      const trimmed = body.notes.trim();
      if (trimmed.length > 0) notes = trimmed;
    }

    let consumedQuantityRaw: number | null = null;
    if (
      body.consumed_quantity !== undefined &&
      body.consumed_quantity !== null
    ) {
      if (
        typeof body.consumed_quantity !== 'number' ||
        !Number.isInteger(body.consumed_quantity) ||
        body.consumed_quantity < 0
      ) {
        return NextResponse.json(
          {
            error:
              '`consumed_quantity` must be a non-negative integer when ' +
              'present.',
          },
          { status: 400 }
        );
      }
      consumedQuantityRaw = body.consumed_quantity;
    }

    // ── Resolve reservation ─────────────────────────────────────
    const reservation = await resolveReservation({
      hasQr,
      qrCodeId: qrCodeRaw,
      reservationId: reservationIdRaw,
    });
    if ('error' in reservation) return reservation.error;
    const row = reservation.row;

    if (row.state !== 'checked_out') {
      return NextResponse.json(
        {
          error:
            row.state === 'returned'
              ? 'Reservation is already returned.'
              : row.state === 'held'
              ? 'Reservation is still held — check-out hasn\'t happened ' +
                'yet. Use /check-out first.'
              : `Reservation is in state '${row.state}' and not ` +
                'check-in-able.',
          current_state: row.state,
        },
        { status: 409 }
      );
    }

    // ── Inventory shape: drives consumables vs durable rules ────
    const inv = await supabaseAdmin
      .from('equipment_inventory')
      .select('id, item_kind, quantity_on_hand, retired_at, qr_code_id')
      .eq('id', row.equipment_inventory_id)
      .maybeSingle();
    if (inv.error) {
      return NextResponse.json(
        { error: inv.error.message },
        { status: 500 }
      );
    }
    if (!inv.data) {
      return NextResponse.json(
        { error: 'Equipment row missing for the reservation.' },
        { status: 500 }
      );
    }
    const invRow = inv.data as InventoryShape;
    const isConsumable = invRow.item_kind === 'consumable';

    let consumedQuantity: number | null = null;
    if (isConsumable) {
      if (consumedQuantityRaw === null) {
        return NextResponse.json(
          {
            error:
              `Item is a consumable; \`consumed_quantity\` is required.`,
          },
          { status: 400 }
        );
      }
      consumedQuantity = consumedQuantityRaw;
    } else if (consumedQuantityRaw !== null && consumedQuantityRaw !== 0) {
      return NextResponse.json(
        {
          error:
            '`consumed_quantity` only applies to consumables; pass 0 ' +
            'or omit for durables / kits.',
        },
        { status: 400 }
      );
    }

    // ── Update reservation ──────────────────────────────────────
    const nowIso = new Date().toISOString();
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('equipment_reservations')
      .update({
        state: 'returned',
        actual_returned_at: nowIso,
        returned_by: actorUserId,
        returned_condition: condition,
        returned_photo_url: photoUrl,
        returned_notes: notes,
        consumed_quantity: isConsumable ? consumedQuantity : null,
      })
      .eq('id', row.id)
      .eq('state', 'checked_out')
      .select(
        'id, equipment_inventory_id, job_id, reserved_from, reserved_to, ' +
          'state, actual_checked_out_at, actual_returned_at, ' +
          'checked_out_by, checked_out_to_user, checked_out_condition, ' +
          'returned_by, returned_condition, returned_photo_url, ' +
          'returned_notes, consumed_quantity, is_override, ' +
          'override_reason, notes, updated_at'
      )
      .maybeSingle();
    if (updateErr) {
      console.error(
        '[admin/equipment/check-in POST] update failed',
        { reservationId: row.id, error: updateErr.message }
      );
      return NextResponse.json(
        { error: updateErr.message },
        { status: 500 }
      );
    }
    if (!updated) {
      const { data: latest } = await supabaseAdmin
        .from('equipment_reservations')
        .select('state')
        .eq('id', row.id)
        .maybeSingle();
      const latestState =
        (latest as { state?: string } | null)?.state ?? 'unknown';
      return NextResponse.json(
        {
          error:
            'Reservation state changed between read and write. ' +
            'Refetch and retry.',
          current_state: latestState,
        },
        { status: 409 }
      );
    }

    // ── Consumables: decrement quantity_on_hand ─────────────────
    // Cross-table transactional atomicity isn't available through
    // PostgREST. The decrement is best-effort — a failure logs +
    // surfaces a warning to the caller, but the reservation
    // state flip survives so the audit anchor is intact. The
    // §5.12.7 reconcile dashboard will surface mismatched stock
    // for manual correction.
    let stockDecrementWarning: string | null = null;
    if (isConsumable && consumedQuantity !== null && consumedQuantity > 0) {
      const onHand = invRow.quantity_on_hand ?? 0;
      const newOnHand = Math.max(onHand - consumedQuantity, 0);
      const { error: decErr } = await supabaseAdmin
        .from('equipment_inventory')
        .update({
          quantity_on_hand: newOnHand,
        })
        .eq('id', invRow.id);
      if (decErr) {
        console.error(
          '[admin/equipment/check-in POST] consumables decrement failed',
          {
            equipment_inventory_id: invRow.id,
            consumed: consumedQuantity,
            error: decErr.message,
          }
        );
        stockDecrementWarning =
          'Reservation closed but quantity_on_hand decrement failed; ' +
          'reconcile manually.';
      }
    }

    console.log('[admin/equipment/check-in POST] ok', {
      reservation_id: row.id,
      equipment_inventory_id: row.equipment_inventory_id,
      job_id: row.job_id,
      condition,
      had_photo: !!photoUrl,
      consumed_quantity: consumedQuantity,
      stock_decrement_warning: !!stockDecrementWarning,
      actor_email: session.user.email,
    });

    return NextResponse.json({
      reservation: updated,
      previous_state: 'checked_out',
      stock_decrement_warning: stockDecrementWarning,
    });
  },
  { routeName: 'admin/equipment/check-in#post' }
);

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

async function resolveReservation(args: {
  hasQr: boolean;
  qrCodeId: string;
  reservationId: string;
}): Promise<{ row: ReservationRow } | { error: NextResponse }> {
  const { hasQr, qrCodeId, reservationId } = args;

  if (!hasQr) {
    const { data, error } = await supabaseAdmin
      .from('equipment_reservations')
      .select(
        'id, equipment_inventory_id, job_id, reserved_from, reserved_to, ' +
          'state, is_override, notes'
      )
      .eq('id', reservationId)
      .maybeSingle();
    if (error) {
      return {
        error: NextResponse.json({ error: error.message }, { status: 500 }),
      };
    }
    if (!data) {
      return {
        error: NextResponse.json(
          { error: 'Reservation not found.' },
          { status: 404 }
        ),
      };
    }
    return { row: data as ReservationRow };
  }

  const inv = await supabaseAdmin
    .from('equipment_inventory')
    .select('id, retired_at')
    .eq('qr_code_id', qrCodeId)
    .maybeSingle();
  if (inv.error) {
    return {
      error: NextResponse.json(
        { error: inv.error.message },
        { status: 500 }
      ),
    };
  }
  if (!inv.data) {
    return {
      error: NextResponse.json(
        { error: 'No equipment matches that QR code.', code: 'qr_unknown' },
        { status: 404 }
      ),
    };
  }
  // Note: we DON'T refuse on retired_at here — a retired
  // instrument may still have an outstanding checked_out row
  // that needs to come back in. Refusing on retire would block
  // the cleanup path. The /check-out side does refuse retire
  // because that's the gate that prevents new check-outs.

  const equipmentId = (inv.data as { id: string; retired_at: string | null })
    .id;
  const { data, error } = await supabaseAdmin
    .from('equipment_reservations')
    .select(
      'id, equipment_inventory_id, job_id, reserved_from, reserved_to, ' +
        'state, is_override, notes'
    )
    .eq('equipment_inventory_id', equipmentId)
    .eq('state', 'checked_out');
  if (error) {
    return {
      error: NextResponse.json({ error: error.message }, { status: 500 }),
    };
  }
  const matches = (data ?? []) as ReservationRow[];
  if (matches.length === 0) {
    return {
      error: NextResponse.json(
        {
          error: 'No checked-out reservation matches that QR.',
          code: 'no_matching_checked_out_reservation',
        },
        { status: 404 }
      ),
    };
  }
  if (matches.length > 1) {
    // The seeds/239 EXCLUDE forbids overlapping active reservations
    // on the same instrument, so this branch should be unreachable
    // in practice. If we see it, something is structurally wrong;
    // surface the candidates so a human can investigate.
    return {
      error: NextResponse.json(
        {
          error:
            `Multiple checked-out reservations match (${matches.length}) — ` +
            'this should be impossible per the seeds/239 EXCLUDE. ' +
            'Pass `reservation_id` to pick the row directly.',
          code: 'unexpected_ambiguous_match',
          candidates: matches.map((m) => ({
            reservation_id: m.id,
            job_id: m.job_id,
          })),
        },
        { status: 409 }
      ),
    };
  }
  return { row: matches[0] };
}
