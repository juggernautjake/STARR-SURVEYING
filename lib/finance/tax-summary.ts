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

export interface TaxSummary {
  /** The one line. Short enough to read in a list. */
  summary: string;
  /** True when a person must resolve something before this row can be filed. */
  needsAttention: boolean;
  /** Which rule decided it — so a surprising summary can be traced without re-deriving it. */
  basis: 'card-unconfirmed' | 'card-role' | 'capital-asset' | 'recovery' | 'deductible-flag' | 'unclassified';
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
      // re-derived wrongly at filing time.
      return { summary: `Deductible at 50%${tail} — meals and entertainment limit.`, needsAttention: false, basis: 'deductible-flag' };
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
