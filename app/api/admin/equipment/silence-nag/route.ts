// app/api/admin/equipment/silence-nag/route.ts
//
// POST /api/admin/equipment/silence-nag
//   body: { reservation_id: UUID, until?: ISO }
//
// Phase F10.5-f-iii — backs the "Mark in transit" inline action
// on the F10.5-f-ii overdue-gear notification. The surveyor is
// driving the gear back right now and doesn't want a 9pm nag if
// 6pm just fired and they'll be at the office in 30 minutes.
// Sets `nag_silenced_until` on the row; the F10.5-f-ii cron
// query skips silenced rows until the timestamp passes.
//
// `until` defaults to MIDNIGHT TONIGHT (00:00 next-day local-as-
// UTC for v1; DST-aware tuning is a polish item) when omitted.
// Capped at end-of-day-tomorrow as a sanity ceiling — silencing
// a nag for longer than that is conceptually "extend the
// reservation," which goes through F10.5-d, not here.
//
// State guard: only `checked_out` rows can be silenced.
// Returned / cancelled / held silencing is meaningless.
//
// Auth: admin / developer / equipment_manager OR the row's
// `checked_out_to_user` (the surveyor with the gear in their
// truck — the inline notification action runs in their session).

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

interface ReservationRow {
  id: string;
  job_id: string;
  state: string;
  checked_out_to_user: string | null;
  reserved_to: string;
  nag_silenced_until: string | null;
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
      | { reservation_id?: unknown; until?: unknown }
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

    // Resolve until ISO. Default = midnight tonight UTC.
    // (Spec says "silenced until midnight" — we store that
    // moment in UTC and the cron compares against now() in UTC.)
    let untilIso: string;
    const nowMs = Date.now();
    if (body.until !== undefined && body.until !== null) {
      if (typeof body.until !== 'string') {
        return NextResponse.json(
          { error: '`until` must be a string when present.' },
          { status: 400 }
        );
      }
      const t = Date.parse(body.until);
      if (!Number.isFinite(t)) {
        return NextResponse.json(
          { error: '`until` must be a parseable ISO timestamp.' },
          { status: 400 }
        );
      }
      if (t <= nowMs) {
        return NextResponse.json(
          { error: '`until` must be in the future.' },
          { status: 400 }
        );
      }
      // Sanity ceiling: end-of-day-tomorrow. Anything longer
      // belongs in F10.5-d (extend the reservation), not here.
      const tomorrowEnd = new Date(nowMs);
      tomorrowEnd.setUTCDate(tomorrowEnd.getUTCDate() + 2);
      tomorrowEnd.setUTCHours(0, 0, 0, 0);
      if (t > tomorrowEnd.getTime()) {
        return NextResponse.json(
          {
            error:
              '`until` cannot be more than 2 days out. To silence longer, ' +
              'use /extend-reservation to push reserved_to forward instead.',
          },
          { status: 400 }
        );
      }
      untilIso = new Date(t).toISOString();
    } else {
      // Default = midnight tonight (next 00:00 UTC).
      const midnight = new Date(nowMs);
      midnight.setUTCDate(midnight.getUTCDate() + 1);
      midnight.setUTCHours(0, 0, 0, 0);
      untilIso = midnight.toISOString();
    }

    // ── Read + auth gate ────────────────────────────────────────
    const { data, error: readErr } = await supabaseAdmin
      .from('equipment_reservations')
      .select(
        'id, job_id, state, checked_out_to_user, reserved_to, ' +
          'nag_silenced_until'
      )
      .eq('id', reservationId)
      .maybeSingle();
    if (readErr) {
      console.error(
        '[admin/equipment/silence-nag] read failed',
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

    const isOwnRow =
      !!actorUserId && row.checked_out_to_user === actorUserId;
    if (!isPrivileged && !isOwnRow) {
      return NextResponse.json(
        {
          error:
            'You can only silence nags for a reservation you currently ' +
            'hold (checked_out_to_user must match), or you must be ' +
            'admin / equipment_manager.',
        },
        { status: 403 }
      );
    }

    if (row.state !== 'checked_out') {
      return NextResponse.json(
        {
          error:
            row.state === 'returned'
              ? 'Reservation already returned — no nag to silence.'
              : `Reservation is in state '${row.state}'; silencing is only ` +
                'meaningful for checked_out rows.',
          current_state: row.state,
        },
        { status: 409 }
      );
    }

    // ── Apply with TOCTOU guard ─────────────────────────────────
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('equipment_reservations')
      .update({ nag_silenced_until: untilIso })
      .eq('id', reservationId)
      .eq('state', 'checked_out')
      .select(
        'id, job_id, state, reserved_to, nag_silenced_until, updated_at'
      )
      .maybeSingle();
    if (updateErr) {
      console.error(
        '[admin/equipment/silence-nag] update failed',
        { reservationId, error: updateErr.message }
      );
      return NextResponse.json(
        { error: updateErr.message },
        { status: 500 }
      );
    }
    if (!updated) {
      // Race — another action moved the row out of checked_out
      // between our read and write.
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

    console.log('[admin/equipment/silence-nag POST] ok', {
      reservation_id: reservationId,
      until: untilIso,
      previous_silenced_until: row.nag_silenced_until,
      actor_email: session.user.email,
      privileged_bypass: !isOwnRow,
    });

    return NextResponse.json({
      reservation: updated,
      previous_silenced_until: row.nag_silenced_until,
    });
  },
  { routeName: 'admin/equipment/silence-nag#post' }
);
