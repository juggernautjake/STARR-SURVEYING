// lib/payouts/methods.ts
//
// ONE VOCABULARY FOR "HOW WAS THIS PAID"
// ══════════════════════════════════════
//
// *"We need to also be able to pay people by cash or check or venmo or cashapp and record it."*
// *"Please clear up any confusion with payment systems… consolidate to one consistent and robust
// system."*
//
// There were three definitions of a payment method, and they disagreed:
//
//   app/api/admin/payouts/route.ts   venmo, cashapp, stripe, check, cash, ach, zelle, other   (8)
//   lib/payouts/dispatch.ts          venmo, cashapp, zelle, ach, cash                         (5)
//   lib/employee-pond/activity-history.ts  direct_deposit, check, cash, other                 (4)
//
// The consequences are not cosmetic. A payout recorded as **check** through the first list reaches
// a batch whose dispatch grouping is typed by the second, which has no `check` — so it lands in
// `unassigned` and the office sees a payment with no method. `stripe` and `other` do the same. And
// the third list shares the *type name* `PayoutMethod` while meaning something else again, with a
// `direct_deposit` that exists in no other list and no database row.
//
// This module is the single vocabulary. Everything that stores, validates, groups or displays a
// method reads it from here.
//
// ── WHAT IS ON THE LIST, AND WHY ────────────────────────────────────────────────────────────────
//
// The firm's actual methods, not a superset of everything a payment processor could do. Each entry
// exists because somebody pays that way:
//
//   cash / check      — handed over. The system RECORDS these; it never claims to have sent them.
//   venmo / cashapp   — a handle, a phone-sized payment, and a deep link the office can tap.
//   zelle             — bank-to-bank by email or phone; no fee, common for larger amounts.
//   ach               — the batch file uploaded to the bank. The only rail with a generated artefact.
//   other             — deliberately kept. A method that must be squeezed into a wrong bucket is how
//                       a ledger stops matching reality; `other` plus a reference is honest.
//
// `stripe` and `direct_deposit` are NOT here. Nothing in the platform can send through Stripe — no
// Connect account, no Treasury — so offering it would let somebody record a payment that no rail
// can make. `direct_deposit` was a synonym for `ach` in a list nobody wrote to.
//
// ── RECORDING IS NOT SENDING ────────────────────────────────────────────────────────────────────
//
// The distinction the whole payout system rests on. `cash` marked paid means somebody handed over
// notes and said so. `ach` marked paid means somebody uploaded the file and the bank moved money.
// Neither happened *because a button was pressed here*. `sendsItself` is false for every method on
// this list, and it is false deliberately — the day a real rail is connected, that flag is where it
// gets declared rather than assumed.

export const PAYOUT_METHODS = ['cash', 'check', 'venmo', 'cashapp', 'zelle', 'ach', 'account', 'other'] as const;

export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export interface PayoutMethodInfo {
  /** What a person calls it. */
  label: string;
  /**
   * What the `reference` field means for this method, so the form can ask for the right thing
   * instead of a generic "reference" nobody fills in.
   */
  referenceLabel: string;
  /** Does the method need a handle or account to pay TO? */
  needsHandle: boolean;
  /**
   * Can the platform itself move the money? **False for everything, today.**
   * ACH is the closest and still is not: it produces a file a human uploads.
   */
  sendsItself: boolean;
  /** Shown next to the method so nobody assumes more than the platform does. */
  note: string;
}

