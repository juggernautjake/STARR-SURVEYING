// lib/finance/tax-summary.ts — FINANCE_TAX_AND_INTAKE Slice F3.
//
// One line per financial interaction, saying what it means at tax time.
//
// ── WHY THIS IS DERIVED AND NOT GENERATED ───────────────────────────────────────────────────────
// Every input is already known: the category and `tax_deductible_flag` on the receipt, the card role
// (F1), the recovery state (F2), and whether the receipt was promoted to a capital asset. So this is
// a function of fields, not a question for a model.
//
// An AI-written summary could disagree with the fields it summarises, and would do so
// unpredictably — which is worse than no summary at all, because a plausible sentence is exactly
// what stops someone checking. The rule the whole file follows: **the summary can never say
// something the data does not.**
//
// ── THE ORDER OF PRECEDENCE IS THE DESIGN ───────────────────────────────────────────────────────
// Several facts can be true at once, and they do not carry equal weight. A client's card and a
// "fully deductible" category are both true of the same row, and the card wins: it was not our money,
// so the category is irrelevant. Getting that order wrong is how a row ends up filed under a rule
// that never applied to it.
//
//   1. **Whose money was it.** A client's card is not our transaction; a personal card is a
//      reimbursement, not an expense, until repaid.
//   2. **Is it an expense at all this year.** A capital asset is depreciated, not deducted now.
//   3. **Did we get it back.** A recovered pass-through nets to zero; an under-recovery does not.
//   4. **How much of it is deductible.** Only now does the category's flag matter.
//
// Anything unresolved at any level stops there and says so, rather than falling through to a
// confident answer built on an unanswered question.

import { taxTreatmentForCard, type PaymentCard } from './payment-cards';
import { computeRecovery, type CostRecovery } from './cost-recovery';

/** `tax_deductible_flag` as stored on the receipt (seed 220). */
export type DeductibleFlag = 'full' | 'partial_50' | 'none' | 'review' | null;

/**
 * How much of a receipt's total each flag actually deducts — P2.2c.
 *
 * ── WHY THIS MOVED HERE, AND WHY IT IS A CONSTANT AND NOT A SWITCH ──────────────────────────────
 *
 * It lived inside `app/api/admin/finances/tax-summary/route.ts` as a private function. That was the
 * only place in the tree converting a flag into a number, so nothing was WRONG — but a definition
 * inside a route handler is one a second author cannot import and will therefore write again, which
 * is precisely the `effectiveHours` defect P2.2c exists to prevent.
 *
 * It comes here rather than to `lib/receipts/` for a reason worth stating: **this file already
 * describes the same fact in a sentence.** `summarise()` below tells a person "Deductible at 50% —
 * meals and entertainment limit", and its note explains why the number is spelled out — *"partial
 * without the number is the kind of thing that gets re-derived wrongly at filing time."* So the 50
 * was written down twice, once as arithmetic and once as prose, and the prose copy is invisible to
 * any search for a computation. Splitting them across two libraries would have made that worse.
 *
 * A map rather than a `switch` so the sentence can READ it. There is now one place the number
 * exists, and the summary derives its percentage from it — see `summarise()`.
 *
 * `review` is 0, deliberately and not as a fallthrough: those rows are not booked yet, and a
 * conservative total is the honest one to show a bookkeeper before a CPA has re-classified them.
 */
export const DEDUCTIBLE_FRACTION: Record<Exclude<DeductibleFlag, null>, number> = {
  full: 1.0,
  partial_50: 0.5,
  none: 0.0,
  review: 0.0,
};

/** Fraction of `total_cents` that is deductible. Unknown or absent flags deduct nothing. */
export function deductibleFraction(flag: string | null | undefined): number {
  return DEDUCTIBLE_FRACTION[flag as Exclude<DeductibleFlag, null>] ?? 0;
}

/** `0.5` → `50`. The sentence and the arithmetic must not be able to disagree. */
const asPercent = (fraction: number) => Math.round(fraction * 100);

