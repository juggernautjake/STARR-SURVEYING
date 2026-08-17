// lib/receipts/edit-fields.ts — every field of a receipt a person is allowed to correct, in one registry.
//
// Owner, 2026-08-16: *"We also need to be able to edit all of the details of a receipt once it has
// been analyzed. Some receipts are printed with low amounts of ink and digits and stuff can become
// faded or missing. For instance, I uploaded a receipt that had the date 8/12/2016, but because the
// ink quality was poor when the receipt was printed, it looked like 8/2/2026."*
//
// ── WHAT WAS ACTUALLY MISSING ───────────────────────────────────────────────────────────────────
//
// `PATCH /api/admin/receipts/{id}` accepted exactly nine things: status, category,
// tax_deductible_flag, notes, job_id, expense_nature, expense_nature_note, payment_card_id and
// rejected_reason. Every field the AI actually reads off the paper — vendor, DATE, subtotal, tax,
// tip, total, last four — was write-once by the extractor and unreachable afterwards.
//
// So the owner's example had no fix in the product. A receipt read as 8/2/2026 instead of 8/12/2016
// could be re-run through the AI (which would read the same faded ink the same way), rejected, or
// left wrong. It could not be corrected. Getting a wrong value out of the AI is expected and fine;
// having nowhere to put the right one is the defect.
//
// ── WHY A REGISTRY AND NOT SEVENTEEN `if (body.x !== undefined)` BLOCKS ─────────────────────────
//
// Because the route already had nine of those and they had already drifted: `category` took any
// string while `tax_deductible_flag` was checked against a set, and `job_id` normalised '' → null
// while `notes` did not. Seventeen more would be seventeen more chances to forget a validator on
// the one field where it mattered — and the fields being added here are money and dates.
//
// One table. Each entry says where the value lives (a real column, or a key inside the `ai_extras`
// JSON for the fields that never got columns), how to validate it, and how to normalise it.
//
// Pure module: no I/O, no Supabase. Tested in `__tests__/receipts/edit-fields.test.ts`.

/** Where a field is stored. Not every extracted field got a column of its own. */
export type FieldHome = 'column' | 'ai_extras';

export interface FieldSpec {
  /** The key callers send, and (for `column`) the column name. */
  key: string;
  home: FieldHome;
  label: string;
  /** Returns the normalised value, or an error string. */
  parse: (raw: unknown) => { ok: true; value: unknown } | { ok: false; error: string };
}

const asNullableString = (label: string, max = 500) => (raw: unknown) => {
  if (raw === null || raw === '') return { ok: true as const, value: null };
  if (typeof raw !== 'string') return { ok: false as const, error: `${label} must be text.` };
  const v = raw.trim();
  if (!v) return { ok: true as const, value: null };
  if (v.length > max) return { ok: false as const, error: `${label} is too long (max ${max}).` };
  return { ok: true as const, value: v };
};

/**
 * Money, in cents, as an integer.
 *
 * Rejects floats outright rather than rounding them. A caller sending 42.18 means dollars, and
 * silently storing 42 cents would turn a $42.18 lunch into 42¢ — the kind of wrong that survives
 * because it still looks like a number.
 */
const asNullableCents = (label: string) => (raw: unknown) => {
  if (raw === null || raw === '') return { ok: true as const, value: null };
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    return { ok: false as const, error: `${label} must be a number of cents.` };
  }
  if (!Number.isInteger(n)) {
    return { ok: false as const, error: `${label} must be whole cents (no decimal point).` };
  }
  // Negative totals are real — a refund slip — so the floor is not zero. But a receipt for more than
  // ten million dollars is a typo every time.
  if (Math.abs(n) > 1_000_000_00) {
    return { ok: false as const, error: `${label} looks wrong (over $1,000,000).` };
  }
  return { ok: true as const, value: n };
};

