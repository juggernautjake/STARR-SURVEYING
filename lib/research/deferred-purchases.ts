// lib/research/deferred-purchases.ts — what the run FOUND that it could buy, and did not.
//
// ── WHY THIS EXISTS (owner, 2026-09-21) ─────────────────────────────────────────────────────────
//
// "We need it so that it finds things that are purchasable, but that it doesn't automatically
//  purchase it... If the budget limit is reached, then it should not purchase anything else. It
//  should list other found documents that can be purchased, but it should not purchase them unless
//  the user wants to after the run is complete."
//
// The run already knows all of this. The purchase orchestrator walks its recommendations, stops at
// the ceiling, and records everything past it as `budget_exceeded`. That status has never left the
// worker: `paid-documents.ts` handles "paid documents were switched off" and "there is no vendor
// login" and says in its own comment that `budget_exceeded` is "a third, different thing" — and
// then nothing anywhere treats it as one. So a run that found five buyable documents and could
// afford one reported the four as though they did not exist.
//
// ── WHY THE DISTINCTION MATTERS MORE THAN IT SOUNDS ─────────────────────────────────────────────
//
// These are not failures, and writing them up as failures is the trap. A deferred document is a
// FINDING: the county has it, we located it, we know what it costs, and the only reason it is not
// in the file is a limit the operator set. That is worth more to a surveyor than most of what a run
// retrieves, because it converts "I wonder what else is out there" into a priced list.
//
// So the language here is an offer, never an apology. `budget_exceeded` is not an error state and
// must not be rendered in red beside genuine retrieval failures — the run did exactly what it was
// told.

/** Why a purchasable document was not bought. */
export type DeferralReason =
  /** The run had permission and the money ran out. The commonest, and the most actionable. */
  | 'budget_exceeded'
  /** Paid documents were switched off for this run. A setting, not a gap. */
  | 'paid_disabled'
  /** No vendor login is configured. A configuration problem; re-running will not help. */
  | 'no_vendor_credentials'
  /** We already hold the same document from a free source. Never offer to sell this back. */
  | 'free_copy_held';

export interface DeferredPurchase {
  /** What it is, in the words the vendor's index used. */
  label: string;
  documentType?: string | null;
  instrument?: string | null;
  /** Where it would be bought, e.g. 'texasfile'. */
  source: string;
  /** Best estimate in USD. Null when the vendor prices per page and the count is unknown. */
  estimatedCostUsd: number | null;
  reason: DeferralReason;
}

/** The reasons that represent something the operator can still choose to buy. */
const BUYABLE: ReadonlySet<DeferralReason> = new Set<DeferralReason>([
  'budget_exceeded',
  'paid_disabled',
]);

/**
 * The ones worth offering.
 *
 * `free_copy_held` is excluded because offering to sell somebody a document they already have is
 * worse than saying nothing. `no_vendor_credentials` is excluded because the operator cannot act on
 * it from a list — that one belongs in the run's configuration notice, where the fix is.
 */
export function offerable(items: readonly DeferredPurchase[]): DeferredPurchase[] {
  return items.filter((i) => BUYABLE.has(i.reason));
}

/** What the offerable ones would cost together, when every one of them carries a price. */
export function deferredTotalUsd(items: readonly DeferredPurchase[]): number | null {
  const offers = offerable(items);
  if (offers.length === 0) return null;
  if (offers.some((i) => i.estimatedCostUsd === null)) return null;
  return Number(offers.reduce((sum, i) => sum + (i.estimatedCostUsd ?? 0), 0).toFixed(2));
}

/**
 * One sentence offering them, or null when there is nothing to offer.
 *
 * Written as an offer. A run that found four more documents and stopped at the ceiling did what it
 * was told, and a reader who is shown that in the language of failure learns to distrust a limit
 * they set themselves.
 */
export function deferredNotice(items: readonly DeferredPurchase[]): string | null {
  const offers = offerable(items);
  if (offers.length === 0) return null;

  const noun = offers.length === 1 ? '1 more document' : `${offers.length} more documents`;
  const total = deferredTotalUsd(items);
  const price = total === null ? '' : ` for about $${total.toFixed(2)}`;

  const budget = offers.filter((i) => i.reason === 'budget_exceeded').length;
  const why = budget === offers.length
    ? 'the run reached its document budget'
    : budget > 0
      ? 'the run reached its document budget, and paid documents were off for part of it'
      : 'paid documents were switched off for this run';

  return `${noun} can be bought${price} — ${why}. Nothing was purchased beyond the limit you set; `
    + 'review the list and buy any of them when you are ready.';
}

/** Group the offer by where it would be bought, for a UI that buys per vendor. */
export function bySource(items: readonly DeferredPurchase[]): Map<string, DeferredPurchase[]> {
  const out = new Map<string, DeferredPurchase[]>();
  for (const i of offerable(items)) {
    const key = i.source || 'unknown';
    const list = out.get(key);
    if (list) list.push(i);
    else out.set(key, [i]);
  }
  return out;
}
