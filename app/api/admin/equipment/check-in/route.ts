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
// Kit batch flow (parent QR returns all children atomically) —
// opt in via `kit_mode: true`. Mirrors the morning-scan kit
// path (F10.5-e-ii-α): single condition photo applies uniformly
// to parent + children, the retired-instrument gate stays
// intentionally absent on the check-in side (a retired unit
// may still have an outstanding checked_out row that needs to
// come back in), and v1 still refuses kit-mode for kits whose
// children include consumables — kits in practice hold
// durables, so this gate keeps the consumed_quantity flow on
// the single-row path until a hybrid kit lands.
//
// Auth: admin / developer / equipment_manager.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notifyMany } from '@/lib/notifications';
import {
  loadActiveReservationsForKit,
  resolveKit,
} from '@/lib/equipment/kit-resolver';

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
          kit_mode?: unknown;
          job_id?: unknown;
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

    let jobIdFilter: string | null = null;
    if (body.job_id !== undefined && body.job_id !== null) {
      if (typeof body.job_id !== 'string' || !UUID_RE.test(body.job_id)) {
        return NextResponse.json(
          { error: '`job_id` must be a valid UUID when present.' },
          { status: 400 }
        );
      }
      jobIdFilter = body.job_id;
    }

    const kitMode = body.kit_mode === true;
    if (kitMode && !hasQr) {
      return NextResponse.json(
        {
          error:
            'kit_mode=true requires qr_code_id — fan-out runs from a ' +
            'kit-parent QR scan, not a direct reservation pick.',
        },
        { status: 400 }
      );
    }

    // ── Kit-batch fan-out path ──────────────────────────────────
    if (kitMode) {
      // consumed_quantity is meaningless in kit-mode v1 (kit
      // children are durables; the gate inside applyKitCheckin
      // double-checks). Refuse explicit non-null/non-zero
      // values up front so the caller doesn't think the field
      // matters here.
      if (consumedQuantityRaw !== null && consumedQuantityRaw !== 0) {
        return NextResponse.json(
          {
            error:
              '`consumed_quantity` is rejected in kit_mode — kits hold ' +
              'durables in v1; use the single-row path for consumables.',
          },
          { status: 400 }
        );
      }
      return await applyKitCheckin({
        qrCodeId: qrCodeRaw,
        jobIdFilter,
        condition,
        photoUrl,
        notes,
        actorUserId,
        actorEmail: session.user.email,
      });
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

    // ── F10.5-g-ii: damage triage ───────────────────────────────
    // condition='damaged' on check-in fans out three actions:
    //   1. INSERT a maintenance_events row (origin='damaged_
    //      return', kind='damage_triage', state='scheduled') so
    //      the §5.12.7.4 calendar surfaces it on EM's open-work
    //      list.
    //   2. Flip equipment_inventory.current_status to
    //      'maintenance' so the F10.3-b status check blocks
    //      future reservations until the EM resolves the work.
    //   3. Notify every equipment_manager user with
    //      escalation_level='high' so the gear doesn't
    //      languish unseen.
    // All best-effort post-success — the reservation already
    // committed, so failures here log loudly and surface as
    // warnings in the response. The audit anchor on
    // equipment_reservations always survives.
    let triageWarning: string | null = null;
    let maintenanceEventId: string | null = null;
    if (condition === 'damaged') {
      const triage = await triggerDamageTriage({
        equipmentInventoryId: row.equipment_inventory_id,
        equipmentName: null, // helper resolves the display name
        reservationId: row.id,
        jobId: row.job_id,
        photoUrl,
        notes,
        actorUserId,
        actorEmail: session.user.email,
      });
      triageWarning = triage.warning;
      maintenanceEventId = triage.maintenanceEventId;
    }

    console.log('[admin/equipment/check-in POST] ok', {
      reservation_id: row.id,
      equipment_inventory_id: row.equipment_inventory_id,
      job_id: row.job_id,
      condition,
      had_photo: !!photoUrl,
      consumed_quantity: consumedQuantity,
      stock_decrement_warning: !!stockDecrementWarning,
      damage_triage_warning: !!triageWarning,
      maintenance_event_id: maintenanceEventId,
      actor_email: session.user.email,
    });

    return NextResponse.json({
      reservation: updated,
      previous_state: 'checked_out',
      stock_decrement_warning: stockDecrementWarning,
      damage_triage_warning: triageWarning,
      maintenance_event_id: maintenanceEventId,
    });
  },
  { routeName: 'admin/equipment/check-in#post' }
);

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/**
 * F10.5-g-ii damage-triage fan-out. Best-effort — every step is
 * a separate write, none of which roll back the already-committed
 * reservation update. Returns a warning string when any step
 * fails so the response payload surfaces partial state for the
 * EM to reconcile manually.
 */
