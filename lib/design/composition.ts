// lib/design/composition.ts — which composition a given viewer sees, and nothing else.
//
// W1 of docs/planning/in-progress/DESIGN_STUDIO_SERVES_PAGES_2026-08-24.md.
//
// ── THE WHOLE POINT OF THIS FILE BEING A FILE ───────────────────────────────────────────────────
//
// §8 settled that a composition has three possible audiences and that the most specific one wins:
//
//     user  →  role  →  firm  →  the hand-built page
//
// A fallthrough chain is trivial to write and trivial to write SLIGHTLY differently. Written twice,
// the two copies disagree about one case — usually a viewer with several roles, or an empty
// `scope_key` — and the symptom is not an error. It is the wrong portal, for one group of people,
// silently, with everything looking saved.
//
// This session has produced four bugs of exactly that shape (`defaultFor`, `getDossier`,
// `selectedStateKey`, the `stateKey` column mapping) and every one of them was two ends answering
// one question with two rules that were nearly the same. So the rule lives here, once, pure and
// tested, and every reader calls it. Nothing else may query the table for a composition.
//
// ── AND WHY THE RESOLUTION IS PURE ──────────────────────────────────────────────────────────────
//
// It takes rows and a viewer and returns a row. It does not fetch. That is what lets the hard part
// — the precedence — be tested without a database, and it is the reason the tie-breaks below can be
// pinned to specific examples rather than described in a comment and hoped for.

import type { UserRole } from '@/lib/auth-roles';
import type { CompositionScope, DesignKind } from './document';

// The vocabulary lives in `document.ts` — the module everything imports, kept dependency-free so
// nothing can cycle through it. This file owns the RULES about those values, not the values.
export type { CompositionScope, DesignKind };

/** Every scope, most-specific-first. This order IS the cascade, written down once. */
export const SCOPES: readonly CompositionScope[] = ['user', 'role', 'firm'];

export interface CompositionRow {
  id: string;
  route: string | null;
  stateKey: string;
  kind: DesignKind;
  scope: CompositionScope;
  /** The role name or the email. Empty for firm scope — see seed 618's check constraint. */
  scopeKey: string;
  /** Later is more recent. Used only to break a tie between two rows of equal specificity. */
  updatedAt?: string | null;
}

export interface Viewer {
  email: string | null;
  /**
   * Every role this person holds.
   *
   * A list rather than one role, because this app genuinely gives people several — an owner who is
   * also an employee is the normal case, not the edge one. Which is why `roleRank` exists below: a
   * viewer matching two role compositions needs an answer that is the same every time.
   */
  roles: string[];
}

/**
 * Role precedence, most authoritative first.
 *
 * ── WHY THERE IS AN ORDER AT ALL ────────────────────────────────────────────────────────────────
 *
 * A viewer with `['employee', 'admin']` matches both an employee composition and an admin one, and
 * "whichever the database returned first" is not an answer — it changes between runs, and the
 * complaint it produces is "the receipts page looks different on my other laptop".
 *
 * Sorting alphabetically would be stable and wrong: `admin` would beat `finance` and `developer`,
 * so the person with the most authority would see the most restricted layout.
 *
 * ── AND WHY IT IS SPELLED IN THIS APP'S ACTUAL ROLE NAMES ───────────────────────────────────────
 *
 * The first draft of this list said `owner`, `manager` and `marketing`. **None of those roles
 * exists.** The vocabulary is `ALL_ROLES` in `lib/auth-roles.ts` and it has twelve entries, none of
 * them those three — so the ordering would have been an opinion about an imaginary hierarchy, and
 * every real role would have tied at "unranked". Written in units nobody produces, which is a
 * defect shape this codebase has hit before.
 *
 * So it is derived from `ALL_ROLES` and the order is asserted exhaustive by a test: adding a role
 * without deciding where it sits fails loudly, rather than silently ranking it last.
 */
const ROLE_ORDER: readonly UserRole[] = [
  // Can see and change anything, including this.
  'developer',
  'admin',
  // Sees money. Deliberately above the operational roles: `finance` exists precisely because
  // `admin` was too broad an answer to "who may look at what somebody earns".
  'finance',
  'equipment_manager',
  // The teaching side. A teacher's view of a page is the authored one; a student's is the taught one.
  'teacher',
  'researcher',
  // The people doing the work. `field_crew` above `employee` because it is the narrower claim.
  'drawer',
  'field_crew',
  'employee',
  'tech_support',
  'student',
  // Least specific real role. Anything a guest can see, everyone can.
  'guest',
];

