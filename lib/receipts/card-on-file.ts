// lib/receipts/card-on-file.ts
//
// "Was this bought on a company card we know about?"
//
// Owner, 2026-08-12: *"if a receipt uses a card that is not on file, it needs to be flagged and show
// that the card number or card name or card name holder is not on file."*
//
// ── WHY THIS IS NOT A JOB FOR THE MODEL ───────────────────────────────────────────────────────────
//
// The extractor reads what is PRINTED on the slip; it has no idea which cards the firm owns. Asking it
// to decide "on file or not" would be asking it to invent a fact it cannot see. So the model reports
// last four / brand / cardholder, and this compares that against `payment_cards` — a database question
// answered with the database.
//
// ── WHAT COUNTS AS A MATCH, AND WHY IT IS NOT JUST last4 ─────────────────────────────────────────
//
// Last four alone is weak: with a dozen cards a collision is ordinary, and two different cards ending
// 4054 are a real possibility. But requiring brand AND holder to agree would flag almost everything,
// because plenty of slips print no brand and most print no name.
//
// So: **last4 must match, and any other field the receipt actually provides must not CONTRADICT.** A
// field the receipt does not carry is not evidence against a match — absence is not disagreement. That
// keeps a printed "VISA ...4054" from matching a Mastercard on file, without demanding detail the
// paper never had.
//
// A retired card still matches. It was a company card at the time, so the purchase is explained; the
// result says the card is retired rather than pretending it is unknown, because "you used the old fuel
// card" and "you used a card nobody has ever seen" need different responses from a bookkeeper.

/** One row of `payment_cards`, narrowed to what matching needs. */
export interface CardOnFile {
  id: string;
  last4: string | null;
  brand: string | null;
  label: string | null;
  holder_name: string | null;
  retired_at?: string | null;
}

/** What the extractor read off the slip. */
export interface ReceiptCardDetails {
  payment_method?: string | null;
  payment_last4?: string | null;
  card_brand?: string | null;
  card_holder_name?: string | null;
}

export type CardMatchStatus =
  /** Not a card purchase at all — the receipt SAYS cash or cheque. Nothing to check. */
  | 'not_a_card'
  /** A card was used but the slip does not show the last four, so it CANNOT be checked. */
  | 'unknown'
  /** Matches a card on file. */
  | 'on_file'
  /** Matches a card on file that has since been retired. */
  | 'retired'
  /** A card was used, the last four are legible, and nothing on file matches. */
  | 'not_on_file';

export interface CardMatchResult {
  status: CardMatchStatus;
  /** The matched row, when there is one. */
  cardId: string | null;
  /** A sentence for the bookkeeper. Null when there is nothing worth saying. */
  flag: string | null;
}

