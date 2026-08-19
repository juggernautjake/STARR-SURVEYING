// lib/receipts/required-fields.ts — what a person must tell us before a receipt is accepted.
//
// Owner, 2026-08-18: *"For each receipt, before it can be submitted, please make it so that the user
// has to put in the date, business name, and total amount before being able to submit it."*
//
// ── THIS IS AN ACCURACY FEATURE, NOT A FORM ─────────────────────────────────────────────────────
//
// The three fields asked for here are precisely the three the reader gets wrong on a bad photo, and
// two of them cannot be recovered by reading harder:
//
//   * Guy's Quick Stop prints a total of $27.89. The reader returned $27.69 at two bands and at
//     five, because the photo is 480×640 and the strokes are not in it. Worse, the arithmetic could
//     not arbitrate — 25.62 + 2.07 = 27.69 balances exactly as well as 25.82 + 2.07 = 27.89, so
//     every internal check passed on the wrong number.
//   * The McDonald's totals block is faint enough that subtotal, tax and total all came back null.
//
// A person holding the paper settles both in seconds. So these are not bureaucracy: they are the one
// input that beats another look at the pixels, collected at the only moment the paper is still in
// somebody's hand.
//
// ── AND THE DATE IS DELIBERATELY NOT DEFAULTED TO TODAY ─────────────────────────────────────────
//
// A prefilled date would make the requirement toothless. Somebody photographing a week-old receipt
// from the truck door pocket would accept the default without reading it, and the receipt would file
// under today — silently, and with the confident air of a field somebody filled in. An empty box
// that will not submit is the whole point.
//
// Pure. No I/O. Tested in `__tests__/receipts/required-fields.test.ts`.

// ── WHICH FIELDS EARN THEIR PLACE ───────────────────────────────────────────────────────────────
//
// Owner, 2026-08-18: *"If there is other information from the receipt that would make sense for the
// user to enter before submitting, then please create those fields too and make them mandatory."*
//
// The test applied to each candidate was: does the person know it instantly while holding the paper,
// and does knowing it change what the books or the reader do? Three more passed.
//
//   category           The reader guesses this and it drives the tax treatment. The person who
//                      bought it never has to guess.
//   business/personal  A fork no reader can resolve from a photograph — the same coffee is either
//                      deductible or not depending on who it was for. Only a person knows.
//   payment method     Decides whether a card match is even expected. The last four is the single
//                      field the reader misreads most (measured: 5054 read as 0431), and knowing a
//                      receipt was cash stops that hunt before it starts.
//
// Rejected, and why: subtotal and tax (derivable, and the total is the figure that matters);
// vendor address (long to type, and the lookup gets it); receipt number (tedious, low value).
// Adding a field nobody fills carefully is worse than not having it, because a wrong value typed to
// get past a form outranks a machine reading that was honestly uncertain.
//
// ── AND WHY THREE OF THEM CAN BE SET ONCE FOR A STACK ───────────────────────────────────────────
//
// Date, business and total genuinely differ per receipt. Category, nature and payment method usually
// do not: a fortnight of fuel receipts is twenty times fuel, business, same card. Demanding twenty
// identical answers is how a required field becomes a thing people click through without reading,
// which produces confidently wrong data — strictly worse than the honest uncertainty it replaced.
//
// So those three are still MANDATORY and still per-receipt in the data; the form simply lets one
// answer satisfy the whole stack, with a per-receipt override. The requirement is real; the typing
// is not multiplied by twenty.

