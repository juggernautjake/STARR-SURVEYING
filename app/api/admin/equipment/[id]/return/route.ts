// app/api/admin/equipment/[id]/return/route.ts
//
// POST /api/admin/equipment/{id}/return — direct check-IN.
//
// E2 of EQUIPMENT_MANAGER_BUILDOUT_2026-06-22.md. Closes the item's OPEN
// equipment_assignments row, records return condition + notes, frees the item
// (current_status back to available), decrements consumable stock by any units
// used, and — if the item came back damaged or lost — auto-creates a
// maintenance triage event and parks the item in maintenance/lost.
//
// Body: {
//   condition: 'good'|'fair'|'damaged'|'lost',
//   consumed_quantity?: number,   // consumables only
//   notes?: string
// }
//
// Auth: admin / developer / equipment_manager.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  RETURN_CONDITIONS, statusAfterReturn, needsMaintenanceTriage,
  checkinEventType, isUuid, type ReturnCondition,
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
    const condition = body.condition as ReturnCondition;
    if (!RETURN_CONDITIONS.includes(condition)) {
      return NextResponse.json(
        { error: `condition must be one of ${RETURN_CONDITIONS.join(', ')}` },
        { status: 400 },
      );
    }
    const consumed = typeof body.consumed_quantity === 'number' && body.consumed_quantity > 0
      ? Math.round(body.consumed_quantity) : 0;

    // Find the open assignment.
    const { data: open, error: openErr } = await supabaseAdmin
      .from('equipment_assignments')
      .select('id, equipment_id')
      .eq('equipment_id', id)
      .is('checked_in_at', null)
      .maybeSingle();
    if (openErr) return NextResponse.json({ error: openErr.message }, { status: 500 });
    if (!open) {
      return NextResponse.json({ error: 'This item is not currently checked out.' }, { status: 409 });
    }

    // Read item to know if it's a consumable + current stock.
    const { data: item } = await supabaseAdmin
      .from('equipment_inventory')
      .select('id, name, item_kind, quantity_on_hand')
      .eq('id', id)
      .maybeSingle();
    const itemRow = item as { item_kind?: string; quantity_on_hand?: number } | null;

    const nowIso = new Date().toISOString();
    const rawActorId = (session.user as unknown as { id?: unknown }).id;
    const actor = isUuid(rawActorId) ? rawActorId : null;
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) || null : null;

    // Close the assignment.
    const { data: closed, error: closeErr } = await supabaseAdmin
      .from('equipment_assignments')
      .update({
        checked_in_at: nowIso,
        returned_by: actor,
        return_condition: condition,
        return_notes: notes,
        consumed_quantity: consumed > 0 ? consumed : null,
        updated_at: nowIso,
      })
      .eq('id', (open as { id: string }).id)
      .is('checked_in_at', null) // race guard
      .select('*')
      .maybeSingle();
    if (closeErr) return NextResponse.json({ error: closeErr.message }, { status: 500 });
    if (!closed) {
      return NextResponse.json({ error: 'This item was just checked in by someone else.' }, { status: 409 });
    }

    // Free the item (or park in maintenance/lost).
    await supabaseAdmin
      .from('equipment_inventory')
      .update({ current_status: statusAfterReturn(condition), updated_at: nowIso })
      .eq('id', id);

    // Decrement consumable stock by units used (guard >= 0).
    let stockAfter: number | null = null;
    if (consumed > 0 && itemRow?.item_kind === 'consumable') {
      const before = typeof itemRow.quantity_on_hand === 'number' ? itemRow.quantity_on_hand : 0;
      stockAfter = Math.max(0, before - consumed);
      await supabaseAdmin
        .from('equipment_inventory')
        .update({ quantity_on_hand: stockAfter, updated_at: nowIso })
        .eq('id', id);
    }

    // Damaged / lost → auto-create a maintenance triage event.
    let triageEventId: string | null = null;
    if (needsMaintenanceTriage(condition)) {
      const { data: ev } = await supabaseAdmin
        .from('maintenance_events')
        .insert({
          equipment_inventory_id: id,
          kind: 'damage_triage',
          origin: condition === 'lost' ? 'lost_returned' : 'damaged_return',
          state: 'scheduled',
          summary: condition === 'lost' ? 'Reported lost on check-in' : 'Returned damaged — needs triage',
          notes,
        })
        .select('id')
        .maybeSingle();
      triageEventId = (ev as { id?: string } | null)?.id ?? null;
    }

    // Audit log (best-effort).
    await supabaseAdmin.from('equipment_events').insert({
      equipment_id: id,
      actor_user_id: actor,
      event_type: checkinEventType(condition),
      notes,
      payload: {
        assignment_id: (closed as { id: string }).id,
        return_condition: condition,
        consumed_quantity: consumed || undefined,
        stock_after: stockAfter ?? undefined,
        maintenance_event_id: triageEventId ?? undefined,
        by_email: session.user.email,
      },
    });

    return NextResponse.json({
      assignment: closed,
      stock_after: stockAfter,
      maintenance_event_id: triageEventId,
    });
  },
  { routeName: 'admin/equipment/:id/return' },
);
