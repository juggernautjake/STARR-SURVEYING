// lib/finances/ad-spend-reconcile.ts
//
// ── THE DEFECT THIS FILE EXISTS FOR ─────────────────────────────────────────────────────────────
//
// Google charges the card once a month. That charge can reach the books TWICE, by two routes that
// know nothing about each other:
//
//   1. `ad_spend_daily` — imported from the Ads API every night, or typed off the invoice.
//   2. `receipts` — somebody photographs the Google Ads charge like any other business expense,
//      an approver approves it, and it lands in `expenses_cents`.
//
// Both numbers are individually correct, both are defensible in isolation, and together they report
// advertising twice. Net profit then reads LOW by exactly one month of ad spend — an error in the
// direction nobody investigates, because a business that looks less profitable than it is does not
// generate a complaint.
//
// ── WHY THIS WARNS RATHER THAN FIXES ───────────────────────────────────────────────────────────
//
// The obvious move is to drop the matching receipt automatically. It is the wrong move: the match is
// a HEURISTIC over a free-text vendor name somebody typed on a phone in a truck. Silently deleting a
// real expense because a fuzzy match fired is a worse failure than showing two numbers, and it is
// undetectable afterwards — the receipt simply never appears in a total again.
//
// So this returns candidates and the route shows them with a sentence. A human decides. That is the
// correct division of labour when the input is somebody's handwriting.

/** A receipt as this module needs to see it. Deliberately narrow so the caller maps explicitly. */
export interface ReceiptLike {
  id: string;
  vendor_name: string | null;
  total_cents: number;
  transaction_at: string;
}

export interface SuspectedDuplicate {
  receipt_id: string;
  vendor_name: string | null;
  total_cents: number;
  transaction_at: string;
  /** Why it matched, in words a non-engineer can act on. */
  reason: string;
}

/**
 * Vendor names that mean "this receipt is an advertising platform charge".
 *
 * Matched case-insensitively as substrings, because the vendor field is free text and real entries
 * look like "GOOGLE *ADS 8394", "Google Ads", "google adwords", "GOOGLE*ADS".
 */
const AD_VENDOR_PATTERNS: ReadonlyArray<RegExp> = [
  /google\s*\*?\s*ads?\b/i,
  /google\s*adwords/i,
  /\bgoogle\s*\*\s*/i,      // "GOOGLE *…" — the card-statement shape
  /\bmeta\s+platforms\b/i,
  /\bfacebook\s+ads?\b/i,
  /\bmicrosoft\s+advertis/i,
  /\bbing\s+ads?\b/i,
];

export function looksLikeAdVendor(vendor: string | null | undefined): boolean {
  if (!vendor) return false;
  return AD_VENDOR_PATTERNS.some((re) => re.test(vendor));
}

/**
 * Receipts inside the window that look like advertising charges, when ad spend is ALSO being counted
 * from `ad_spend_daily` for that window.
 *
 * `adSpendCents` gates the whole thing: with no imported ad spend there is nothing to double-count,
 * and an advertising receipt is simply an expense like any other. Warning then would be noise, and a
 * warning that fires when nothing is wrong is one people learn to dismiss.
 */
export function findSuspectedDuplicates(
  receipts: ReadonlyArray<ReceiptLike>,
  adSpendCents: number,
): SuspectedDuplicate[] {
  if (adSpendCents <= 0) return [];

  return receipts
    .filter((r) => looksLikeAdVendor(r.vendor_name))
    .map((r) => ({
      receipt_id: r.id,
      vendor_name: r.vendor_name,
      total_cents: r.total_cents,
      transaction_at: r.transaction_at,
      reason:
        `"${r.vendor_name ?? 'unnamed vendor'}" looks like an advertising platform charge, and ` +
        'advertising is already counted separately from the Ads account for this period. If this ' +
        'receipt is the same money, it is being counted twice.',
    }));
}

/** Total of the suspected duplicates — what net profit is understated by, if every match is real. */
export function suspectedDuplicateTotal(dupes: ReadonlyArray<SuspectedDuplicate>): number {
  return dupes.reduce((s, d) => s + Math.max(0, Math.round(d.total_cents)), 0);
}
