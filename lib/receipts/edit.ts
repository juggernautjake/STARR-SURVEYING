// lib/receipts/edit.ts — slice V4 of
// docs/planning/completed/RECEIPT_REVIEW_SLIDESHOW_2026-08-14.md
//
// Owner: *"we need to be able to manually edit all of the info for each receipt if needed."*
//
// ── MONEY IS WHERE A TYPO BECOMES A WRONG NUMBER SILENTLY ───────────────────────────────────────
//
// The database stores cents as integers; the person types dollars. Every failure in that conversion
// is quiet:
//
//   · `parseFloat('12.3.4')` is `12.3` — JavaScript stops at the second dot and returns a number,
//     so a fat-fingered total becomes a plausible one rather than an error;
//   · `Math.round(19.99 * 100)` is 1999, but `12.55 * 100` is `1254.9999999999998`, so a naive
//     `Math.floor` loses a cent on some values and not others;
//   · an empty field must mean "not known" (null), not zero — a receipt with no recorded tip and a
//     receipt with a tip of exactly $0.00 are different facts, and only one of them should be
//     written back over an AI extraction.
//
// So parsing is here, with tests, rather than inline in an onChange handler.

/** The fields the viewer can edit. Deliberately explicit rather than `Partial<ReceiptRow>`: this is
 *  the allow-list the API validates against, and a wildcard would let the UI write `status` or
 *  `approved_by` by accident. */
export interface ReceiptEditable {
  vendor_name: string | null;
  vendor_address: string | null;
  transaction_at: string | null;
  subtotal_cents: number | null;
  tax_cents: number | null;
  tip_cents: number | null;
  total_cents: number | null;
  payment_method: string | null;
  payment_last4: string | null;
  category: string | null;
  tax_deductible_flag: string | null;
  notes: string | null;
  job_id: string | null;
  payment_card_id: string | null;
  expense_nature: string | null;
  expense_nature_note: string | null;
}

export const EDITABLE_FIELDS: ReadonlyArray<keyof ReceiptEditable> = [
  'vendor_name', 'vendor_address', 'transaction_at',
  'subtotal_cents', 'tax_cents', 'tip_cents', 'total_cents',
  'payment_method', 'payment_last4', 'category', 'tax_deductible_flag',
  'notes', 'job_id', 'payment_card_id', 'expense_nature', 'expense_nature_note',
];

export const MONEY_FIELDS: ReadonlyArray<keyof ReceiptEditable> = [
  'subtotal_cents', 'tax_cents', 'tip_cents', 'total_cents',
];

export const PAYMENT_METHODS = ['card', 'cash', 'check', 'other'] as const;
export const TAX_FLAGS = ['full', 'partial_50', 'none', 'review'] as const;
export const EXPENSE_NATURES = ['business', 'personal'] as const;

/**
 * Cents → the string that goes in a text input. Null becomes empty, so "not known" round-trips as
 * "not known" rather than as "0.00".
 */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return '';
  return (cents / 100).toFixed(2);
}

export interface MoneyParse {
  /** null means "cleared"; a number is cents. */
  cents: number | null;
  /** Set when the text could not be read as money at all — shown next to the field rather than
   *  silently coercing to something plausible. */
  error: string | null;
}

/**
 * A typed dollar amount → cents.
 *
 * Accepts `$1,234.50`, `1234.5`, `1234`. Refuses anything with a second decimal point or stray
 * letters, because `parseFloat` would happily return a number for those and the person would never
 * know their total had been truncated.
 */