/**
 * What one receipt actually deducts, in cents — P2.2c.
 *
 * ── WHY THIS AND NOT `deductibleTotal(rows)` ────────────────────────────────────────────────────
 *
 * P2.2c asks for `approvedTotal()` and `deductibleTotal()`, "exported, used everywhere", against the
 * `effectiveHours` defect — four files summing raw hours while a fifth summed the approver's
 * adjustment. The instinct is to add two list-level functions. **Implemented literally, that would
 * create the very defect the item exists to prevent.**
 *
 * The only consumer is `/api/admin/finances/tax-summary`, and it does not sum a list: it makes ONE
 * pass accumulating `by_status`, `by_category`, `by_tax_flag`, `top_vendors` and `by_user` together.
 * A standalone `deductibleTotal(rows)` beside that loop would be a second way to compute the same
 * number, differing the first time somebody changes one and not the other — two definitions, added
 * by the slice whose entire purpose is to have one.
 *
 * So the shared unit is the per-RECEIPT arithmetic the loop already calls, and the totals stay where
 * the totals are made. `Math.round` is part of the definition, not the caller's business: cents are
 * integers, and a half-cent that rounds differently in two places is exactly the kind of discrepancy
 * nobody can explain at filing time.
 */
export function deductibleCents(
  totalCents: number | null | undefined,
  flag: string | null | undefined,
): number {
  return Math.round((totalCents ?? 0) * deductibleFraction(flag));
}

/** A line as this file needs to see it — the shape `receipt_line_items` already stores. */
export interface DeductibleLine {
  amount_cents: number | null;
  /** TRUE claim it · FALSE do not · NULL follow the receipt. */
  is_business_expense: boolean | null;
  removed_at?: string | null;
}

/**
 * What share of a receipt its lines say we may claim — P2.2b.
 *
 * `null` when the lines cannot answer: none transcribed, or they sum to nothing. A caller that gets
 * `null` must fall back to the receipt-level answer rather than treat it as zero, because "the AI
 * read no lines off this fuel slip" is not "none of this was business".
 */
export function claimableShareOfLines(
  lines: readonly DeductibleLine[],
  receiptIsBusiness: boolean,
): number | null {
  let claimable = 0;
  let total = 0;
  for (const li of lines) {
    const cents = typeof li.amount_cents === 'number' ? li.amount_cents : 0;
    if (cents <= 0) continue;
    total += cents;
    const removed = Boolean(li.removed_at);
    const counts = removed ? false
      : (li.is_business_expense ?? receiptIsBusiness);
    if (counts) claimable += cents;
  }
  if (total <= 0) return null;
  return claimable / total;
}

/**
 * What a receipt deducts once its LINES are allowed to disagree with it — P2.2b/P2.2d.
 *
 * ── THE DECISION THIS ENCODES, AND THE TWO IT REJECTS ───────────────────────────────────────────
 *
 * When lines carry their own treatment and the transcribed lines do not add up to the printed total
 * — which they routinely do not, because transcription is not arithmetic — three answers were
 * possible:
 *
 *   (a) **Sum the lines.** Honest per line, but it quietly replaces the printed total with the AI's
 *       transcription, and the approval queue tells the approver the opposite in as many words:
 *       *"The receipt's own total above is what gets approved."*
 *   (b) **Printed total × the receipt's flag**, lines informational. Safe, and it makes per-line
 *       marking decorative — which defeats the point of having it.
 *   (c) **Printed total, apportioned by the share the lines say is claimable.** ← this one.
 *
 * The printed total stays authoritative; the lines decide the SHARE, not the AMOUNT. Its strongest
 * property is that it changes nothing until somebody deliberately marks a line: with no line
 * overridden every line inherits the receipt, the share collapses to 1, and the figure is
 * **byte-identical to what this system produced yesterday**. A change to a tax report that cannot
 * alter a single existing number until a person acts is the version that ships without a
 * reconciliation.
 *
 * ── AND WHY THERE IS NO NEW COLUMN ──────────────────────────────────────────────────────────────
 *
 * P2.2b asks for "a per-line tax treatment — deductible · partial · not deductible". The per-line
 * control that already ships is business · personal · follow-receipt, and the two compose without
 * inventing anything: **business-vs-personal is whether we may claim the line at all; the receipt's
 * flag is how much of a claimable amount is deductible.** Multiplying them is the whole feature.
 *
 * A per-line CATEGORY (this line is meals at 50%, that one supplies at 100%) is a genuinely
 * different capability, needs a column, and only pays for itself on a receipt that mixes categories.
 * Deliberately not built here — see the plan's §13.4.
 */