/**
 * The transaction date — the field this whole slice exists for.
 *
 * Accepts a date-only string or a full ISO timestamp, and is deliberately strict about the YEAR.
 * The owner's receipt was printed 8/12/2016 and read as 8/2/2026: a faded digit changes a year as
 * easily as a day, and a receipt dated in the future or before the firm existed is always a misread.
 */
export const MIN_RECEIPT_YEAR = 1990;

export function parseTransactionAt(raw: unknown, now = new Date()): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, error: 'Date must be text.' };
  const text = raw.trim();
  if (!text) return { ok: true, value: null };

  // `new Date('2026-08-12')` is UTC midnight, which is the previous DAY in any western timezone —
  // the same trap `getMonday` was fixed for. A date-only value is anchored at local noon so it can
  // never cross a day boundary in either direction.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const d = dateOnly ? new Date(`${text}T12:00:00`) : new Date(text);
  if (Number.isNaN(d.getTime())) return { ok: false, error: 'That is not a date we can read.' };

  const year = d.getFullYear();
  if (year < MIN_RECEIPT_YEAR) {
    return { ok: false, error: `${year} is too far back — check the year on the receipt.` };
  }
  // One day of slack for timezones rather than "not in the future" to the millisecond.
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (d.getTime() > tomorrow.getTime()) {
    return { ok: false, error: 'That date is in the future — check the year on the receipt.' };
  }
  return { ok: true, value: d.toISOString() };
}

/** Last four digits. Exactly four, digits only — the field that has been read wrong most often. */
function parseLast4(raw: unknown) {
  if (raw === null || raw === '') return { ok: true as const, value: null };
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return { ok: false as const, error: 'Last four must be digits.' };
  }
  const v = String(raw).trim();
  if (!/^\d{4}$/.test(v)) return { ok: false as const, error: 'Last four must be exactly 4 digits.' };
  return { ok: true as const, value: v };
}

const PAYMENT_METHODS = new Set(['card', 'cash', 'check', 'other']);
function parsePaymentMethod(raw: unknown) {
  if (raw === null || raw === '') return { ok: true as const, value: null };
  if (typeof raw !== 'string') return { ok: false as const, error: 'Payment method must be text.' };
  const v = raw.trim().toLowerCase();
  if (!PAYMENT_METHODS.has(v)) {
    return { ok: false as const, error: `Payment method must be one of: ${[...PAYMENT_METHODS].join(', ')}.` };
  }
  return { ok: true as const, value: v };
}

/**
 * The editable surface.
 *
 * `category`, `tax_deductible_flag`, `notes`, `job_id`, `expense_nature`, `status` and
 * `payment_card_id` are NOT here — the route already handles those, and several carry side effects
 * (a status change stamps an approver; naming a card stamps a confirmation). Moving them would have
 * meant reproducing those side effects in a table that is meant to be declarative.
 */
export const EDITABLE_FIELDS: FieldSpec[] = [
  { key: 'vendor_name', home: 'column', label: 'Vendor', parse: asNullableString('Vendor', 200) },
  { key: 'vendor_address', home: 'column', label: 'Vendor address', parse: asNullableString('Vendor address') },
  { key: 'transaction_at', home: 'column', label: 'Date', parse: (raw) => parseTransactionAt(raw) },
  { key: 'subtotal_cents', home: 'column', label: 'Subtotal', parse: asNullableCents('Subtotal') },
  { key: 'tax_cents', home: 'column', label: 'Tax', parse: asNullableCents('Tax') },
  { key: 'tip_cents', home: 'column', label: 'Tip', parse: asNullableCents('Tip') },
  { key: 'service_charge_cents', home: 'column', label: 'Service charge', parse: asNullableCents('Service charge') },
  { key: 'total_cents', home: 'column', label: 'Total', parse: asNullableCents('Total') },
  { key: 'payment_method', home: 'column', label: 'Payment method', parse: parsePaymentMethod },
  { key: 'payment_last4', home: 'column', label: 'Card last four', parse: parseLast4 },
  // These never got columns; they live in the `ai_extras` JSON, which is where every reader already
  // looks for them. Writing a human correction to the same place keeps one source of truth per
  // field — a parallel `user_extras` blob would mean every reader has to merge two.
  { key: 'vendor_phone', home: 'ai_extras', label: 'Vendor phone', parse: asNullableString('Vendor phone', 40) },
  { key: 'card_brand', home: 'ai_extras', label: 'Card brand', parse: asNullableString('Card brand', 40) },
  { key: 'card_holder_name', home: 'ai_extras', label: 'Cardholder name', parse: asNullableString('Cardholder name', 120) },
  { key: 'receipt_number', home: 'ai_extras', label: 'Receipt number', parse: asNullableString('Receipt number', 80) },
  { key: 'discount_cents', home: 'ai_extras', label: 'Discount', parse: asNullableCents('Discount') },
  { key: 'currency', home: 'ai_extras', label: 'Currency', parse: asNullableString('Currency', 8) },
];

