// lib/payroll/payout-ledger.ts
//
// ONE RECORD OF MONEY PAID TO A PERSON (pay consolidation C-16, 2026-08-04)
// ════════════════════════════════════════════════════════════════════════
//
// Two tables recorded "we paid this person", and they shared no rows and no callers:
//
//   `payout_batch_items` (+ `payout_batches`) — batch, approval, dispatch, per-item status, ACH
//       method handle, external reference, failure reason, void. Amounts in cents, broken down into
//       hours / bonuses / reimbursements / adjustments. Ten call sites including the ACH export,
//       the tax report and the finance overview.
//
//   `employee_payouts` — twelve columns: who, how much, method, reference, period, paid_at. A
//       strict subset, with no batch, no approval, no status and no failure handling. Five call
//       sites, none of which knew the other table existed.
//
// The first is the real ledger. The second is retired into it here.
//
// ── TWO TABLES THAT LOOK LIKE THIS PAIR BUT ARE NOT ────────────────────────────────────────────
//
// Checked before assuming, because "these look similar" is how a working table gets deleted:
//
//   • `payout_log` is **not** a payout ledger despite the name. Its columns are `old_rate` /
//     `new_rate` / `old_role` / `new_role` — it is the employee-change audit trail, and
//     `employees/manage` uses it as one. Left alone.
//   • `balance_transactions` + `withdrawal_requests` are an earned-balance model: hours accrue a
//     balance, the person requests a withdrawal against it. Adjacent to payouts, not the same
//     thing. Left alone.
//
// ── WHAT THIS COST ─────────────────────────────────────────────────────────────────────────────
//
// `/api/admin/profile/compensation` selected `gross_cents` and `net_cents` from `employee_payouts`.
// **Those columns have never existed on it.** PostgREST answers 42703, the route returns 500 on any
// query error, so that endpoint has returned 500 on every request for as long as it has shipped.
// Verified against the live database rather than inferred. Nobody noticed because the table is
// empty and a page with no payouts looks the same as a page that failed to load them.
//
// All of these tables are empty, so this is a repoint rather than a migration.

import { supabaseAdmin } from '@/lib/supabase';

/** One payout as every screen needs it, whatever it was called before. */
export interface PayoutRecord {
  id: string;
  user_email: string;
  user_name: string | null;
  /** Total paid, in cents. The canonical figure. */
  amount_cents: number;
  /** The breakdown, when the batch item carried one. */
  hours_cents: number | null;
  bonuses_cents: number | null;
  reimbursements_cents: number | null;
  adjustments_cents: number | null;
  method: string | null;
  /** The bank's or processor's reference for this payment. */
  reference: string | null;
  status: string | null;
  paid_at: string | null;
  period_start: string | null;
  period_end: string | null;
  notes: string | null;
  batch_id: string | null;
  batch_label: string | null;
  created_at: string | null;
}

interface BatchItemRow {
  id: string;
  batch_id: string;
  user_email: string;
  user_name: string | null;
  hours_cents: number | null;
  bonuses_cents: number | null;
  reimbursements_cents: number | null;
  adjustments_cents: number | null;
  total_cents: number | null;
  method: string | null;
  external_ref: string | null;
  status: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string | null;
}

interface BatchRow {
  id: string;
  label: string | null;
  week_start: string | null;
  week_end: string | null;
  status: string | null;
  org_id: string | null;
}

const ITEM_COLUMNS =
  'id, batch_id, user_email, user_name, hours_cents, bonuses_cents, reimbursements_cents, ' +
  'adjustments_cents, total_cents, method, external_ref, status, paid_at, notes, created_at';

function toRecord(item: BatchItemRow, batch: BatchRow | undefined): PayoutRecord {
  return {
    id: item.id,
    user_email: item.user_email,
    user_name: item.user_name,
    amount_cents: Number(item.total_cents ?? 0),
    hours_cents: item.hours_cents,
    bonuses_cents: item.bonuses_cents,
    reimbursements_cents: item.reimbursements_cents,
    adjustments_cents: item.adjustments_cents,
    method: item.method,
    reference: item.external_ref,
    status: item.status,
    paid_at: item.paid_at,
    // The pay period lives on the batch, not the item — a batch covers a week and its items are the
    // people in it. Reading it from the item would return null for every row.
    period_start: batch?.week_start ?? null,
    period_end: batch?.week_end ?? null,
    notes: item.notes,
    batch_id: item.batch_id,
    batch_label: batch?.label ?? null,
    created_at: item.created_at,
  };
}

export interface PayoutQuery {
  /** Restrict to one person. */
  userEmail?: string;
  orgId?: string | null;
  /** ISO datetime bounds on `paid_at`. */
  from?: string | null;
  to?: string | null;
  limit?: number;
  /**
   * When true, only payouts that actually went out. Default false, because a screen listing
   * payments usually wants pending ones visible too — a payment that failed is information.
   */
  paidOnly?: boolean;
}

/**
 * Read the payout ledger.
 *
 * Two queries rather than a PostgREST embed: the batch filter (`org_id`) lives on the parent and
 * the row filters live on the child, and expressing that as one embedded query is where this kind
 * of read silently starts returning the wrong set. Both tables are small.
 */
export async function readPayouts(query: PayoutQuery = {}): Promise<{ payouts: PayoutRecord[]; error: string | null }> {
  let items = supabaseAdmin
    .from('payout_batch_items')
    .select(ITEM_COLUMNS)
    .order('paid_at', { ascending: false, nullsFirst: false })
    .limit(query.limit ?? 500);

  if (query.userEmail) items = items.eq('user_email', query.userEmail.toLowerCase());
  if (query.from) items = items.gte('paid_at', query.from);
  if (query.to) items = items.lte('paid_at', query.to);
  if (query.paidOnly) items = items.eq('status', 'paid');

  const { data: itemRows, error: itemError } = await items;
  if (itemError) return { payouts: [], error: itemError.message };

  const rows = (itemRows ?? []) as BatchItemRow[];
  if (rows.length === 0) return { payouts: [], error: null };

  const { data: batchData, error: batchError } = await supabaseAdmin
    .from('payout_batches')
    .select('id, label, week_start, week_end, status, org_id')
    .in('id', [...new Set(rows.map((r) => r.batch_id))]);
  const batchRows = (batchData ?? []) as unknown as BatchRow[];

  // Named, not swallowed. The items are still worth returning — they carry the amounts — but the
  // caller should know the period and label will be missing rather than assume the payouts had none.
  if (batchError) {
    return { payouts: rows.map((r) => toRecord(r, undefined)), error: batchError.message };
  }

  const batches = new Map(batchRows.map((b) => [b.id, b]));

  // Org scoping is applied here, after the join, because it lives on the batch. Filtering items by
  // an org_id they do not carry would return everything.
  const scoped = query.orgId
    ? rows.filter((r) => batches.get(r.batch_id)?.org_id === query.orgId)
    : rows;

  return { payouts: scoped.map((r) => toRecord(r, batches.get(r.batch_id))), error: null };
}

/** Total paid, in cents, over the rows a query returns. */
export function totalPaidCents(payouts: PayoutRecord[]): number {
  return payouts.reduce((sum, p) => sum + (Number(p.amount_cents) || 0), 0);
}