export function deductibleCentsWithLines(
  totalCents: number | null | undefined,
  flag: string | null | undefined,
  lines: readonly DeductibleLine[],
  receiptIsBusiness: boolean,
): number {
  const share = claimableShareOfLines(lines, receiptIsBusiness);
  const claimable = share === null ? (totalCents ?? 0) : (totalCents ?? 0) * share;
  // One rounding, at the end, for the reason `deductibleCents` rounds inside itself: a half-cent
  // rounded twice is a discrepancy nobody can explain at filing time.
  return Math.round(claimable * deductibleFraction(flag));
}

export interface TaxSummaryInput {
  /** The card that paid, if one has been CONFIRMED. An unconfirmed suggestion must not be passed
   *  here — see `cardConfirmed`. */
  card?: Pick<PaymentCard, 'role' | 'holderName' | 'label'> | null;
  /** False when a card was suggested by last4 but nobody has confirmed it. A suggestion is not a
   *  fact, and filing on one is the failure F1 exists to prevent. */
  cardConfirmed?: boolean;
  /** Set when this receipt was promoted to a capital asset in `equipment_inventory`. */
  promotedToAsset?: boolean;
  /** Set when this cost was billed on to a customer. */
  recovery?: CostRecovery | null;
  deductibleFlag?: DeductibleFlag;
  /** Free-text category, for the tail of the sentence only. Never used to decide anything. */
  category?: string | null;
}

export type TaxSummaryBasis =
  'card-unconfirmed' | 'card-role' | 'capital-asset' | 'recovery' | 'deductible-flag' | 'unclassified';

export interface TaxSummary {
  /** The one line. Short enough to read in a list. */
  summary: string;
  /** True when a person must resolve something before this row can be filed. */
  needsAttention: boolean;
  /** Which rule decided it — so a surprising summary can be traced without re-deriving it. */
  basis: TaxSummaryBasis;
}

/**
 * FINANCE_TAX_AND_INTAKE Slice F7a — why the summary says what it says.
 *
 * The owner asked for the finance tools to explain themselves. The most useful explanation is not a
 * manual nobody opens: it is *which rule fired on this row*, next to the row. `basis` was already
 * computed and thrown away at every call site.
 *
 * It matters because the precedence is genuinely surprising the first time you meet it. A receipt
 * whose category is "fully deductible" can correctly read *"not our transaction"*, and without this
 * the reader's only options are to trust it or to go and read the source. Naming the rule turns a
 * verdict into something checkable.
 */
export function explainBasis(basis: TaxSummaryBasis): string {
  switch (basis) {
    case 'card-unconfirmed':
      return 'Decided by: the card match is only a suggestion — four digits are not an identifier, so nothing is filed until someone confirms whose card paid.';
    case 'card-role':
      return 'Decided by: whose card paid. This outranks the category — a purchase we did not pay for is not ours to deduct, and a personal card is money owed to a person until it is repaid.';
    case 'capital-asset':
      return 'Decided by: this receipt was promoted to a capital asset, so it is depreciated rather than deducted this year. It is excluded from the Schedule C receipts total so the dollars cannot land twice.';
    case 'recovery':
      return 'Decided by: what was billed back to the customer, compared with what was paid. Only an exact match is a pass-through; anything else is a shortfall or margin.';
    case 'deductible-flag':
      return "Decided by: the receipt's category and its tax-deductible flag, once the questions above were settled.";
    case 'unclassified':
    default:
      return 'Decided by: nothing yet — this receipt has no category or deductibility recorded, so no treatment can be derived.';
  }
}

