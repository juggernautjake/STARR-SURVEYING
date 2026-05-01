// app/api/admin/equipment/templates/[id]/apply/route.ts
//
// POST /api/admin/equipment/templates/[id]/apply
//
// Phases F10.2g-b-i + F10.2g-b-ii — combined apply flow. Walks
// the composed template, runs availability per item AND per
// supplied slot_assignment, then atomically commits both
// equipment_reservations and job_team rows with
// `from_template_id` + `from_template_version` audit stamps so
// the §5.12.3 versioning rule holds: snapshots answer "what did
// Job #427 actually go out with?", not the live mutable template.
//
// Body:
//   {
//     job_id: UUID, from: ISO, to: ISO,
//     slot_assignments?: [
//       {
//         slot_role: string,           // matches resolver slot
//         user_email: string,
//         is_crew_lead?: boolean,
//         override_reason?: string
//       }
//     ]
//   }
//
// Slot assignments are optional. When omitted, only equipment
// reserves — useful when the dispatcher wants to lock equipment
// while still working out who the crew will be. When provided,
// each entry's slot_role must match a resolved slot, and the
// total count per slot_role must satisfy that slot's min/max.
//
// Strict-fail v1: any blocked item or slot conflict aborts the
// whole apply with 409 carrying every conflict (equipment +
// personnel) in one response so the dispatcher fixes everything
// in one pass.
//
// Cleanup-on-partial-failure: equipment commits first, then
// personnel. If personnel fails AFTER equipment commits (race or
// 23P01), the handler issues a delete-by-id batch against the
// just-inserted reservation rows so the all-or-none guarantee
// holds. Cleanup failures log loudly but don't block the 409
// response — the equipment_events audit chain still records the
// reservations regardless.
//
// Per-item overrides + per-item swaps will land in F10.2g-b-iii;
// for v1 the dispatcher routes overrides through F10.3-c
// /reserve directly if they need them mid-apply.
//
// Re-runs the F10.2g-a-i resolver inside the handler so a stale
// preview can't drive a bad apply — the dispatcher's review
// happens against /preview, but apply is the source of truth.
//
// Race-safety inherits from F10.3-c:
//   1. F10.3-b engine pre-checks each item.
//   2. PostgREST batch INSERT runs in one transaction.
//   3. seeds/239 GiST EXCLUDE catches concurrent overlap;
//      Postgres 23P01 maps to typed `reserved_for_other_job`.
//
// Auth: admin / developer / equipment_manager (mutating;
// tech_support read-only — preview is the read endpoint).

import { NextRequest, NextResponse } from 'next/server';
import type { PostgrestError } from '@supabase/supabase-js';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  resolveTemplate,
  type ResolvedItem,
  type ResolvedSlot,
} from '@/lib/equipment/template-resolver';
import {
  assessCategory,
  assessUnit,
  type AvailabilityReason,
  type UnitAssessment,
} from '@/lib/equipment/availability';
import {
  assessPerson,
  type PersonAssessment,
  type PersonnelAvailabilityReason,
} from '@/lib/personnel/availability';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

interface ResolvedReservationRow {
  item_key: string;
  resolved_item: ResolvedItem;
  unit: UnitAssessment;
}

interface ItemConflict {
  item_key: string;
  resolved_item: ResolvedItem;
  reasons: AvailabilityReason[];
  /**
   * Set when category-mode found nothing assignable. Mirrors
   * the F10.3-c shape so the dispatcher's UI handles preview
   * conflicts and apply conflicts identically.
   */
  category_summary?: {
    category: string;
    total_units: number;
    blocked_units: number;
    earliest_next_available_at: string | null;
  };
}

interface SlotAssignmentRequest {
  slot_role: string;
  user_email: string;
  is_crew_lead: boolean;
  override_reason: string | null;
}

interface ResolvedSlotAssignment {
  request: SlotAssignmentRequest;
  resolved_slot: ResolvedSlot;
  assessment: PersonAssessment;
}

interface SlotConflict {
  request: SlotAssignmentRequest;
  resolved_slot: ResolvedSlot | null;
  reasons: PersonnelAvailabilityReason[];
  /** Set when user_email isn't in registered_users. */
  user_not_found?: boolean;
  /**
   * Set when slot_role doesn't match any resolved slot, or
   * when the per-role count is below min / above max. The
   * F10.2g-a-ii preview surfaces resolved slots so the
   * dispatcher should never mismatch in practice — this is the
   * defensive surface.
   */
  slot_misuse?: {
    code:
      | 'unknown_slot_role'
      | 'count_below_min'
      | 'count_above_max'
      | 'duplicate_user_in_slot';
    detail: string;
  };
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
    const reservedByUserId =
      (session.user as { id?: string } | undefined)?.id ?? null;
    if (!reservedByUserId) {
      return NextResponse.json(
        { error: 'Session is missing user id; cannot author reservations.' },
        { status: 500 }
      );
    }

