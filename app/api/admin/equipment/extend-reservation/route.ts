// app/api/admin/equipment/extend-reservation/route.ts
//
// POST /api/admin/equipment/extend-reservation
//
// Phase F10.5-d — moves a reservation's `reserved_to` forward.
// Two callers per §5.12.6:
//
//   1. The 6pm/9pm overdue-gear nag's "Extend until tomorrow
//      8am" inline button → notification action.
//   2. The mobile clock-out modal's "Keep overnight" choice
//      when the surveyor still has gear in their truck.
//
// Body:
//   {
//     reservation_id: UUID,
//     new_reserved_to: ISO,
//     source?: 'nag' | 'clock_out' | 'manual'
//   }
//
// Audit invariants:
//   * `original_reserved_to` is captured the FIRST TIME a row
//     is extended via this endpoint and never overwritten on
//     subsequent extends, so the audit trail records the
//     schedule slipped vs. ran long.
//   * `extended_overnight_at` is set when source ∈ {nag, clock_
//     out} since both convey deliberate overnight retention.
//     Manual dispatcher extends (source='manual' or omitted)
//     update reserved_to without setting the overnight flag.
//
// Race-safety: the seeds/239 GiST EXCLUDE forbids two ACTIVE
// reservations from overlapping for the same instrument. If
// the new window collides with another held/checked_out row,
// Postgres rejects with 23P01 which we map to a typed
// `extend_collides` conflict.
//
// Auth: admin / developer / equipment_manager OR the
// `checked_out_to_user` of the row (the surveyor with the gear
// in their truck — the nag action runs in their session).

import { NextRequest, NextResponse } from 'next/server';
import type { PostgrestError } from '@supabase/supabase-js';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const ALLOWED_SOURCES = new Set(['nag', 'clock_out', 'manual']);

const EXTENDABLE_STATES = new Set(['held', 'checked_out']);

interface ReservationRow {
  id: string;
  equipment_inventory_id: string;
  job_id: string;
  reserved_from: string;
  reserved_to: string;
  state: string;
  checked_out_to_user: string | null;
  original_reserved_to: string | null;
  extended_overnight_at: string | null;
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
    const actorUserId =
      (session.user as { id?: string } | undefined)?.id ?? null;
    const isPrivileged =
      isAdmin(session.user.roles) ||
      userRoles.includes('equipment_manager');

    const body = (await req.json().catch(() => null)) as
      | {
          reservation_id?: unknown;
          new_reserved_to?: unknown;
          source?: unknown;
        }
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

    const newReservedToRaw =
      typeof body.new_reserved_to === 'string' ? body.new_reserved_to : '';
    const newReservedToTime = Date.parse(newReservedToRaw);
    if (!Number.isFinite(newReservedToTime)) {
      return NextResponse.json(
        { error: '`new_reserved_to` must be a parseable ISO timestamp.' },
        { status: 400 }
      );
    }
    const newReservedTo = new Date(newReservedToTime).toISOString();

    let source: 'nag' | 'clock_out' | 'manual' = 'manual';
    if (body.source !== undefined && body.source !== null) {
      if (
        typeof body.source !== 'string' ||
        !ALLOWED_SOURCES.has(body.source)
      ) {
        return NextResponse.json(
          {
            error:
              '`source` must be one of: ' +
              Array.from(ALLOWED_SOURCES).join(', '),
          },
          { status: 400 }
        );
      }
      source = body.source as 'nag' | 'clock_out' | 'manual';
    }

    // ── Read the row + auth gate ────────────────────────────────
    const { data, error: readErr } = await supabaseAdmin
      .from('equipment_reservations')
      .select(
        'id, equipment_inventory_id, job_id, reserved_from, reserved_to, ' +
          'state, checked_out_to_user, original_reserved_to, ' +
          'extended_overnight_at, notes'
      )
      .eq('id', reservationId)
      .maybeSingle();
    if (readErr) {
      console.error(
        '[admin/equipment/extend-reservation] read failed',
        { reservationId, error: readErr.message }
      );
      return NextResponse.json(
        { error: readErr.message },
        { status: 500 }
      );
    }
    if (!data) {
      return NextResponse.json(
        { error: 'Reservation not found.' },
        { status: 404 }
      );
    }
    const row = data as ReservationRow;

