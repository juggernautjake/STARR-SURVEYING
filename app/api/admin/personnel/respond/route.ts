// app/api/admin/personnel/respond/route.ts
//
// POST /api/admin/personnel/respond
//
// Phase F10.4-d — surveyor confirm/decline endpoint. The mobile
// inbox card's [Confirm] / [Decline + reason] buttons POST here
// per §5.12.4 step 4-5 of the assignment loop.
//
// Body: { assignment_id, response: 'confirm'|'decline',
//         decline_reason? }
//
// Auth:
//   * The assigned surveyor (job_team.user_email === session
//     email) — the primary case.
//   * admin / equipment_manager — the §5.12.4 step 6 "verbally
//     agreed in person" dispatcher bypass; the audit log
//     captures the bypass.
//
// State machine (only 'proposed' is respondable):
//   proposed → confirmed     (response='confirm')
//   proposed → declined      (response='decline' + reason)
//   confirmed/declined/cancelled → 409 (already terminal)
//
// On decline, fan out a §5.10.4 notification to every
// admin / equipment_manager so a dispatcher can pick up the
// re-staffing — the original assigner isn't tracked on the
// row (job_team has no created_by column historically), so we
// broadcast to the role group. The notification body includes
// the declining surveyor + reason + a deep link back to the
// job page where re-assign happens.
//
// On confirm, no fan-out — quiet success. The dispatcher's
// daily roster view shows the state flip on next refresh.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notifyMany } from '@/lib/notifications';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

interface AssignmentRow {
  id: string;
  job_id: string;
  user_email: string;
  user_name: string | null;
  slot_role: string | null;
  assigned_from: string | null;
  assigned_to: string | null;
  state: string | null;
  is_crew_lead: boolean;
}

