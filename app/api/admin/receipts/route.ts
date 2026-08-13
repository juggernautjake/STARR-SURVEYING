// app/api/admin/receipts/route.ts — Admin list of all receipts
//
// Phase F2 #5 — bookkeeper approval queue.
//
// GET /api/admin/receipts?status=pending&from=2026-04-01&to=2026-04-30
//   - status:   one of pending | approved | rejected | exported (omit for all)
//   - from/to:  YYYY-MM-DD bounds on receipts.transaction_at OR (when null)
//               receipts.created_at — bookkeepers want "April expenses" even
//               for receipts that lack an extracted transaction date.
//   - email:    filter to a single submitter
//   - jobId:    filter to a single job
//
// Mobile receipts carry user_id (UUID) but the bookkeeper UI works in
// emails. We bulk-look-up auth.users via the service role and annotate
// each row with submitted_by_email + submitted_by_name. A
// per-job-id annotation pulls job.name + job_number for display.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// ── ONE DECLARATION OF A RECEIPT ROW (R6, 2026-08-11) ────────────────────────────────────────────
//
// `ReceiptRow` and `AdminReceiptRow` used to be declared HERE as well as in
// `app/admin/receipts/receipt-types.ts`, which openly described itself as a mirror of this file.
// Two hand-maintained shapes for one row, and the bill came due the moment the extractor learned to
// return line items: adding them to the UI's copy made this file fail to compile.
//
// Imported now, and re-exported so existing importers of `AdminReceiptRow` from this route keep
// working unchanged.
import type { ReceiptRow, AdminReceiptRow, ReceiptPaymentCard } from '@/app/admin/receipts/receipt-types';
// `needsReview` is imported as a VALUE, not re-implemented here: the tab's count and the rows
// behind it must answer the question the same way, and the surest way to guarantee that is one
// function. See its note in receipt-types.ts for why `queued` is deliberately not "needs review".
import { needsReview } from '@/app/admin/receipts/receipt-types';
export type { AdminReceiptRow };

