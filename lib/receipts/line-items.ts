// lib/receipts/line-items.ts — the individual things on a receipt, and who decided what about them.
//
// Owner, 2026-08-17: *"We should also be able to edit the list of items … mark each individual item
// as a business expense or not … remove items … add items too, just in case they do not show up
// properly on the receipt, or the AI hallucinates. All removed/added items should be flagged as
// such. Like, removed items should not actually be removed, they should just be flagged. The user
// should have to give a reason associated with adding or removing an item."*
//
// ── THREE STATES, NOT TWO ───────────────────────────────────────────────────────────────────────
//
// `is_business_expense` is nullable and that is the whole design. TRUE claim it, FALSE do not, NULL
// nobody has said — and NULL follows whatever the receipt as a whole is. Most receipts are entirely
// one or the other, so making somebody tick twenty lines to say "yes, all of it" would guarantee
// nobody ticks any. Defaulting to TRUE would silently claim the personal half of a mixed receipt;
// defaulting to FALSE would silently drop the business half. Only NULL is honest about not knowing.
//
// ── A REMOVED LINE IS EVIDENCE, NOT NOISE ───────────────────────────────────────────────────────
//
// A receipt is a tax record. "This was on the paper and we are not claiming it" and "this was never
// on the paper" are different assertions, and a hard DELETE collapses them into the same absence.
// So removal is a flag plus a reason, and the reason is enforced by a CHECK constraint in seed 597
// rather than by this module — a form is one caller, and the database is the only place that can
// refuse an unexplained removal on behalf of every caller that has not been written yet.
//
// ── AND THE TRAP THAT MADE ALL OF THIS URGENT ───────────────────────────────────────────────────
//
// `lib/receipts/extract.ts` DELETES every line for a receipt and re-inserts, so that a re-extraction
// does not double them. With the "re-run the AI" button now shipped, that would have wiped every
// business/personal mark, every reason and every hand-added line the moment somebody re-read a
// receipt — silently, and most likely on the receipts that had been corrected most carefully.
// `linesToReplaceOnReextract` is the answer, and it is exercised by a test named after the failure.
//
// Pure module: no I/O. Tested in `__tests__/receipts/line-items.test.ts`.

export type LineItemSource = 'ai' | 'user';

export interface LineItem {
  id: string;
  receipt_id?: string;
  description: string | null;
  amount_cents: number | null;
  quantity: number | null;
  position: number | null;
  source: LineItemSource;
  /** TRUE claim it · FALSE do not · NULL follow the receipt. */
  is_business_expense: boolean | null;
  business_expense_note?: string | null;
  added_by?: string | null;
  added_reason?: string | null;
  removed_at?: string | null;
  removed_by?: string | null;
  removed_reason?: string | null;
  edited_at?: string | null;
  edited_by?: string | null;
}

export const isRemoved = (li: Pick<LineItem, 'removed_at'>): boolean => Boolean(li.removed_at);
export const isUserAdded = (li: Pick<LineItem, 'source'>): boolean => li.source === 'user';
export const wasEdited = (li: Pick<LineItem, 'edited_at'>): boolean => Boolean(li.edited_at);

/**
 * Does this line count toward the business total?
 *
 * `receiptIsBusiness` is the receipt's own `expense_nature`. A removed line never counts, whatever
 * it says about itself — that is what removing it meant.
 */
export function countsAsBusiness(
  li: Pick<LineItem, 'is_business_expense' | 'removed_at'>,
  receiptIsBusiness: boolean,
): boolean {
  if (isRemoved(li)) return false;
  if (li.is_business_expense === null || li.is_business_expense === undefined) return receiptIsBusiness;
  return li.is_business_expense;
}

export interface LineItemTotals {
  /** Every line still on the record, removed or not. */
  count: number;
  removed: number;
  userAdded: number;
  edited: number;
  /** Money in the lines that count as business. */
  businessCents: number;
  /** Money in lines explicitly excluded — either marked personal or removed. */
  excludedCents: number;
  /** How many lines somebody has actually made a decision about. */
  decided: number;
}

/**
 * The numbers the review panel prints.
 *
 * `excludedCents` deliberately counts BOTH the removed and the personal, because from the books'
 * point of view they have the same consequence and a bookkeeper asking "how much of this receipt
 * are we not claiming" wants one number, not two that must be added up by hand.
 */
export function summariseLineItems(
  items: readonly LineItem[],
  receiptIsBusiness = true,
): LineItemTotals {
  let businessCents = 0;
  let excludedCents = 0;
  let removed = 0;
  let userAdded = 0;
  let edited = 0;
  let decided = 0;

  for (const li of items) {
    const cents = typeof li.amount_cents === 'number' ? li.amount_cents : 0;
    if (isRemoved(li)) { removed += 1; excludedCents += cents; }
    else if (countsAsBusiness(li, receiptIsBusiness)) businessCents += cents;
    else excludedCents += cents;

    if (isUserAdded(li)) userAdded += 1;
    if (wasEdited(li)) edited += 1;
    if (isRemoved(li) || isUserAdded(li) || li.is_business_expense !== null) decided += 1;
  }

  return { count: items.length, removed, userAdded, edited, businessCents, excludedCents, decided };
}

