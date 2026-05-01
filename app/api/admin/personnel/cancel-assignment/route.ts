// app/api/admin/personnel/cancel-assignment/route.ts
//
// POST /api/admin/personnel/cancel-assignment
//   body: { assignment_id: UUID, reason?: string }
//
// Phase F10.4-e — symmetric counterpart to
// /api/admin/equipment/cancel-reservation. Dispatcher pulls a
// crew member off a job. Mirrors the equipment cancel path so
// dispatchers learn one mental model.
//
// State transitions:
//   proposed   → cancelled    OK (surveyor never responded yet)
//   confirmed  → cancelled    OK (rare — dispatcher reverses
//                              after a confirm; e.g. surveyor
//                              got sick day-of and the dispatcher
//                              wants to swap them out cleanly)
//   declined   → 409 (already terminal)
//   cancelled  → 409 (already terminal)
//
// On cancel of a confirmed slot, fan out a notification to the
// affected surveyor so they know they were pulled. On cancel of
// a proposed slot, the surveyor still gets a courtesy
// notification — the inbox card now shows "cancelled" instead
// of waiting for a tap.
//
// Auth: admin / developer / equipment_manager.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notify } from '@/lib/notifications';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const CANCELLABLE_STATES = new Set(['proposed', 'confirmed']);

interface AssignmentRow {
  id: string;
  job_id: string;
  user_email: string;
  slot_role: string | null;
  state: string | null;
  notes: string | null;
  is_crew_lead: boolean;
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
    const actorEmail = session.user.email;

    const body = (await req.json().catch(() => null)) as
      | { assignment_id?: unknown; reason?: unknown }
      | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Body must be a JSON object.' },
        { status: 400 }
      );
    }

    const assignmentId =
      typeof body.assignment_id === 'string' ? body.assignment_id.trim() : '';
    if (!UUID_RE.test(assignmentId)) {
      return NextResponse.json(
        { error: '`assignment_id` must be a valid UUID.' },
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

    const { data, error: readErr } = await supabaseAdmin
      .from('job_team')
      .select(
        'id, job_id, user_email, slot_role, state, notes, is_crew_lead'
      )
      .eq('id', assignmentId)
      .maybeSingle();
    if (readErr) {
      console.error(
        '[admin/personnel/cancel-assignment] read failed',
        { assignmentId, error: readErr.message }
      );
      return NextResponse.json(
        { error: readErr.message },
        { status: 500 }
      );
    }
    if (!data) {
      return NextResponse.json(
        { error: 'Assignment not found.' },
        { status: 404 }
      );
    }
    const row = data as AssignmentRow;

    if (!row.state || !CANCELLABLE_STATES.has(row.state)) {
      return NextResponse.json(
        {
          error: `Assignment is in terminal state '${row.state ?? 'null'}' ` +
                 'and cannot be cancelled.',
          current_state: row.state,
        },
        { status: 409 }
      );
    }

    const finalNotes = (() => {
      if (!reason) return row.notes;
      const cancelLine = `CANCEL: ${reason}`;
      return row.notes ? `${row.notes} — ${cancelLine}` : cancelLine;
    })();

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('job_team')
      .update({ state: 'cancelled', notes: finalNotes })
      .eq('id', assignmentId)
      .in('state', Array.from(CANCELLABLE_STATES)) // TOCTOU guard
      .select(
        'id, job_id, user_email, slot_role, assigned_from, assigned_to, ' +
          'state, is_crew_lead, is_override, override_reason, ' +
          'confirmed_at, declined_at, decline_reason, notes, updated_at'
      )
      .maybeSingle();
    if (updateErr) {
      console.error(
        '[admin/personnel/cancel-assignment] update failed',
        { assignmentId, error: updateErr.message }
      );
      return NextResponse.json(
        { error: updateErr.message },
        { status: 500 }
      );
    }
    if (!updated) {
      const { data: latest } = await supabaseAdmin
        .from('job_team')
        .select('state')
        .eq('id', assignmentId)
        .maybeSingle();
      const latestState =
        (latest as { state?: string } | null)?.state ?? 'unknown';
      return NextResponse.json(
        {
          error:
            'Assignment state changed between read and write. Refetch ' +
            'and retry.',
          current_state: latestState,
        },
        { status: 409 }
      );
    }

    // Notify the affected surveyor — best effort.
    try {
      await notify({
        user_email: row.user_email,
        type: 'personnel_assignment_cancelled',
        title: 'Assignment cancelled',
        body:
          `${actorEmail} cancelled your ${row.slot_role ?? 'slot'} on ` +
          `job ${row.job_id}` +
          (reason ? ` — ${reason}` : '.'),
        icon: '🚫',
        escalation_level: row.is_crew_lead ? 'high' : 'normal',
        source_type: 'job_team',
        source_id: row.id,
        link: `/admin/jobs/${row.job_id}`,
      });
    } catch (err) {
      console.warn(
        '[admin/personnel/cancel-assignment] surveyor notify failed',
        { error: (err as Error).message }
      );
    }

    console.log('[admin/personnel/cancel-assignment POST] ok', {
      assignment_id: assignmentId,
      job_id: row.job_id,
      previous_state: row.state,
      was_crew_lead: row.is_crew_lead,
      had_reason: !!reason,
      actor_email: actorEmail,
    });

    return NextResponse.json({
      assignment: updated,
      previous_state: row.state,
    });
  },
  { routeName: 'admin/personnel/cancel-assignment#post' }
);