export const POST = withErrorHandler(
  async (req: NextRequest) => {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const actorEmail = session.user.email.toLowerCase();
    const userRoles = (session.user as { roles?: string[] } | undefined)
      ?.roles ?? [];
    const isPrivileged =
      isAdmin(session.user.roles) ||
      userRoles.includes('equipment_manager');

    const body = (await req.json().catch(() => null)) as
      | { assignment_id?: unknown; response?: unknown; decline_reason?: unknown }
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

    const response = body.response;
    if (response !== 'confirm' && response !== 'decline') {
      return NextResponse.json(
        { error: '`response` must be `confirm` or `decline`.' },
        { status: 400 }
      );
    }

    let declineReason: string | null = null;
    if (response === 'decline') {
      if (
        body.decline_reason === undefined ||
        body.decline_reason === null
      ) {
        return NextResponse.json(
          { error: '`decline_reason` is required when response=`decline`.' },
          { status: 400 }
        );
      }
      if (typeof body.decline_reason !== 'string') {
        return NextResponse.json(
          { error: '`decline_reason` must be a string.' },
          { status: 400 }
        );
      }
      const trimmed = body.decline_reason.trim();
      if (trimmed.length === 0) {
        return NextResponse.json(
          {
            error:
              '`decline_reason` cannot be blank — surveyors must say ' +
              'why so the dispatcher can decide whether to ask again.',
          },
          { status: 400 }
        );
      }
      if (trimmed.length > 500) {
        return NextResponse.json(
          { error: '`decline_reason` must be ≤ 500 characters.' },
          { status: 400 }
        );
      }
      declineReason = trimmed;
    }

    // ── Read the assignment + auth gate ─────────────────────────
    const { data, error: readErr } = await supabaseAdmin
      .from('job_team')
      .select(
        'id, job_id, user_email, user_name, slot_role, ' +
          'assigned_from, assigned_to, state, is_crew_lead'
      )
      .eq('id', assignmentId)
      .maybeSingle();
    if (readErr) {
      console.error(
        '[admin/personnel/respond] read failed',
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

    const isOwnRow =
      typeof row.user_email === 'string' &&
      row.user_email.toLowerCase() === actorEmail;
    if (!isOwnRow && !isPrivileged) {
      return NextResponse.json(
        {
          error:
            'You can only respond to your own assignment, or you must ' +
            'be admin / equipment_manager to respond on behalf of someone.',
        },
        { status: 403 }
      );
    }

    if (row.state !== 'proposed') {
      return NextResponse.json(
        {
          error:
            row.state === 'confirmed'
              ? 'Assignment is already confirmed.'
              : row.state === 'declined'
              ? 'Assignment was already declined.'
              : row.state === 'cancelled'
              ? 'Assignment was cancelled by the dispatcher.'
              : `Assignment is in state '${row.state}' and not respondable.`,
          current_state: row.state,
        },
        { status: 409 }
      );
    }

    // ── Update with TOCTOU guard ────────────────────────────────
    const nowIso = new Date().toISOString();
    const update =
      response === 'confirm'
        ? { state: 'confirmed', confirmed_at: nowIso }
        : {
            state: 'declined',
            declined_at: nowIso,
            decline_reason: declineReason,
          };

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('job_team')
      .update(update)
      .eq('id', assignmentId)
      .eq('state', 'proposed')
      .select(
        'id, job_id, user_email, user_name, slot_role, assigned_from, ' +
          'assigned_to, state, confirmed_at, declined_at, decline_reason, ' +
          'is_crew_lead, is_override, override_reason, notes, updated_at'
      )
      .maybeSingle();
    if (updateErr) {
      console.error(
        '[admin/personnel/respond] update failed',
        { assignmentId, error: updateErr.message }
      );
      return NextResponse.json(
        { error: updateErr.message },
        { status: 500 }
      );
    }
    if (!updated) {
      // State changed between our read and write — race.
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

    // ── Side effects ────────────────────────────────────────────
    if (response === 'decline') {
      // Re-staff signal — broadcast to admin + equipment_manager
      // so any dispatcher can pick up the slot. (job_team has no
      // historical created_by column, so the original assigner
      // isn't directly addressable; targeting the role group is
      // the v1 path.)
      await emitDeclineFanout({
        actorEmail,
        respondingFor: row.user_email,
        assignment: row,
        reason: declineReason,
      });
    } else {
      // Quiet success on confirm — the dispatcher sees the state
      // flip on next dashboard refresh; no notification.
    }

    // §5.12.4 step 6 audit: when a privileged user confirmed/
    // declined on behalf of someone else, log it explicitly so
    // the audit trail shows the bypass.
    if (!isOwnRow) {
      console.log('[admin/personnel/respond] privileged-bypass audit', {
        assignment_id: assignmentId,
        actor_email: actorEmail,
        on_behalf_of: row.user_email,
        response,
      });
    }

    console.log('[admin/personnel/respond POST] ok', {
      assignment_id: assignmentId,
      job_id: row.job_id,
      user_email: row.user_email,
      response,
      privileged_bypass: !isOwnRow,
      actor_email: actorEmail,
    });

    return NextResponse.json({
      assignment: updated,
      previous_state: 'proposed',
      privileged_bypass: !isOwnRow,
    });
  },
  { routeName: 'admin/personnel/respond#post' }
);

async function emitDeclineFanout(args: {
  actorEmail: string;
  respondingFor: string;
  assignment: AssignmentRow;
  reason: string | null;
}): Promise<void> {
  const { actorEmail, respondingFor, assignment, reason } = args;

  // Recipients: every admin + every equipment_manager. Filter
  // out the actor + the assignee themselves.
  let recipientEmails: string[] = [];
  try {
    const { data, error } = await supabaseAdmin
      .from('registered_users')
      .select('email, roles')
      .or('roles.cs.{admin},roles.cs.{equipment_manager}');
    if (error) {
      console.warn(
        '[admin/personnel/respond] dispatcher fanout lookup failed',
        { error: error.message }
      );
      return;
    }
    if (data) {
      const rows = data as Array<{ email: string | null }>;
      const seen = new Set<string>([actorEmail, respondingFor.toLowerCase()]);
      recipientEmails = rows
        .map((r) => r.email)
        .filter((e): e is string => !!e)
        .filter((e) => !seen.has(e.toLowerCase()));
    }
  } catch (err) {
    console.warn(
      '[admin/personnel/respond] dispatcher fanout threw',
      { error: (err as Error).message }
    );
    return;
  }

  if (recipientEmails.length === 0) return;

  const dateLine =
    assignment.assigned_from && assignment.assigned_to
      ? ` (${assignment.assigned_from} → ${assignment.assigned_to})`
      : '';
  const reasonLine = reason ? ` Reason: ${reason}.` : '';

  await notifyMany(recipientEmails, {
    type: 'personnel_assignment_declined',
    title: 'Assignment declined — re-staff needed',
    body:
      `${respondingFor} declined ${assignment.slot_role ?? 'their slot'} ` +
      `on job ${assignment.job_id}${dateLine}.${reasonLine} ` +
      `Tap to re-staff.`,
    icon: '🔄',
    escalation_level: assignment.is_crew_lead ? 'high' : 'normal',
    source_type: 'job_team',
    source_id: assignment.id,
    link: `/admin/jobs/${assignment.job_id}`,
  });
}