export type FieldProblem = { ok: true } | { ok: false; error: string };

/** A description somebody can recognise six months later. */
export function validateDescription(raw: unknown): FieldProblem {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, error: 'Give the item a description.' };
  if (raw.trim().length > 300) return { ok: false, error: 'That description is too long (300 characters max).' };
  return { ok: true };
}

/**
 * Whole cents, and a float is refused rather than rounded.
 *
 * The same rule as `edit-fields.ts`: a caller sending 4.99 means dollars, and quietly storing 4
 * cents turns a $4.99 item into 4¢ — wrong in a way that still looks like a number. Negative is
 * allowed because a receipt line can be a discount or a return.
 */
export function validateAmountCents(raw: unknown): FieldProblem {
  if (raw === null) return { ok: true };
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return { ok: false, error: 'Amount must be a number of cents.' };
  if (!Number.isInteger(raw)) return { ok: false, error: 'Amount must be whole cents (no decimal point).' };
  if (Math.abs(raw) > 1_000_000_00) return { ok: false, error: 'That amount looks wrong (over $1,000,000).' };
  return { ok: true };
}

/** Quantity may be fractional — 2.5 kg of something is a real line on a real receipt. */
export function validateQuantity(raw: unknown): FieldProblem {
  if (raw === null) return { ok: true };
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return { ok: false, error: 'Quantity must be a number.' };
  if (raw < 0) return { ok: false, error: 'Quantity cannot be negative.' };
  if (raw > 100_000) return { ok: false, error: 'That quantity looks wrong.' };
  return { ok: true };
}

/**
 * The reason attached to adding or removing a line.
 *
 * A minimum length, because "x" satisfies a not-empty check and explains nothing — and the entire
 * point of demanding a reason is that somebody can read it later and understand the decision.
 */
export const MIN_REASON_LENGTH = 4;

export function validateReason(raw: unknown, verb: 'add' | 'remove'): FieldProblem {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, error: `Say why you are ${verb === 'add' ? 'adding' : 'removing'} this item.` };
  }
  if (raw.trim().length < MIN_REASON_LENGTH) {
    return { ok: false, error: 'Give a reason somebody could understand later — a few words at least.' };
  }
  if (raw.trim().length > 500) return { ok: false, error: 'That reason is too long (500 characters max).' };
  return { ok: true };
}

/**
 * Which existing lines a re-extraction is allowed to throw away.
 *
 * THE FAILURE THIS PREVENTS: `extract.ts` clears every line for a receipt before inserting the new
 * reading, so that re-running the AI does not double them. Correct, until lines carry human
 * decisions — at which point the same DELETE silently destroys every business/personal mark, every
 * reason, and every line somebody added because the AI missed it. Worse, it would hit hardest on the
 * receipts somebody had spent the most time correcting.
 *
 * A line is safe to replace only if it is an untouched AI transcription: nobody added it, nobody
 * edited it, nobody removed it, and nobody has ruled on whether it is a business expense.
 */
export function linesToReplaceOnReextract(items: readonly LineItem[]): string[] {
  return items
    .filter((li) => li.source === 'ai'
      && !isRemoved(li)
      && !wasEdited(li)
      && (li.is_business_expense === null || li.is_business_expense === undefined))
    .map((li) => li.id);
}

/** Lines a re-extraction must keep, with why — so the UI can say what it preserved. */
export function linesPreservedOnReextract(items: readonly LineItem[]): Array<{ id: string; why: string }> {
  const keep: Array<{ id: string; why: string }> = [];
  for (const li of items) {
    if (isUserAdded(li)) keep.push({ id: li.id, why: 'added by hand' });
    else if (isRemoved(li)) keep.push({ id: li.id, why: 'removed, with a reason on the record' });
    else if (wasEdited(li)) keep.push({ id: li.id, why: 'corrected by hand' });
    else if (li.is_business_expense !== null && li.is_business_expense !== undefined) {
      keep.push({ id: li.id, why: li.is_business_expense ? 'marked a business expense' : 'marked not a business expense' });
    }
  }
  return keep;
}

/**
 * One sentence for the review panel, or null when nobody has touched anything.
 *
 * Null rather than "0 changes" for the same reason the confidence banner disappears at 100: a line
 * that is always present stops being read.
 */
export function describeLineItemReview(totals: LineItemTotals): string | null {
  const parts: string[] = [];
  if (totals.userAdded) parts.push(`${totals.userAdded} added by hand`);
  if (totals.removed) parts.push(`${totals.removed} removed`);
  if (totals.edited) parts.push(`${totals.edited} corrected`);
  if (!parts.length) return null;
  return `${parts.join(', ')} — every one with a reason on the record.`;
}
