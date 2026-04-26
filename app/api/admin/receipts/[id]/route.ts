// app/api/admin/receipts/[id]/route.ts — Per-receipt admin actions
//
// Phase F2 #5 — bookkeeper approval workflow.
//
// PATCH /api/admin/receipts/{id} — transition status / patch fields.
//   Body shape (all fields optional):
//     {
//       status?: 'approved' | 'rejected' | 'exported' | 'pending',
//       rejected_reason?: string | null,
//       category?: string | null,         // bookkeeper override
//       tax_deductible_flag?: 'full' | 'partial_50' | 'none' | 'review' | null,
//       notes?: string | null
//     }
//
//   When status flips to 'approved' the server stamps approved_by =
//   current admin's auth UUID + approved_at = now. Reopening (back to
//   'pending') clears those stamps.
//
//   Updates to user-editable fields (category / tax flag / notes) flag
//   `category_source = 'user'` when category changes — same convention
//   as the mobile useUpdateReceipt hook.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const ALLOWED_STATUSES = new Set(['pending', 'approved', 'rejected', 'exported']);
const ALLOWED_TAX_FLAGS = new Set(['full', 'partial_50', 'none', 'review']);

interface PatchBody {
  status?: string;
  rejected_reason?: string | null;
  category?: string | null;
  tax_deductible_flag?: string | null;
  notes?: string | null;
}

export const PATCH = withErrorHandler(
  async (req: NextRequest) => {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdmin(session.user.roles)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Next 15: params is a Promise<>; the URL parse is more robust.
    const id = new URL(req.url).pathname.split('/').filter(Boolean).pop();
    if (!id) {
      return NextResponse.json({ error: 'Missing receipt id' }, { status: 400 });
    }

    let body: PatchBody;
    try {
      body = (await req.json()) as PatchBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Build the partial update.
    const update: Record<string, unknown> = {};
    if (body.status !== undefined) {
      if (!ALLOWED_STATUSES.has(body.status)) {
        return NextResponse.json(
          { error: `Invalid status: ${body.status}` },
          { status: 400 }
        );
      }
      update.status = body.status;
      // Approval / rejection stamps. The admin's auth.users.id is the
      // approved_by; mobile session.user.id resolves to the same UUID.
      if (body.status === 'approved') {
        const adminId = await resolveAdminUserId(session.user.email);
        update.approved_by = adminId;
        update.approved_at = new Date().toISOString();
        update.rejected_reason = null;
      } else if (body.status === 'rejected') {
        update.rejected_reason = body.rejected_reason ?? 'Bookkeeper rejected';
        update.approved_by = null;
        update.approved_at = null;
      } else if (body.status === 'pending') {
        // Reopen — clear stamps so the row goes back through the queue.
        update.approved_by = null;
        update.approved_at = null;
        update.rejected_reason = null;
      }
    }

    if (body.category !== undefined) {
      update.category = body.category;
      update.category_source = 'user'; // bookkeeper edited
    }
    if (body.tax_deductible_flag !== undefined) {
      if (
        body.tax_deductible_flag !== null &&
        !ALLOWED_TAX_FLAGS.has(body.tax_deductible_flag)
      ) {
        return NextResponse.json(
          { error: `Invalid tax flag: ${body.tax_deductible_flag}` },
          { status: 400 }
        );
      }
      update.tax_deductible_flag = body.tax_deductible_flag;
    }
    if (body.notes !== undefined) {
      update.notes = body.notes;
    }
    if (body.rejected_reason !== undefined && body.status === undefined) {
      // Allow updating the rejection reason without changing status
      // (bookkeeper clarifying after the fact).
      update.rejected_reason = body.rejected_reason;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    update.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('receipts')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      // A failing approval / status transition is high-signal. Log the
      // underlying Postgres / PostgREST message + code so ops can
      // correlate bookkeeper-visible 500s with the DB error class
      // (RLS denial vs constraint violation vs network).
      console.error('[admin/receipts/[id]] PATCH failed', {
        id,
        status: body.status,
        error: error.message,
        code: (error as { code?: string }).code ?? null,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ receipt: data });
  },
  { routeName: '/api/admin/receipts/[id]' }
);

/**
 * Look up the admin's auth.users.id by email so we can stamp it on
 * approved_by. Returns null if the lookup fails — the API still
 * succeeds, the audit trail just lacks the approver.
 */
async function resolveAdminUserId(email: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const match = data?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    return match?.id ?? null;
  } catch (err) {
    // Audit trail will lack the approver UUID — a non-blocking issue,
    // but worth logging so we know when it happens. The PATCH itself
    // still succeeds with approved_by = null.
    console.warn(
      '[admin/receipts/[id]] approved_by resolve failed; audit trail will lack approver',
      { email, error: err instanceof Error ? err.message : String(err) }
    );
    return null;
  }
}
