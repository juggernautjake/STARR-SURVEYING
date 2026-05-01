// app/api/admin/personnel/assign/route.ts
//
// POST /api/admin/personnel/assign
//
// Phase F10.4-c — atomic multi-slot personnel assignment.
// Body:
//
//   {
//     job_id: UUID,
//     slots: [
//       {
//         user_email: string,
//         slot_role: string,                 // rpls | party_chief | …
//         assigned_from: ISO,
//         assigned_to: ISO,
//         required_skills?: string[],        // strict-fail when set
//         skills_are_soft?: boolean,         // ad-hoc fill mode
//         is_crew_lead?: boolean,
//         notes?: string,
//         override_reason?: string           // F10.4 soft-override
//       },
//       ...
//     ]
//   }
//
// All-or-none semantics. Either every slot lands at
// state='proposed' or none do. The §5.12.4 worked example —
// dispatcher applies a 5-line template, two slots are blocked,
// the whole apply fails and the dispatcher decides what to
// substitute.
//
// Race-safety mirrors F10.3-c (POST /reserve):
//   1. lib/personnel/availability runs the four §5.12.4 checks
//      against current state per slot.
//   2. PostgREST batch INSERT runs in a single transaction.
//   3. seeds/241's GiST EXCLUDE on (user_email, [from, to))
//      catches concurrent races we missed pre-insert; the
//      handler maps 23P01 to a typed `capacity_overlap`.
//
// Crew-lead constraint: exactly one `is_crew_lead=true` per
// (job_id, active state). The seeds/241 partial UNIQUE index
// enforces it; the handler maps the resulting 23505 to a typed
// `crew_lead_already_set` conflict so the dispatcher knows to
// either drop the flag or cancel the existing lead first.
//
// On full success, the handler fans out a §5.10.4 notification
// to every assigned surveyor — "Henry assigned you to Smith
// Boundary tomorrow 8am-noon. Tap to accept or decline." —
// keying off the F10.4-d /respond endpoint.
//
// Auth: admin / developer / equipment_manager.

import { NextRequest, NextResponse } from 'next/server';
import type { PostgrestError } from '@supabase/supabase-js';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { notify } from '@/lib/notifications';
import {
  assessPerson,
  type PersonAssessment,
  type PersonnelAvailabilityReason,
} from '@/lib/personnel/availability';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SlotRequest {
  user_email: string;
  slot_role: string;
  assigned_from: string;
  assigned_to: string;
  required_skills: string[];
  skills_are_soft: boolean;
  is_crew_lead: boolean;
  notes: string | null;
  override_reason: string | null;
}