export const PAYOUT_METHOD_INFO: Record<PayoutMethod, PayoutMethodInfo> = {
  cash: {
    label: 'Cash',
    referenceLabel: 'Who handed it over, and when',
    needsHandle: false,
    sendsItself: false,
    note: 'Recorded after the fact. Marking it paid means it changed hands.',
  },
  check: {
    label: 'Check',
    referenceLabel: 'Check number',
    needsHandle: false,
    sendsItself: false,
    note: 'Recorded after the fact. The check number is what makes it findable later.',
  },
  venmo: {
    label: 'Venmo',
    referenceLabel: 'Venmo transaction note or ID',
    needsHandle: true,
    sendsItself: false,
    note: 'The office sends it in Venmo; this records that it happened.',
  },
  cashapp: {
    label: 'Cash App',
    referenceLabel: 'Cash App payment ID',
    needsHandle: true,
    sendsItself: false,
    note: 'The office sends it in Cash App; this records that it happened.',
  },
  zelle: {
    label: 'Zelle',
    referenceLabel: 'Zelle confirmation number',
    needsHandle: true,
    sendsItself: false,
    note: 'Sent from the bank; this records that it happened.',
  },
  ach: {
    label: 'ACH / direct deposit',
    referenceLabel: 'Bank trace or confirmation number',
    needsHandle: true,
    sendsItself: false,
    note: 'The batch produces a CSV the office uploads to the bank. The platform does not send it.',
  },
  account: {
    label: 'Hold in their account',
    referenceLabel: 'Why it is being held rather than sent',
    needsHandle: false,
    // Not "sends itself" either, and the reason is worth being precise about: the money has NOT
    // left the firm. Marking this paid moves the obligation from "we owe you for hours" to "we hold
    // this for you". Both are debts; only the shape changed. It leaves when they withdraw it.
    sendsItself: false,
    note: 'Credits their balance. They draw it out later, and that withdrawal is when it actually goes.',
  },
  other: {
    label: 'Other',
    referenceLabel: 'How it was paid',
    needsHandle: false,
    sendsItself: false,
    note: 'Say how in the reference. Better an honest "other" than a wrong bucket.',
  },
};

/** Is this a method the platform knows about? */
export function isPayoutMethod(value: unknown): value is PayoutMethod {
  return typeof value === 'string' && (PAYOUT_METHODS as readonly string[]).includes(value);
}

/**
 * Map a stored value onto the vocabulary.
 *
 * Historical rows may carry a retired spelling. Translating them is better than showing a raw
 * database string on a payout screen, and far better than dropping the row — a payment with an
 * unrecognised method is still a payment somebody received.
 *
 * Returns null for anything genuinely unknown, so a caller can say "method not recorded" rather
 * than guessing. Guessing here would put a payment in the wrong column of a report somebody
 * reconciles against a bank statement.
 */
export function normalizePayoutMethod(value: unknown): PayoutMethod | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (isPayoutMethod(v)) return v;

  const retired: Record<string, PayoutMethod> = {
    // Was a synonym for ACH in a list nothing ever wrote to.
    direct_deposit: 'ach',
    directdeposit: 'ach',
    // Never had a rail behind it; anything recorded this way was a manual payment.
    stripe: 'other',
    card: 'other',
    cash_app: 'cashapp',
    e_check: 'check',
    cheque: 'check',
  };
  return retired[v] ?? null;
}

/** The label for a method, for a screen. Never renders a raw database value. */
export function payoutMethodLabel(value: unknown): string {
  const m = normalizePayoutMethod(value);
  return m ? PAYOUT_METHOD_INFO[m].label : 'Method not recorded';
}

/**
 * Bucket payouts by method for the office to work through.
 *
 * Every method gets a bucket even when empty, so the screen is a stable checklist rather than a
 * list that changes shape with the data. Unrecognised methods go to `unassigned` — visible, and
 * not silently folded into `other`, which somebody chose on purpose.
 */
export function groupByMethod<T extends { method?: unknown }>(
  items: readonly T[],
): Record<PayoutMethod | 'unassigned', T[]> {
  const out = { unassigned: [] as T[] } as Record<PayoutMethod | 'unassigned', T[]>;
  for (const m of PAYOUT_METHODS) out[m] = [];
  for (const item of items) {
    const m = normalizePayoutMethod(item.method);
    out[m ?? 'unassigned'].push(item);
  }
  return out;
}
