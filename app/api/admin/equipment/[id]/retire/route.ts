// app/api/admin/equipment/[id]/retire/route.ts
//
// POST /api/admin/equipment/{id}/retire
//
// Soft-archive a unit (Phase F10.1e-i). Sets retired_at = now(),
// retired_reason from the body, and flips current_status to
// 'retired'. The §5.12.1 retired_at column lives forever on the
// row so the §5.12.10 depreciation closeout, §5.12.11.K
// chain-of-custody PDF, and §5.12.7.8 templates-referencing-
// retired-gear cleanup queue all keep their reference shape.
//
// Body: { reason: string, notes?: string }
// Reason is open-string for forward compatibility (matches the
// equipment_events.event_type pattern from seeds/236), but a
// short canonical list lives in the comment below for the UI to
// pick from.
//
// Side-effect: writes an equipment_events row with
//   event_type='retired', notes=<reason + freeform>,
//   payload={ retired_reason, current_status_before }
// so the §5.12.7.3 inventory drilldown's history tab can render
// retire events without a join.
//
// Refuses if the row is already retired (idempotent — re-runs
// return the existing state with a 200 + already_retired:true
// flag).
//
// Auth: admin / developer / equipment_manager. tech_support
// read-only — same posture as POST + PATCH.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface RetireBody {
  reason?: unknown;
  notes?: unknown;
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
    // Path is /api/admin/equipment/[id]/retire — the id is the
    // second-to-last segment.
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const id = pathSegments[pathSegments.length - 2];
    if (!id || !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
      return NextResponse.json(
        { error: 'id must be a UUID' },
        { status: 400 }
      );
    }

    let body: RetireBody;
    try {
      body = (await req.json()) as RetireBody;
    } catch {
      // Body is optional — accept empty.
      body = {};
    }

    // Reason is required for audit-trail value but kept permissive
    // — short canonical strings the UI surfaces:
    //   sold | traded | scrapped | donated | lost | stolen |
    //   damaged_beyond_repair | obsolete | transfer_out |
    //   other_with_text
    // The equipment_events row preserves the freeform string so
    // future querying can still group on canonical values.
    const reason =
      typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason) {
      return NextResponse.json(
        { error: 'reason is required' },
        { status: 400 }
      );
    }
    const notes =
      typeof body.notes === 'string' ? body.notes.trim() : null;

    // Read current state to detect already-retired idempotent re-run.
    const { data: current, error: readErr } = await supabaseAdmin
      .from('equipment_inventory')
      .select(SELECT_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (readErr) {
      console.error('[admin/equipment/:id/retire] read failed', {
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

    if (row.retired_at) {
      return NextResponse.json({
        item: row,
        already_retired: true,
      });
    }

    const nowIso = new Date().toISOString();
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('equipment_inventory')
      .update({
        retired_at: nowIso,
        retired_reason: reason,
        current_status: 'retired',
        updated_at: nowIso,
      })
      .eq('id', id)
      .is('retired_at', null) // race guard
      .select(SELECT_COLUMNS)
      .maybeSingle();

    if (updateErr) {
      console.error('[admin/equipment/:id/retire] update failed', {
        id,
        error: updateErr.message,
      });
      return NextResponse.json(
        { error: updateErr.message },
        { status: 500 }
      );
    }

    if (!updated) {
      // Race lost — someone else retired this row between our read
      // and our write. Re-read to surface the actual state.
      const { data: refreshed } = await supabaseAdmin
        .from('equipment_inventory')
        .select(SELECT_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      return NextResponse.json({
        item: refreshed ?? row,
        already_retired: true,
      });
    }

    // Audit log row — fire-and-best-effort. We don't fail the whole
    // retire if the log write fails (the canonical state lives on
    // the row + retired_at column); we log the failure so ops can
    // catch it. The actor_user_id is NULL for v1; resolving the
    // admin's UUID adds a listUsers roundtrip and the audit log
    // already carries actor email implicitly via session.user.email
    // in the server logs.
    const { error: auditErr } = await supabaseAdmin
      .from('equipment_events')
      .insert({
        equipment_id: id,
        event_type: 'retired',
        notes:
          notes && notes.length > 0
            ? `${reason} — ${notes}`
            : reason,
        payload: {
          retired_reason: reason,
          current_status_before: row.current_status,
          retired_by_email: session.user.email,
        },
      });
    if (auditErr) {
      console.warn('[admin/equipment/:id/retire] audit-log write failed', {
        id,
        error: auditErr.message,
      });
    }

    console.log('[admin/equipment/:id/retire] retired', {
      id,
      reason,
      admin_email: session.user.email,
    });

    return NextResponse.json({ item: updated, already_retired: false });
  },
  { routeName: 'admin/equipment/:id/retire' }
);
