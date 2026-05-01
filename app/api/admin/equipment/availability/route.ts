// app/api/admin/equipment/availability/route.ts
//
// GET /api/admin/equipment/availability
//   ?from=ISO&to=ISO
//   (&id=UUID  | &category=str)
//   [&qty=N]
//   [&calibration_hard_block_days=N]
//
// Phase F10.3-b — read-only availability check. Wraps the
// `lib/equipment/availability.ts` engine so the dispatcher UI
// (and the §5.12.7.1 Today landing-page card) can ask "is this
// unit / any unit in this category assignable for this window?"
// without committing a reservation.
//
// Exactly one of `id` or `category` is required. Both → 400.
// Neither → 400. The two modes return the same `{ assessments
// [] }` shape so the caller can render uniformly.
//
// `qty` defaults to 1 (consumables). Ignored for durables/kits.
//
// Response shape:
//   {
//     window: { from, to },
//     assignable_count: number,        // assessments with assignable=true
//     blocked_count:    number,
//     assessments: UnitAssessment[]    // see lib/equipment/availability
//   }
//
// Auth: admin / developer / tech_support / equipment_manager.
// Same read-side authorization as the catalogue route.
import { NextRequest, NextResponse } from 'next/server';

import { auth, isAdmin } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  assessCategory,
  assessUnit,
  type UnitAssessment,
} from '@/lib/equipment/availability';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

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

    const { searchParams } = new URL(req.url);
    const fromRaw = searchParams.get('from');
    const toRaw = searchParams.get('to');
    const idRaw = searchParams.get('id');
    const categoryRaw = searchParams.get('category');
    const qtyRaw = searchParams.get('qty');
    const calBlockRaw = searchParams.get('calibration_hard_block_days');

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

    const hasId = !!idRaw;
    const hasCategory = !!categoryRaw && categoryRaw.trim().length > 0;
    if (hasId === hasCategory) {
      return NextResponse.json(
        {
          error:
            'Provide exactly one of `id` (UUID) or `category` (string).',
        },
        { status: 400 }
      );
    }
    if (hasId && !UUID_RE.test(idRaw!)) {
      return NextResponse.json(
        { error: '`id` must be a valid UUID.' },
        { status: 400 }
      );
    }

    let qty: number | undefined;
    if (qtyRaw) {
      const n = parseInt(qtyRaw, 10);
      if (!Number.isInteger(n) || n < 1) {
        return NextResponse.json(
          { error: '`qty` must be a positive integer (≥1).' },
          { status: 400 }
        );
      }
      qty = n;
    }

    let calibrationHardBlockDays: number | undefined;
    if (calBlockRaw) {
      const n = parseInt(calBlockRaw, 10);
      if (!Number.isInteger(n) || n < 0) {
        return NextResponse.json(
          {
            error:
              '`calibration_hard_block_days` must be a non-negative integer.',
          },
          { status: 400 }
        );
      }
      calibrationHardBlockDays = n;
    }

    const opts = {
      windowFrom: new Date(fromTime).toISOString(),
      windowTo: new Date(toTime).toISOString(),
      quantityNeeded: qty,
      calibrationHardBlockDays,
    };

    let assessments: UnitAssessment[];
    if (hasId) {
      const single = await assessUnit(idRaw!, opts);
      if (!single) {
        return NextResponse.json(
          { error: 'Equipment unit not found.' },
          { status: 404 }
        );
      }
      assessments = [single];
    } else {
      assessments = await assessCategory(categoryRaw!.trim(), opts);
    }

    const assignableCount = assessments.filter((a) => a.assignable).length;
    const blockedCount = assessments.length - assignableCount;

    console.log('[admin/equipment/availability GET]', {
      mode: hasId ? 'unit' : 'category',
      from: opts.windowFrom,
      to: opts.windowTo,
      qty,
      total: assessments.length,
      assignable: assignableCount,
      admin_email: session.user.email,
    });

    return NextResponse.json({
      window: { from: opts.windowFrom, to: opts.windowTo },
      assignable_count: assignableCount,
      blocked_count: blockedCount,
      assessments,
    });
  },
  { routeName: 'admin/equipment/availability#get' }
);