export function taxSummaryFor(input: TaxSummaryInput): TaxSummary {
  // ── 1. Whose money was it ─────────────────────────────────────────────────────────────────────
  // A card that was matched but never confirmed is an open question, not a fact. Filing on a
  // last4 suggestion is precisely the mistake F1's matcher refuses to make.
  if (input.card && input.cardConfirmed === false) {
    return {
      summary: 'Card not confirmed — check whose card paid this before filing.',
      needsAttention: true,
      basis: 'card-unconfirmed',
    };
  }

  if (input.card) {
    const t = taxTreatmentForCard(input.card);
    if (t.treatment === 'NOT_OUR_TRANSACTION') {
      // Beats every other consideration: the category of a purchase we did not pay for is irrelevant.
      return { summary: t.summary, needsAttention: false, basis: 'card-role' };
    }
    if (t.treatment === 'REIMBURSEMENT_OWED') {
      // Also beats the category. It is a debt to a person now and an expense when repaid, and
      // collapsing those two into one line is what double-counts it.
      return { summary: t.summary, needsAttention: false, basis: 'card-role' };
    }
    if (t.treatment === 'UNDETERMINED') {
      return { summary: t.summary, needsAttention: true, basis: 'card-role' };
    }
    // COMPANY_EXPENSE falls through: it is our money, so the remaining questions now apply.
  }

  // ── 2. Is it an expense at all this year ──────────────────────────────────────────────────────
  if (input.promotedToAsset) {
    // The existing Schedule C summary already excludes promoted receipts so the dollars do not land
    // twice; this says the same thing where a person will actually read it.
    return {
      summary: 'Capital asset — depreciated, not a current-year deduction.',
      needsAttention: false,
      basis: 'capital-asset',
    };
  }

  // ── 3. Did we get it back ─────────────────────────────────────────────────────────────────────
  if (input.recovery) {
    const r = computeRecovery(input.recovery);
    // Reuses F2's wording verbatim rather than re-phrasing it. Two descriptions of the same
    // arithmetic is how they come to disagree.
    if (r.state !== 'NOT_RECOVERED') {
      return { summary: r.summary, needsAttention: r.needsAttention, basis: 'recovery' };
    }
    // NOT_RECOVERED deliberately falls through: an unbilled pass-through is still a deductible
    // business expense today. It is flagged for billing, not withheld from the books.
  }

  // ── 4. How much of it is deductible ───────────────────────────────────────────────────────────
  const tail = input.category ? ` (${input.category})` : '';
  switch (input.deductibleFlag) {
    case 'full':
      return { summary: `Deductible business expense${tail}.`, needsAttention: false, basis: 'deductible-flag' };
    case 'partial_50':
      // Named explicitly, because "partial" without the number is the kind of thing that gets
      // re-derived wrongly at filing time. READ from `DEDUCTIBLE_FRACTION` rather than typed again:
      // the sentence and the arithmetic were two copies of one number, and the copy a person reads
      // is the one no search for a computation would ever have found.
      return {
        summary: `Deductible at ${asPercent(DEDUCTIBLE_FRACTION.partial_50)}%${tail} — meals and entertainment limit.`,
        needsAttention: false,
        basis: 'deductible-flag',
      };
    case 'none':
      return { summary: `Not deductible${tail}.`, needsAttention: false, basis: 'deductible-flag' };
    case 'review':
      return { summary: `Needs review — deductibility not decided${tail}.`, needsAttention: true, basis: 'deductible-flag' };
    default:
      return {
        summary: `Not categorised yet${tail} — no tax treatment recorded.`,
        needsAttention: true,
        basis: 'unclassified',
      };
  }
}

// ── The receipt row's own line ───────────────────────────────────────────────────────────────────