export function parseMoney(raw: string): MoneyParse {
  const text = (raw ?? '').trim();
  if (text === '') return { cents: null, error: null };

  // Strip only the decorations people actually type — a currency symbol and thousands separators.
  //
  // Internal WHITESPACE is deliberately NOT stripped. Closing up "12 34" gives 1234, i.e. $1,234.00
  // from something the person almost certainly did not mean; leaving the space in makes it fail the
  // shape check below and ask. (The outer `trim()` above already handles the ordinary case of a
  // stray leading or trailing space.)
  const cleaned = text.replace(/[$,]/g, '');
  if (!/^-?\d*\.?\d*$/.test(cleaned) || cleaned === '' || cleaned === '-' || cleaned === '.') {
    return { cents: null, error: 'Enter an amount like 12.34' };
  }
  if ((cleaned.match(/\./g) ?? []).length > 1) {
    return { cents: null, error: 'That has more than one decimal point' };
  }

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return { cents: null, error: 'Enter an amount like 12.34' };
  if (value < 0) return { cents: null, error: 'An amount cannot be negative' };

  // Rounded from a string-scaled value rather than `value * 100`: 12.55 * 100 is
  // 1254.9999999999998 in binary floating point, and flooring that loses a cent.
  const cents = Math.round(Number((value * 100).toFixed(4)));
  if (cents > 100_000_000) return { cents: null, error: 'That is larger than any real receipt' };
  return { cents, error: null };
}

/** A `datetime-local` input value from a stored timestamp, in the browser's own zone. Empty when
 *  the AI never read a date — which is a real state and must not become "now". */
export function isoToDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Back the other way. Returns null for an empty field so clearing a date clears the column. */
export function dateTimeInputToIso(value: string): string | null {
  const text = (value ?? '').trim();
  if (!text) return null;
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Last four digits, or null. Same rule as the search filter — people type cards every way there
 *  is, and only the last four are ever stored. */
export function parseLast4(raw: string): string | null {
  const digits = (raw ?? '').replace(/\D+/g, '');
  if (digits.length === 0) return null;
  return digits.slice(-4).padStart(4, '0').slice(-4);
}

/** Only the fields that actually changed, so a save cannot overwrite a column the person never
 *  touched — which matters here because two people may be reviewing the same queue. */
export function changedFields(
  original: Partial<ReceiptEditable>,
  edited: Partial<ReceiptEditable>,
): Partial<ReceiptEditable> {
  const out: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) {
    const a = original[key] ?? null;
    const b = edited[key] ?? null;
    if (a !== b) out[key] = b;
  }
  return out as Partial<ReceiptEditable>;
}

export interface TotalsCheck {
  /** subtotal + tax + tip, in cents, when enough parts are known. */
  expected: number | null;
  /** How far the entered total is from that sum. */
  differenceCents: number | null;
  /** True when the parts are known and disagree with the total by more than a cent of rounding. */
  mismatched: boolean;
}

/**
 * Does the arithmetic on the receipt add up?
 *
 * Shown as a note, never enforced. Real receipts legitimately fail this: a discount line, a
 * service charge, a split payment, or a vendor who rounds. Blocking a save on it would stop
 * somebody recording what the paper actually says, which is the one thing this screen exists for.
 * A tolerance of one cent absorbs ordinary rounding without hiding a real transposition.
 */
export function checkTotals(v: Partial<ReceiptEditable>): TotalsCheck {
  const { subtotal_cents: sub, tax_cents: tax, tip_cents: tip, total_cents: total } = v;
  if (sub === null || sub === undefined || total === null || total === undefined) {
    return { expected: null, differenceCents: null, mismatched: false };
  }
  const expected = sub + (tax ?? 0) + (tip ?? 0);
  const differenceCents = total - expected;
  return { expected, differenceCents, mismatched: Math.abs(differenceCents) > 1 };
}

/** Confidence for one field from `ai_confidence_per_field`, or null when the AI said nothing. */
export function confidenceFor(
  map: Record<string, unknown> | null | undefined,
  field: string,
): number | null {
  const raw = map?.[field];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/** Below this, the field is marked for a second look. Matches the queue's existing LOW_CONFIDENCE
 *  so the viewer and the row agree about which fields are shaky. */
export const LOW_CONFIDENCE = 0.6;

export function isLowConfidence(
  map: Record<string, unknown> | null | undefined,
  field: string,
): boolean {
  const c = confidenceFor(map, field);
  return c !== null && c < LOW_CONFIDENCE;
}
