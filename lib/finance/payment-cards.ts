// lib/finance/payment-cards.ts — FINANCE_TAX_AND_INTAKE Slice F1.
//
// Whose card paid for this, and what that means at tax time.
//
// ── THE GAP THIS FILLS ──────────────────────────────────────────────────────────────────────────
// A receipt row already carries `payment_method` and `payment_last4` and nothing else about the
// card. Four digits with no owner cannot answer the only question that matters here, which is not
// "what was bought" but **"whose money was it"** — and the tax treatment turns entirely on that:
//
//   * a company card is a company expense;
//   * an owner's or employee's personal card is a **reimbursement owed to a person**, and is not a
//     company expense until it is reimbursed;
//   * a client's card is **not our transaction at all** and must never reach the books as either.
//
// The same coffee, on three different cards, is three different rows in three different places.
// Guessing at that is not a small error: booking a reimbursement as a direct expense overstates
// deductions and leaves a real debt to a person unrecorded, and booking a client's charge as ours
// invents revenue and expense that never existed.
//
// ── THE RULE THAT SHAPES THIS FILE: A MATCH ON last4 IS A GUESS ─────────────────────────────────
// Four digits are not an identifier. Two cards sharing a last4 is ordinary in any wallet, and it is
// certain across a company card, two owners' personal cards and a handful of employees'. So nothing
// here ever returns "this is the card". It returns candidates and says how confident that is, and an
// unmatched charge is reported as *"this card is not on file"* rather than left silently blank —
// because a charge on a card nobody registered is exactly what a bookkeeper needs surfaced, not
// hidden behind an empty field.

export type CardRole =
  /** Owned by the company. Charges are company expenses. */
  | 'COMPANY'
  /** An owner's personal card. Charges are reimbursements owed to that owner. */
  | 'OWNER_PERSONAL'
  /** An employee's personal card. Charges are reimbursements owed to that employee. */
  | 'EMPLOYEE_PERSONAL'
  /** A client's or customer's card. Not our transaction. */
  | 'CLIENT'
  /** On file, but whose it is has not been established. Never treated as any of the above. */
  | 'UNKNOWN';

export interface PaymentCard {
  id: string;
  /** Last four digits as printed. Not unique, by nature — see the header. */
  last4: string;
  /** 'Visa' | 'Mastercard' | … as captured. Free text: what the receipt actually said. */
  brand: string | null;
  /** What a person calls it: "Company Amex", "Dad's Chase", "Jacob personal". */
  label: string | null;
  role: CardRole;
  /** Who holds it. Null for COMPANY (the company holds it) and for UNKNOWN (that is the question). */
  holderName: string | null;
  /** Set when the holder is a person in the system, so a reimbursement can be routed. */
  holderUserId: string | null;
  /** Null while active; set when the card is closed or replaced. A closed card must still resolve,
   *  because historical receipts point at it. */
  retiredAt: string | null;
}

/** What a charge on this card means for the books. `UNKNOWN` has no treatment on purpose. */
export type TaxTreatment =
  | 'COMPANY_EXPENSE'
  | 'REIMBURSEMENT_OWED'
  | 'NOT_OUR_TRANSACTION'
  | 'UNDETERMINED';

export interface CardTaxTreatment {
  treatment: TaxTreatment;
  /** True only for `COMPANY_EXPENSE`. A reimbursement becomes a company expense when it is paid,
   *  which is a separate event with its own date — treating it as one at charge time double-counts
   *  it and hides money owed to a person. */
  isCompanyExpenseNow: boolean;
  /** Who is owed, when `REIMBURSEMENT_OWED`. */
  owedTo: string | null;
  /** One line a bookkeeper can read without opening anything else. */
  summary: string;
  /** True when this row cannot be filed as it stands and a human must resolve it. */
  needsResolution: boolean;
}

/**
 * What a charge on `card` means for the books.
 *
 * Pure and total: every `CardRole` has an answer, and the answer for `UNKNOWN` is that there is no
 * answer yet. Returning a plausible default for an unknown card is the single most damaging thing
 * this function could do, because the row would then look filed.
 */