/** The subset of a `receipts` row the tax summary reads. Named so the mapping is checkable. */
export interface ReceiptTaxRow {
  /** Set when the receipt was turned into a capital asset — depreciated, not deducted this year. */
  promoted_to_equipment_id?: string | null;
  tax_deductible_flag?: string | null;
  category?: string | null;
  /**
   * The card that paid, resolved from `payment_card_id` (seeds 572/584), in the shape the DATABASE
   * returns it — `holder_name`, not `holderName`.
   *
   * Deliberately not `Pick<PaymentCard, …>`: this function's whole reason for existing is that the
   * mapping from a row to the summary's inputs is the part unit tests of `taxSummaryFor` cannot
   * protect. Taking the row's own shape and converting here keeps the conversion in one place
   * instead of at every call site, where a silently-undefined `holderName` would produce "the
   * cardholder" in a sentence about somebody's money.
   */
  payment_card?: { role?: string | null; holder_name?: string | null; label?: string | null } | null;
  /** Seed 591. Set when a person agreed the matched card is really the one that paid. */
  card_confirmed_at?: string | null;
  /** Seed 591. 'personal' means this was never a business purchase, whatever card paid for it. */
  expense_nature?: string | null;
}

/**
 * The two-line tax summary shown on an expanded receipt row: the verdict, then the rule behind it.
 *
 * ── WHY THIS IS A FUNCTION AND NOT AN INLINE IIFE (F7c) ─────────────────────────────────────────
 *
 * It used to be an arrow function invoked inside JSX, in the middle of a 700-line client page. That
 * had one consequence worth a slice: **the only way to see its output was to expand a real receipt
 * row in a browser**, and this environment has no receipt data. F3b and F7a were therefore recorded
 * as *shipped but unverified* — honest, and not something to leave standing when the fix is to move
 * three lines somewhere they can be called.
 *
 * The mapping is the part that unit tests of `taxSummaryFor` cannot protect. Those prove the
 * sentences; nothing proved that the PAGE hands over the right three fields. Passing `category_source`
 * where `category` belongs, or forgetting `promoted_to_equipment_id`, would produce a wrong verdict
 * that still reads perfectly — which is exactly the failure this summary exists to prevent, wearing
 * the summary's own voice.
 *
 * ── THE CARD IS NOW PASSED (2026-08-13) ─────────────────────────────────────────────────────────
 *
 * It was not, and the note that used to sit here said the columns had not arrived yet. They had —
 * seed 572 shipped `payment_cards.role`, seed 584 shipped the matcher that fills `payment_card_id` —
 * and the note outlived them. The consequence was not cosmetic: `taxSummaryFor` puts "whose money
 * was it" ABOVE the category on purpose, and with no card to look at that entire first rule was
 * dead. A $200 dinner on an employee's own Visa read *"50% deductible meal"* — a company deduction
 * for money the company had not spent, and a debt to a person that never appeared anywhere.
 *
 * Owner, 2026-08-13: *"maybe one of the employees paid for something without using the business
 * card… we might reimburse them, or maybe not depending. We might want to disregard the receipt
 * entirely from our taxes because it might have just been a personal purchase."*
 *
 * `cardConfirmed` is passed explicitly rather than defaulted, because the default in `taxSummaryFor`
 * is the permissive one and a suggestion filed as a fact is the exact failure the F1 matcher refuses
 * to make.
 */
export function receiptTaxLine(row: ReceiptTaxRow): string {
  // A purchase somebody has marked personal is not a tax question at all — it is not the business's
  // receipt. Checked before the card, because it is true whatever card paid: the company card buying
  // somebody's groceries is still not a deduction.
  if (row.expense_nature === 'personal') {
    return 'Personal purchase — not a business expense, and excluded from every tax total.\n'
      + 'Decided by: somebody marked this personal. Whose card paid does not change it.';
  }
  const t = taxSummaryFor({
    promotedToAsset: !!row.promoted_to_equipment_id,
    deductibleFlag: (row.tax_deductible_flag as DeductibleFlag) ?? null,
    category: row.category ?? null,
    card: row.payment_card
      ? {
          role: (row.payment_card.role ?? 'UNKNOWN') as PaymentCard['role'],
          holderName: row.payment_card.holder_name ?? null,
          label: row.payment_card.label ?? null,
        }
      : null,
    // Only meaningful when there IS a card; `taxSummaryFor` ignores it otherwise.
    cardConfirmed: Boolean(row.card_confirmed_at),
  });
  return `${t.summary}\n${explainBasis(t.basis)}`;
}