async function triggerDamageTriage(args: {
  equipmentInventoryId: string;
  equipmentName: string | null;
  reservationId: string;
  jobId: string;
  photoUrl: string | null;
  notes: string | null;
  actorUserId: string;
  actorEmail: string | null | undefined;
}): Promise<{ warning: string | null; maintenanceEventId: string | null }> {
  const failures: string[] = [];

  // Resolve a display name for the maintenance summary + the
  // notification body. Best-effort; falls back to the UUID.
  let displayName = args.equipmentName;
  if (!displayName) {
    const { data: invRow } = await supabaseAdmin
      .from('equipment_inventory')
      .select('name')
      .eq('id', args.equipmentInventoryId)
      .maybeSingle();
    displayName =
      (invRow as { name: string | null } | null)?.name ??
      args.equipmentInventoryId;
  }

  // 1. INSERT maintenance_events row.
  let maintenanceEventId: string | null = null;
  const summary = `Damaged on return — triage pending (${displayName})`;
  const meBody: Record<string, unknown> = {
    equipment_inventory_id: args.equipmentInventoryId,
    kind: 'damage_triage',
    origin: 'damaged_return',
    state: 'scheduled',
    summary,
    notes: args.notes,
    created_by: args.actorUserId,
  };
  const { data: meRow, error: meErr } = await supabaseAdmin
    .from('maintenance_events')
    .insert(meBody)
    .select('id')
    .maybeSingle();
  if (meErr) {
    console.error(
      '[admin/equipment/check-in damage-triage] maintenance_event insert failed',
      {
        equipment_inventory_id: args.equipmentInventoryId,
        reservation_id: args.reservationId,
        error: meErr.message,
      }
    );
    failures.push('maintenance_event_insert');
  } else {
    maintenanceEventId = (meRow as { id: string } | null)?.id ?? null;
  }

  // 2. Flip equipment_inventory.current_status to 'maintenance'
  // so the F10.3-b status check blocks future reservations.
  const { error: statusErr } = await supabaseAdmin
    .from('equipment_inventory')
    .update({ current_status: 'maintenance' })
    .eq('id', args.equipmentInventoryId);
  if (statusErr) {
    console.error(
      '[admin/equipment/check-in damage-triage] status flip failed',
      {
        equipment_inventory_id: args.equipmentInventoryId,
        error: statusErr.message,
      }
    );
    failures.push('inventory_status_flip');
  }

  // 3. Notify equipment_manager users (and admins on call).
  // Mirrors the F10.3-e override fan-out lookup pattern.
  let recipients: string[] = [];
  try {
    const { data: rows, error: ruErr } = await supabaseAdmin
      .from('registered_users')
      .select('email')
      .or('roles.cs.{admin},roles.cs.{equipment_manager}');
    if (ruErr) {
      console.warn(
        '[admin/equipment/check-in damage-triage] recipients lookup failed',
        { error: ruErr.message }
      );
      failures.push('notify_recipient_lookup');
    } else {
      recipients = ((rows ?? []) as Array<{ email: string | null }>)
        .map((r) => r.email)
        .filter((e): e is string => !!e);
    }
  } catch (err) {
    console.warn(
      '[admin/equipment/check-in damage-triage] recipients lookup threw',
      { error: (err as Error).message }
    );
    failures.push('notify_recipient_lookup');
  }

  if (recipients.length > 0) {
    try {
      await notifyMany(recipients, {
        type: 'equipment_damage_triage',
        title: `Damage triage — ${displayName}`,
        body:
          `${args.actorEmail ?? 'A crew member'} returned ${displayName} ` +
          `damaged on job ${args.jobId}.` +
          (args.notes ? ` Notes: ${args.notes}` : '') +
          ' Status flipped to maintenance; reservations blocked until cleared.',
        icon: '🔧',
        escalation_level: 'high',
        source_type: 'maintenance_event',
        source_id: maintenanceEventId ?? args.reservationId,
        link: '/admin/equipment',
      });
    } catch (err) {
      console.warn(
        '[admin/equipment/check-in damage-triage] notifyMany failed',
        { error: (err as Error).message }
      );
      failures.push('notify_send');
    }
  }

  if (failures.length === 0) {
    return { warning: null, maintenanceEventId };
  }
  return {
    warning:
      `Damage triage partial — these steps failed: ${failures.join(', ')}. ` +
      'Reconcile from the §5.12.7 EM dashboard.',
    maintenanceEventId,
  };
}

