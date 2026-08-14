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
import { notifyJobEvent } from '@/lib/notifications/job-event';

const ALLOWED_STATUSES = new Set(['pending', 'approved', 'rejected', 'exported']);
const ALLOWED_TAX_FLAGS = new Set(['full', 'partial_50', 'none', 'review']);
/** The column has no CHECK constraint — seed 220 records these four in a comment only — so the
 *  validation has to live here or the column accepts anything a client sends. */
const ALLOWED_PAYMENT_METHODS = new Set(['card', 'cash', 'check', 'other']);
/** Editing any of these means a human has corrected what the AI read, which is what
 *  `user_reviewed_at` records. Deciding a status or filing to a job is not that. */
const TOUCHES_EXTRACTED_FIELDS = [
  'vendor_name', 'vendor_address', 'transaction_at',
  'subtotal_cents', 'tax_cents', 'tip_cents', 'total_cents',
  'payment_method', 'payment_last4',
] as const;

interface PatchBody {
  status?: string;
  rejected_reason?: string | null;
  category?: string | null;
  tax_deductible_flag?: string | null;
  notes?: string | null;
  job_id?: string | null;
  // ── V4 (2026-08-14) — the extracted fields became editable ──────────────────────────────────
  //
  // Owner: *"sometimes the AI gets info wrong… we need to be able to manually edit all of the info
  // for each receipt if needed."* Until now this route accepted the bookkeeper's DECISIONS
  // (status, category, tax flag, job) but none of the facts the AI had read — so a mis-read vendor
  // or a transposed total could be seen and not corrected. The only recourse was re-running the AI
  // and hoping it read it differently the second time.
  //
  // Each one is validated below rather than passed through: these write to typed columns, and a
  // total of "12.3.4" reaching an INT column is a 500 the bookkeeper cannot act on.
  vendor_name?: string | null;
  vendor_address?: string | null;
  transaction_at?: string | null;
  subtotal_cents?: number | null;
  tax_cents?: number | null;
  tip_cents?: number | null;
  total_cents?: number | null;
  payment_method?: string | null;
  payment_last4?: string | null;
  // ── Seed 591 — answering "whose money was this?" ────────────────────────────────────────────
  /** 'business' | 'personal' | null. The one fact nothing can derive. */
  expense_nature?: string | null;
  expense_nature_note?: string | null;
  /** The card on file that really paid. Sending this CONFIRMS it — `null` un-confirms and clears. */
  payment_card_id?: string | null;
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

    // ── V4 — the extracted facts, each validated for the column it lands in ─────────────────────
    for (const key of ['vendor_name', 'vendor_address'] as const) {
      if (body[key] !== undefined) {
        const v = body[key];
        if (v !== null && typeof v !== 'string') {
          return NextResponse.json({ error: `${key} must be text or null` }, { status: 400 });
        }
        // An empty box means "clear it", not "store an empty string" — a blank vendor and a vendor
        // of "" read the same on screen and sort differently in an export.
        update[key] = v === null ? null : v.trim() || null;
      }
    }

    if (body.transaction_at !== undefined) {
      if (body.transaction_at === null) {
        update.transaction_at = null;
      } else if (typeof body.transaction_at !== 'string' || Number.isNaN(Date.parse(body.transaction_at))) {
        return NextResponse.json({ error: 'transaction_at must be an ISO timestamp or null' }, { status: 400 });
      } else {
        update.transaction_at = new Date(body.transaction_at).toISOString();
      }
    }

    for (const key of ['subtotal_cents', 'tax_cents', 'tip_cents', 'total_cents'] as const) {
      if (body[key] === undefined) continue;
      const v = body[key];
      if (v === null) { update[key] = null; continue; }
      // Integer cents only. A float here is silently truncated by Postgres, so $12.345 would become
      // $12.34 with no indication — the parsing belongs on the client (lib/receipts/edit.ts) and
      // this is the guard that says so if it did not happen.
      if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) {
        return NextResponse.json(
          { error: `${key} must be a whole number of cents (or null) — 12.34 dollars is 1234` },
          { status: 400 },
        );
      }
      if (v < 0) return NextResponse.json({ error: `${key} cannot be negative` }, { status: 400 });
      update[key] = v;
    }

    if (body.payment_method !== undefined) {
      const v = body.payment_method;
      if (v !== null && !ALLOWED_PAYMENT_METHODS.has(v)) {
        return NextResponse.json(
          { error: `Invalid payment_method: ${String(v)}. Expected ${[...ALLOWED_PAYMENT_METHODS].join(', ')} or null.` },
          { status: 400 },
        );
      }
      update.payment_method = v;
    }

    if (body.payment_last4 !== undefined) {
      const v = body.payment_last4;
      if (v === null) {
        update.payment_last4 = null;
      } else if (typeof v !== 'string' || !/^\d{4}$/.test(v)) {
        // Exactly four digits. Anything longer would put more of a card number in the database than
        // the receipt itself ever prints.
        return NextResponse.json({ error: 'payment_last4 must be exactly four digits, or null' }, { status: 400 });
      } else {
        update.payment_last4 = v;
      }
    }

    // A person touched this row. `user_reviewed_at` is what a later automatic pass reads to know a
    // human has been here — without it, a re-extraction can silently overwrite a correction and the
    // bookkeeper finds the same wrong vendor back again next week.
    if (TOUCHES_EXTRACTED_FIELDS.some((k) => k in update)) {
      update.user_reviewed_at = new Date().toISOString();
    }
    // N3 — the job this receipt was on BEFORE the patch, so "linked to a job" can be told apart
    // from "re-saved with the same job". Read only when `job_id` is in the body, so an ordinary
    // category edit does not pay for a query it will not use.
    let previousJobId: string | null = null;
    if (body.job_id !== undefined) {
      // Assign / reassign the receipt to a job (or clear with null). Empty
      // string is normalized to null so the FK clears cleanly.
      if (body.job_id !== null && typeof body.job_id !== 'string') {
        return NextResponse.json({ error: 'job_id must be a string or null' }, { status: 400 });
      }
      update.job_id = body.job_id ? body.job_id : null;
      const { data: prior } = await supabaseAdmin
        .from('receipts').select('job_id').eq('id', id).maybeSingle();
      previousJobId = (prior as { job_id: string | null } | null)?.job_id ?? null;
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

    // ── N3 (2026-08-14) — a receipt landing on a job ────────────────────────────────────────────
    //
    // Only on the transition, and only ONTO a job: `update.job_id` is set whenever the field was in
    // the body, including when it is unchanged or being cleared. Notifying on all of those makes
    // every receipt edit tell the crew something, which is the failure mode this whole group is
    // arranged to avoid.
    //
    // Cost matters here too — the job's crew is not told about somebody's fuel receipt at full
    // volume; it defaults to the digest (see DEFAULT_JOB_EVENT_CHANNELS).
    if (typeof update.job_id === 'string' && update.job_id && update.job_id !== previousJobId) {
      const receipt = data as { vendor_name?: string | null; total_cents?: number | null };
      const dollars = typeof receipt.total_cents === 'number'
        ? `$${Math.round(receipt.total_cents / 100).toLocaleString('en-US')}`
        : null;
      await notifyJobEvent(update.job_id, {
        kind: 'receipt_linked',
        title: `expense linked — ${receipt.vendor_name ?? 'a receipt'}${dollars ? ` (${dollars})` : ''}`,
        link: `/admin/jobs/${update.job_id}?tab=financial`,
      }, session.user.email);
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
