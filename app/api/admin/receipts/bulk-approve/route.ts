// app/api/admin/receipts/bulk-approve/route.ts
//
// POST /api/admin/receipts/bulk-approve
//   Body: { ids: string[] }
//
// Bulk-approve N pending receipts in a single request. Closes the
// Batch FF v2 polish item *"Bulk-approve action — checkboxes in the
// row + a top-of-list '✓ Approve N selected' button so the
// bookkeeper can clear the pending queue in one tap."*
//
// Per-row contract:
//   - Row must currently be `status='pending'` AND `deleted_at IS
//     NULL`. Anything else (already approved, rejected, soft-
//     deleted, exported) is skipped with a typed reason.
//   - Approved rows get `approved_by = current admin's UUID` +
//     `approved_at = now()` + `rejected_reason = null`.
//   - The whole batch is one bulk UPDATE so the bookkeeper sees a
//     single atomic transition in the audit log.
//
// Auth: admin / developer / tech_support. Same shape as the
// per-row PATCH endpoint at /api/admin/receipts/[id].
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

/** Hard cap so a runaway client can't approve thousands of rows
 *  by accident. Bookkeeper queues rarely exceed 50/day; 200 is a
 *  generous ceiling. */
const MAX_BATCH = 200;

interface BulkApproveBody {
  ids?: unknown;
}

interface BulkApproveResult {
  approved: string[];
  skipped: Array<{
    id: string;
    reason:
      | 'not_found'
      | 'already_approved'
      | 'rejected'
      | 'exported'
      | 'soft_deleted'
      | 'unknown_status';
  }>;
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

    let body: BulkApproveBody;
    try {
      body = (await req.json()) as BulkApproveBody;
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    // Defensive validation — a malformed body should 400, not 500.
    if (!Array.isArray(body.ids)) {
      return NextResponse.json(
        { error: 'Body must include `ids: string[]`.' },
        { status: 400 }
      );
    }
    const ids = body.ids
      .filter((v): v is string => typeof v === 'string')
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      return NextResponse.json(
        { error: 'No receipt ids provided.' },
        { status: 400 }
      );
    }
    if (ids.length > MAX_BATCH) {
      return NextResponse.json(
        {
          error: `Batch too large (${ids.length}). Max ${MAX_BATCH} receipts per call.`,
        },
        { status: 400 }
      );
    }

    // 1. Pull current state for each id so we can classify skips.
    //    Single round-trip via .in().
    const { data: currentRows, error: readErr } = await supabaseAdmin
      .from('receipts')
      .select('id, status, deleted_at')
      .in('id', ids);
    if (readErr) {
      console.error('[admin/receipts/bulk-approve] read failed', {
        error: readErr.message,
      });
      return NextResponse.json({ error: readErr.message }, { status: 500 });
    }

    const result: BulkApproveResult = { approved: [], skipped: [] };
    type RawRow = {
      id: string;
      status: string | null;
      deleted_at: string | null;
    };
    const seen = new Map<string, RawRow>();
    for (const row of (currentRows ?? []) as RawRow[]) {
      seen.set(row.id, row);
    }

    // Classify each requested id. ids the SELECT didn't return are
    // not_found; everything else gets categorised by status +
    // deleted_at.
    const toApprove: string[] = [];
    for (const id of ids) {
      const row = seen.get(id);
      if (!row) {
        result.skipped.push({ id, reason: 'not_found' });
        continue;
      }
      if (row.deleted_at) {
        result.skipped.push({ id, reason: 'soft_deleted' });
        continue;
      }
      switch (row.status) {
        case 'pending':
          toApprove.push(id);
          break;
        case 'approved':
          result.skipped.push({ id, reason: 'already_approved' });
          break;
        case 'rejected':
          result.skipped.push({ id, reason: 'rejected' });
          break;
        case 'exported':
          result.skipped.push({ id, reason: 'exported' });
          break;
        default:
          result.skipped.push({ id, reason: 'unknown_status' });
      }
    }

    if (toApprove.length === 0) {
      return NextResponse.json(result);
    }

    // 2. Resolve the approver UUID once for the whole batch — the
    //    per-row PATCH endpoint does the same listUsers call, so
    //    keeping the audit trail consistent matters here.
    const adminId = await resolveAdminUserId(session.user.email);
    const nowIso = new Date().toISOString();

    // 3. Bulk UPDATE. Postgres does this in one statement via the
    //    .in() filter + the WHERE status='pending' guard (defends
    //    against a TOCTOU where a row was approved between our
    //    SELECT and UPDATE).
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('receipts')
      .update({
        status: 'approved',
        approved_by: adminId,
        approved_at: nowIso,
        rejected_reason: null,
        updated_at: nowIso,
      })
      .in('id', toApprove)
      .eq('status', 'pending')
      .select('id');
    if (updateErr) {
      console.error('[admin/receipts/bulk-approve] update failed', {
        error: updateErr.message,
        attempted: toApprove.length,
      });
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    const approvedIds = new Set(
      ((updated ?? []) as Array<{ id: string }>).map((r) => r.id)
    );
    result.approved = Array.from(approvedIds);

    // Anything we attempted but didn't get back lost the TOCTOU
    // race — surface as already_approved so the UI's count math
    // still adds up.
    for (const id of toApprove) {
      if (!approvedIds.has(id)) {
        result.skipped.push({ id, reason: 'already_approved' });
      }
    }

    console.log('[admin/receipts/bulk-approve] done', {
      requested: ids.length,
      approved: result.approved.length,
      skipped: result.skipped.length,
      admin_email: session.user.email,
    });

    return NextResponse.json(result);
  },
  { routeName: 'admin/receipts/bulk-approve' }
);

async function resolveAdminUserId(email: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const match = data?.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );
    return match?.id ?? null;
  } catch (err) {
    // Audit trail will lack the approver UUID — non-blocking, but
    // worth a warn so ops see when it happens. Mirrors the per-row
    // PATCH behaviour.
    console.warn(
      '[admin/receipts/bulk-approve] approved_by resolve failed; audit trail will lack approver',
      { email, error: err instanceof Error ? err.message : String(err) }
    );
    return null;
  }
}
