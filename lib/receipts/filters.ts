// lib/receipts/filters.ts — slice F1 of
// docs/planning/completed/RECEIPT_REVIEW_SLIDESHOW_2026-08-14.md
//
// Owner, 2026-08-14: *"we need to be able to review receipts based on what job they are assigned to,
// what day they were recorded or the purchase on them was made, and we need to be able to search
// receipts based on type of purchase, location, and the payment method used. We need it so that we
// can input a card number or select from the saved cards on file and see all of the receipts related
// to that payment method."*
//
// ── THE DATE FILTER DID NOT FILTER THE DATE IT CLAIMED TO ───────────────────────────────────────
//
// `GET /api/admin/receipts` has always bounded **`created_at`** with `from`/`to`, while its own
// header comment says it uses `transaction_at` *"OR (when null) receipts.created_at — bookkeepers
// want 'April expenses' even for receipts that lack an extracted transaction date."* There is no
// COALESCE anywhere in the route. The comment describes an intention nobody implemented.
//
// So "show me April" has always meant *recorded* in April. A receipt photographed on 2 May for a
// 28 April purchase is filed under May, and no query could say otherwise. The owner asking for
// "what day they were recorded OR the purchase was made" as two separate questions is the same
// observation from the other side of the screen.
//
// `dateField` makes the choice explicit rather than guessing, because the two are genuinely
// different questions and a tool that silently picks one is wrong half the time.
//
// ── WHY THIS IS A LIB ───────────────────────────────────────────────────────────────────────────
//
// The route builds a PostgREST query; it should not also be deciding what "search by location"
// means, or how a typed card number relates to a saved one. Those are rules, they have edge cases
// that matter (a card that is not on file is exactly the case the owner wants to find), and they
// are worth testing without a database.

/** Which timestamp a date range applies to. */
export type ReceiptDateField = 'purchase' | 'recorded';

/** The column each choice bounds. `purchase` is the date printed on the receipt; `recorded` is when
 *  it entered the system. */
export const DATE_COLUMN: Record<ReceiptDateField, 'transaction_at' | 'created_at'> = {
  purchase: 'transaction_at',
  recorded: 'created_at',
};

export interface ReceiptFilterInput {
  status?: string | null;
  from?: string | null;
  to?: string | null;
  dateField?: string | null;
  email?: string | null;
  jobId?: string | null;
  /** Free text, matched against vendor name AND address — "Las Cruces" and "Desert Sands" both
   *  need to work, and a person searching does not know which column their words live in. */
  q?: string | null;
  category?: string | null;
  paymentMethod?: string | null;
  /** A typed card number's last four. Finds receipts whose card is NOT in the registry. */
  last4?: string | null;
  /** A saved `payment_cards.id`. */
  cardId?: string | null;
  includeDeleted?: boolean;
  limit?: string | number | null;
}

export interface ReceiptFilters {
  status: string | null;
  from: string | null;
  to: string | null;
  dateField: ReceiptDateField;
  dateColumn: 'transaction_at' | 'created_at';
  email: string | null;
  jobId: string | null;
  q: string | null;
  category: string | null;
  paymentMethod: string | null;
  last4: string | null;
  cardId: string | null;
  includeDeleted: boolean;
  limit: number;
  /** True when anything narrows the set beyond the defaults — drives the "you are looking at a
   *  filtered list" affordance, without which a missing receipt reads as a deleted one. */
  isNarrowed: boolean;
}

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 500;

const trimOrNull = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
  return s.length > 0 ? s : null;
};

/** Accept the several spellings of yes that arrive from a URL, a checkbox and a curl. */
export function truthy(raw: unknown): boolean {
  const s = String(raw ?? '').toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

/**
 * The last four digits of whatever the user typed.
 *
 * People type card numbers in every shape there is: `4824`, `**** 4824`, `4111-1111-1111-4824`.
 * Taking the last four DIGITS handles all of them, and means somebody can paste a full card number
 * without us ever storing or matching on more than the last four — which is the only part the
 * receipt itself carries.
 *
 * Returns null unless exactly four digits can be produced, so a stray keystroke does not silently
 * filter the list down to nothing.
 */
export function normaliseLast4(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D+/g, '');
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

/**
 * Escape a value for PostgREST's `ilike` inside an `.or()` list.
 *
 * `,` and `.` are the separators PostgREST parses in an `or` expression, and `%`/`_` are wildcards.
 * A vendor called "Smith, Jones & Co." or an address with a comma would otherwise be read as extra
 * filter terms — which does not error, it just quietly returns the wrong rows.
 */
export function escapeForOrIlike(value: string): string {
  return value.replace(/[%_]/g, (c) => `\\${c}`).replace(/[,().]/g, ' ');
}

/** Resolve raw query input into the filters the route applies. Pure. */
export function parseReceiptFilters(input: ReceiptFilterInput): ReceiptFilters {
  const rawDateField = trimOrNull(input.dateField);
  // Anything unrecognised falls back to `recorded`, which is what the endpoint has always done —
  // changing the default would silently move every existing caller's results.
  const dateField: ReceiptDateField = rawDateField === 'purchase' ? 'purchase' : 'recorded';

  const rawLimit = Number(input.limit ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.trunc(rawLimit)))
    : DEFAULT_LIMIT;

  const f: Omit<ReceiptFilters, 'isNarrowed'> = {
    status: trimOrNull(input.status),
    from: trimOrNull(input.from),
    to: trimOrNull(input.to),
    dateField,
    dateColumn: DATE_COLUMN[dateField],
    email: trimOrNull(input.email),
    jobId: trimOrNull(input.jobId),
    q: trimOrNull(input.q),
    category: trimOrNull(input.category),
    paymentMethod: trimOrNull(input.paymentMethod),
    last4: normaliseLast4(input.last4),
    cardId: trimOrNull(input.cardId),
    includeDeleted: Boolean(input.includeDeleted),
    limit,
  };

  // A date range alone is NOT "narrowed": the queue opens on the current month by default, and
  // calling that a filter would put a "you are filtering" banner on the ordinary view forever.
  const isNarrowed = Boolean(
    f.email || f.jobId || f.q || f.category || f.paymentMethod || f.last4 || f.cardId,
  );

  return { ...f, isNarrowed };
}

/** One `.or()` expression matching free text against vendor name and address, or null when there
 *  is nothing to search for. */
export function vendorSearchExpression(q: string | null): string | null {
  if (!q) return null;
  const safe = escapeForOrIlike(q);
  if (!safe.trim()) return null;
  return `vendor_name.ilike.%${safe}%,vendor_address.ilike.%${safe}%`;
}

/** A short human sentence naming what is being shown. Empty when nothing is narrowed. */
export function describeFilters(f: ReceiptFilters, cardLabel?: string | null): string[] {
  const out: string[] = [];
  if (f.q) out.push(`matching “${f.q}”`);
  if (f.category) out.push(`category ${f.category}`);
  if (f.paymentMethod) out.push(`paid by ${f.paymentMethod}`);
  if (f.cardId) out.push(cardLabel ? `on ${cardLabel}` : 'on one saved card');
  if (f.last4 && !f.cardId) out.push(`card ending ${f.last4}`);
  if (f.jobId) out.push('on one job');
  if (f.email) out.push(`from ${f.email}`);
  if (f.from || f.to) {
    const basis = f.dateField === 'purchase' ? 'purchased' : 'recorded';
    if (f.from && f.to) out.push(`${basis} ${f.from} to ${f.to}`);
    else if (f.from) out.push(`${basis} on or after ${f.from}`);
    else out.push(`${basis} on or before ${f.to}`);
  }
  return out;
}
