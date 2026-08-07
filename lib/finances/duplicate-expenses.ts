// lib/finances/duplicate-expenses.ts
//
// Owner ask, 2026-08-07: *"systems and checks in place that trigger alerts whenever it seems like
// receipt/expenditures are counted multiple times."*
//
// ── WHY THE EARLIER GUARD WAS NOT ENOUGH ───────────────────────────────────────────────────────
//
// `ad-spend-reconcile.ts` catches one shape: an ad-platform receipt while ad spend is also imported.
// The commonest duplicate in a small firm has nothing to do with advertising — it is the same fuel
// receipt photographed twice, once in the truck and once at the desk. That guard also only ran when
// somebody opened the finance overview, and a check nobody runs is not a control.
//
// ── EVERY RULE HERE IS A SIGNAL, NEVER A VERDICT ───────────────────────────────────────────────
//
// The inputs are a vendor name typed on a phone and an amount. Two genuine fuel stops at the same
// station for the same round number are indistinguishable from one receipt entered twice, and no
// amount of cleverness closes that gap. So nothing here deletes, hides, or excludes anything: it
// describes what it noticed and links to the rows. A human decides.
//
// The alternative was tried and rejected on purpose. Auto-removing the "duplicate" would make the
// books quietly wrong in a way nobody could find later — the receipt would simply stop appearing in
// any total, with no error and no record of the removal.

export interface ReceiptForDuplicateCheck {
  id: string;
  vendor_name: string | null;
  total_cents: number;
  /** ISO timestamp. `transaction_at` where present — when the money moved, not when it was filed. */
  transaction_at: string;
}

export type DuplicateKind = 'same-charge-twice' | 'cross-source-advertising' | 'possible-re-entry';
export type DuplicateConfidence = 'high' | 'low';

export interface DuplicateFinding {
  kind: DuplicateKind;
  confidence: DuplicateConfidence;
  /** Every receipt involved. Two for a pair; more when three rows collide. */
  receipt_ids: string[];
  vendor: string | null;
  /** What is at stake — the amount that would be counted more than once if the match is real. */
  total_cents: number;
  /**
   * Stable identity of the SITUATION, so the alert ledger can dedupe it.
   *
   * Ids are SORTED before joining. `a|b` and `b|a` are the same pair, and an unsorted key alerts
   * twice for one situation — once in whichever order the query happened to return.
   */
  dedupe_key: string;
  /** Plain English, for somebody who will read it in a notification and act on it. */
  explanation: string;
}

/** Same vendor, same amount, this close together: one charge entered twice. */
const SAME_CHARGE_DAYS = 3;
/** Same vendor and amount further apart is ordinary repeat business — flagged, but quietly. */
const RE_ENTRY_DAYS = 14;

const DAY_MS = 86_400_000;

