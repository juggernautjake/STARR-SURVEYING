// app/api/admin/equipment/cancel-reservation/route.ts
//
// POST /api/admin/equipment/cancel-reservation
//   body: { reservation_id: UUID, reason?: string }
//
// Phase F10.3-f — closes out the F10.3 series. Flips a
// `held` reservation to `cancelled`. Once the gear has been
// physically picked up (`state='checked_out'`), the cancel path
// is no longer valid — returns require a check-in scan, not a
// cancel — so this route refuses anything past `held`.
//
// State transitions handled:
//
//   held       → cancelled    OK
//   checked_out → ❌ 409       use §5.12.6 check-in flow
//   returned    → ❌ 409 (already terminal — no-op refused so
//                          dispatchers don't accidentally void
//                          the audit trail)
//   cancelled   → ❌ 409 (already terminal)
//
// On success the seeds/239 sync trigger automatically releases
// `equipment_inventory.current_reservation_id` +
// `next_available_at` for the affected unit, so the §5.12.7.1
// Today landing-page card refreshes without any extra writes
// here.
//
// Auth: admin / developer / equipment_manager.
//
// Returns:
//   200 { reservation: {...}, previous_state: 'held' }
//   409 { error, current_state }   (terminal-state refusals)
//   404 { error }                  (no row matches the id)

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const CANCELLABLE_STATES = new Set(['held']);

interface ReservationRow {
  id: string;
  equipment_inventory_id: string;
  job_id: string;
  state: string;
  reserved_from: string;
  reserved_to: string;
  is_override: boolean;
  notes: string | null;
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

    const body = (await req.json().catch(() => null)) as
      | { reservation_id?: unknown; reason?: unknown }
      | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Body must be a JSON object.' },
        { status: 400 }
      );
    }

    const reservationId =
      typeof body.reservation_id === 'string'
        ? body.reservation_id.trim()
        : '';
    if (!UUID_RE.test(reservationId)) {
      return NextResponse.json(
        { error: '`reservation_id` must be a valid UUID.' },
        { status: 400 }
      );
    }

    let reason: string | null = null;
    if (body.reason !== undefined && body.reason !== null) {
      if (typeof body.reason !== 'string') {
        return NextResponse.json(
          { error: '`reason` must be a string when present.' },
          { status: 400 }
        );
      }
      const trimmed = body.reason.trim();
      if (trimmed.length > 500) {
        return NextResponse.json(
          { error: '`reason` must be ≤ 500 characters.' },
          { status: 400 }
        );
      }
      reason = trimmed.length > 0 ? trimmed : null;
    }

    // Read current state first so we can return a typed
    // 409 instead of a raw 0-row UPDATE on terminal states.
    const { data: existing, error: readErr } = await supabaseAdmin
      .from('equipment_reservations')
      .select(
        'id, equipment_inventory_id, job_id, state, reserved_from, ' +
          'reserved_to, is_override, notes'
      )
      .eq('id', reservationId)
      .maybeSingle();
    if (readErr) {
      console.error(
        '[admin/equipment/cancel-reservation] read failed',
        { reservationId, error: readErr.message }
      );
      return NextResponse.json(
        { error: readErr.message },
        { status: 500 }
      );
    }
    if (!existing) {
      return NextResponse.json(
        { error: 'Reservation not found.' },
        { status: 404 }
      );
    }
    const current = existing as ReservationRow;
    if (!CANCELLABLE_STATES.has(current.state)) {
      return NextResponse.json(
        {
          error:
            current.state === 'checked_out'
              ? 'Reservation is already checked out — use the §5.12.6 ' +
                'check-in scan flow to close it, not cancel.'
              : `Reservation is in terminal state '${current.state}' ` +
                'and cannot be cancelled.',
          current_state: current.state,
        },
        { status: 409 }
      );
    }

    // Append the cancel reason to notes (preserving any prior
    // OVERRIDE: prefix) so the timeline + audit log carry the
    // justification. The base column update doesn't touch other
    // columns; the seeds/239 BEFORE-UPDATE trigger refreshes
    // updated_at and the AFTER-UPDATE trigger releases the
    // unit's current_reservation_id + next_available_at.
    const finalNotes = (() => {
      if (!reason) return current.notes;
      const prefix = 'CANCEL';
      const reasonLine = `${prefix}: ${reason}`;
      return current.notes
        ? `${current.notes} — ${reasonLine}`
        : reasonLine;
    })();

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('equipment_reservations')
      .update({ state: 'cancelled', notes: finalNotes })
      .eq('id', reservationId)
      .eq('state', 'held') // belt-and-suspenders against TOCTOU
      .select(
        'id, equipment_inventory_id, job_id, state, reserved_from, ' +
          'reserved_to, is_override, notes, actual_checked_out_at, ' +
          'actual_returned_at, override_reason, updated_at'
      )
      .maybeSingle();
    if (updateErr) {
      console.error(
        '[admin/equipment/cancel-reservation] update failed',
        { reservationId, error: updateErr.message }
      );
      return NextResponse.json(
        { error: updateErr.message },
        { status: 500 }
      );
    }
    if (!updated) {
      // The state-equality guard rejected — someone else flipped
      // it between our read and write. Re-read so the caller
      // sees the actual current state and can decide how to react.
      const { data: latest } = await supabaseAdmin
        .from('equipment_reservations')
        .select('state')
        .eq('id', reservationId)
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

    console.log('[admin/equipment/cancel-reservation POST] cancelled', {
      reservation_id: reservationId,
      job_id: current.job_id,
      equipment_inventory_id: current.equipment_inventory_id,
      was_override: current.is_override,
      had_reason: !!reason,
      admin_email: session.user.email,
    });

    return NextResponse.json({
      reservation: updated,
      previous_state: current.state,
    });
  },
  { routeName: 'admin/equipment/cancel-reservation#post' }
);
