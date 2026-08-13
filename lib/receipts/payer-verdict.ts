// lib/receipts/payer-verdict.ts
//
// "Whose money paid for this, and was it business at all?"
//
// Owner, 2026-08-13: *"if we do not have a card on file, then the receipt should be flagged and it
// should tell us that the card is not recognized… maybe one of the employees paid for something
// without using the business card. They might have used their own personal card. In which case we
// might reimburse them, or maybe not depending. We might want to disregard the receipt entirely from
// our taxes because it might have just been a personal purchase."*
//
// ── WHAT ALREADY EXISTED, AND WHY IT WAS NOT ENOUGH ──────────────────────────────────────────────
//
// Three of the four pieces were already built:
//
//   · `payment_cards.role` (seed 572) knows a company card from an owner's, an employee's, a
//     client's.
//   · `matchCardOnFile` (seed 584) compares a receipt's printed last four against that list.
//   · `taxSummaryFor` puts "whose money was it" FIRST in its precedence, above the category — a
//     personal card is a debt to a person, not a deduction.
//
// The fourth was missing, and without it the other three did nothing: `receiptTaxLine` never passed
// the card. So every receipt in the queue was filed on its category alone, and a $200 dinner on
// somebody's own Visa read "50% deductible meal" — the exact answer the precedence was written to
// prevent. The machinery was authored, tested and unreachable, which is this codebase's signature
// defect and the reason this module exists as a wiring point rather than as new rules.
//
// ── THE ONE GENUINELY NEW FACT ───────────────────────────────────────────────────────────────────
//
// A personal card is used for both kinds of purchase:
//
//     employee's own card, business purchase → we owe them the money
//     employee's own card, personal purchase → not ours; keep it out of the books entirely
//
// Those two receipts are identical in every column the database had. Nothing can derive which is
// which — only a person knows — so `expense_nature` (seed 591) stores the answer, and until somebody
// gives it the receipt says it is waiting rather than guessing.

import type { CardMatchStatus } from './card-on-file';

/** A card as this module needs it — the role is the part that decides anything. */
export interface PayerCard {
  id: string;
  label?: string | null;
  last4?: string | null;
  role?: string | null;
  holder_name?: string | null;
}

export interface PayerInput {
  /** Result of `matchCardOnFile`, as stored on the receipt. Null for receipts extracted before the
   *  matcher existed — deliberately distinguishable from `unknown` ("checked, could not tell"). */
  card_match_status?: CardMatchStatus | string | null;
  /** The card the matcher suggested, resolved. Null when nothing matched. */
  card?: PayerCard | null;
  /** Set once a person agreed the suggestion is right. A match is not a confirmation. */
  card_confirmed_at?: string | null;
  /** 'business' | 'personal' | null. Only a person can supply this. */
  expense_nature?: string | null;
  payment_method?: string | null;
}

export interface PayerVerdict {
  /** True when the books cannot be right until somebody answers something. */
  needsDecision: boolean;
  /** The question to put in front of a person, or null when nothing is outstanding. */
  question: string | null;
  /** What is known, in one sentence. Always populated. */
  summary: string;
  /** False when this purchase must be kept out of every expense and tax total. */
  countsAsExpense: boolean;
  /** Set when the business owes the money back to whoever paid. */
  reimbursementOwedTo: string | null;
  /** Which rule decided it, so a surprising verdict can be traced rather than re-derived. */
  basis:
    | 'not-a-card'
    | 'card-unrecognised'
    | 'card-illegible'
    | 'card-unconfirmed'
    | 'personal-purchase'
    | 'reimbursable'
    | 'client-card'
    | 'company-card'
    | 'card-role-unknown';
}

/** Roles that mean the money came out of a person's own pocket. */
const PERSONAL_ROLES = new Set(['OWNER_PERSONAL', 'EMPLOYEE_PERSONAL']);

function who(card: PayerCard | null | undefined): string {
  return card?.holder_name?.trim() || card?.label?.trim() || 'the cardholder';
}

/**
 * Decide what is known about who paid, and what is still outstanding.
 *
 * Pure. The order below is the design, and it is the same precedence `taxSummaryFor` uses: whose
 * money it was outranks what was bought. A "fully deductible" category on a purchase we did not pay
 * for is not a deduction, it is somebody else's receipt.
 */