const norm = (s: string | null | undefined): string =>
  (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Payment methods that genuinely have no card behind them.
 *
 * Owner, 2026-08-13: *"We need to know what card is paying for each receipt unless it is cash or
 * check."* That sentence is the whole reason this set is a LIST rather than the negation of "card":
 * "not the string 'card'" and "not a card purchase" are different claims, and treating an
 * unrecognised method as the second is how a card purchase leaves the check silently.
 */
const NON_CARD_METHODS = new Set([
  'cash', 'check', 'cheque', 'money order', 'moneyorder', 'ach', 'banktransfer', 'wire', 'invoice',
]);

/** Brands are written a dozen ways ("VISA", "Visa Credit", "VISA DEBIT"). Compare on the stem. */
function brandsConflict(receipt: string | null | undefined, onFile: string | null | undefined): boolean {
  const a = norm(receipt);
  const b = norm(onFile);
  if (!a || !b) return false;                 // absence is not disagreement
  return !(a.includes(b) || b.includes(a));
}

/**
 * Holder names collide with formatting more than with reality: "MADDUX/JACOB", "JACOB MADDUX" and
 * "Jacob R Maddux" are one person. Compare as unordered word sets and call it a conflict only when the
 * two share NO word at all — a middle initial or a swapped order must not manufacture a mismatch.
 */
function holdersConflict(receipt: string | null | undefined, onFile: string | null | undefined): boolean {
  const words = (s: string | null | undefined) =>
    (s ?? '').toLowerCase().split(/[^a-z]+/i).filter((w) => w.length > 1);
  const a = words(receipt);
  const b = words(onFile);
  if (a.length === 0 || b.length === 0) return false;
  return !a.some((w) => b.includes(w));
}

/**
 * Decide whether a receipt's card is one the firm knows about.
 *
 * Pure: given the same receipt and the same card list it always returns the same answer, so the rule
 * can be tested without a database and without the model.
 */
export function matchCardOnFile(
  receipt: ReceiptCardDetails,
  cards: readonly CardOnFile[],
): CardMatchResult {
  const method = norm(receipt.payment_method);
  // Only card purchases are in scope. Cash and cheques have no card to be on file, and flagging them
  // would train people to ignore the flag — which is how the one real problem gets approved with the rest.
  const looksLikeCard = method === 'card' || Boolean(receipt.payment_last4) || Boolean(receipt.card_brand);
  if (!looksLikeCard) {
    // The receipt SAYS cash or cheque. Settled, and nothing to ask.
    if (NON_CARD_METHODS.has(method)) return { status: 'not_a_card', cardId: null, flag: null };

    // Nothing was read off the paper about how this was paid — which is NOT the same as "it was not
    // a card", though this function used to answer both with `not_a_card` (2026-08-13). The
    // difference is the owner's requirement: every receipt must end up with a card named against it
    // unless it was cash or a cheque, and a receipt silently filed as "no card involved" because the
    // method line was blank is exactly the one that escapes that. `unknown` is the honest answer —
    // a question, not an accusation — and it is a status the re-match sweep revisits.
    return {
      status: 'unknown',
      cardId: null,
      flag: 'No payment method was read off this receipt — we cannot tell whether a card was used. '
        + 'Confirm whether this was cash, a cheque, or a card.',
    };
  }

  const last4 = (receipt.payment_last4 ?? '').replace(/\D/g, '');
  if (last4.length !== 4) {
    // Deliberately NOT "not on file". We do not know, and saying we do would be a false accusation
    // about somebody's expense claim.
    return {
      status: 'unknown',
      cardId: null,
      flag: 'Paid by card, but the card number is not legible on the receipt — cannot check it against the cards on file.',
    };
  }

  const candidates = cards.filter((c) => (c.last4 ?? '').replace(/\D/g, '') === last4);
  const compatible = candidates.filter(
    (c) => !brandsConflict(receipt.card_brand, c.brand) && !holdersConflict(receipt.card_holder_name, c.holder_name),
  );

  if (compatible.length > 0) {
    // Prefer an active card when both an active and a retired one share the last four.
    const active = compatible.find((c) => !c.retired_at);
    const chosen = active ?? compatible[0];
    if (active) return { status: 'on_file', cardId: chosen.id, flag: null };
    return {
      status: 'retired',
      cardId: chosen.id,
      flag: `Paid with ${chosen.label ?? `card ending ${last4}`}, which is on file but marked retired — check the purchase was authorised.`,
    };
  }

  // Last four matched something, but the brand or the name on the slip disagrees with it. Worth saying
  // precisely, because "we have a card ending 4054 but it is a Visa and this slip says Amex" is a
  // different problem from "we have never seen this card".
  if (candidates.length > 0) {
    const details = [
      receipt.card_brand ? `brand "${receipt.card_brand}"` : null,
      receipt.card_holder_name ? `cardholder "${receipt.card_holder_name}"` : null,
    ].filter(Boolean).join(' and ');
    return {
      status: 'not_on_file',
      cardId: null,
      flag: `Card ending ${last4} is on file, but this receipt's ${details} does not match it — confirm which card was actually used.`,
    };
  }

  const named = [
    receipt.card_brand ? receipt.card_brand.toUpperCase() : null,
    receipt.card_holder_name ? `in the name of ${receipt.card_holder_name}` : null,
  ].filter(Boolean).join(' ');
  return {
    status: 'not_on_file',
    cardId: null,
    flag: `Card ending ${last4}${named ? ` (${named})` : ''} is NOT on file — add it under company cards, or confirm this was a personal card to be reimbursed.`,
  };
}
