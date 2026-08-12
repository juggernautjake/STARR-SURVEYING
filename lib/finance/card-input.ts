// lib/finance/card-input.ts — validating a card before it reaches the registry.
//
// `payment_cards` (seed 572) already refuses the two rows that would be worse than no row at all:
// digits that are not four digits, and a personal card with nobody's name on it. Those CHECK
// constraints are the floor and they stay — the API is not the only thing that can write this table.
//
// This exists because a constraint violation arrives as *'new row for relation "payment_cards"
// violates check constraint "payment_cards_personal_needs_holder"'*, and that sentence, shown to a
// bookkeeper, is indistinguishable from the site being broken. The same rules stated here produce a
// sentence that names the field and what to do about it — and, being pure, can be tested without a
// database.
//
// The normalisation matters as much as the rejection:
//
//   * **last4 is stripped to digits.** People type "···· 4054", "x4054", "**** 4054" — all of which
//     are the same card and none of which match `^[0-9]{4}$`. Rejecting them teaches the user to
//     fight the form; taking the digits is what they meant.
//   * **empty strings become NULL.** A form posts `""` for a field nobody filled in, and `''` is not
//     absence — it satisfies `holder_name IS NOT NULL` while telling us nothing, which would let a
//     personal card through with an empty payee and defeat the constraint entirely.

import type { CardRole } from './payment-cards';

const ROLES: readonly CardRole[] = ['COMPANY', 'OWNER_PERSONAL', 'EMPLOYEE_PERSONAL', 'CLIENT', 'UNKNOWN'];

/** Roles where "whose card is this?" has an answer that must be recorded. */
const PERSONAL_ROLES: readonly CardRole[] = ['OWNER_PERSONAL', 'EMPLOYEE_PERSONAL'];

export interface CardInput {
  last4?: unknown;
  brand?: unknown;
  label?: unknown;
  role?: unknown;
  holder_name?: unknown;
  holder_user_id?: unknown;
  notes?: unknown;
}

/** Exactly the columns to write. Absent keys are left alone on an edit. */
export interface CardValues {
  last4?: string;
  brand?: string | null;
  label?: string | null;
  role?: CardRole;
  holder_name?: string | null;
  holder_user_id?: string | null;
  notes?: string | null;
}

export type CardInputResult =
  | { ok: true; values: CardValues }
  | { ok: false; error: string };

/** Trim, and treat blank as absent. See the header — `''` is not an answer. */
function text(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/** "···· 4054", "x4054", "4054" all mean 4054. */
function digitsOnly(v: unknown): string | null {
  const t = text(v);
  if (t === null) return null;
  const d = t.replace(/\D/g, '');
  return d === '' ? null : d;
}

/**
 * Validate and normalise a card as typed by a person.
 *
 * `mode` matters because the two operations ask different questions. Creating a card must establish
 * the digits — a card with no number is not a card. Editing one must NOT require them again: a PATCH
 * that only changes the role should not have to resend fields it is not touching, and demanding them
 * is how an edit form quietly overwrites a field the user never looked at.
 *
 * `currentRole` / `currentHolder` describe the row as it stands, so an edit can be checked against
 * the row it will PRODUCE rather than the fields it happens to mention. Setting a card to
 * OWNER_PERSONAL when a holder is already recorded is valid; the same change on a card with no
 * holder is not, and only the merged view can tell them apart.
 */
export function validateCardInput(
  input: CardInput,
  opts: { mode: 'create' | 'edit'; currentRole?: CardRole; currentHolder?: string | null } = { mode: 'create' },
): CardInputResult {
  const values: CardValues = {};

  const last4 = digitsOnly(input.last4);
  if (opts.mode === 'create' || input.last4 !== undefined) {
    if (last4 === null) {
      return { ok: false, error: 'Enter the last four digits printed on the card.' };
    }
    if (last4.length !== 4) {
      // Naming what was received is the difference between a form you can fix and one you retry.
      return { ok: false, error: `“${last4}” is ${last4.length} digit${last4.length === 1 ? '' : 's'} — the card number must be the last four.` };
    }
    values.last4 = last4;
  }

  if (input.role !== undefined) {
    const role = text(input.role);
    if (role === null || !ROLES.includes(role as CardRole)) {
      return { ok: false, error: 'Choose what kind of card this is.' };
    }
    values.role = role as CardRole;
  } else if (opts.mode === 'create') {
    // Deliberate: an unanswered card is UNKNOWN, which the registry surfaces as a question. It is
    // never guessed at as COMPANY, because a card assumed to be the company's is one whose charges
    // are booked as expenses without anybody deciding that.
    values.role = 'UNKNOWN';
  }

  if (input.brand !== undefined) values.brand = text(input.brand);
  if (input.label !== undefined) values.label = text(input.label);
  if (input.notes !== undefined) values.notes = text(input.notes);
  if (input.holder_name !== undefined) values.holder_name = text(input.holder_name);
  if (input.holder_user_id !== undefined) values.holder_user_id = text(input.holder_user_id);

  // Check the row that will EXIST, not the fields that were sent.
  const finalRole = values.role ?? opts.currentRole ?? 'UNKNOWN';
  const finalHolder = input.holder_name !== undefined
    ? values.holder_name
    : (opts.currentHolder ?? null);
  const finalHolderId = values.holder_user_id ?? null;

  if (PERSONAL_ROLES.includes(finalRole) && !finalHolder && !finalHolderId) {
    return {
      ok: false,
      // The constraint's reason, not its name. A reimbursement with no payee is a debt to nobody.
      error: 'A personal card has to say whose it is — the charges on it are money owed back to that person.',
    };
  }

  return { ok: true, values };
}