/**
 * Lower is more authoritative. An unknown role ranks last rather than throwing — a role this file
 * has not heard of should degrade to "less specific than the ones we know about", not break every
 * portal in the product until somebody edits it.
 */
export function roleRank(role: string): number {
  const i = (ROLE_ORDER as readonly string[]).indexOf(role.toLowerCase());
  return i === -1 ? ROLE_ORDER.length : i;
}

/** Exported for the test that keeps it in step with `ALL_ROLES`. */
export const ROLE_PRECEDENCE = ROLE_ORDER;

/** Does this row apply to this viewer at all? */
function applies(row: CompositionRow, viewer: Viewer): boolean {
  if (row.kind !== 'composition') return false;
  if (row.scope === 'firm') return true;
  if (row.scope === 'user') {
    // Case-insensitive, because an email is. A composition saved for `Jacob@…` that does not apply
    // to `jacob@…` is a composition that appears to have been discarded on save.
    return !!viewer.email && row.scopeKey.toLowerCase() === viewer.email.toLowerCase();
  }
  return viewer.roles.some((r) => r.toLowerCase() === row.scopeKey.toLowerCase());
}

/** How specific this row is to this viewer. Lower is more specific. */
function specificity(row: CompositionRow, viewer: Viewer): number {
  if (row.scope === 'user') return 0;
  if (row.scope === 'firm') return 10_000;
  // Roles sit between the two, ordered among themselves by the hierarchy above. Offset by one so a
  // role can never tie with a user composition, and kept well below the firm's number so the most
  // junior role still beats "everyone".
  return 1 + Math.min(...viewer.roles
    .filter((r) => r.toLowerCase() === row.scopeKey.toLowerCase())
    .map(roleRank));
}

/**
 * The one composition this viewer should be served for this route and state, or null.
 *
 * Null means "fall back to the hand-built page", which is always a correct answer — a portal with
 * no composition is the portal as it was written, and that is a working page. This function never
 * throws and never guesses: an empty result is a real answer, not a failure.
 */
export function resolveComposition(
  rows: CompositionRow[],
  viewer: Viewer,
  route: string,
  stateKey = '',
): CompositionRow | null {
  const candidates = rows
    .filter((r) => r.route === route && r.stateKey === stateKey && applies(r, viewer));
  if (!candidates.length) return null;

  return candidates.reduce((best, row) => {
    const a = specificity(row, viewer);
    const b = specificity(best, viewer);
    if (a !== b) return a < b ? row : best;
    // Equal specificity means two rows for the same audience, which seed 618 does not forbid — a
    // firm can have a draft composition beside a published one. Newest wins, and `id` breaks the
    // tie after that so the answer is the same on every call rather than depending on row order.
    const at = row.updatedAt ?? '';
    const bt = best.updatedAt ?? '';
    if (at !== bt) return at > bt ? row : best;
    return row.id > best.id ? row : best;
  });
}

/**
 * What the editor must say out loud while somebody is editing.
 *
 * ── WHY THIS IS IN THIS FILE ────────────────────────────────────────────────────────────────────
 *
 * The most likely way this whole design fails is not the cascade being wrong. It is somebody
 * rearranging the receipts portal, saving, and having changed it only for themselves — or only for
 * admins — and finding out weeks later. The scope has to be visible at the moment of editing, in
 * words, and the words have to come from the same place the rule does. A label written next to the
 * save button is a second description of the schema, and second descriptions drift.
 */
export function scopeLabel(scope: CompositionScope, scopeKey: string): string {
  if (scope === 'firm') return 'Everyone at this company';
  if (scope === 'user') return `Only ${scopeKey}`;
  return `Anyone whose role is ${scopeKey}`;
}

export function scopeMeaning(scope: CompositionScope, scopeKey: string): string {
  if (scope === 'firm') {
    return 'Saving changes this page for every person who does not have a version of their own, or '
      + 'one for their role.';
  }
  if (scope === 'user') {
    return `Saving changes this page for ${scopeKey} and nobody else. Everyone else keeps the `
      + 'company version.';
  }
  return `Saving changes this page for people with the ${scopeKey} role. Someone who also has a `
    + 'more senior role sees that one instead.';
}