async function applyKitCheckin(args: {
  qrCodeId: string;
  jobIdFilter: string | null;
  condition: string;
  photoUrl: string | null;
  notes: string | null;
  actorUserId: string;
  actorEmail: string | null | undefined;
}): Promise<NextResponse> {
  // 1. QR → parent equipment_inventory id. retired_at is
  // INTENTIONALLY not gated on the check-in side — a retired
  // unit may have an outstanding checked_out row that needs to
  // come back.
  const inv = await supabaseAdmin
    .from('equipment_inventory')
    .select('id')
    .eq('qr_code_id', args.qrCodeId)
    .maybeSingle();
  if (inv.error) {
    return NextResponse.json({ error: inv.error.message }, { status: 500 });
  }
  if (!inv.data) {
    return NextResponse.json(
      { error: 'No equipment matches that QR code.', code: 'qr_unknown' },
      { status: 404 }
    );
  }
  const parentEquipmentId = (inv.data as { id: string }).id;

  // 2. Resolve kit composition.
  const kit = await resolveKit(parentEquipmentId);
  if ('error' in kit) {
    if (kit.error === 'parent_is_not_a_kit') {
      return NextResponse.json(
        {
          error:
            'kit_mode=true but the scanned instrument is not registered ' +
            'as a kit parent. Drop kit_mode or scan the kit case QR.',
          code: 'parent_is_not_a_kit',
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Kit parent not found.', code: 'parent_not_found' },
      { status: 404 }
    );
  }
  const resolved = kit.resolved;

  // v1 gate: refuse kit-mode when any child is a consumable.
  // Same rule as F10.5-e-ii-α — kits hold durables in practice.
  const consumableChild = resolved.children.find(
    (c) => c.child_item_kind === 'consumable'
  );
  if (consumableChild) {
    return NextResponse.json(
      {
        error:
          `Kit '${resolved.parent_name ?? resolved.parent_equipment_id}' ` +
          `contains a consumable child (` +
          `${consumableChild.child_name ?? consumableChild.child_equipment_id}` +
          `); use single-row check-in for these until kit consumables ` +
          'support lands.',
        code: 'kit_has_consumable_child',
      },
      { status: 400 }
    );
  }

  // 3. Find every checked_out reservation across parent +
  // children. No window filter — checked_out is the unique
  // active row per the seeds/239 EXCLUDE.
  const bundle = await loadActiveReservationsForKit(resolved, {
    state: 'checked_out',
    jobIdFilter: args.jobIdFilter,
  });

  if (!bundle.parent_reservation_id) {
    return NextResponse.json(
      {
        error:
          'No checked-out reservation matches the kit parent. The kit ' +
          'may already be returned, or the parent was never checked out.',
        code: 'no_matching_kit_reservation',
      },
      { status: 404 }
    );
  }

  // Required-children gate: every is_required child must have
  // a matching checked_out reservation. Optional children
  // without one are fine (they were never checked out).
  const reservedChildIds = new Set(
    bundle.child_reservations.map((r) => r.child_equipment_id)
  );
  const missingRequired = resolved.children.filter(
    (c) => c.is_required && !reservedChildIds.has(c.child_equipment_id)
  );
  if (missingRequired.length > 0) {
    return NextResponse.json(
      {
        error:
          'Kit has required children with no checked-out reservation. ' +
          'They may have been returned individually already; reconcile ' +
          'via single-row check-in for the parent + remaining children.',
        code: 'missing_required_children',
        missing: missingRequired.map((c) => ({
          child_equipment_id: c.child_equipment_id,
          child_name: c.child_name,
        })),
      },
      { status: 409 }
    );
  }

  // 4. Batch UPDATE every checked-out row in the bundle.
  // Single condition photo applies uniformly to parent +
  // children per the §5.12.6 spec ("condition photo captured
  // once at the kit level — case exterior — per-child
  // conditions inherit unless the crew flags an exception
  // inline"). Per-child exceptions are v1+ polish.
  const ids = [
    bundle.parent_reservation_id,
    ...bundle.child_reservations.map((r) => r.reservation_id),
  ];
  const nowIso = new Date().toISOString();
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('equipment_reservations')
    .update({
      state: 'returned',
      actual_returned_at: nowIso,
      returned_by: args.actorUserId,
      returned_condition: args.condition,
      returned_photo_url: args.photoUrl,
      returned_notes: args.notes,
      // consumed_quantity intentionally null — kit-mode v1
      // forbids consumable children. Single-row path handles
      // consumables decrements.
    })
    .in('id', ids)
    .eq('state', 'checked_out')
    .select(
      'id, equipment_inventory_id, job_id, reserved_from, reserved_to, ' +
        'state, actual_checked_out_at, actual_returned_at, ' +
        'checked_out_by, checked_out_to_user, checked_out_condition, ' +
        'returned_by, returned_condition, returned_photo_url, ' +
        'returned_notes, consumed_quantity, is_override, ' +
        'override_reason, notes, updated_at'
    );

  if (updateErr) {
    console.error(
      '[admin/equipment/check-in POST kit] update failed',
      { kit_id: resolved.kit_id, error: updateErr.message }
    );
    return NextResponse.json(
      { error: updateErr.message },
      { status: 500 }
    );
  }

  const flippedRows = updated ?? [];
  if (flippedRows.length !== ids.length) {
    return NextResponse.json(
      {
        error:
          `Kit batch was partially blocked — ${flippedRows.length}/${ids.length} ` +
          'rows flipped to returned. Refetch the kit and retry.',
        code: 'partial_kit_flip',
        flipped_count: flippedRows.length,
        expected_count: ids.length,
      },
      { status: 409 }
    );
  }

  console.log('[admin/equipment/check-in POST kit] ok', {
    kit_id: resolved.kit_id,
    parent_equipment_id: resolved.parent_equipment_id,
    child_count: bundle.child_reservations.length,
    flipped_count: flippedRows.length,
    condition: args.condition,
    actor_email: args.actorEmail,
  });

  return NextResponse.json({
    mode: 'kit',
    kit: {
      kit_id: resolved.kit_id,
      parent_equipment_id: resolved.parent_equipment_id,
      parent_name: resolved.parent_name,
    },
    reservations: flippedRows,
    previous_state: 'checked_out',
  });
}

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
