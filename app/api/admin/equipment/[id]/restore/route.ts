// app/api/admin/equipment/[id]/restore/route.ts
//
// POST /api/admin/equipment/{id}/restore
//
// Un-retire a previously soft-archived unit (Phase F10.1e-i).
// Clears retired_at + retired_reason and flips current_status
// back to 'available' (the safe default — the operator can move
// it through the lifecycle via the F10.1d edit modal afterward).
//
// Body: { reason?: string }
// Reason is optional but surfaces in the equipment_events
// audit-log row as the "why we un-retired" justification —
// useful when a Section 179'd unit gets pulled back into service
// after the bookkeeper finds it in storage.
//
// Refuses if the row is NOT currently retired (idempotent —
// re-runs return the existing state with a 200 +
// already_active:true flag).
//
// Auth: admin / developer / equipment_manager.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface RestoreBody {
  reason?: unknown;
}

const SELECT_COLUMNS =
  'id, name, current_status, retired_at, retired_reason';

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

    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const id = pathSegments[pathSegments.length - 2];
    if (!id || !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
      return NextResponse.json(
        { error: 'id must be a UUID' },
        { status: 400 }
      );
    }

    let body: RestoreBody;
    try {
      body = (await req.json()) as RestoreBody;
    } catch {
      body = {};
    }
    const reason =
      typeof body.reason === 'string' ? body.reason.trim() : '';

    const { data: current, error: readErr } = await supabaseAdmin
      .from('equipment_inventory')
      .select(SELECT_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (readErr) {
      console.error('[admin/equipment/:id/restore] read failed', {
        id,
        error: readErr.message,
      });
      return NextResponse.json({ error: readErr.message }, { status: 500 });
    }
    if (!current) {
      return NextResponse.json(
        { error: 'Equipment row not found' },
        { status: 404 }
      );
    }

    type Row = {
      id: string;
      name: string | null;
      current_status: string | null;
      retired_at: string | null;
      retired_reason: string | null;
    };
    const row = current as Row;

    if (!row.retired_at) {
      return NextResponse.json({
        item: row,
        already_active: true,
      });
    }

    const previousReason = row.retired_reason;
    const nowIso = new Date().toISOString();
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('equipment_inventory')
      .update({
        retired_at: null,
        retired_reason: null,
        current_status: 'available',
        updated_at: nowIso,
      })
      .eq('id', id)
      .not('retired_at', 'is', null) // race guard
      .select(SELECT_COLUMNS)
      .maybeSingle();

    if (updateErr) {
      console.error('[admin/equipment/:id/restore] update failed', {
        id,
        error: updateErr.message,
      });
      return NextResponse.json(
        { error: updateErr.message },
        { status: 500 }
      );
    }

    if (!updated) {
      const { data: refreshed } = await supabaseAdmin
        .from('equipment_inventory')
        .select(SELECT_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      return NextResponse.json({
        item: refreshed ?? row,
        already_active: true,
      });
    }

    // Audit log — best-effort, same posture as the retire endpoint.
    const { error: auditErr } = await supabaseAdmin
      .from('equipment_events')
      .insert({
        equipment_id: id,
        event_type: 'restored',
        notes: reason || 'restored to active inventory',
        payload: {
          previous_retired_reason: previousReason,
          restored_by_email: session.user.email,
        },
      });
    if (auditErr) {
      console.warn(
        '[admin/equipment/:id/restore] audit-log write failed',
        { id, error: auditErr.message }
      );
    }

    console.log('[admin/equipment/:id/restore] restored', {
      id,
      previous_retired_reason: previousReason,
      admin_email: session.user.email,
    });

    return NextResponse.json({ item: updated, already_active: false });
  },
  { routeName: 'admin/equipment/:id/restore' }
);
