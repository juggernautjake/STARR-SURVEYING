// lib/receipts/pair-sweep.ts — pairing the receipts that are already on file.
//
// `findSamePurchase` runs inside extraction, which pairs everything uploaded from now on. It does
// nothing for the receipts already in the table — including the two that prompted the whole request:
//
//   Owner, 2026-08-13: *"I think I added two receipts for texas roadhouse… one that is $100 and one
//   that is $84.34, but really they are for the same meal."*
//
// Both of those were extracted days ago and neither will be extracted again. A fix that only applies
// to future uploads would leave the reported case unfixed, which is the version of "done" this
// codebase keeps having to be talked out of.
//
// So the same detection runs as a sweep, hourly, beside the extraction cron. It is cheap — no AI, no
// photo fetch, one query and some arithmetic — and it is idempotent: a receipt that already has a
// link is not a candidate, so a second run finds nothing and writes nothing.
//
// ── WHY THE PLANNING IS SEPARATE FROM THE WRITING ────────────────────────────────────────────────
//
// `planPairings` is pure, and it is where every decision lives: which rows pair, which of the pair is
// counted, and the rule that one receipt cannot be spent twice. That rule is the whole reason this
// is not a nested loop over the query result — see the comment on it below.

import { supabaseAdmin } from '@/lib/supabase';
import { breakdownCharges } from './charges';
import { detectSamePurchase, type ComparableReceipt, type SamePurchaseMatch } from './same-purchase';

export interface PlannedPairing {
  /** The row to write the link ON — the itemisation. */
  supersededId: string;
  /** The row it points at — what actually left the account. */
  countId: string;
  kind: SamePurchaseMatch['kind'];
  confidence: SamePurchaseMatch['confidence'];
  reason: string;
}

/**
 * Work out every pairing among a set of receipts.
 *
 * Pure. Each receipt takes part in at most ONE pairing, which is not a tidiness rule: three receipts
 * for one meal (bill, slip, and a re-photograph of the slip) could otherwise be linked in a chain,
 * and a chain re-introduces the double count from the far end — the middle row would be both counted
 * by one link and superseded by another. One pairing per receipt keeps "is this row counted?" a
 * question with one answer.
 *
 * Order matters only for determinism: rows are considered as given, so a caller that sorts by
 * `created_at` gets the same plan every run.
 */
export function planPairings(rows: readonly ComparableReceipt[]): PlannedPairing[] {
  const spent = new Set<string>();
  const plan: PlannedPairing[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    if (spent.has(rows[i].id)) continue;
    for (let j = i + 1; j < rows.length; j += 1) {
      if (spent.has(rows[j].id)) continue;
      const match = detectSamePurchase(rows[i], rows[j]);
      if (!match) continue;
      spent.add(rows[i].id);
      spent.add(rows[j].id);
      plan.push({
        supersededId: match.supersededId,
        countId: match.countId,
        kind: match.kind,
        confidence: match.confidence,
        reason: match.reason,
      });
      break;
    }
  }
  return plan;
}

export interface PairSweepResult {
  scanned: number;
  paired: number;
  errors: string[];
}

/**
 * Find and link same-purchase pairs among receipts already on file.
 *
 * Scoped per submitter, because two people can eat at the same restaurant on the same evening for
 * the same amount and neither of them is a duplicate of the other.
 *
 * Rejected and soft-deleted rows are excluded — they are not in any total, so pairing them would
 * change nothing and could only produce a confusing banner on a receipt somebody already dismissed.
 */
export async function sweepSamePurchase(lookbackDays = 120): Promise<PairSweepResult> {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('receipts')
    .select('id, user_id, vendor_name, transaction_at, subtotal_cents, tax_cents, tip_cents, total_cents, created_at')
    .neq('status', 'rejected')
    .is('deleted_at', null)
    // Already linked — leaving these out is what makes a repeat run a no-op rather than a churn of
    // identical UPDATEs.
    .is('superseded_by_receipt_id', null)
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  if (error) return { scanned: 0, paired: 0, errors: [error.message] };

  const rows = (data ?? []) as Array<ComparableReceipt & { user_id: string | null }>;

  const byUser = new Map<string, ComparableReceipt[]>();
  for (const r of rows) {
    // A null submitter cannot be grouped with anybody, and grouping every such row together would
    // compare receipts from different people. They are skipped rather than lumped.
    if (!r.user_id) continue;
    const list = byUser.get(r.user_id) ?? [];
    list.push(r);
    byUser.set(r.user_id, list);
  }

  const errors: string[] = [];
  let paired = 0;

  for (const list of byUser.values()) {
    for (const p of planPairings(list)) {
      const { error: upErr } = await supabaseAdmin
        .from('receipts')
        .update({
          superseded_by_receipt_id: p.countId,
          same_purchase_kind: p.kind,
          same_purchase_confidence: p.confidence,
        })
        .eq('id', p.supersededId)
        // Written only if still unpaired: an extraction running concurrently may have just linked
        // this row, and the last writer would otherwise silently win.
        .is('superseded_by_receipt_id', null);
      if (upErr) { errors.push(`${p.supersededId}: ${upErr.message}`); continue; }
      paired += 1;

      // ── The tip becomes recoverable the moment the pair is known ───────────────────────────────
      //
      // On its own, a card slip prints one subtotal and one total and says nothing about which part
      // was written by hand. Once the itemised bill is linked, the gap between them IS the tip —
      // arithmetic, not a guess. So the split is computed here rather than left to a re-extraction
      // that will never run: `sweepQueuedReceipts` deliberately skips receipts already done.
      const bill = list.find((r) => r.id === p.supersededId);
      const slip = list.find((r) => r.id === p.countId);
      if (!slip || p.kind !== 'bill_and_slip') continue;
      const charges = breakdownCharges({
        subtotal_cents: slip.subtotal_cents,
        tax_cents: slip.tax_cents ?? bill?.tax_cents ?? null,
        tip_cents: slip.tip_cents,
        total_cents: slip.total_cents,
        settledBillTotalCents: bill?.total_cents ?? null,
      });
      const { error: chargeErr } = await supabaseAdmin
        .from('receipts')
        .update({
          customer_tip_cents: charges.customerTipCents,
          service_charge_cents: charges.businessGratuityCents,
        })
        .eq('id', p.countId);
      if (chargeErr) errors.push(`${p.countId} charges: ${chargeErr.message}`);
    }
  }

  return { scanned: rows.length, paired, errors };
}