export const RECEIPT_CATEGORIES = [
  'fuel', 'meals', 'supplies', 'equipment', 'tolls', 'parking', 'lodging',
  'professional_services', 'office_supplies', 'client_entertainment', 'other',
] as const;
export type ReceiptCategory = (typeof RECEIPT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ReceiptCategory, string> = {
  fuel: 'Fuel',
  meals: 'Meals',
  supplies: 'Supplies',
  equipment: 'Equipment',
  tolls: 'Tolls',
  parking: 'Parking',
  lodging: 'Lodging',
  professional_services: 'Professional services',
  office_supplies: 'Office supplies',
  client_entertainment: 'Client entertainment',
  other: 'Other',
};

export const PAYMENT_METHODS = ['card', 'cash', 'check', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  card: 'Card',
  cash: 'Cash',
  check: 'Check',
  other: 'Other',
};

export const EXPENSE_NATURES = ['business', 'personal'] as const;
export type ExpenseNature = (typeof EXPENSE_NATURES)[number];

export interface ReceiptDeclarationInput {
  /** `YYYY-MM-DD` from a date input. */
  date?: string | null;
  /** As typed. */
  vendor?: string | null;
  /** As typed — "27.89", "$27.89", "27". */
  total?: string | null;
  category?: string | null;
  nature?: string | null;
  payment?: string | null;
}

export interface ReceiptDeclaration {
  dateIso: string;
  vendorName: string;
  totalCents: number;
  category: ReceiptCategory;
  nature: ExpenseNature;
  payment: PaymentMethod;
}

export type FieldKey = 'date' | 'vendor' | 'total' | 'category' | 'nature' | 'payment';

export interface DeclarationCheck {
  ok: boolean;
  /** Per-field message, absent when the field is fine. Shown under the input. */
  errors: Partial<Record<FieldKey, string>>;
  /** The fields still to fill, in reading order, for the summary line. */
  missing: FieldKey[];
  /** Present only when `ok`. */
  value?: ReceiptDeclaration;
}

export const FIELD_LABELS: Record<FieldKey, string> = {
  date: 'date',
  vendor: 'business name',
  total: 'total',
  category: 'category',
  nature: 'business or personal',
  payment: 'payment method',
};

/** Reading order, used by the form and by `describeMissing` so the two list fields the same way. */
export const FIELD_ORDER: readonly FieldKey[] = ['date', 'vendor', 'total', 'category', 'nature', 'payment'];

/** The three that sensibly apply to a whole stack. See the note at the top of the file. */
export const SHAREABLE_FIELDS: readonly FieldKey[] = ['category', 'nature', 'payment'];

/**
 * Dollars as a person types them → whole cents.
 *
 * Accepts a leading `$`, thousands separators, and a bare integer. Returns `'invalid'` rather than
 * guessing: a half-typed "12." must not be stored as twelve dollars while somebody is still typing
 * the cents.
 *
 * Negative is allowed. A refund receipt is a real receipt and the schema already contemplates one —
 * rejecting it would send somebody to type a positive number for money that went the other way.
 */
export function parseTotalToCents(raw: string | null | undefined): number | 'invalid' | 'empty' {
  const t = (raw ?? '').trim().replace(/^\$/, '').replace(/,/g, '');
  if (!t) return 'empty';
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return 'invalid';
  const n = Number(t);
  if (!Number.isFinite(n)) return 'invalid';
  return Math.round(n * 100);
}

/** Today in the browser's own calendar, `YYYY-MM-DD`. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Check one receipt's three fields.
 *
 * Every message is written for the person typing, names the field, and says what to do. "Invalid
 * input" tells somebody standing at a truck nothing at all.
 */
export function checkDeclaration(
  input: ReceiptDeclarationInput,
  now: Date = new Date(),
): DeclarationCheck {
  const errors: Partial<Record<FieldKey, string>> = {};
  const missing: FieldKey[] = [];

  // ── Date ──────────────────────────────────────────────────────────────────────────────────────
  const date = (input.date ?? '').trim();
  let dateIso = '';
  if (!date) {
    missing.push('date');
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T12:00:00Z`).getTime())) {
    errors.date = 'That is not a date the calendar recognises.';
  } else {
    const d = new Date(`${date}T12:00:00Z`);
    const days = (d.getTime() - new Date(`${todayIso(now)}T12:00:00Z`).getTime()) / 86_400_000;
    if (days > 0) {
      // Not pedantry. A future date is the single most common typo here — the year, or a day picked
      // from the wrong month in the picker — and it lands the expense in a period that has not been
      // reconciled yet, where nobody is looking for it.
      errors.date = 'That date is in the future. A receipt cannot be from tomorrow.';
    } else if (days < -365 * 5) {
      errors.date = 'That is more than five years ago — check the year.';
    } else {
      dateIso = date;
    }
  }

  // ── Business name ─────────────────────────────────────────────────────────────────────────────
  const vendor = (input.vendor ?? '').trim().replace(/\s+/g, ' ');
  if (!vendor) {
    missing.push('vendor');
  } else if (vendor.length < 2) {
    // A single character satisfies "not empty" and identifies nothing. The point of the field is
    // that somebody can read it back later and know where the money went.
    errors.vendor = 'Give the business name, not a single letter.';
  }

  // ── Total ─────────────────────────────────────────────────────────────────────────────────────
  const cents = parseTotalToCents(input.total);
  let totalCents = 0;
  if (cents === 'empty') {
    missing.push('total');
  } else if (cents === 'invalid') {
    errors.total = 'Enter the total as a number, like 27.89.';
  } else if (cents === 0) {
    errors.total = 'A total of zero is not a receipt — enter the amount charged.';
  } else {
    totalCents = cents;
  }

  // ── Category, nature, payment method ──────────────────────────────────────────────────────────
  // Each is a closed set, so the only failure is "not chosen". An unrecognised value means a
  // hand-built request rather than a person using the form, and is reported as missing rather than
  // stored — a category the rest of the system does not know is a silent hole in every report that
  // groups by it.
  const category = (input.category ?? '').trim() as ReceiptCategory;
  if (!category) missing.push('category');
  else if (!RECEIPT_CATEGORIES.includes(category)) errors.category = 'Choose one of the listed categories.';

  const nature = (input.nature ?? '').trim() as ExpenseNature;
  if (!nature) missing.push('nature');
  else if (!EXPENSE_NATURES.includes(nature)) errors.nature = 'Choose business or personal.';

  const payment = (input.payment ?? '').trim() as PaymentMethod;
  if (!payment) missing.push('payment');
  else if (!PAYMENT_METHODS.includes(payment)) errors.payment = 'Choose how it was paid for.';

  const ok = missing.length === 0 && Object.keys(errors).length === 0;
  return {
    ok,
    errors,
    missing,
    value: ok
      ? { dateIso, vendorName: vendor, totalCents, category, nature, payment }
      : undefined,
  };
}

/**
 * A shot's own answer, falling back to the one set for the whole stack.
 *
 * Only the shareable fields fall back. Letting a date or a total inherit from a batch-level box
 * would file twenty receipts under one day for one amount, which is the exact failure this whole
 * feature exists to prevent.
 */
export function resolveDeclaration(
  own: ReceiptDeclarationInput | undefined,
  shared: ReceiptDeclarationInput | undefined,
): ReceiptDeclarationInput {
  const pick = (k: keyof ReceiptDeclarationInput) => {
    const mine = (own?.[k] ?? '').toString().trim();
    if (mine) return mine;
    if (!SHAREABLE_FIELDS.includes(k as FieldKey)) return '';
    return (shared?.[k] ?? '').toString().trim();
  };
  return {
    date: (own?.date ?? '').toString(),
    vendor: (own?.vendor ?? '').toString(),
    total: (own?.total ?? '').toString(),
    category: pick('category'),
    nature: pick('nature'),
    payment: pick('payment'),
  };
}

/**
 * One sentence naming what is still needed, across a whole queue.
 *
 * Written as a count plus the fields rather than a list of every photo, because a stack of twenty
 * missing a total each would otherwise produce twenty lines of identical text. The per-photo detail
 * lives under the photo, where the person is already looking.
 */
export function describeMissing(checks: readonly DeclarationCheck[]): string | null {
  const bad = checks.filter((c) => !c.ok);
  if (bad.length === 0) return null;

  const fields = new Set<FieldKey>();
  for (const c of bad) {
    for (const m of c.missing) fields.add(m);
    for (const k of Object.keys(c.errors) as FieldKey[]) fields.add(k);
  }

  const names = FIELD_ORDER
    .filter((f) => fields.has(f))
    .map((f) => FIELD_LABELS[f]);

  const list = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

  // "Still needs its date" is wrong for a date that IS filled and is simply not valid — it sends
  // somebody to look for an empty box that does not exist. Caught in the browser: a future date
  // reported as a missing one. So the two states get different sentences.
  const anyBadValue = bad.some((c) => Object.keys(c.errors).length > 0);
  if (anyBadValue) {
    return bad.length === 1
      ? `One receipt needs attention — check the ${list}.`
      : `${bad.length} receipts need attention — check the ${list}.`;
  }

  return bad.length === 1
    ? `One receipt still needs its ${list}.`
    : `${bad.length} receipts still need their ${list}.`;
}

/**
 * What the declaration says, for the reader to weigh.
 *
 * Stronger wording than the free-text note briefing, and deliberately so: a note is whatever somebody
 * felt like writing, while these three were typed into labelled boxes about this specific receipt and
 * the upload was refused until they were. That is a much more deliberate claim, and the reader should
 * treat it accordingly — while still never letting it overwrite print it can plainly read, because a
 * typo in a required box is exactly as possible as a typo anywhere else.
 */
export function declarationBriefing(d: ReceiptDeclaration | null | undefined): string | null {
  if (!d) return null;
  return [
    'WHAT THE SUBMITTER DECLARED WHEN THEY PHOTOGRAPHED THIS RECEIPT:',
    `  date:          ${d.dateIso}`,
    `  business:      ${d.vendorName}`,
    `  total:         $${(d.totalCents / 100).toFixed(2)}`,
    `  category:      ${d.category}`,
    `  business or personal: ${d.nature}`,
    `  paid by:       ${d.payment}`,
    '',
    'These were typed into required boxes about this receipt, with the paper in hand, and the upload',
    'was refused until they were filled. Treat them as the strongest evidence you have for these',
    'three fields specifically.',
    '  - Where your reading of the photo agrees, say so and move on.',
    '  - Where the print is faded, torn or lost to glare, PREFER THE DECLARATION and record that you',
    '    did in "resolved". Do not return null for a figure somebody has handed you.',
    '  - Where the print plainly and legibly says something different, keep what is printed and',
    '    raise a flag naming both. A typo in a required box is exactly as possible as any other typo,',
    '    and silently adopting one would put it straight into the books.',
    '  - The declared total is the TOTAL — the amount charged. Do not read it as a subtotal, and do',
    '    not adjust the printed subtotal or tax to make them add up to it. If they do not reconcile,',
    '    that is a flag, not something to fix by arithmetic.',
    '  - Category and business/personal came from the person who made the purchase. They know what',
    '    they bought and who it was for; you are inferring both from a photograph. Use theirs, and',
    '    only disagree if the receipt plainly contradicts it (a hotel bill declared as fuel).',
    `  - Paid by ${d.payment}. ${d.payment === 'card'
      ? 'A card last four is expected — read it carefully.'
      : 'Do NOT report a card last four; there was no card. A number that looks like one on this receipt is something else.'}`,
  ].join('\n');
}
