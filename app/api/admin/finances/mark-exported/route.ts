// app/api/admin/finances/mark-exported/route.ts
//
// POST /api/admin/finances/mark-exported
//   Body: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', period_label: string }
//        OR
//        { year: 2025, period_label?: string }   // shorthand — full calendar year
//
// "Lock" every approved-and-not-yet-exported receipt that falls in
// the supplied window into a tax period. Implements the second half
// of the user's anti-double-counting directive:
//
//   *"if data has already been managed or used for it's intended
//   purpose, such as old receipts being calculated into business
//   costs, that they are handled and marked well so that there is
//   no confusion. We don't want things getting counted twice, or
//   not counted at all in the total."*
//
// Effect (single bulk UPDATE, race-safe via the WHERE guard):
//   status              : 'approved'  →  'exported'
//   exported_at         : NULL        →  now()
//   exported_period     : NULL        →  body.period_label
//
// Already-exported rows are NOT touched — re-running this endpoint
// for the same period is a no-op (zero rows updated). Receipts that
// were rejected, soft-deleted, or still pending are likewise
// skipped. The response carries `{ locked, already_exported,
// skipped, period_label }` so the page UI can render an
// at-a-glance summary.
//
// Auth: admin / developer / tech_support.
//
// Schema dependency: seeds/232 must be applied — adds
// `receipts.exported_at` + `receipts.exported_period`.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface MarkExportedBody {
  from?: unknown;
  to?: unknown;
  year?: unknown;
  period_label?: unknown;
}

interface MarkExportedResult {
  locked: number;
  already_exported: number;
  pending_or_rejected: number;
  soft_deleted: number;
  period_label: string;
  exported_at: string;
  window: { from: string; to: string };
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
      !userRoles.includes('tech_support')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body: MarkExportedBody;
    try {
      body = (await req.json()) as MarkExportedBody;
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const window = resolveWindow(body);
    if (!window.ok) {
      return NextResponse.json({ error: window.error }, { status: 400 });
    }

    const periodLabel =
      typeof body.period_label === 'string' && body.period_label.trim()
        ? body.period_label.trim().slice(0, 64)
        : window.defaultLabel;
    if (!periodLabel) {
      return NextResponse.json(
        { error: 'period_label is required when from/to are supplied.' },
        { status: 400 }
      );
    }

    // 1. Inventory the window first so we can report counts even
    //    when the UPDATE locks 0 rows. The page needs the
    //    "already_exported" + "pending_or_rejected" numbers to
    //    explain to the bookkeeper why the lock was a no-op.
    const { data: inventory, error: invErr } = await supabaseAdmin
      .from('receipts')
      .select('id, status, deleted_at, exported_at')
      .gte('created_at', window.fromIso)
      .lte('created_at', window.toIso);
    if (invErr) {
      console.error('[admin/finances/mark-exported] inventory failed', {
        error: invErr.message,
      });
      return NextResponse.json({ error: invErr.message }, { status: 500 });
    }

    type Row = {
      id: string;
      status: string | null;
      deleted_at: string | null;
      exported_at: string | null;
    };
    const counts = {
      approvedReady: 0,
      already_exported: 0,
      pending_or_rejected: 0,
      soft_deleted: 0,
    };
    for (const r of (inventory ?? []) as Row[]) {
      if (r.deleted_at) {
        counts.soft_deleted += 1;
        continue;
      }
      if (r.status === 'exported' || r.exported_at) {
        counts.already_exported += 1;
        continue;
      }
      if (r.status === 'approved') {
        counts.approvedReady += 1;
        continue;
      }
      counts.pending_or_rejected += 1;
    }

    const nowIso = new Date().toISOString();

    // Fast path — nothing to lock. Skip the UPDATE so we don't churn
    // the audit log on a re-run for an already-locked period.
    if (counts.approvedReady === 0) {
      const result: MarkExportedResult = {
        locked: 0,
        already_exported: counts.already_exported,
        pending_or_rejected: counts.pending_or_rejected,
        soft_deleted: counts.soft_deleted,
        period_label: periodLabel,
        exported_at: nowIso,
        window: { from: window.fromIso, to: window.toIso },
      };
      console.log('[admin/finances/mark-exported] nothing to lock', {
        admin_email: session.user.email,
        period_label: periodLabel,
        ...counts,
      });
      return NextResponse.json(result);
    }

    // 2. Bulk UPDATE. The WHERE-clause guards both `status='approved'`
    //    and `exported_at IS NULL` so a race with another admin
    //    running the same lock can't double-tag rows.
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('receipts')
      .update({
        status: 'exported',
        exported_at: nowIso,
        exported_period: periodLabel,
        updated_at: nowIso,
      })
      .eq('status', 'approved')
      .is('exported_at', null)
      .is('deleted_at', null)
      .gte('created_at', window.fromIso)
      .lte('created_at', window.toIso)
      .select('id');
    if (updateErr) {
      console.error('[admin/finances/mark-exported] update failed', {
        error: updateErr.message,
        period_label: periodLabel,
      });
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    const lockedCount = (updated ?? []).length;

    const result: MarkExportedResult = {
      locked: lockedCount,
      already_exported: counts.already_exported,
      pending_or_rejected: counts.pending_or_rejected,
      soft_deleted: counts.soft_deleted,
      period_label: periodLabel,
      exported_at: nowIso,
      window: { from: window.fromIso, to: window.toIso },
    };

    console.log('[admin/finances/mark-exported] locked', {
      admin_email: session.user.email,
      period_label: periodLabel,
      locked: lockedCount,
      already_exported: counts.already_exported,
      pending_or_rejected: counts.pending_or_rejected,
      soft_deleted: counts.soft_deleted,
    });

    return NextResponse.json(result);
  },
  { routeName: 'admin/finances/mark-exported' }
);

interface WindowOk {
  ok: true;
  fromIso: string;
  toIso: string;
  defaultLabel: string;
}
interface WindowErr {
  ok: false;
  error: string;
}

function resolveWindow(body: MarkExportedBody): WindowOk | WindowErr {
  const fromRaw = typeof body.from === 'string' ? body.from : null;
  const toRaw = typeof body.to === 'string' ? body.to : null;
  const yearRaw = typeof body.year === 'number' ? body.year : null;

  if (fromRaw && toRaw) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(toRaw)
    ) {
      return {
        ok: false,
        error: '`from` and `to` must be YYYY-MM-DD.',
      };
    }
    if (fromRaw > toRaw) {
      return { ok: false, error: '`from` must be on or before `to`.' };
    }
    return {
      ok: true,
      fromIso: `${fromRaw}T00:00:00.000Z`,
      toIso: `${toRaw}T23:59:59.999Z`,
      // No sensible default label for an arbitrary window — caller
      // must supply one. The empty string is a sentinel checked by
      // the caller's period_label fallback.
      defaultLabel: '',
    };
  }
  if (yearRaw !== null) {
    if (
      !Number.isInteger(yearRaw) ||
      yearRaw < 2000 ||
      yearRaw > 2100
    ) {
      return { ok: false, error: 'Invalid year.' };
    }
    return {
      ok: true,
      fromIso: `${yearRaw}-01-01T00:00:00.000Z`,
      toIso: `${yearRaw}-12-31T23:59:59.999Z`,
      defaultLabel: String(yearRaw),
    };
  }
  return {
    ok: false,
    error: 'Body must include either { year } or { from, to, period_label }.',
  };
}
