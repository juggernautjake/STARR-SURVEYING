// app/api/admin/equipment/my-checkouts/route.ts
//
// GET /api/admin/equipment/my-checkouts
//
// Phase F10.5-h-i — backs the §5.12.6 clock-out gating modal.
// Returns every checked_out reservation owned by the
// authenticated user (`checked_out_to_user = session.user.id`).
// Mobile fetches this when the surveyor taps "Clock out" on the
// Time tab; if any rows come back, the app renders:
//
//   "You have N items still checked out:
//     • Kit #3
//     • GPS Rover #2
//     • 12× ribbon
//   Returning now? [Scan to return] [Keep overnight]"
//
// "Keep overnight" stamps `extended_overnight_at` via F10.5-d
// /extend-reservation; "Scan to return" routes through the
// existing /check-in flow.
//
// Endpoint is intentionally generous on auth — any
// authenticated user can ask for THEIR OWN list. No role
// gate, no admin-only restriction. The query is keyed on
// `checked_out_to_user = me`, so a surveyor never sees
// somebody else's truck.
//
// Returns:
//   { reservations: [...] }   ordered by reserved_to ASC so the
//                             "due back soonest" row comes first

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface ReservationRow {
  id: string;
  job_id: string;
  equipment_inventory_id: string;
  reserved_from: string;
  reserved_to: string;
  state: string;
  is_override: boolean;
  notes: string | null;
  actual_checked_out_at: string | null;
  checked_out_condition: string | null;
  nag_silenced_until: string | null;
  extended_overnight_at: string | null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  void req;
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = (session.user as { id?: string } | undefined)?.id ?? null;
  if (!userId) {
    return NextResponse.json(
      { error: 'Session is missing user id; cannot resolve checkouts.' },
      { status: 500 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('equipment_reservations')
    .select(
      'id, job_id, equipment_inventory_id, reserved_from, reserved_to, ' +
        'state, is_override, notes, actual_checked_out_at, ' +
        'checked_out_condition, nag_silenced_until, extended_overnight_at'
    )
    .eq('state', 'checked_out')
    .eq('checked_out_to_user', userId)
    .order('reserved_to', { ascending: true });
  if (error) {
    console.error(
      '[admin/equipment/my-checkouts GET] read failed',
      { user_id: userId, error: error.message }
    );
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const reservations = (data ?? []) as ReservationRow[];

  if (reservations.length === 0) {
    return NextResponse.json({ reservations: [] });
  }

  // Resolve display fields so the mobile modal renders names,
  // not UUIDs. Single round-trip via .in().
  const equipmentIds = Array.from(
    new Set(reservations.map((r) => r.equipment_inventory_id))
  );
  const equipmentById = new Map<
    string,
    { name: string | null; item_kind: string | null; qr_code_id: string | null }
  >();
  if (equipmentIds.length > 0) {
    const { data: items, error: eqErr } = await supabaseAdmin
      .from('equipment_inventory')
      .select('id, name, item_kind, qr_code_id')
      .in('id', equipmentIds);
    if (eqErr) {
      console.warn(
        '[admin/equipment/my-checkouts GET] equipment lookup failed',
        { error: eqErr.message }
      );
    } else {
      for (const r of (items ?? []) as Array<{
        id: string;
        name: string | null;
        item_kind: string | null;
        qr_code_id: string | null;
      }>) {
        equipmentById.set(r.id, {
          name: r.name,
          item_kind: r.item_kind,
          qr_code_id: r.qr_code_id,
        });
      }
    }
  }

  const enriched = reservations.map((r) => {
    const inv = equipmentById.get(r.equipment_inventory_id);
    const overdue = Date.parse(r.reserved_to) < Date.now();
    return {
      ...r,
      equipment_name: inv?.name ?? null,
      equipment_item_kind: inv?.item_kind ?? null,
      equipment_qr_code_id: inv?.qr_code_id ?? null,
      overdue,
    };
  });

  console.log('[admin/equipment/my-checkouts GET]', {
    user_id: userId,
    count: enriched.length,
    overdue_count: enriched.filter((r) => r.overdue).length,
    actor_email: session.user.email,
  });

  return NextResponse.json({ reservations: enriched });
}, { routeName: 'admin/equipment/my-checkouts#get' });
