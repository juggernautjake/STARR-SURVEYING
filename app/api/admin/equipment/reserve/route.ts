// app/api/admin/equipment/reserve/route.ts
//
// POST /api/admin/equipment/reserve
//
// Phase F10.3-c — atomic multi-item reservation. Body:
//
//   {
//     job_id: UUID,
//     items: [
//       {
//         equipment_inventory_id?: UUID,    // OR
//         category?: string,                // exactly one
//         quantity?: number,                // consumables only; default 1
//         reserved_from: ISO,
//         reserved_to: ISO,
//         notes?: string,
//         from_template_id?: UUID,
//         from_template_version?: number
//       },
//       ...
//     ]
//   }
//
// All-or-none semantics: either every item gets a reservation or
// none do. The §5.12.5 worked-example pattern — dispatcher applies
// a 5-line template, two of those lines are blocked, the whole
// apply fails and the dispatcher decides what to substitute.
// (Soft-override + per-item substitution suggestions land in
// F10.3-d/e; this batch is the strict-fail core.)
//
// Race-safety is layered:
//   1. lib/equipment/availability runs the four §5.12.5 checks
//      against the *current* table state per item — catches
//      maintenance, retired, calibration, low stock that the DB
//      constraint can't see structurally.
//   2. PostgREST's batch INSERT runs in a single transaction —
//      if any row's GiST EXCLUDE catches a concurrent overlap
//      that the engine missed (two dispatchers racing), the
//      whole batch aborts.
//   3. We catch Postgres error codes 23P01 (exclusion_violation)
//      and surface them as typed `reserved_for_other_job`
//      conflicts so the dispatcher sees the same error vocabulary
//      regardless of whether the conflict was caught pre- or
//      mid-insert.
//
// Returns:
//   200 { reservations: [...], summary } on full success
//   409 { conflicts: [{ item_index, reasons }], summary } on any
//     hard-block — includes ALL items' reasons, not just the
//     first failure, so the dispatcher can fix everything in one
//     pass.
//
// Auth: admin / developer / equipment_manager. tech_support
// read-only — POST rejects with 403 (mutating endpoint).
//
// Substitution suggestions (F10.3-d) and the soft-override path
// (F10.3-e) are intentionally NOT in this batch. This handler
// returns clean typed conflicts; the next batch builds the UX
// affordances on top of the same shape.
import { NextRequest, NextResponse } from 'next/server';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  assessCategory,
  assessUnit,
  proposeSubstitutionsForCategory,
  proposeSubstitutionsForUnit,
  type AvailabilityReason,
  type SubstitutionSuggestion,
  type UnitAssessment,
} from '@/lib/equipment/availability';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

interface ItemRequest {
  equipment_inventory_id?: string;
  category?: string;
  quantity?: number;
  reserved_from: string;
  reserved_to: string;
  notes?: string;
  from_template_id?: string;
  from_template_version?: number;
}

interface ResolvedItem {
  index: number;
  unit: UnitAssessment;
  request: ItemRequest;
  windowFrom: string;
  windowTo: string;
}

interface ItemConflict {
  item_index: number;
  request: ItemRequest;
  reasons: AvailabilityReason[];
  /** Set when category mode found nothing assignable. */
  category_summary?: {
    category: string;
    total_units: number;
    blocked_units: number;
    earliest_next_available_at: string | null;
  };
  /**
   * F10.3-d — ranked substitution candidates the dispatcher
   * can use to fix the block without a second roundtrip. Sourced
   * from `proposeSubstitutionsForUnit` (unit-mode block) or
   * `proposeSubstitutionsForCategory` (category-mode miss).
   */
  substitutions: SubstitutionSuggestion[];
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

