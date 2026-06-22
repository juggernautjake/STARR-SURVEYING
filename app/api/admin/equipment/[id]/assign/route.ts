// app/api/admin/equipment/[id]/assign/route.ts
//
// POST /api/admin/equipment/{id}/assign — direct check-OUT.
//
// E2 of EQUIPMENT_MANAGER_BUILDOUT_2026-06-22.md. Checks an available item out
// to a crew member, a vehicle, maintenance, or "other" (free label), with a
// condition. Creates an OPEN equipment_assignments row, flips
// equipment_inventory.current_status, and writes the equipment_events log.
//
// Body: {
//   assigned_kind: 'crew' | 'vehicle' | 'maintenance' | 'other',
//   assigned_user_id?: UUID, assigned_vehicle_id?: UUID, assigned_label?: string,
//   condition?: 'good' | 'fair' | 'damaged',  expected_back_at?: ISO, notes?: string
// }
//
// Auth: admin / developer / equipment_manager.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  ASSIGNED_KINDS, CHECKOUT_CONDITIONS, canCheckOut, statusForCheckout,
  checkoutEventType, isUuid, type AssignedKind, type CheckoutCondition,
} from '@/lib/equipment/assignment';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const POST = withErrorHandler(
  async (req: NextRequest) => {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const roles = (session.user as { roles?: string[] } | undefined)?.roles ?? [];
    if (!isAdmin(session.user.roles) && !roles.includes('equipment_manager')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const segs = new URL(req.url).pathname.split('/').filter(Boolean);
    const id = segs[segs.length - 2];
    if (!id || !UUID_RE.test(id)) {
      return NextResponse.json({ error: 'id must be a UUID' }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const kind = body.assigned_kind as AssignedKind;
    if (!ASSIGNED_KINDS.includes(kind)) {
      return NextResponse.json(
        { error: `assigned_kind must be one of ${ASSIGNED_KINDS.join(', ')}` },
        { status: 400 },
      );
    }
    const condition = (typeof body.condition === 'string' && CHECKOUT_CONDITIONS.includes(body.condition as CheckoutCondition))
      ? (body.condition as CheckoutCondition) : 'good';

    // Read current state.
    const { data: item, error: readErr } = await supabaseAdmin
      .from('equipment_inventory')
      .select('id, name, current_status, item_kind')
      .eq('id', id)
      .maybeSingle();
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    if (!item) return NextResponse.json({ error: 'Equipment not found' }, { status: 404 });

    const gate = canCheckOut((item as { current_status: string | null }).current_status);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.reason }, { status: 409 });
    }

    const nowIso = new Date().toISOString();
    const rawActorId = (session.user as unknown as { id?: unknown }).id;
    const actor = isUuid(rawActorId) ? rawActorId : null;

    const insertRow = {
      equipment_id: id,
      assigned_kind: kind,
      assigned_user_id: kind === 'crew' && isUuid(body.assigned_user_id) ? body.assigned_user_id : null,
      assigned_vehicle_id: kind === 'vehicle' && isUuid(body.assigned_vehicle_id) ? body.assigned_vehicle_id : null,
      assigned_label: typeof body.assigned_label === 'string' ? body.assigned_label.trim().slice(0, 200) || null : null,
      checked_out_at: nowIso,
      checked_out_by: actor,
      checkout_condition: condition,
      checkout_notes: typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) || null : null,
      expected_back_at: typeof body.expected_back_at === 'string' ? body.expected_back_at : null,
    };

    const { data: assignment, error: insErr } = await supabaseAdmin
      .from('equipment_assignments')
      .insert(insertRow)
      .select('*')
      .single();
    if (insErr) {
      // 23505 = the partial-unique "one open assignment per item" guard.
      if (insErr.code === '23505') {
        return NextResponse.json({ error: 'This item is already checked out.' }, { status: 409 });
      }
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    // Flip inventory status.
    await supabaseAdmin
      .from('equipment_inventory')
      .update({ current_status: statusForCheckout(kind), updated_at: nowIso })
      .eq('id', id);

    // Audit log (best-effort).
    const { error: auditErr } = await supabaseAdmin.from('equipment_events').insert({
      equipment_id: id,
      actor_user_id: actor,
      event_type: checkoutEventType(kind),
      notes: insertRow.checkout_notes,
      payload: {
        assignment_id: (assignment as { id: string }).id,
        assigned_kind: kind,
        condition,
        by_email: session.user.email,
      },
    });
    if (auditErr) console.warn('[equipment/:id/assign] audit write failed', auditErr.message);

    return NextResponse.json({ assignment });
  },
  { routeName: 'admin/equipment/:id/assign' },
);