const SIGNED_URL_TTL_SEC = 60 * 15;
const STORAGE_BUCKET = 'starr-field-receipts';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const email = searchParams.get('email');
  const jobId = searchParams.get('jobId');
  // Soft-deleted rows (Batch CC) are hidden by default — they're
  // tombstones for IRS retention, not part of the day-to-day
  // queue. The bookkeeper can flip the "Show deleted" toggle to
  // include them when reviewing the audit trail (Batch FF). Accept
  // any of '1', 'true', 'yes' so curl-from-the-CLI calls don't
  // need to remember the canonical form.
  const includeDeleted = (() => {
    const raw = (searchParams.get('include_deleted') ?? '').toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
  })();
  // Cap at 500: bookkeeper queue rarely needs more in one page — a
  // tighter date range is the recommended path for big exports. The
  // client default of 100 fits ~3 screens of rows.
  const limit = Math.max(1, Math.min(500, parseInt(searchParams.get('limit') ?? '100', 10)));

  // When the bookkeeper filters by submitter email, resolve to the
  // matching auth.users.id BEFORE running the Postgres query so the
  // .limit applies to that user's receipts only. Without this, the
  // .limit caps the org-wide result first and the email filter
  // post-trims — which can return zero rows for valid users whose
  // receipts are deeper than the cap.
  let resolvedUserId: string | null | undefined = undefined;
  if (email) {
    resolvedUserId = await resolveUserIdByEmail(email);
    if (!resolvedUserId) {
      // No user with that email — return empty result but keep the
      // counters shape so the UI doesn't blow up.
      return NextResponse.json({
        receipts: [],
        counters: { pending: 0, approved: 0, rejected: 0, exported: 0, total: 0 },
      });
    }
  }

  let query = supabaseAdmin
    .from('receipts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  // ── R7 — the "needs review" view ────────────────────────────────────────────────────────────
  //
  // Not a receipt STATUS, which is why it cannot just be another `.eq('status', …)`: a receipt that
  // needs a person can be pending, approved or exported. It is a question about the extraction —
  // "which of these did the AI struggle with, or warn about?" — and it is the view that makes R6's
  // flags actionable rather than merely visible.
  //
  // FOUR things qualify, each for a different reason:
  //   · extraction_status = 'failed'  — the AI never read it; somebody must key it in or re-run.
  //   · dedup_match_id IS NOT NULL    — possibly the same receipt twice. Only a person can tell.
  //   · review_flags is a non-empty array — the AI read it and saw something off.
  //   · an unrecognised card with no decision recorded (seed 591) — the owner's case: an employee
  //     may have paid on their own card, and whether we owe them, or should disregard it as a
  //     personal purchase, is a question nothing can derive. `and(…)` because the pair is one
  //     condition: an unrecognised card that HAS been answered is finished business and must leave
  //     this view, or the queue never empties and stops being read.
  //
  // The third predicate is the load-bearing one, and its SQL was VERIFIED rather than assumed:
  // PostgREST renders `ai_extras->>review_flags=neq.[]` as `(ai_extras->>'review_flags') <> '[]'`,
  // which returns TRUE only for a non-empty array. A row with no extraction, or with the key
  // absent, yields NULL and is correctly excluded — an unextracted receipt is not a flagged one.
  // (Checked against production SQL with a four-case VALUES table, because a probe against an
  // empty table returns 200 for a predicate that matches nothing and a predicate that is wrong.)
  //
  // The predicate is a named constant because it is used TWICE — once to fetch the view, and once to
  // count it for the tab badge (see `needsReviewTotal` below). Two copies of a four-clause `or` is
  // how the badge and the list start disagreeing.
  const NEEDS_REVIEW_PREDICATE =
    'extraction_status.eq.failed,dedup_match_id.not.is.null,ai_extras->>review_flags.neq.[],'
    + 'and(card_match_status.eq.not_on_file,expense_nature.is.null)';

  const needsReviewView = status === 'needs_review';
  if (needsReviewView) {
    query = query.or(NEEDS_REVIEW_PREDICATE);
  } else if (status) {
    query = query.eq('status', status);
  }
  if (jobId) query = query.eq('job_id', jobId);
  if (resolvedUserId) query = query.eq('user_id', resolvedUserId);
  if (!includeDeleted) {
    // Default path — hide tombstoned rows from the bookkeeper
    // queue. Includes survives the entire query stack via the
    // explicit IS NULL guard.
    query = query.is('deleted_at', null);
  }
  if (from) {
    // Date filter applies to created_at only — see the in-line note
    // on the export route for the reasoning. Bookkeepers rarely care
    // about a single-day boundary cliff.
    query = query.gte('created_at', `${from}T00:00:00.000Z`);
  }
  if (to) {
    query = query.lte('created_at', `${to}T23:59:59.999Z`);
  }

  const { data: rows, error } = await query;
  if (error) {
    // withErrorHandler only catches throws — Supabase returning a
    // typed error object lands here. Log it so ops can correlate
    // bookkeeper-visible 500s with the underlying Postgres / PostgREST
    // message + code.
    console.error('[admin/receipts] list failed', {
      error: error.message,
      code: (error as { code?: string }).code ?? null,
      status,
      from,
      to,
      email,
      jobId,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const receiptRows = (rows ?? []) as ReceiptRow[];

  // Bulk-lookup user emails + names for every distinct user_id in the
  // result set. auth.admin.listUsers paginates; for the bookkeeper
  // queue we expect <100 distinct submitters, so one page suffices.
  const userIds = unique(receiptRows.map((r) => r.user_id).filter(isString));
  const userMap = await buildUserLookup(userIds);

  // Same idea for jobs — one fetch covers the page.
  const jobIds = unique(receiptRows.map((r) => r.job_id).filter(isString));
  const jobMap = await buildJobLookup(jobIds);

  // F10.7 tail — batched lookup of maintenance events that link
  // to any of the receipts on this page, plus a second batch for
  // the joined equipment names. Failures degrade to "no links"
  // (best-effort) so a maintenance schema mismatch can't break
  // the bookkeeper queue.
  const receiptIds = receiptRows.map((r) => r.id);

  // R6 — line items for the whole page in ONE query, keyed back by receipt_id. Same batching shape
  // as the maintenance lookup below rather than a fetch per expanded row: the queue routinely shows
  // fifty receipts, and a grocery receipt can carry thirty lines.
  //
  // Best-effort like the maintenance lookup. A failure here degrades to "no line items" — it must
  // never take down the bookkeeper's queue, because the totals a bookkeeper approves on live on the
  // receipt row itself, not in this table.
  const lineItemsByReceiptId = new Map<string, AdminReceiptRow['line_items']>();
  if (receiptIds.length > 0) {
    const { data: liRows, error: liErr } = await supabaseAdmin
      .from('receipt_line_items')
      .select('id, receipt_id, description, amount_cents, quantity, position')
      .in('receipt_id', receiptIds)
      .order('position', { ascending: true });
    if (liErr) {
      console.warn('[admin/receipts] line-item lookup failed', { error: liErr.message });
    } else {
      for (const li of (liRows ?? []) as Array<{
        id: string;
        receipt_id: string;
        description: string | null;
        amount_cents: number | null;
        quantity: number | null;
        position: number | null;
      }>) {
        const list = lineItemsByReceiptId.get(li.receipt_id) ?? [];
        list.push({
          id: li.id,
          description: li.description,
          amount_cents: li.amount_cents,
          quantity: li.quantity,
          position: li.position,
        });
        lineItemsByReceiptId.set(li.receipt_id, list);
      }
    }
  }

  const linkedByReceiptId = new Map<
    string,
    AdminReceiptRow['linked_maintenance_events']
  >();
  if (receiptIds.length > 0) {
    const { data: maintRows, error: maintErr } = await supabaseAdmin
      .from('maintenance_events')
      .select(
        'id, summary, kind, state, scheduled_for, ' +
          'equipment_inventory_id, linked_receipt_id'
      )
      .in('linked_receipt_id', receiptIds);
    if (maintErr) {
      console.warn(
        '[admin/receipts] maintenance link lookup failed',
        { error: maintErr.message }
      );
    } else {
      const maintEvents = (maintRows ?? []) as Array<{
        id: string;
        summary: string;
        kind: string;
        state: string;
        scheduled_for: string | null;
        equipment_inventory_id: string | null;
        linked_receipt_id: string;
      }>;
      // Resolve equipment names in one batch.
      const equipmentIds = unique(
        maintEvents
          .map((e) => e.equipment_inventory_id)
          .filter(isString)
      );
      const equipmentNameById = new Map<string, string>();
      if (equipmentIds.length > 0) {
        const { data: items } = await supabaseAdmin
          .from('equipment_inventory')
          .select('id, name')
          .in('id', equipmentIds);
        for (const r of (items ?? []) as Array<{
          id: string;
          name: string | null;
        }>) {
          equipmentNameById.set(r.id, r.name ?? r.id);
        }
      }
      for (const ev of maintEvents) {
        const list = linkedByReceiptId.get(ev.linked_receipt_id) ?? [];
        list.push({
          id: ev.id,
          summary: ev.summary,
          kind: ev.kind,
          state: ev.state,
          scheduled_for: ev.scheduled_for,
          equipment_inventory_id: ev.equipment_inventory_id,
          equipment_name: ev.equipment_inventory_id
            ? equipmentNameById.get(ev.equipment_inventory_id) ?? null
            : null,
        });
        linkedByReceiptId.set(ev.linked_receipt_id, list);
      }
    }
  }

  // (No more post-filter — resolvedUserId already constrained the query.)
  const filtered = receiptRows;

  // ── The card that paid, resolved (2026-08-13) ─────────────────────────────────────────────────
  //
  // `payment_card_id` has been written by the matcher since seed 584 and read by nothing. Resolving
  // it here is what makes the whole "whose money was it" precedence in `lib/finance/tax-summary.ts`
  // reachable — without the row, that rule ranked first and never fired, and a dinner on somebody's
  // own Visa was filed as a 50%-deductible company meal.
  //
  // One batched query, like every other lookup on this route. The cards table is small; the whole of
  // it would be a reasonable fetch, but the ids are already to hand.
  const cardIds = unique(
    filtered.map((r) => (r as { payment_card_id?: string | null }).payment_card_id).filter(isString),
  );
  const cardById = new Map<string, ReceiptPaymentCard>();
  if (cardIds.length > 0) {
    const { data: cards, error: cardErr } = await supabaseAdmin
      .from('payment_cards')
      .select('id, label, last4, brand, role, holder_name, retired_at')
      .in('id', cardIds);
    if (cardErr) {
      // Not fatal. A receipt queue that will not load because a lookup failed is worse than one
      // whose card column is blank — and the blank is honest: nothing is filed without the card.
      console.warn('[admin/receipts] payment-card lookup failed', { error: cardErr.message });
    }
    for (const c of (cards ?? []) as ReceiptPaymentCard[]) cardById.set(c.id, c);
  }


  // Generate signed photo URLs in parallel. Failure is non-fatal —
  // the row still renders with a "photo unavailable" placeholder. We
  // log the FIRST FEW failures per request so a misconfigured bucket
  // policy is visible in worker logs without the page-load flooding
  // them.
  let signFailuresLogged = 0;
  const signed = await Promise.all(
    filtered.map(async (r) => {
      if (!r.photo_url) return null;
      const { data, error: signErr } = await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(r.photo_url, SIGNED_URL_TTL_SEC);
      if (signErr) {
        if (signFailuresLogged < 3) {
          console.warn('[admin/receipts] sign failed', {
            path: r.photo_url,
            error: signErr.message,
          });
          signFailuresLogged += 1;
        }
        return null;
      }
      return data?.signedUrl ?? null;
    })
  );

  const annotated: AdminReceiptRow[] = filtered.map((r, idx) => {
    const user = r.user_id ? userMap.get(r.user_id) : undefined;
    const job = r.job_id ? jobMap.get(r.job_id) : undefined;
    return {
      ...r,
      submitted_by_email: user?.email ?? null,
      submitted_by_name: user?.name ?? null,
      job_name: job?.name ?? null,
      job_number: job?.job_number ?? null,
      photo_signed_url: signed[idx] ?? null,
      linked_maintenance_events: linkedByReceiptId.get(r.id) ?? [],
      // `ai_extras` and `dedup_match_id` already arrive via `select('*')`; they are named here so
      // the shape is explicit at the boundary and a reader of this file can see what the UI gets.
      // The `?? null` matters for `ai_extras`: rows written before seed 580 have no such key at
      // all, and `undefined` would drop out of the JSON entirely rather than reading as "no
      // extraction has run".
      ai_extras: (r as { ai_extras?: AdminReceiptRow['ai_extras'] }).ai_extras ?? null,
      dedup_match_id: (r as { dedup_match_id?: string | null }).dedup_match_id ?? null,
      line_items: lineItemsByReceiptId.get(r.id) ?? [],
      // The card row itself, not just its id. The page needs `role` to say whose money this was, and
      // an id it would have to look up per row is an id it will not look up at all.
      payment_card: (() => {
        const id = (r as { payment_card_id?: string | null }).payment_card_id;
        return id ? cardById.get(id) ?? null : null;
      })(),
    };
  });

  // ── How many receipts need a person, across the whole table ───────────────────────────────────
  //
  // A HEAD request with an exact count — no rows come back, so this is cheap enough to run on every
  // list call. It repeats the scoping filters (submitter, job, deleted, dates) deliberately: the
  // badge must count the same population the user is looking at, or filtering to one submitter would
  // still show the firm's whole backlog.
  //
  // Not scoped by `status`, because needing review is not a status — a receipt that needs a person
  // can be pending, approved or exported, which is the whole reason R7 exists as a separate view.
  const needsReviewTotal = await (async (): Promise<number | null> => {
    let q = supabaseAdmin
      .from('receipts')
      .select('id', { count: 'exact', head: true })
      .or(NEEDS_REVIEW_PREDICATE);
    if (jobId) q = q.eq('job_id', jobId);
    if (resolvedUserId) q = q.eq('user_id', resolvedUserId);
    if (!includeDeleted) q = q.is('deleted_at', null);
    if (from) q = q.gte('created_at', `${from}T00:00:00.000Z`);
    if (to) q = q.lte('created_at', `${to}T23:59:59.999Z`);
    const { count, error: countErr } = await q;
    if (countErr) {
      // Non-fatal: a queue that will not load because a badge could not be counted is a worse
      // failure than a badge that falls back to counting the page.
      console.warn('[admin/receipts] needs-review count failed', { error: countErr.message });
      return null;
    }
    return count ?? 0;
  })();

  // Aggregate counters for the header — useful for "12 awaiting review."
  //
  // These count the RETURNED PAGE, not the table. That is pre-existing behaviour and it is left
  // alone here rather than quietly changed, but it is worth stating plainly: with the default
  // `limit=100`, a queue holding 300 pending receipts reports 100. The tab counts are a guide to
  // what is on screen, not a total.
  const counters = {
    pending: receiptRows.filter((r) => r.status === 'pending').length,
    approved: receiptRows.filter((r) => r.status === 'approved').length,
    rejected: receiptRows.filter((r) => r.status === 'rejected').length,
    exported: receiptRows.filter((r) => r.status === 'exported').length,
    // R7. This used to be `needsReviewView ? …count the page… : 0`, which made the tab read
    // **"Needs review 0" whenever you were not already on the Needs-review tab** — so the badge
    // whose entire job is to send you there only told the truth after you had gone. Production on
    // 2026-08-13 had nine receipts waiting behind a badge reading 0.
    //
    // Now counted against the TABLE, with the same predicate the view filters on, so it is a real
    // total rather than a count of the page — and it is right on every tab. `needsReviewTotal` is
    // null only if the count query itself failed, in which case the page count is a better answer
    // than pretending there is nothing to review.
    needs_review: needsReviewTotal
      ?? receiptRows.filter((r) => needsReview(r as unknown as AdminReceiptRow)).length,
    total: receiptRows.length,
  };

  return NextResponse.json({
    receipts: annotated,
    counters,
  });
});

/**
 * Lookup a single auth.users.id by email. Returns null when no user
 * matches. Used by the email filter so we can constrain the Postgres
 * query BEFORE the LIMIT runs — see comment on the call site.
 */
async function resolveUserIdByEmail(email: string): Promise<string | null> {
  const lower = email.trim().toLowerCase();
  if (!lower) return null;
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error || !data) {
    // Distinguish "user not found" (returns null naturally below) from
    // "listUsers failed" (also returns null but for a different reason).
    // Without this log, a throttled / outaged listUsers makes a valid
    // bookkeeper query appear as "no receipts for this email."
    console.error(
      '[admin/receipts] listUsers failed during email resolve',
      { error: error?.message ?? null, email: lower }
    );
    return null;
  }
  const match = data.users.find((u) => u.email?.toLowerCase() === lower);
  return match?.id ?? null;
}

interface UserInfo {
  email: string | null;
  name: string | null;
}

async function buildUserLookup(userIds: string[]): Promise<Map<string, UserInfo>> {
  const out = new Map<string, UserInfo>();
  if (userIds.length === 0) return out;

  // listUsers is paginated; one page (1000 default) covers the
  // entire surveyor team. If Starr Surveying ever exceeds that we
  // can switch to per-id getUserById in a Promise.all.
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error || !data) return out;

  const wanted = new Set(userIds);
  for (const u of data.users) {
    if (!wanted.has(u.id)) continue;
    const meta = (u.user_metadata ?? {}) as { full_name?: string; name?: string };
    out.set(u.id, {
      email: u.email ?? null,
      name: meta.full_name ?? meta.name ?? null,
    });
  }
  return out;
}

interface JobInfo {
  name: string | null;
  job_number: string | null;
}

async function buildJobLookup(jobIds: string[]): Promise<Map<string, JobInfo>> {
  const out = new Map<string, JobInfo>();
  if (jobIds.length === 0) return out;

  const { data, error } = await supabaseAdmin
    .from('jobs')
    .select('id, name, job_number')
    .in('id', jobIds);
  if (error || !data) return out;

  for (const j of data as Array<{ id: string; name: string | null; job_number: string | null }>) {
    out.set(j.id, { name: j.name, job_number: j.job_number });
  }
  return out;
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function isString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}
