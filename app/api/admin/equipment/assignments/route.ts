// app/api/admin/equipment/assignments/route.ts
//
// GET /api/admin/equipment/assignments?state=open|all&limit=
//
// E3 of EQUIPMENT_MANAGER_BUILDOUT_2026-06-22.md — lists direct check-out
// assignments for the "Checked out" manager view. Defaults to the OPEN set
// (still out). Joins the equipment name + the vehicle name so the UI needs no
// extra round-trips.
//
// Auth: admin / developer / equipment_manager.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const GET = withErrorHandler(
  async (req: NextRequest) => {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const roles = (session.user as { roles?: string[] } | undefined)?.roles ?? [];
    if (!isAdmin(session.user.roles) && !roles.includes('equipment_manager')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(req.url);
    const state = url.searchParams.get('state') ?? 'open';
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 200) || 200, 500);

    let q = supabaseAdmin
      .from('equipment_assignments')
      .select(
        'id, equipment_id, assigned_kind, assigned_user_id, assigned_vehicle_id, assigned_label, ' +
        'checked_out_at, checkout_condition, checkout_notes, expected_back_at, ' +
        'checked_in_at, return_condition, return_notes, consumed_quantity, ' +
        'equipment:equipment_inventory!equipment_id(name, category, item_kind, unit), ' +
        'vehicle:vehicles!assigned_vehicle_id(name)',
      )
      .order('checked_out_at', { ascending: false })
      .limit(limit);

    if (state === 'open') q = q.is('checked_in_at', null);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []) as Array<{ assigned_user_id: string | null } & Record<string, unknown>>;

    // Resolve the assigned employee (team lead) names — assigned_user_id points
    // at registered_users, which PostgREST can't embed, so batch-fetch.
    const userIds = Array.from(new Set(rows.map((r) => r.assigned_user_id).filter((v): v is string => !!v)));
    const nameById = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from('registered_users')
        .select('id, name')
        .in('id', userIds);
      for (const u of (users ?? []) as Array<{ id: string; name: string | null }>) {
        if (u.name) nameById.set(u.id, u.name);
      }
    }

    const assignments = rows.map((r) => ({
      ...r,
      assigned_user_name: r.assigned_user_id ? (nameById.get(r.assigned_user_id) ?? null) : null,
    }));
    return NextResponse.json({ assignments });
  },
  { routeName: 'admin/equipment/assignments' },
);