export function payerVerdict(input: PayerInput): PayerVerdict {
  const nature = input.expense_nature ?? null;
  const status = input.card_match_status ?? null;
  const card = input.card ?? null;

  // ── A decision, once made, outranks everything the matcher can see ─────────────────────────────
  //
  // Checked first because it is the answer to the question everything below is asking. Somebody who
  // has said "that was my own dinner" should not keep being asked whose card it was.
  if (nature === 'personal') {
    return {
      needsDecision: false,
      question: null,
      summary:
        'Marked a personal purchase — kept out of every expense and tax total, and not reimbursed.',
      countsAsExpense: false,
      reimbursementOwedTo: null,
      basis: 'personal-purchase',
    };
  }

  // ── Not a card purchase at all ─────────────────────────────────────────────────────────────────
  if (status === 'not_a_card') {
    return {
      needsDecision: false,
      question: null,
      summary: 'Not a card purchase — cash or cheque, so there is no card to recognise.',
      countsAsExpense: true,
      reimbursementOwedTo: null,
      basis: 'not-a-card',
    };
  }

  // ── The card is not one of ours ────────────────────────────────────────────────────────────────
  //
  // The case the owner raised. Deliberately NOT resolved by guessing: an unrecognised card is
  // equally likely to be a company card nobody has added yet, an employee's own card on a business
  // errand, and somebody's own lunch. Those three lead to three different outcomes and the receipt
  // waits rather than picking one.
  if (status === 'not_on_file') {
    return {
      needsDecision: nature !== 'business',
      question: nature === 'business'
        ? null
        : 'This card is not recognised. Whose card was it, and was the purchase for the business?',
      summary: nature === 'business'
        ? 'Paid on a card that is not on file, confirmed as a business purchase — add the card so it '
          + 'is recognised next time, and record who is owed the money.'
        : 'The card on this receipt is NOT recognised — it matches no card on file. It may be a '
          + 'company card nobody has added yet, somebody\'s own card used for the business, or a '
          + 'personal purchase. It counts as a business expense unless you say otherwise.',
      // ── WHY THIS COUNTS RATHER THAN WAITING ──────────────────────────────────────────────────
      //
      // The tempting rule is "unresolved, so leave it out". It is the wrong one here, for a reason
      // specific to where these totals come from: every expense query filters
      // `status IN ('approved','exported')`, so a receipt only reaches a total after a bookkeeper
      // has approved it. It has been looked at.
      //
      // Defaulting to excluded would mean the firm's deductions silently shrink every time the
      // extractor cannot read four digits — a wrong number with no symptom. Defaulting to counted
      // with a flag on the row and a place in the review queue is a wrong number that announces
      // itself. The finance queries agree with this exactly: they exclude
      // `expense_nature = 'personal'` and let NULL through.
      countsAsExpense: nature !== 'personal',
      reimbursementOwedTo: null,
      basis: 'card-unrecognised',
    };
  }

  // ── A card was used and the digits are not legible ─────────────────────────────────────────────
  if (status === 'unknown') {
    return {
      needsDecision: nature === null,
      question: nature === null
        ? 'The card number is not legible. Which card was this, and was it for the business?'
        : null,
      summary: nature === 'business'
        ? 'Card not legible on the photo, confirmed as a business purchase.'
        : 'Paid by card, but the number is not legible — it cannot be checked against the cards on file.',
      countsAsExpense: nature === 'business',
      reimbursementOwedTo: null,
      basis: 'card-illegible',
    };
  }

  // ── A card matched, but a match is not a confirmation ──────────────────────────────────────────
  //
  // Four printed digits are not an identifier. `taxSummaryFor` has always refused to file on an
  // unconfirmed suggestion; until seed 591 nothing recorded whether it had one.
  if (card && !input.card_confirmed_at) {
    const isPersonal = PERSONAL_ROLES.has(card.role ?? '');
    return {
      needsDecision: true,
      question: `This looks like ${card.label ?? `the card ending ${card.last4 ?? '????'}`}. Is that right?`,
      summary: isPersonal
        ? `Looks like ${who(card)}'s own card — confirm it, because a personal card means money owed `
          + 'to a person rather than a company expense.'
        : `Matched to ${card.label ?? `a card ending ${card.last4 ?? '????'}`} on four printed digits, `
          + 'which is a suggestion rather than an identifier. Confirm it before filing.',
      // Everything below this line depends on which card it is, so nothing is counted yet.
      countsAsExpense: false,
      reimbursementOwedTo: null,
      basis: 'card-unconfirmed',
    };
  }

  // ── A confirmed card. Its role decides the treatment. ──────────────────────────────────────────
  if (card) {
    const role = card.role ?? 'UNKNOWN';
    if (role === 'CLIENT') {
      return {
        needsDecision: false,
        question: null,
        summary: 'Paid on a client or customer card — not our transaction. Never booked as our expense.',
        countsAsExpense: false,
        reimbursementOwedTo: null,
        basis: 'client-card',
      };
    }
    if (PERSONAL_ROLES.has(role)) {
      // A personal card is where the owner's two outcomes diverge, and the divergence is not
      // derivable: business → we owe them; personal → not ours at all.
      if (nature !== 'business') {
        return {
          needsDecision: true,
          question: `${who(card)} paid with their own card. Was this for the business, or personal?`,
          summary: `Paid on ${who(card)}'s own card. Whether the business owes them the money depends `
            + 'on whether the purchase was for the business — nobody has said yet.',
          countsAsExpense: false,
          reimbursementOwedTo: null,
          basis: 'reimbursable',
        };
      }
      return {
        needsDecision: false,
        question: null,
        summary: `Business purchase on ${who(card)}'s own card — the money is owed back to them, and is `
          + 'a company expense once repaid.',
        countsAsExpense: true,
        reimbursementOwedTo: who(card),
        basis: 'reimbursable',
      };
    }
    if (role === 'COMPANY') {
      return {
        needsDecision: false,
        question: null,
        summary: `Paid on ${card.label ?? 'a company card'} — company money, as expected.`,
        countsAsExpense: true,
        reimbursementOwedTo: null,
        basis: 'company-card',
      };
    }
    // A card on file whose own role nobody has set. Saying "company expense" here would invent the
    // answer the card record itself is missing.
    return {
      needsDecision: true,
      question: `Whose card is ${card.label ?? `the one ending ${card.last4 ?? '????'}`}? Its role has never been set.`,
      summary: 'Matched a card on file whose role has never been recorded, so whose money this was is '
        + 'still unknown. Set the role under company cards.',
      countsAsExpense: false,
      reimbursementOwedTo: null,
      basis: 'card-role-unknown',
    };
  }

  // ── Nothing has been checked ───────────────────────────────────────────────────────────────────
  //
  // Every receipt extracted before the matcher existed. Not an accusation and not a clean bill:
  // it says the check has not run, which is exactly what is true.
  return {
    needsDecision: false,
    question: null,
    summary: 'The card on this receipt has not been checked against the cards on file.',
    countsAsExpense: true,
    reimbursementOwedTo: null,
    basis: 'not-a-card',
  };
}
