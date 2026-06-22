// app/api/admin/equipment/[id]/use/route.ts
//
// POST /api/admin/equipment/{id}/use — record ad-hoc consumable usage.
//
// E4 of EQUIPMENT_MANAGER_BUILDOUT_2026-06-22.md. Lets the equipment manager log
// "we used N of this" any time, independent of a check-in. Decrements
// quantity_on_hand (floored at 0) and writes an equipment_events row so the
// 30-day burn-rate on the consumables dashboard stays accurate.
//
// Body: { quantity: number, notes?: string }
// Refuses on non-consumables and retired rows (mirrors restock).
//
// Auth: admin / developer / equipment_manager.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

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
    const quantity = typeof body.quantity === 'number' ? Math.round(body.quantity) : NaN;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: 'quantity must be a positive number' }, { status: 400 });
    }
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) || null : null;

    const { data: inv, error: readErr } = await supabaseAdmin
      .from('equipment_inventory')
      .select('id, name, item_kind, retired_at, quantity_on_hand, unit')
      .eq('id', id)
      .maybeSingle();
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    if (!inv) return NextResponse.json({ error: 'Equipment not found' }, { status: 404 });

    const row = inv as { item_kind?: string; retired_at?: string | null; quantity_on_hand?: number | null };
    if (row.item_kind !== 'consumable') {
      return NextResponse.json({ error: 'Usage only applies to consumables.' }, { status: 400 });
    }
    if (row.retired_at) {
      return NextResponse.json({ error: 'This item is retired.' }, { status: 400 });
    }

    const before = row.quantity_on_hand ?? 0;
    const after = Math.max(0, before - quantity);
    const nowIso = new Date().toISOString();

    const { data: updated, error: updErr } = await supabaseAdmin
      .from('equipment_inventory')
      .update({ quantity_on_hand: after, updated_at: nowIso })
      .eq('id', id)
      .select('id, name, quantity_on_hand, low_stock_threshold, unit')
      .maybeSingle();
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    const rawActorId = (session.user as unknown as { id?: unknown }).id;
    const actor = typeof rawActorId === 'string' && UUID_RE.test(rawActorId) ? rawActorId : null;
    await supabaseAdmin.from('equipment_events').insert({
      equipment_id: id,
      actor_user_id: actor,
      event_type: 'consumed',
      notes,
      payload: { quantity_used: quantity, on_hand_before: before, on_hand_after: after, by_email: session.user.email },
    });

    return NextResponse.json({ item: updated, quantity_used: quantity, on_hand_after: after });
  },
  { routeName: 'admin/equipment/:id/use' },
);