export const EDITABLE_KEYS = new Set(EDITABLE_FIELDS.map((f) => f.key));

export interface AppliedEdits {
  /** Straight into the `receipts` row. */
  columnUpdate: Record<string, unknown>;
  /** Merged over the existing `ai_extras` JSON. Empty when nothing in there changed. */
  aiExtrasUpdate: Record<string, unknown>;
  /** `{ field: { from, to } }` — what actually changed, for `user_review_edits`. */
  changed: Record<string, { from: unknown; to: unknown }>;
  errors: string[];
}

/**
 * Validate a patch and work out what to write.
 *
 * `current` is the row as it stands (including its `ai_extras`), used for two things: skipping
 * no-op writes, and recording what a value changed FROM. A correction log that says only the new
 * value cannot answer "what did the AI actually get wrong", which is the question worth asking of a
 * pile of corrections.
 */
export function applyReceiptEdits(
  current: Record<string, unknown> & { ai_extras?: Record<string, unknown> | null },
  patch: Record<string, unknown>,
): AppliedEdits {
  const out: AppliedEdits = { columnUpdate: {}, aiExtrasUpdate: {}, changed: {}, errors: [] };
  const extras = (current.ai_extras ?? {}) as Record<string, unknown>;

  for (const spec of EDITABLE_FIELDS) {
    if (!(spec.key in patch)) continue;
    const parsed = spec.parse(patch[spec.key]);
    if (!parsed.ok) { out.errors.push(parsed.error); continue; }

    const before = spec.home === 'column' ? current[spec.key] ?? null : extras[spec.key] ?? null;
    const after = parsed.value;

    // A no-op is not an edit. Without this, opening the form and saving would stamp every field as
    // human-corrected and wipe the AI's confidence for fields nobody touched.
    if (sameValue(before, after)) continue;

    if (spec.home === 'column') out.columnUpdate[spec.key] = after;
    else out.aiExtrasUpdate[spec.key] = after;
    out.changed[spec.key] = { from: before ?? null, to: after };
  }

  return out;
}

/** Dates compare by instant, everything else by value. `'2026-08-12T12:00:00.000Z'` and a Date for
 *  the same moment are the same edit, and re-saving one should not be recorded as a change. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const aTime = typeof a === 'string' ? Date.parse(a) : NaN;
  const bTime = typeof b === 'string' ? Date.parse(b) : NaN;
  if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) return aTime === bTime;
  return String(a) === String(b);
}

/**
 * The AI's confidence in a field it no longer supplied.
 *
 * When a person corrects a value, the stored `ai_confidence_per_field` entry for it becomes a
 * statement about a number that is no longer on the screen — so the UI would keep drawing "the AI
 * was 30% sure of this" next to a figure a human typed off the paper in front of them. Dropping the
 * key is what makes the low-confidence marker mean "still unverified".
 */
export function clearConfidenceFor(
  confidence: Record<string, number> | null | undefined,
  editedKeys: string[],
): Record<string, number> {
  const next = { ...(confidence ?? {}) };
  for (const k of editedKeys) delete next[k];
  return next;
}
