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
import { notify } from '@/lib/notifications';
import { buildReceiptDecisionNotification } from '@/lib/notifications/receipt-decision';
import { resolveSubmitterEmails } from '@/lib/receipts/submitter';
import { EDITABLE_KEYS, applyReceiptEdits, clearConfidenceFor } from '@/lib/receipts/edit-fields';

const ALLOWED_STATUSES = new Set(['pending', 'approved', 'rejected', 'exported']);
const ALLOWED_TAX_FLAGS = new Set(['full', 'partial_50', 'none', 'review']);

interface PatchBody {
  status?: string;
  rejected_reason?: string | null;
  category?: string | null;
  tax_deductible_flag?: string | null;
  notes?: string | null;
  job_id?: string | null;
  // ── Seed 591 — answering "whose money was this?" ────────────────────────────────────────────
  /** 'business' | 'personal' | null. The one fact nothing can derive. */
  expense_nature?: string | null;
  expense_nature_note?: string | null;
  /** The card on file that really paid. Sending this CONFIRMS it — `null` un-confirms and clears. */
  payment_card_id?: string | null;
  // Every field the extractor reads is correctable too. They are not listed one by one because
  // `EDITABLE_FIELDS` in lib/receipts/edit-fields.ts is the single place a field is declared, along
  // with its validator and where it is stored — a second list here would drift from it.
  [field: string]: unknown;
}