    // Auth: privileged dispatcher OR the surveyor who has the
    // gear in their truck (the nag-action / clock-out path).
    const isOwnRow =
      !!actorUserId && row.checked_out_to_user === actorUserId;
    if (!isPrivileged && !isOwnRow) {
      return NextResponse.json(
        {
          error:
            'You can only extend a reservation you currently hold ' +
            '(checked_out_to_user must match), or you must be admin / ' +
            'equipment_manager.',
        },
        { status: 403 }
      );
    }

    // State guard: only held / checked_out are extendable.
    if (!EXTENDABLE_STATES.has(row.state)) {
      return NextResponse.json(
        {
          error:
            row.state === 'returned'
              ? 'Reservation already returned — no extend possible.'
              : `Reservation is in state '${row.state}' and not ` +
                'extendable.',
          current_state: row.state,
        },
        { status: 409 }
      );
    }

    // The new window must end strictly after the current one.
    // Shrinking is a separate operation (cancel + re-reserve).
    const currentEndMs = Date.parse(row.reserved_to);
    if (newReservedToTime <= currentEndMs) {
      return NextResponse.json(
        {
          error:
            '`new_reserved_to` must be strictly after the current ' +
            `reserved_to (${row.reserved_to}). To shrink a window, ` +
            'cancel + re-reserve instead.',
          current_reserved_to: row.reserved_to,
        },
        { status: 400 }
      );
    }

    // Audit: capture original_reserved_to ONLY on the first
    // extend so the audit trail records the schedule slipped vs.
    // ran long. Subsequent extends preserve the existing value.
    const captureOriginal = row.original_reserved_to == null;
    const overnightFlag =
      source === 'nag' || source === 'clock_out'
        ? new Date().toISOString()
        : null;

    const update: Record<string, unknown> = { reserved_to: newReservedTo };
    if (captureOriginal) update.original_reserved_to = row.reserved_to;
    // Only set extended_overnight_at when this extend conveys
    // deliberate overnight retention; preserve any prior flag
    // when the new source isn't overnight-flavoured (a manual
    // dispatch extend after a nag-extend shouldn't overwrite
    // the nag's audit anchor).
    if (overnightFlag && !row.extended_overnight_at) {
      update.extended_overnight_at = overnightFlag;
    }

    // ── Apply with TOCTOU guard ─────────────────────────────────
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('equipment_reservations')
      .update(update)
      .eq('id', reservationId)
      .in('state', Array.from(EXTENDABLE_STATES))
      .select(
        'id, equipment_inventory_id, job_id, reserved_from, reserved_to, ' +
          'state, original_reserved_to, extended_overnight_at, ' +
          'is_override, override_reason, notes, updated_at'
      )
      .maybeSingle();
    if (updateErr) {
      const pgErr = updateErr as PostgrestError;
      if (pgErr.code === '23P01') {
        // The new window collides with another active reservation
        // for the same instrument. Map to a typed conflict so
        // the caller surfaces "until 8am tomorrow conflicts with
        // Job #428 starting at 7am — pick a different end time."
        return NextResponse.json(
          {
            error:
              'Extending to ' +
              newReservedTo +
              ' would overlap another active reservation for this ' +
              'instrument. Pick an earlier end time.',
            code: 'extend_collides',
          },
          { status: 409 }
        );
      }
      console.error(
        '[admin/equipment/extend-reservation] update failed',
        {
          reservationId,
          new_reserved_to: newReservedTo,
          code: pgErr.code,
          error: pgErr.message,
        }
      );
      return NextResponse.json(
        { error: pgErr.message ?? 'Extend failed.' },
        { status: 500 }
      );
    }
    if (!updated) {
      const { data: latest } = await supabaseAdmin
        .from('equipment_reservations')
        .select('state, reserved_to')
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

    console.log('[admin/equipment/extend-reservation POST] ok', {
      reservation_id: reservationId,
      previous_reserved_to: row.reserved_to,
      new_reserved_to: newReservedTo,
      source,
      captured_original: captureOriginal,
      overnight_flag_set: !!overnightFlag && !row.extended_overnight_at,
      actor_email: session.user.email,
    });

    return NextResponse.json({
      reservation: updated,
      previous_reserved_to: row.reserved_to,
    });
  },
  { routeName: 'admin/equipment/extend-reservation#post' }
);