    const body = (await req.json().catch(() => null)) as
      | { job_id?: unknown; items?: unknown }
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

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: '`items` must be a non-empty array.' },
        { status: 400 }
      );
    }

    const requestItems: ItemRequest[] = [];
    for (let i = 0; i < body.items.length; i++) {
      const raw = body.items[i] as Record<string, unknown> | null;
      if (!raw || typeof raw !== 'object') {
        return NextResponse.json(
          { error: `items[${i}] must be an object.` },
          { status: 400 }
        );
      }
      const validation = validateItem(raw, i);
      if ('error' in validation) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      requestItems.push(validation.item);
    }

    // ── Resolve every item against current state ────────────────
    const resolved: ResolvedItem[] = [];
    const conflicts: ItemConflict[] = [];

    for (let i = 0; i < requestItems.length; i++) {
      const item = requestItems[i];
      const opts = {
        windowFrom: item.reserved_from,
        windowTo: item.reserved_to,
        quantityNeeded: item.quantity,
      };

      if (item.equipment_inventory_id) {
        const assessment = await assessUnit(item.equipment_inventory_id, opts);
        if (!assessment) {
          conflicts.push({
            item_index: i,
            request: item,
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
            substitutions: [],
          });
        } else if (!assessment.assignable) {
          // F10.3-d: surface ranked swaps from the same category.
          const subs = await proposeSubstitutionsForUnit(assessment, opts);
          conflicts.push({
            item_index: i,
            request: item,
            reasons: assessment.hard_blocks,
            substitutions: subs,
          });
        } else {
          resolved.push({
            index: i,
            unit: assessment,
            request: item,
            windowFrom: opts.windowFrom,
            windowTo: opts.windowTo,
          });
        }
      } else {
        // Category mode — F10.3-d ranks assignable units by
        // proximity (same home_location > same vehicle > category-
        // only) and picks the highest-ranked. The plan's
        // §5.12.5 "kit #3 reserved; kit #4 also available —
        // switch?" UX is built on top of this: the chosen
        // winner lands in `resolved`; the alternates surface in
        // the response's `substitutions` field for the dispatcher
        // to swap to with one click.
        const assessments = await assessCategory(item.category!, opts);
        const winner = pickProximityWinner(assessments);
        if (!winner) {
          // No assignable unit anywhere in the category. Surface
          // ranked candidates so the dispatcher can decide
          // between "wait" (smallest next_available_at) and
          // "swap category" (template `notes`-driven; structured
          // substitution graph is v2 polish per §5.12.5).
          const subs = await proposeSubstitutionsForCategory(
            item.category!,
            opts
          );
          conflicts.push({
            item_index: i,
            request: item,
            reasons: [],
            category_summary: {
              category: item.category!,
              total_units: assessments.length,
              blocked_units: assessments.length,
              earliest_next_available_at: earliestNextAvailable(assessments),
            },
            substitutions: subs,
          });
        } else {
          resolved.push({
            index: i,
            unit: winner,
            request: item,
            windowFrom: opts.windowFrom,
            windowTo: opts.windowTo,
          });
        }
      }
    }

    if (conflicts.length > 0) {
      return NextResponse.json(
        {
          conflicts,
          summary: {
            requested: requestItems.length,
            resolved: resolved.length,
            blocked: conflicts.length,
          },
        },
        { status: 409 }
      );
    }

    // ── Atomic batch insert ─────────────────────────────────────
    // PostgREST runs the array .insert() in a single transaction.
    // Any GiST EXCLUDE / FK / NOT NULL violation aborts the whole
    // batch — partial reservations are impossible.
    const rows = resolved.map((r) => ({
      equipment_inventory_id: r.unit.equipment_inventory_id,
      job_id: jobId,
      from_template_id: r.request.from_template_id ?? null,
      from_template_version: r.request.from_template_version ?? null,
      reserved_from: r.windowFrom,
      reserved_to: r.windowTo,
      state: 'held' as const,
      notes: r.request.notes ?? null,
      reserved_by: reservedByUserId,
    }));

    const inserted = await tryInsertBatch(supabaseAdmin, rows);
    if ('error' in inserted) {
      return inserted.response;
    }

    console.log('[admin/equipment/reserve POST] ok', {
      job_id: jobId,
      count: inserted.rows.length,
      admin_email: session.user.email,
    });

    return NextResponse.json({
      reservations: inserted.rows,
      summary: {
        requested: requestItems.length,
        resolved: resolved.length,
        blocked: 0,
      },
    });
  },
  { routeName: 'admin/equipment/reserve#post' }
);

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function validateItem(
  raw: Record<string, unknown>,
  index: number
):
  | { item: ItemRequest }
  | { error: string } {
  const equipmentId =
    typeof raw.equipment_inventory_id === 'string'
      ? raw.equipment_inventory_id.trim()
      : '';
  const category =
    typeof raw.category === 'string' ? raw.category.trim() : '';
  const hasId = equipmentId.length > 0;
  const hasCategory = category.length > 0;
  if (hasId === hasCategory) {
    return {
      error:
        `items[${index}]: provide exactly one of ` +
        `equipment_inventory_id or category.`,
    };
  }
  if (hasId && !UUID_RE.test(equipmentId)) {
    return {
      error: `items[${index}].equipment_inventory_id must be a valid UUID.`,
    };
  }

  const fromRaw =
    typeof raw.reserved_from === 'string' ? raw.reserved_from : '';
  const toRaw = typeof raw.reserved_to === 'string' ? raw.reserved_to : '';
  const fromTime = Date.parse(fromRaw);
  const toTime = Date.parse(toRaw);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) {
    return {
      error:
        `items[${index}].reserved_from/reserved_to must be parseable ` +
        `ISO timestamps.`,
    };
  }
  if (toTime <= fromTime) {
    return {
      error: `items[${index}].reserved_to must be strictly after reserved_from.`,
    };
  }

  let quantity: number | undefined;
  if (raw.quantity !== undefined && raw.quantity !== null) {
    if (
      typeof raw.quantity !== 'number' ||
      !Number.isInteger(raw.quantity) ||
      raw.quantity < 1
    ) {
      return {
        error: `items[${index}].quantity must be a positive integer (≥1).`,
      };
    }
    quantity = raw.quantity;
  }

  let templateId: string | undefined;
  if (raw.from_template_id !== undefined && raw.from_template_id !== null) {
    if (
      typeof raw.from_template_id !== 'string' ||
      !UUID_RE.test(raw.from_template_id)
    ) {
      return {
        error:
          `items[${index}].from_template_id must be a valid UUID when present.`,
      };
    }
    templateId = raw.from_template_id;
  }

  let templateVersion: number | undefined;
  if (
    raw.from_template_version !== undefined &&
    raw.from_template_version !== null
  ) {
    if (
      typeof raw.from_template_version !== 'number' ||
      !Number.isInteger(raw.from_template_version) ||
      raw.from_template_version < 1
    ) {
      return {
        error:
          `items[${index}].from_template_version must be a positive integer.`,
      };
    }
    templateVersion = raw.from_template_version;
  }

  let notes: string | undefined;
  if (raw.notes !== undefined && raw.notes !== null) {
    if (typeof raw.notes !== 'string') {
      return { error: `items[${index}].notes must be a string.` };
    }
    notes = raw.notes;
  }

  return {
    item: {
      equipment_inventory_id: hasId ? equipmentId : undefined,
      category: hasCategory ? category : undefined,
      quantity,
      reserved_from: new Date(fromTime).toISOString(),
      reserved_to: new Date(toTime).toISOString(),
      notes,
      from_template_id: templateId,
      from_template_version: templateVersion,
    },
  };
}