/** Vendor names normalise before comparison: "Buc-ee's #12" and "BUC-EES 12" are one vendor. */
function normaliseVendor(v: string | null | undefined): string {
  return (v ?? '')
    .toLowerCase()
    // Apostrophes are DELETED, not turned into a separator. Through the general pass below,
    // "buc-ee's" becomes "buc ee s" while "BUC-EES" becomes "buc ees" — two spellings of one vendor
    // that no longer match. Removing the apostrophe first collapses both to "buc ees".
    .replace(/['‘’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    // Store and terminal numbers vary between two prints of the SAME charge, so they cannot be part
    // of the identity or the commonest duplicate of all slips through.
    .replace(/\b\d{1,6}\b/g, ' ')
    // Collapse the gaps the substitutions left, or "buc  ees" and "buc ees" differ.
    .replace(/\s+/g, ' ')
    .trim();
}

function daysApart(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return Number.POSITIVE_INFINITY;
  return Math.abs(ta - tb) / DAY_MS;
}

function keyFor(kind: string, ids: string[]): string {
  return `dupe:${kind}:${[...ids].sort().join('|')}`;
}

export interface DuplicateCheckContext {
  /** Advertising imported from the Ads account for the same window, in cents. */
  adSpendCents?: number;
  /** Vendor patterns that mean "this receipt is an advertising platform charge". */
  isAdVendor?: (vendor: string | null) => boolean;
}

/**
 * Every suspected double-count in a set of receipts.
 *
 * Deliberately takes rows rather than querying: pure, so the boundaries — the 3-day window, the
 * vendor normalisation — are testable with frozen inputs instead of against a live table.
 */
export function findDuplicateExpenses(
  receipts: ReadonlyArray<ReceiptForDuplicateCheck>,
  ctx: DuplicateCheckContext = {},
): DuplicateFinding[] {
  const findings: DuplicateFinding[] = [];

  // ── 1 + 3. Same vendor and amount, close together ──────────────────────────────────────────
  //
  // Grouped rather than compared pairwise so three prints of one charge become ONE finding naming
  // three receipts, not three findings naming overlapping pairs. Somebody reading an alert should
  // see one situation.
  const groups = new Map<string, ReceiptForDuplicateCheck[]>();
  for (const r of receipts) {
    const v = normaliseVendor(r.vendor_name);
    if (!v) continue; // An unnamed vendor cannot be matched to anything without inventing a match.
    const k = `${v}::${Math.round(r.total_cents)}`;
    const list = groups.get(k);
    if (list) list.push(r);
    else groups.set(k, [r]);
  }

  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    const sorted = [...rows].sort((a, b) => a.transaction_at.localeCompare(b.transaction_at));

    // Walk the run and cut it wherever the gap exceeds the window, so a vendor visited monthly all
    // year produces adjacent-month findings rather than one finding naming twelve receipts.
    let cluster: ReceiptForDuplicateCheck[] = [sorted[0]];
    const flush = () => {
      if (cluster.length < 2) return;
      const span = daysApart(cluster[0].transaction_at, cluster[cluster.length - 1].transaction_at);
      const high = span <= SAME_CHARGE_DAYS;
      const ids = cluster.map((c) => c.id);
      const each = cluster[0].total_cents;
      findings.push({
        kind: high ? 'same-charge-twice' : 'possible-re-entry',
        confidence: high ? 'high' : 'low',
        receipt_ids: ids,
        vendor: cluster[0].vendor_name,
        // What is AT RISK is the extra copies, not the whole group — one of them is a real expense.
        total_cents: each * (cluster.length - 1),
        dedupe_key: keyFor(high ? 'same-charge' : 're-entry', ids),
        explanation: high
          ? `${cluster.length} approved receipts from "${cluster[0].vendor_name}" for the same amount within ${Math.max(1, Math.round(span))} day(s). That is usually one charge entered more than once.`
          : `${cluster.length} approved receipts from "${cluster[0].vendor_name}" for the same amount, ${Math.round(span)} days apart. Could be repeat business, could be a re-entry — worth a look.`,
      });
    };

    for (let i = 1; i < sorted.length; i++) {
      if (daysApart(sorted[i - 1].transaction_at, sorted[i].transaction_at) <= RE_ENTRY_DAYS) {
        cluster.push(sorted[i]);
      } else {
        flush();
        cluster = [sorted[i]];
      }
    }
    flush();
  }

  // ── 2. Cross-source: an advertising receipt while ad spend is imported ─────────────────────
  //
  // Gated on `adSpendCents`: with nothing imported there is nothing to double-count, and an
  // advertising receipt is simply an expense. A warning that fires when nothing is wrong is one
  // people learn to dismiss, and then the real ones go unread too.
  const adSpend = ctx.adSpendCents ?? 0;
  const isAd = ctx.isAdVendor;
  if (adSpend > 0 && isAd) {
    for (const r of receipts) {
      if (!isAd(r.vendor_name)) continue;
      findings.push({
        kind: 'cross-source-advertising',
        confidence: 'high',
        receipt_ids: [r.id],
        vendor: r.vendor_name,
        total_cents: r.total_cents,
        dedupe_key: keyFor('cross-source', [r.id]),
        explanation:
          `"${r.vendor_name ?? 'unnamed vendor'}" looks like an advertising charge, and advertising ` +
          'is already counted separately from the Ads account for this period. If this receipt is ' +
          'the same money, it is being counted twice.',
      });
    }
  }

  // High confidence first, then by amount: the biggest thing you can actually act on leads.
  const rank: Record<DuplicateConfidence, number> = { high: 0, low: 1 };
  return findings.sort(
    (a, b) => rank[a.confidence] - rank[b.confidence] || b.total_cents - a.total_cents,
  );
}

/** Total at risk across findings — what outflow is overstated by if every match is real. */
export function duplicateRiskTotal(findings: ReadonlyArray<DuplicateFinding>): number {
  return findings.reduce((s, f) => s + Math.max(0, Math.round(f.total_cents)), 0);
}