const ALLOWED_EXPENSE_NATURE = new Set(['business', 'personal']);

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
    if (body.job_id !== undefined) {
      // Assign / reassign the receipt to a job (or clear with null). Empty
      // string is normalized to null so the FK clears cleanly.
      if (body.job_id !== null && typeof body.job_id !== 'string') {
        return NextResponse.json({ error: 'job_id must be a string or null' }, { status: 400 });
      }
      update.job_id = body.job_id ? body.job_id : null;
    }
    // ── Whose money was it, and was it business at all (seed 591) ─────────────────────────────
    //
    // Owner, 2026-08-13: *"maybe one of the employees paid for something without using the business
    // card… we might reimburse them, or maybe not depending. We might want to disregard the receipt
    // entirely from our taxes because it might have just been a personal purchase."*
    //
    // These two are the write half of that. Everything else in the feature reads them.
    if (body.expense_nature !== undefined) {
      if (body.expense_nature !== null && !ALLOWED_EXPENSE_NATURE.has(body.expense_nature)) {
        return NextResponse.json(
          { error: `Invalid expense_nature: ${body.expense_nature}. Expected 'business', 'personal' or null.` },
          { status: 400 },
        );
      }
      update.expense_nature = body.expense_nature;
    }
    if (body.expense_nature_note !== undefined) {
      update.expense_nature_note = body.expense_nature_note;
    }
    if (body.payment_card_id !== undefined) {
      if (body.payment_card_id !== null && typeof body.payment_card_id !== 'string') {
        return NextResponse.json({ error: 'payment_card_id must be a string or null' }, { status: 400 });
      }
      update.payment_card_id = body.payment_card_id ? body.payment_card_id : null;
      // Naming the card IS the confirmation — a person picked it from the list of cards on file, and
      // that is precisely the human agreement `card_confirmed_at` records. Clearing the card clears
      // the confirmation with it: leaving a stale timestamp behind would say somebody had confirmed
      // a card that is no longer set, and `taxSummaryFor` would then file on nothing.
      update.card_confirmed_at = body.payment_card_id ? new Date().toISOString() : null;
      update.card_confirmed_by = body.payment_card_id
        ? await resolveAdminUserId(session.user.email)
        : null;
    }

    if (body.rejected_reason !== undefined && body.status === undefined) {
      // Allow updating the rejection reason without changing status
      // (bookkeeper clarifying after the fact).
      update.rejected_reason = body.rejected_reason;
    }

    // ── CORRECTING WHAT THE AI READ (owner, 2026-08-16) ──────────────────────────────────────────
    //
    // *"We also need to be able to edit all of the details of a receipt once it has been analyzed …
    // I uploaded a receipt that had the date 8/12/2016, but because the ink quality was poor … it
    // looked like 8/2/2026."*
    //
    // Until now every field the extractor read — vendor, DATE, subtotal, tax, tip, total, last four
    // — was write-once and unreachable afterwards. The nine things this route accepted were all
    // bookkeeping decisions ABOUT the receipt, not what the receipt says. So a misread date could be
    // re-run through the AI (which reads the same faded ink the same way), rejected, or left wrong.
    // There was nowhere to put the right answer.
    //
    // The registry in `lib/receipts/edit-fields.ts` validates and routes each field; this reads the
    // row first because a correction log needs to record what the value changed FROM.
    const editKeys = Object.keys(body as Record<string, unknown>).filter((k) => EDITABLE_KEYS.has(k));
    if (editKeys.length > 0) {
      const { data: currentRow } = await supabaseAdmin
        .from('receipts')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!currentRow) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });

      const current = currentRow as Record<string, unknown> & { ai_extras?: Record<string, unknown> | null };
      const edits = applyReceiptEdits(current, body as Record<string, unknown>);
      if (edits.errors.length > 0) {
        return NextResponse.json({ error: edits.errors.join(' ') }, { status: 400 });
      }

      Object.assign(update, edits.columnUpdate);

      if (Object.keys(edits.aiExtrasUpdate).length > 0) {
        // Merged, never replaced: `ai_extras` also carries the summary, review flags and the
        // legibility block, and a whole-object write would drop them.
        update.ai_extras = { ...(current.ai_extras ?? {}), ...edits.aiExtrasUpdate };
      }

      const changedKeys = Object.keys(edits.changed);
      if (changedKeys.length > 0) {
        // The AI's confidence in a field a human has since corrected is a statement about a number
        // that is no longer on the screen. Left in place, the page keeps drawing "the AI was 30%
        // sure of this" beside a figure somebody read off the paper themselves — which is exactly
        // backwards, and would make the low-confidence marker mean nothing.
        update.ai_confidence_per_field = clearConfidenceFor(
          current.ai_confidence_per_field as Record<string, number> | null,
          changedKeys,
        );
        // What was corrected, and from what. Answers "what does the AI keep getting wrong", which
        // is the question a pile of corrections is actually worth asking.
        const priorEdits = (current.user_review_edits ?? {}) as Record<string, unknown>;
        update.user_review_edits = {
          ...priorEdits,
          [new Date().toISOString()]: { by: session.user.email, changed: edits.changed },
        };
        update.user_reviewed_at = new Date().toISOString();
      }
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

    // hub-widget-excellence-03 Slice 2c — notify the submitter when the
    // bookkeeper approves or rejects their receipt (only those two
    // transitions; reopen-to-pending + field edits stay silent).
    // Best-effort: a notification failure must not fail the decision.
    if (body.status === 'approved' || body.status === 'rejected') {
      try {
        // ── THE FIELDS THIS USED TO ASK FOR DO NOT EXIST ──────────────────────────────────────
        //
        // It read `submitted_by`, `vendor` and `total` off the row. The real columns are `user_id`
        // (an auth.users UUID), `vendor_name` and `total_cents` — so all three arrived `undefined`,
        // the builder returned null on the missing submitter, and `if (notice)` swallowed it.
        //
        // **Every receipt approval and rejection has notified nobody**, silently. A crew member
        // whose receipt was rejected with a reason was never told and there was no error to notice.
        // The `as Record<string, unknown>` cast is exactly what stopped the compiler catching it,
        // which is why it is gone rather than corrected.
        const row = data as { user_id?: string | null; vendor_name?: string | null; total_cents?: number | null; rejected_reason?: string | null };
        const emailById = await resolveSubmitterEmails([row.user_id]);
        const notice = buildReceiptDecisionNotification(
          {
            user_email: row.user_id ? emailById.get(row.user_id) ?? null : null,
            vendor_name: row.vendor_name ?? null,
            total_cents: row.total_cents ?? null,
            rejected_reason: row.rejected_reason ?? null,
          },
          body.status,
        );
        if (notice) await notify(notice);
      } catch { /* ignore notification failures */ }
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