interface SlotConflict {
  slot_index: number;
  request: SlotRequest;
  reasons: PersonnelAvailabilityReason[];
  /** Set when the user_email isn't a registered_users row. */
  user_not_found?: boolean;
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
      | { job_id?: unknown; slots?: unknown }
      | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Body must be a JSON object.' },
        { status: 400 }
      );
    }

    const jobId = typeof body.job_id === 'string' ? body.job_id.trim() : '';
    if (!UUID_RE.test(jobId)) {
      return NextResponse.json(
        { error: '`job_id` must be a valid UUID.' },
        { status: 400 }
      );
    }
    if (!Array.isArray(body.slots) || body.slots.length === 0) {
      return NextResponse.json(
        { error: '`slots` must be a non-empty array.' },
        { status: 400 }
      );
    }

    const slotRequests: SlotRequest[] = [];
    for (let i = 0; i < body.slots.length; i++) {
      const v = validateSlot(body.slots[i] as Record<string, unknown>, i);
      if ('error' in v) {
        return NextResponse.json({ error: v.error }, { status: 400 });
      }
      slotRequests.push(v.slot);
    }

    // Detect duplicate (user_email × overlapping window) within
    // this batch — the EXCLUDE will reject anyway but a clean
    // pre-check returns a better error message.
    const intraBatchDup = findIntraBatchOverlap(slotRequests);
    if (intraBatchDup) {
      return NextResponse.json(
        {
          error:
            `Slots ${intraBatchDup.a} and ${intraBatchDup.b} both ` +
            `assign ${intraBatchDup.email} to overlapping windows. ` +
            `Reduce to one or shrink the windows so they don't overlap.`,
        },
        { status: 400 }
      );
    }
    const crewLeadCount = slotRequests.filter((s) => s.is_crew_lead).length;
    if (crewLeadCount > 1) {
      return NextResponse.json(
        {
          error:
            `Exactly one slot per assign call may have ` +
            `is_crew_lead=true (got ${crewLeadCount}).`,
        },
        { status: 400 }
      );
    }

    // ── Per-slot resolution ─────────────────────────────────────
    const resolved: Array<{
      index: number;
      slot: SlotRequest;
      assessment: PersonAssessment;
    }> = [];
    const conflicts: SlotConflict[] = [];

    for (let i = 0; i < slotRequests.length; i++) {
      const slot = slotRequests[i];
      const assessment = await assessPerson(slot.user_email, {
        windowFrom: slot.assigned_from,
        windowTo: slot.assigned_to,
        requiredSkills: slot.required_skills,
        skillsAreSoft: slot.skills_are_soft,
      });
      if (!assessment) {
        conflicts.push({
          slot_index: i,
          request: slot,
          reasons: [],
          user_not_found: true,
        });
        continue;
      }
      if (!assessment.assignable && !slot.override_reason) {
        conflicts.push({
          slot_index: i,
          request: slot,
          reasons: assessment.hard_blocks,
        });
        continue;
      }
      // Either fully clear OR overridden — treat as resolved.
      resolved.push({ index: i, slot, assessment });
    }

    if (conflicts.length > 0) {
      return NextResponse.json(
        {
          conflicts,
          summary: {
            requested: slotRequests.length,
            resolved: resolved.length,
            blocked: conflicts.length,
          },
        },
        { status: 409 }
      );
    }

    // ── Atomic batch insert ─────────────────────────────────────
    const rows = resolved.map((r) => {
      const isOverride = !!r.slot.override_reason;
      const baseNotes = r.slot.notes;
      const finalNotes = isOverride
        ? `OVERRIDE: ${r.slot.override_reason}` +
          (baseNotes ? ` — ${baseNotes}` : '')
        : baseNotes;
      // job_team's pre-F10.4 columns (user_name, role) still
      // need to be filled so existing readers keep working.
      // Use display_name from the assessment for user_name; copy
      // slot_role into the legacy `role` column too.
      return {
        job_id: jobId,
        user_email: r.slot.user_email,
        user_name: r.assessment.display_name ?? r.slot.user_email,
        role: r.slot.slot_role,
        slot_role: r.slot.slot_role,
        assigned_from: r.slot.assigned_from,
        assigned_to: r.slot.assigned_to,
        state: 'proposed' as const,
        is_crew_lead: r.slot.is_crew_lead,
        is_override: isOverride,
        override_reason: isOverride ? r.slot.override_reason : null,
        notes: finalNotes,
      };
    });

    const { data: inserted, error } = await supabaseAdmin
      .from('job_team')
      .insert(rows)
      .select(
        'id, job_id, user_email, user_name, role, slot_role, ' +
          'assigned_from, assigned_to, state, is_crew_lead, ' +
          'is_override, override_reason, notes, created_at'
      );

    if (error) {
      const pgErr = error as PostgrestError;
      if (pgErr.code === '23P01') {
        // Capacity-overlap race — engine said clear, EXCLUDE caught
        // a concurrent insert.
        return NextResponse.json(
          {
            conflicts: [
              {
                slot_index: -1,
                request: null,
                reasons: [
                  {
                    code: 'capacity_overlap',
                    severity: 'block',
                    conflicting_job_id: 'unknown',
                    conflicting_assignment_id: 'unknown',
                    assigned_from: '',
                    assigned_to: '',
                    state: 'unknown',
                    message:
                      'Concurrent assignment beat this insert. Refetch ' +
                      'availability and retry.',
                  },
                ],
              },
            ],
          },
          { status: 409 }
        );
      }
      if (pgErr.code === '23505') {
        // Crew-lead exactly-one-per-job UNIQUE collision.
        return NextResponse.json(
          {
            error:
              'Crew lead is already set on this job. Cancel the ' +
              'existing lead first or drop is_crew_lead from this assign.',
            code: 'crew_lead_already_set',
          },
          { status: 409 }
        );
      }
      console.error('[admin/personnel/assign POST] insert failed', {
        code: pgErr.code,
        message: pgErr.message,
      });
      return NextResponse.json(
        { error: pgErr.message ?? 'Assignment insert failed.' },
        { status: 500 }
      );
    }

    const insertedRows =
      (inserted as Array<{
        id: string;
        job_id: string;
        user_email: string;
        slot_role: string;
        assigned_from: string;
        assigned_to: string;
        is_override: boolean;
        is_crew_lead: boolean;
      }>) ?? [];

    // ── Surveyor notifications + override fan-out ───────────────
    // §5.12.4 step 2: each surveyor gets a "Henry assigned you
    // to Smith Boundary 8am-noon. Tap to accept or decline."
    // notification within seconds of insert. Best-effort —
    // notification failures don't roll back; the daily digest
    // catches stragglers.
    for (const row of insertedRows) {
      try {
        await notify({
          user_email: row.user_email,
          type: 'personnel_assignment_proposed',
          title: 'New job assignment',
          body:
            `${actorEmail} proposed you for ${row.slot_role} on ` +
            `job ${row.job_id} from ${row.assigned_from} to ` +
            `${row.assigned_to}. Tap to confirm or decline.`,
          icon: '📋',
          source_type: 'job_team',
          source_id: row.id,
          link: `/admin/jobs/${row.job_id}`,
          escalation_level: row.is_override ? 'high' : 'normal',
        });
      } catch (err) {
        console.warn(
          '[admin/personnel/assign POST] surveyor notify failed',
          { user_email: row.user_email, error: (err as Error).message }
        );
      }
    }

    // Override fan-out — every override row fires an additional
    // high-priority notification to the §5.10.4 audit
    // recipients, mirroring the F10.3-e equipment override.
    const overrideRows = insertedRows.filter((r) => r.is_override);
    if (overrideRows.length > 0) {
      await emitOverrideAudit({
        actorEmail,
        jobId,
        overrideRows,
      });
    }

    console.log('[admin/personnel/assign POST] ok', {
      job_id: jobId,
      count: insertedRows.length,
      override_count: overrideRows.length,
      crew_lead_assigned: insertedRows.some((r) => r.is_crew_lead),
      admin_email: actorEmail,
    });

    return NextResponse.json({
      assignments: insertedRows,
      summary: {
        requested: slotRequests.length,
        resolved: resolved.length,
        blocked: 0,
        override_count: overrideRows.length,
      },
    });
  },
  { routeName: 'admin/personnel/assign#post' }
);

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function validateSlot(
  raw: Record<string, unknown> | null,
  index: number
): { slot: SlotRequest } | { error: string } {
  if (!raw || typeof raw !== 'object') {
    return { error: `slots[${index}] must be an object.` };
  }
  const userEmail =
    typeof raw.user_email === 'string' ? raw.user_email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(userEmail)) {
    return { error: `slots[${index}].user_email must be a valid email.` };
  }
  const slotRole =
    typeof raw.slot_role === 'string' ? raw.slot_role.trim() : '';
  if (!slotRole) {
    return {
      error: `slots[${index}].slot_role must be a non-empty string.`,
    };
  }

  const fromRaw =
    typeof raw.assigned_from === 'string' ? raw.assigned_from : '';
  const toRaw = typeof raw.assigned_to === 'string' ? raw.assigned_to : '';
  const fromTime = Date.parse(fromRaw);
  const toTime = Date.parse(toRaw);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) {
    return {
      error: `slots[${index}].assigned_from/assigned_to must be ISO timestamps.`,
    };
  }
  if (toTime <= fromTime) {
    return {
      error: `slots[${index}].assigned_to must be strictly after assigned_from.`,
    };
  }

  let requiredSkills: string[] = [];
  if (raw.required_skills !== undefined && raw.required_skills !== null) {
    if (!Array.isArray(raw.required_skills)) {
      return {
        error: `slots[${index}].required_skills must be an array of strings.`,
      };
    }
    requiredSkills = (raw.required_skills as unknown[])
      .filter((v): v is string => typeof v === 'string')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }

  const skillsAreSoft = raw.skills_are_soft === true;
  const isCrewLead = raw.is_crew_lead === true;

  let notes: string | null = null;
  if (raw.notes !== undefined && raw.notes !== null) {
    if (typeof raw.notes !== 'string') {
      return { error: `slots[${index}].notes must be a string.` };
    }
    notes = raw.notes;
  }

  let overrideReason: string | null = null;
  if (raw.override_reason !== undefined && raw.override_reason !== null) {
    if (typeof raw.override_reason !== 'string') {
      return {
        error: `slots[${index}].override_reason must be a string when present.`,
      };
    }
    const trimmed = raw.override_reason.trim();
    if (trimmed.length === 0) {
      return {
        error:
          `slots[${index}].override_reason cannot be blank. Either omit ` +
          `the field or provide a justification.`,
      };
    }
    if (trimmed.length > 500) {
      return {
        error: `slots[${index}].override_reason must be ≤ 500 characters.`,
      };
    }
    overrideReason = trimmed;
  }

  return {
    slot: {
      user_email: userEmail,
      slot_role: slotRole,
      assigned_from: new Date(fromTime).toISOString(),
      assigned_to: new Date(toTime).toISOString(),
      required_skills: requiredSkills,
      skills_are_soft: skillsAreSoft,
      is_crew_lead: isCrewLead,
      notes,
      override_reason: overrideReason,
    },
  };
}

