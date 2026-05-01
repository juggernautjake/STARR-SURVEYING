// app/api/admin/equipment/templates/[id]/apply/route.ts
//
// POST /api/admin/equipment/templates/[id]/apply
//
// Phase F10.2g-b-i — equipment side of the apply flow. Walks the
// composed template, runs availability per item, batch-inserts
// `equipment_reservations` with `from_template_id` +
// `from_template_version` audit stamps so the §5.12.3 versioning
// rule holds: the snapshot answers "what did Job #427 actually
// go out with?" not the live (mutable) template.
//
// Body:
//   { job_id: UUID, from: ISO, to: ISO }
//
// Strict-fail v1: any blocked item aborts the whole apply with a
// 409 carrying every conflict. Overrides + per-item swaps land
// in a follow-up batch (F10.2g-b-iii). Personnel-side assign +
// cleanup-on-partial-failure lands in F10.2g-b-ii.
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
} from '@/lib/equipment/template-resolver';
import {
  assessCategory,
  assessUnit,
  type AvailabilityReason,
  type UnitAssessment,
} from '@/lib/equipment/availability';

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
      | { job_id?: unknown; from?: unknown; to?: unknown }
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

    if (conflicts.length > 0) {
      return NextResponse.json(
        {
          template_id: templateId,
          template_version: templateVersion,
          conflicts,
          summary: {
            requested: resolved.items.length,
            resolved: resolvedRows.length,
            blocked: conflicts.length,
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
            summary: {
              requested: resolved.items.length,
              resolved: 0,
              blocked: rows.length,
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

    console.log('[admin/equipment/templates/apply POST] ok', {
      template_id: templateId,
      template_version: templateVersion,
      job_id: jobId,
      reservation_count: (inserted ?? []).length,
      admin_email: session.user.email,
    });

    return NextResponse.json({
      template_id: templateId,
      template_version: templateVersion,
      job_id: jobId,
      reservations: inserted ?? [],
      summary: {
        requested: resolved.items.length,
        resolved: resolvedRows.length,
        blocked: 0,
      },
    });
  },
  { routeName: 'admin/equipment/templates/:id/apply#post' }
);

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

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