    const url = new URL(req.url);
    // Pathname: /api/admin/equipment/templates/[id]/apply — id
    // is the second-to-last segment.
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const templateId = pathSegments[pathSegments.length - 2];
    if (!templateId || !UUID_RE.test(templateId)) {
      return NextResponse.json(
        { error: 'template id must be a UUID' },
        { status: 400 }
      );
    }

    const body = (await req.json().catch(() => null)) as
      | {
          job_id?: unknown;
          from?: unknown;
          to?: unknown;
          slot_assignments?: unknown;
        }
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
    const fromRaw = typeof body.from === 'string' ? body.from : '';
    const toRaw = typeof body.to === 'string' ? body.to : '';
    const fromTime = Date.parse(fromRaw);
    const toTime = Date.parse(toRaw);
    if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) {
      return NextResponse.json(
        { error: '`from` and `to` must be parseable ISO timestamps.' },
        { status: 400 }
      );
    }
    if (toTime <= fromTime) {
      return NextResponse.json(
        { error: '`to` must be strictly after `from`.' },
        { status: 400 }
      );
    }
    const windowFrom = new Date(fromTime).toISOString();
    const windowTo = new Date(toTime).toISOString();

    const slotRequests: SlotAssignmentRequest[] = [];
    if (body.slot_assignments !== undefined && body.slot_assignments !== null) {
      if (!Array.isArray(body.slot_assignments)) {
        return NextResponse.json(
          { error: '`slot_assignments` must be an array.' },
          { status: 400 }
        );
      }
      for (let i = 0; i < body.slot_assignments.length; i++) {
        const v = validateSlotAssignment(
          body.slot_assignments[i] as Record<string, unknown>,
          i
        );
        if ('error' in v) {
          return NextResponse.json({ error: v.error }, { status: 400 });
        }
        slotRequests.push(v.assignment);
      }
    }

    // ── Resolve composition ─────────────────────────────────────
    const resolution = await resolveTemplate(templateId);
    if ('error' in resolution) {
      const status = (() => {
        switch (resolution.error.error) {
          case 'missing_template':
            return 404;
          case 'cycle_detected':
          case 'depth_exceeded':
          case 'archived_parent':
            return 409;
          default:
            return 400;
        }
      })();
      return NextResponse.json({ error: resolution.error }, { status });
    }
    const resolved = resolution.resolved;
    const templateVersion = resolved.root.version;
    const slotsByRole = new Map<string, ResolvedSlot>();
    for (const s of resolved.personnel_slots) {
      slotsByRole.set(s.slot_role.toLowerCase(), s);
    }

    // ── Per-slot personnel resolution ───────────────────────────
    const resolvedSlots: ResolvedSlotAssignment[] = [];
    const slotConflicts: SlotConflict[] = [];

    if (slotRequests.length > 0) {
      // Pre-pass: group by slot_role to validate min/max + dup
      // user-in-slot. Done before per-row engine reads so a bad
      // batch shape returns fast without DB roundtrips.
      const groups = new Map<string, SlotAssignmentRequest[]>();
      for (const r of slotRequests) {
        const key = r.slot_role.toLowerCase();
        const list = groups.get(key) ?? [];
        list.push(r);
        groups.set(key, list);
      }

      for (const [roleKey, group] of groups.entries()) {
        const slot = slotsByRole.get(roleKey);
        if (!slot) {
          for (const req of group) {
            slotConflicts.push({
              request: req,
              resolved_slot: null,
              reasons: [],
              slot_misuse: {
                code: 'unknown_slot_role',
                detail:
                  `slot_role '${req.slot_role}' isn't on this template's ` +
                  `composition. Valid roles: ` +
                  Array.from(slotsByRole.keys()).join(', ') +
                  '.',
              },
            });
          }
          continue;
        }
        if (group.length < slot.min) {
          slotConflicts.push({
            request: group[0],
            resolved_slot: slot,
            reasons: [],
            slot_misuse: {
              code: 'count_below_min',
              detail:
                `slot_role '${slot.slot_role}' requires at least ` +
                `${slot.min} (got ${group.length}).`,
            },
          });
        }
        if (group.length > slot.max) {
          slotConflicts.push({
            request: group[0],
            resolved_slot: slot,
            reasons: [],
            slot_misuse: {
              code: 'count_above_max',
              detail:
                `slot_role '${slot.slot_role}' allows at most ` +
                `${slot.max} (got ${group.length}).`,
            },
          });
        }
        // Same person assigned twice in the same slot → drop.
        const seen = new Set<string>();
        for (const req of group) {
          const e = req.user_email.toLowerCase();
          if (seen.has(e)) {
            slotConflicts.push({
              request: req,
              resolved_slot: slot,
              reasons: [],
              slot_misuse: {
                code: 'duplicate_user_in_slot',
                detail:
                  `${req.user_email} appears twice in the '${slot.slot_role}' ` +
                  `slot — dedupe before applying.`,
              },
            });
          }
          seen.add(e);
        }
      }

      // Crew-lead exactly-one-per-job — same constraint as
      // seeds/241's partial UNIQUE. The DB will reject anyway,
      // but a clean pre-check returns a friendlier error.
      const leadCount = slotRequests.filter((r) => r.is_crew_lead).length;
      if (leadCount > 1) {
        return NextResponse.json(
          {
            error:
              `Exactly one slot_assignment may have is_crew_lead=true ` +
              `(got ${leadCount}).`,
          },
          { status: 400 }
        );
      }

      // Per-row engine assessment — only if no slot_misuse
      // occurred (skip the engine reads when the shape is already
      // wrong; we'll surface those + then run engine on the rest).
      for (const req of slotRequests) {
        // If this request already produced a slot_misuse, don't
        // double up with engine reads. Slot_misuse rows have the
        // same `request` reference so we can match by identity.
        if (slotConflicts.some((c) => c.request === req)) continue;

        const slot = slotsByRole.get(req.slot_role.toLowerCase())!;
        const assessment = await assessPerson(req.user_email, {
          windowFrom,
          windowTo,
          requiredSkills: slot.required_skills,
          skillsAreSoft: false,
        });
        if (!assessment) {
          slotConflicts.push({
            request: req,
            resolved_slot: slot,
            reasons: [],
            user_not_found: true,
          });
          continue;
        }
        if (!assessment.assignable && !req.override_reason) {
          slotConflicts.push({
            request: req,
            resolved_slot: slot,
            reasons: assessment.hard_blocks,
          });
          continue;
        }
        resolvedSlots.push({ request: req, resolved_slot: slot, assessment });
      }
    }

    // ── Per-item availability + category-mode picker ────────────
    const resolvedRows: ResolvedReservationRow[] = [];
    const conflicts: ItemConflict[] = [];

    for (const item of resolved.items) {
      const opts = {
        windowFrom,
        windowTo,
        quantityNeeded: item.quantity,
      };
      if (item.equipment_inventory_id) {
        const assessment = await assessUnit(item.equipment_inventory_id, opts);
        if (!assessment) {
          conflicts.push({
            item_key: item.key,
            resolved_item: item,
            reasons: [
              {
                code: 'unavailable_status',
                severity: 'block',
                status: 'not_found',
                retired: false,
                message:
                  `Equipment unit ${item.equipment_inventory_id} not found.`,
              },
            ],
          });
        } else if (!assessment.assignable) {
          conflicts.push({
            item_key: item.key,
            resolved_item: item,
            reasons: assessment.hard_blocks,
          });
        } else {
          resolvedRows.push({
            item_key: item.key,
            resolved_item: item,
            unit: assessment,
          });
        }
      } else if (item.category) {
        const assessments = await assessCategory(item.category, opts);
        const winner = assessments.find((a) => a.assignable);
        if (!winner) {
          conflicts.push({
            item_key: item.key,
            resolved_item: item,
            reasons: [],
            category_summary: {
              category: item.category,
              total_units: assessments.length,
              blocked_units: assessments.length,
              earliest_next_available_at:
                earliestNextAvailable(assessments),
            },
          });
        } else {
          resolvedRows.push({
            item_key: item.key,
            resolved_item: item,
            unit: winner,
          });
        }
      }
      // Defensive: items without unit/category were already
      // surfaced as empty assessments by the resolver; the v1
      // strict-fail path drops them silently here. The
      // resolver's invariant ensures one of unit/category is
      // set on every accepted row.
    }

    if (conflicts.length > 0 || slotConflicts.length > 0) {
      return NextResponse.json(
        {
          template_id: templateId,
          template_version: templateVersion,
          conflicts,
          slot_conflicts: slotConflicts,
          summary: {
            equipment_requested: resolved.items.length,
            equipment_resolved: resolvedRows.length,
            equipment_blocked: conflicts.length,
            slots_requested: slotRequests.length,
            slots_resolved: resolvedSlots.length,
            slots_blocked: slotConflicts.length,
          },
        },
        { status: 409 }
      );
    }

    // ── Atomic batch insert ─────────────────────────────────────
    const rows = resolvedRows.map((r) => ({
      equipment_inventory_id: r.unit.equipment_inventory_id,
      job_id: jobId,
      from_template_id: templateId,
      from_template_version: templateVersion,
      reserved_from: windowFrom,
      reserved_to: windowTo,
      state: 'held' as const,
      notes: r.resolved_item.notes,
      reserved_by: reservedByUserId,
    }));

    const { data: inserted, error } = await supabaseAdmin
      .from('equipment_reservations')
      .insert(rows)
      .select('*');

    if (error) {
      const pgErr = error as PostgrestError;
      if (pgErr.code === '23P01') {
        // Concurrent overlap that beat the engine's pre-check.
        // Same shape as the per-item conflict so the UI handles
        // pre/mid-insert collisions identically.
        return NextResponse.json(
          {
            template_id: templateId,
            template_version: templateVersion,
            conflicts: [
              {
                item_key: 'concurrent_race',
                resolved_item: null,
                reasons: [
                  {
                    code: 'reserved_for_other_job',
                    severity: 'block',
                    reservation_id: 'unknown',
                    conflicting_job_id: 'unknown',
                    reserved_from: '',
                    reserved_to: '',
                    message:
                      'Concurrent reservation locked one of the resolved ' +
                      'units between availability check and insert. ' +
                      'Refetch /preview and retry.',
                  },
                ],
              },
            ],
            slot_conflicts: [],
            summary: {
              equipment_requested: resolved.items.length,
              equipment_resolved: 0,
              equipment_blocked: rows.length,
              slots_requested: slotRequests.length,
              slots_resolved: 0,
              slots_blocked: 0,
            },
          },
          { status: 409 }
        );
      }
      console.error('[admin/equipment/templates/apply] insert failed', {
        code: pgErr.code,
        message: pgErr.message,
      });
      return NextResponse.json(
        { error: pgErr.message ?? 'Apply failed.' },
        { status: 500 }
      );
    }

    const reservations = inserted ?? [];

    // ── Personnel insert + cleanup-on-failure ───────────────────
    // Equipment is committed at this point. If personnel insert
    // fails, we delete the just-inserted reservation rows so the
    // all-or-none guarantee holds. Cleanup is best-effort + logs
    // loudly on failure — equipment_events still records the
    // reservations regardless, so the audit chain survives.
    let assignments: unknown[] = [];
    if (resolvedSlots.length > 0) {
      const slotRows = resolvedSlots.map((r) => {
        const isOverride = !!r.request.override_reason;
        const baseNotes = null;
        const finalNotes = isOverride
          ? `OVERRIDE: ${r.request.override_reason}`
          : baseNotes;
        return {
          job_id: jobId,
          user_email: r.request.user_email,
          user_name: r.assessment.display_name ?? r.request.user_email,
          role: r.request.slot_role,
          slot_role: r.request.slot_role,
          assigned_from: windowFrom,
          assigned_to: windowTo,
          state: 'proposed' as const,
          is_crew_lead: r.request.is_crew_lead,
          is_override: isOverride,
          override_reason: isOverride ? r.request.override_reason : null,
          notes: finalNotes,
        };
      });

      const { data: insertedSlots, error: slotErr } = await supabaseAdmin
        .from('job_team')
        .insert(slotRows)
        .select(
          'id, job_id, user_email, slot_role, assigned_from, ' +
            'assigned_to, state, is_crew_lead, is_override'
        );

      if (slotErr) {
        // CLEANUP: roll back equipment reservations so apply is
        // atomic-by-construction. We delete by id + job_id +
        // state='held' so a concurrent check-out can't lose its
        // row to our cleanup (the surveyor's morning scan moves
        // state to 'checked_out' first).
        const idsToCleanup = (
          reservations as Array<{ id: string }>
        ).map((r) => r.id);
        if (idsToCleanup.length > 0) {
          const { error: cleanupErr } = await supabaseAdmin
            .from('equipment_reservations')
            .delete()
            .in('id', idsToCleanup)
            .eq('state', 'held');
          if (cleanupErr) {
            console.error(
              '[admin/equipment/templates/apply] CLEANUP FAILED — ' +
                'equipment reservations remain after personnel failure',
              {
                template_id: templateId,
                job_id: jobId,
                reservation_ids: idsToCleanup,
                error: cleanupErr.message,
              }
            );
          } else {
            console.warn(
              '[admin/equipment/templates/apply] cleanup ok — ' +
                'equipment reservations rolled back after personnel failure',
              {
                template_id: templateId,
                job_id: jobId,
                cleanup_count: idsToCleanup.length,
              }
            );
          }
        }

        const slotPgErr = slotErr as PostgrestError;
        // Map known DB constraint codes to typed conflict shape
        // for parity with the pre-insert path.
        if (slotPgErr.code === '23P01') {
          return NextResponse.json(
            {
              template_id: templateId,
              template_version: templateVersion,
              conflicts: [],
              slot_conflicts: [
                {
                  request: null,
                  resolved_slot: null,
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
                        '/preview and retry.',
                    },
                  ],
                },
              ],
              summary: {
                equipment_requested: resolved.items.length,
                equipment_resolved: 0,
                equipment_blocked: rows.length,
                slots_requested: slotRequests.length,
                slots_resolved: 0,
                slots_blocked: slotRequests.length,
              },
              cleanup: {
                rolled_back_reservation_count: (
                  reservations as Array<{ id: string }>
                ).length,
              },
            },
            { status: 409 }
          );
        }
        if (slotPgErr.code === '23505') {
          return NextResponse.json(
            {
              error:
                'Crew lead is already set on this job. Cancel the ' +
                'existing lead first or drop is_crew_lead from the ' +
                'apply.',
              code: 'crew_lead_already_set',
              cleanup: {
                rolled_back_reservation_count: (
                  reservations as Array<{ id: string }>
                ).length,
              },
            },
            { status: 409 }
          );
        }
        console.error(
          '[admin/equipment/templates/apply] personnel insert failed',
          { code: slotPgErr.code, message: slotPgErr.message }
        );
        return NextResponse.json(
          {
            error:
              slotPgErr.message ?? 'Personnel insert failed.',
            cleanup: {
              rolled_back_reservation_count: (
                reservations as Array<{ id: string }>
              ).length,
            },
          },
          { status: 500 }
        );
      }
      assignments = insertedSlots ?? [];
    }

    console.log('[admin/equipment/templates/apply POST] ok', {
      template_id: templateId,
      template_version: templateVersion,
      job_id: jobId,
      reservation_count: reservations.length,
      assignment_count: assignments.length,
      admin_email: session.user.email,
    });

    return NextResponse.json({
      template_id: templateId,
      template_version: templateVersion,
      job_id: jobId,
      reservations,
      assignments,
      summary: {
        equipment_requested: resolved.items.length,
        equipment_resolved: resolvedRows.length,
        equipment_blocked: 0,
        slots_requested: slotRequests.length,
        slots_resolved: resolvedSlots.length,
        slots_blocked: 0,
      },
    });
  },
  { routeName: 'admin/equipment/templates/:id/apply#post' }
);

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateSlotAssignment(
  raw: Record<string, unknown> | null,
  index: number
): { assignment: SlotAssignmentRequest } | { error: string } {
  if (!raw || typeof raw !== 'object') {
    return { error: `slot_assignments[${index}] must be an object.` };
  }
  const slotRole =
    typeof raw.slot_role === 'string' ? raw.slot_role.trim() : '';
  if (!slotRole) {
    return {
      error:
        `slot_assignments[${index}].slot_role must be a non-empty string.`,
    };
  }
  const userEmail =
    typeof raw.user_email === 'string'
      ? raw.user_email.trim().toLowerCase()
      : '';
  if (!EMAIL_RE.test(userEmail)) {
    return {
      error:
        `slot_assignments[${index}].user_email must be a valid email.`,
    };
  }
  const isCrewLead = raw.is_crew_lead === true;
  let overrideReason: string | null = null;
  if (raw.override_reason !== undefined && raw.override_reason !== null) {
    if (typeof raw.override_reason !== 'string') {
      return {
        error:
          `slot_assignments[${index}].override_reason must be a string.`,
      };
    }
    const trimmed = raw.override_reason.trim();
    if (trimmed.length === 0) {
      return {
        error:
          `slot_assignments[${index}].override_reason cannot be blank.`,
      };
    }
    if (trimmed.length > 500) {
      return {
        error:
          `slot_assignments[${index}].override_reason must be ≤ 500 ` +
          `characters.`,
      };
    }
    overrideReason = trimmed;
  }
  return {
    assignment: {
      slot_role: slotRole,
      user_email: userEmail,
      is_crew_lead: isCrewLead,
      override_reason: overrideReason,
    },
  };
}

function earliestNextAvailable(
  assessments: UnitAssessment[]
): string | null {
  let earliest: string | null = null;
  for (const a of assessments) {
    if (!a.next_available_at) continue;
    if (!earliest || a.next_available_at < earliest) {
      earliest = a.next_available_at;
    }
  }
  return earliest;
}