export function taxTreatmentForCard(card: Pick<PaymentCard, 'role' | 'holderName' | 'label'>): CardTaxTreatment {
  const who = card.holderName ?? card.label ?? 'the cardholder';
  switch (card.role) {
    case 'COMPANY':
      return {
        treatment: 'COMPANY_EXPENSE',
        isCompanyExpenseNow: true,
        owedTo: null,
        summary: 'Company card — company expense.',
        needsResolution: false,
      };
    case 'OWNER_PERSONAL':
      return {
        treatment: 'REIMBURSEMENT_OWED',
        isCompanyExpenseNow: false,
        owedTo: who,
        summary: `Paid on ${who}'s personal card — reimbursement owed to ${who}, not a company expense until repaid.`,
        needsResolution: false,
      };
    case 'EMPLOYEE_PERSONAL':
      return {
        treatment: 'REIMBURSEMENT_OWED',
        isCompanyExpenseNow: false,
        owedTo: who,
        summary: `Paid on ${who}'s personal card — reimbursement owed to ${who}, not a company expense until repaid.`,
        needsResolution: false,
      };
    case 'CLIENT':
      return {
        treatment: 'NOT_OUR_TRANSACTION',
        isCompanyExpenseNow: false,
        owedTo: null,
        // Neither an expense nor revenue. It is on the pile only because we hold the receipt.
        summary: 'Paid on a client/customer card — not our transaction. Do not book as an expense.',
        needsResolution: false,
      };
    case 'UNKNOWN':
    default:
      return {
        treatment: 'UNDETERMINED',
        isCompanyExpenseNow: false,
        owedTo: null,
        summary: 'Cardholder not established — cannot be filed until someone says whose card this is.',
        needsResolution: true,
      };
  }
}

export type MatchConfidence =
  /** Exactly one live card on file has this last4. Still a suggestion, not an identification. */
  | 'SINGLE_CANDIDATE'
  /** More than one card shares this last4. A human must pick. */
  | 'AMBIGUOUS'
  /** No card on file has this last4. */
  | 'NOT_ON_FILE'
  /** The receipt did not capture a last4 at all. */
  | 'NO_LAST4';

export interface CardMatch {
  confidence: MatchConfidence;
  candidates: PaymentCard[];
  /** True whenever a person has to decide before this row can be filed. */
  needsReview: boolean;
  summary: string;
}

/**
 * Find which cards on file could have paid a charge, from the last four digits.
 *
 * **Never returns a single confirmed card**, even when only one matches — see the header. The
 * caller's job is to present a suggestion and record a human's confirmation; this function's job is
 * to be honest about how much the digits actually establish.
 *
 * Retired cards are still matched. A receipt from March points at whatever card paid it, and
 * dropping closed cards from the search would silently turn last year's filed receipts into
 * "not on file".
 */
export function matchCardByLast4(last4: string | null | undefined, cards: readonly PaymentCard[]): CardMatch {
  const digits = (last4 ?? '').trim();
  if (!/^\d{4}$/.test(digits)) {
    return {
      confidence: 'NO_LAST4',
      candidates: [],
      needsReview: true,
      summary: 'No card digits were captured on this receipt — the card cannot be identified.',
    };
  }

  const candidates = cards.filter((c) => c.last4 === digits);

  if (candidates.length === 0) {
    return {
      confidence: 'NOT_ON_FILE',
      candidates: [],
      needsReview: true,
      // The useful case. A charge on a card nobody registered is the thing a bookkeeper most needs
      // told about, and an empty field says nothing.
      summary: `Card ending ${digits} is not on file. Add it, or record whose card it is.`,
    };
  }

  if (candidates.length > 1) {
    return {
      confidence: 'AMBIGUOUS',
      candidates,
      needsReview: true,
      summary: `${candidates.length} cards on file end in ${digits} — pick which one paid this.`,
    };
  }

  const only = candidates[0];
  return {
    confidence: 'SINGLE_CANDIDATE',
    candidates,
    // Still needs review: one match is a suggestion. Auto-applying it is how a charge on an
    // unregistered card silently inherits someone else's tax treatment.
    needsReview: true,
    summary: `Likely ${only.label ?? `card ending ${digits}`}${only.retiredAt ? ' (retired)' : ''} — confirm before filing.`,
  };
}

/** Roles a person can be asked to choose from, in the order they should be offered. `UNKNOWN` is
 *  last because it is the state you are trying to leave, not a choice you make. */
export const CARD_ROLE_OPTIONS: ReadonlyArray<{ role: CardRole; label: string; hint: string }> = [
  { role: 'COMPANY',           label: 'Company card',            hint: 'Owned by the business. Charges are company expenses.' },
  { role: 'OWNER_PERSONAL',    label: "An owner's personal card", hint: 'Charges are reimbursed to that owner — not a company expense until repaid.' },
  { role: 'EMPLOYEE_PERSONAL', label: "An employee's personal card", hint: 'Charges are reimbursed to that employee.' },
  { role: 'CLIENT',            label: 'A client or customer card', hint: 'Not our transaction. Never booked as our expense or revenue.' },
  { role: 'UNKNOWN',           label: "Not sure yet",             hint: 'Held for review. Nothing is filed until this is answered.' },
];
