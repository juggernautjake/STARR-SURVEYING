// app/api/admin/equipment/templates/[id]/preview/route.ts
//
// GET /api/admin/equipment/templates/[id]/preview
//   ?from=ISO&to=ISO
//   [&job_id=UUID]
//
// Phase F10.2g-a-ii — read-only apply preview. Wraps the F10.2g-
// a-i composition resolver + the F10.3-b equipment availability
// engine + the F10.4-b personnel availability engine to produce
// the §5.12.3 step 4 dispatcher view: every line item with
// resolved availability info (✓ available · ⚠ in-use until
// Friday · ✗ in maintenance · ⚠ low stock — only 2 left) and
// every personnel slot with its candidate roster.
//
// Read-only: this endpoint NEVER writes. The dispatcher reviews
// the preview, edits the assignment list (swaps / overrides /
// drops), then POSTs to /apply (F10.2g-b) which re-runs the
// resolver + availability inside its transaction so a stale
// preview can't slip through.
//
// `job_id` is optional and only carried into the response for
// audit context — it does NOT mutate state, and the engine
// doesn't currently key on job_id at all (capacity overlap is
// per-unit / per-person, not per-job). Future polish: scheduled
// window auto-fill from the job record once jobs gain
// scheduled_start / scheduled_end columns.
//
// Auth: admin / developer / tech_support / equipment_manager —
// same read-side authorization as the catalogue + availability
// routes.

import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  resolveTemplate,
  type ResolvedItem,
  type ResolvedSlot,
} from '@/lib/equipment/template-resolver';
import {
  assessCategory,
  assessUnit,
  type UnitAssessment,
} from '@/lib/equipment/availability';
import {
  assessForSkillCohort,
  type PersonAssessment,
} from '@/lib/personnel/availability';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

interface ItemPreview {
  resolved: ResolvedItem;
  /**
   * Unit-mode (specific instrument): one assessment.
   * Category-mode: every unit in the category — the dispatcher
   * picks one at apply-time per the §5.12.3 worked example
   * ("kit #3 reserved; kit #4 also available — switch?").
   */
  assessments: UnitAssessment[];
  assignable_count: number;
  blocked_count: number;
}

interface SlotPreview {
  resolved: ResolvedSlot;
  candidates: PersonAssessment[];
  assignable_count: number;
  blocked_count: number;
}

export const GET = withErrorHandler(
  async (req: NextRequest) => {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userRoles = (session.user as { roles?: string[] } | undefined)
      ?.roles ?? [];
    if (
      !isAdmin(session.user.roles) &&
      !userRoles.includes('tech_support') &&
      !userRoles.includes('equipment_manager')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(req.url);
    // Pathname: /api/admin/equipment/templates/[id]/preview — id
    // is the second-to-last segment.
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const templateId = pathSegments[pathSegments.length - 2];
    if (!templateId || !UUID_RE.test(templateId)) {
      return NextResponse.json(
        { error: 'template id must be a UUID' },
        { status: 400 }
      );
    }

    const fromRaw = url.searchParams.get('from');
    const toRaw = url.searchParams.get('to');
    const jobIdRaw = url.searchParams.get('job_id');
    if (!fromRaw || !toRaw) {
      return NextResponse.json(
        { error: '`from` and `to` (ISO timestamps) are required.' },
        { status: 400 }
      );
    }
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
    if (jobIdRaw && !UUID_RE.test(jobIdRaw)) {
      return NextResponse.json(
        { error: '`job_id` must be a UUID when present.' },
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

    // ── Per-item availability ───────────────────────────────────
    const itemPreviews = await Promise.all(
      resolved.items.map(async (item): Promise<ItemPreview> => {
        const opts = {
          windowFrom,
          windowTo,
          quantityNeeded: item.quantity,
        };
        if (item.equipment_inventory_id) {
          const single = await assessUnit(item.equipment_inventory_id, opts);
          const assessments = single ? [single] : [];
          return {
            resolved: item,
            assessments,
            assignable_count: assessments.filter((a) => a.assignable).length,
            blocked_count:
              assessments.length -
              assessments.filter((a) => a.assignable).length,
          };
        }
        if (item.category) {
          const list = await assessCategory(item.category, opts);
          return {
            resolved: item,
            assessments: list,
            assignable_count: list.filter((a) => a.assignable).length,
            blocked_count:
              list.length - list.filter((a) => a.assignable).length,
          };
        }
        // Defensive — resolver guarantees at least one of unit/
        // category, but if a bad row slips through we surface as
        // empty rather than 500.
        return {
          resolved: item,
          assessments: [],
          assignable_count: 0,
          blocked_count: 0,
        };
      })
    );

    // ── Per-slot personnel availability ─────────────────────────
    const slotPreviews = await Promise.all(
      resolved.personnel_slots.map(async (slot): Promise<SlotPreview> => {
        const candidates = await assessForSkillCohort({
          windowFrom,
          windowTo,
          requiredSkills: slot.required_skills,
          // Template-required slots are strict-fail; the
          // dispatcher's apply UI exposes per-row override
          // toggles which the F10.2g-b apply handler honours.
          skillsAreSoft: false,
        });
        return {
          resolved: slot,
          candidates,
          assignable_count: candidates.filter((c) => c.assignable).length,
          blocked_count:
            candidates.length - candidates.filter((c) => c.assignable).length,
        };
      })
    );

    // ── Roll-up summary ─────────────────────────────────────────
    // "blocked_items" = items where ZERO assignable candidates.
    // For specific-mode that means the unit itself is blocked;
    // for category-mode that means every unit in the category is
    // unavailable. Both surface as red in the dispatcher UI.
    const blockedItems = itemPreviews.filter(
      (i) => i.assignable_count === 0
    ).length;
    // "unfilled_slots" = slots where no candidate is assignable.
    // The dispatcher can still pick a candidate with hard_blocks
    // by issuing an override on apply, but the preview flags it.
    const unfilledSlots = slotPreviews.filter(
      (s) => s.assignable_count === 0
    ).length;

    console.log('[admin/equipment/templates/preview GET]', {
      template_id: templateId,
      job_id: jobIdRaw,
      from: windowFrom,
      to: windowTo,
      resolution_chain_length: resolved.resolution_chain.length,
      resolution_depth: resolved.resolution_depth,
      item_count: itemPreviews.length,
      blocked_items: blockedItems,
      slot_count: slotPreviews.length,
      unfilled_slots: unfilledSlots,
      admin_email: session.user.email,
    });

    return NextResponse.json({
      window: { from: windowFrom, to: windowTo },
      job_id: jobIdRaw ?? null,
      template: resolved.root,
      resolution: {
        chain: resolved.resolution_chain,
        depth: resolved.resolution_depth,
      },
      items: itemPreviews,
      personnel_slots: slotPreviews,
      summary: {
        item_count: itemPreviews.length,
        blocked_items: blockedItems,
        slot_count: slotPreviews.length,
        unfilled_slots: unfilledSlots,
        ready_to_apply: blockedItems === 0 && unfilledSlots === 0,
      },
    });
  },
  { routeName: 'admin/equipment/templates/:id/preview#get' }
);