function findIntraBatchOverlap(
  slots: SlotRequest[]
): { a: number; b: number; email: string } | null {
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      if (slots[i].user_email !== slots[j].user_email) continue;
      const aFrom = Date.parse(slots[i].assigned_from);
      const aTo = Date.parse(slots[i].assigned_to);
      const bFrom = Date.parse(slots[j].assigned_from);
      const bTo = Date.parse(slots[j].assigned_to);
      if (aFrom < bTo && aTo > bFrom) {
        return { a: i, b: j, email: slots[i].user_email };
      }
    }
  }
  return null;
}

async function emitOverrideAudit(args: {
  actorEmail: string;
  jobId: string;
  overrideRows: Array<{
    id: string;
    user_email: string;
    slot_role: string;
    assigned_from: string;
    assigned_to: string;
  }>;
}): Promise<void> {
  const { actorEmail, jobId, overrideRows } = args;

  let managerEmails: string[] = [];
  try {
    const { data, error } = await supabaseAdmin
      .from('registered_users')
      .select('email')
      .filter('roles', 'cs', '{equipment_manager}');
    if (error) {
      console.warn(
        '[admin/personnel/assign] equipment_manager lookup failed',
        { error: error.message }
      );
    } else if (data) {
      const rows = data as Array<{ email: string | null }>;
      managerEmails = rows
        .map((r) => r.email)
        .filter((e): e is string => !!e);
    }
  } catch (err) {
    console.warn(
      '[admin/personnel/assign] equipment_manager lookup threw',
      { error: (err as Error).message }
    );
  }

  const recipients = Array.from(new Set([...managerEmails, actorEmail]));

  for (const row of overrideRows) {
    for (const recipient of recipients) {
      try {
        await notify({
          user_email: recipient,
          type: 'personnel_assignment_override',
          title: 'Personnel assignment override',
          body:
            `${actorEmail} assigned ${row.user_email} as ${row.slot_role} ` +
            `on job ${jobId} (${row.assigned_from} → ${row.assigned_to}) ` +
            `via soft-override.`,
          icon: '⚠️',
          escalation_level: 'high',
          source_type: 'job_team',
          source_id: row.id,
          link: `/admin/jobs/${jobId}`,
        });
      } catch (err) {
        console.warn(
          '[admin/personnel/assign] override audit notify failed',
          { recipient, error: (err as Error).message }
        );
      }
    }
  }
}