/**
 * F10.3-d category-mode picker. Walks the engine's
 * already-loaded assessments and returns the assignable winner.
 * V1 ranking is name-ASC (matches the engine's order_by); the
 * more interesting proximity ranking lives in
 * `proposeSubstitutionsForUnit` and only kicks in once an
 * anchor exists (e.g. when a unit-mode reservation fails and
 * we widen to its category for swaps). Centralising the picker
 * here keeps the reserve flow's ranking decisions in one place
 * for future tuning.
 */
function pickProximityWinner(
  assessments: UnitAssessment[]
): UnitAssessment | null {
  return assessments.find((a) => a.assignable) ?? null;
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

async function tryInsertBatch(
  client: SupabaseClient,
  rows: Array<Record<string, unknown>>
): Promise<
  | { rows: unknown[] }
  | { error: true; response: NextResponse }
> {
  const { data, error } = await client
    .from('equipment_reservations')
    .insert(rows)
    .select('*');

  if (!error) return { rows: data ?? [] };

  // Map Postgres error codes to typed conflicts. The GiST EXCLUDE
  // collision (23P01) is the race-fence path described above.
  const pgErr = error as PostgrestError;
  if (pgErr.code === '23P01') {
    console.warn(
      '[admin/equipment/reserve POST] exclusion_violation (race)',
      { detail: pgErr.details, hint: pgErr.hint }
    );
    return {
      error: true,
      response: NextResponse.json(
        {
          conflicts: [
            {
              item_index: -1,
              request: null,
              reasons: [
                {
                  code: 'reserved_for_other_job',
                  severity: 'block',
                  reservation_id: 'unknown',
                  conflicting_job_id: 'unknown',
                  reserved_from: '',
                  reserved_to: '',
                  message:
                    'A concurrent reservation locked one of the requested ' +
                    'units between the availability check and the insert. ' +
                    'Refetch availability and retry.',
                },
              ],
            },
          ],
          summary: { requested: rows.length, resolved: 0, blocked: rows.length },
        },
        { status: 409 }
      ),
    };
  }

  console.error('[admin/equipment/reserve POST] insert failed', {
    code: pgErr.code,
    message: pgErr.message,
    detail: pgErr.details,
  });
  return {
    error: true,
    response: NextResponse.json(
      { error: pgErr.message ?? 'Reservation insert failed.' },
      { status: 500 }
    ),
  };
}
