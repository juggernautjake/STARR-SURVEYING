// lib/time-tracking/clock-eligibility.ts
//
// Who clocks in.
//
// ── C0g (2026-08-15): THIS WAS `lib/hub/work-mode-eligibility.ts` ───────────────────────────────
//
// Work Mode is retired (D8), and the obvious move was to delete this with it. That would have been
// wrong, and the reason is worth keeping: the predicate never actually meant "can enter Work Mode".
// It means **"is this person staff who work shifts"** — and its surviving caller is the site-wide
// clock-in pill, which uses it to decide whether to render at all. Students and teachers do not
// clock in; field crew, drafters, researchers, equipment managers and support do.
//
// The old name described the first thing it happened to gate rather than what it decides, so
// deleting the shell made the name a lie without changing the logic underneath. Renamed and moved
// beside the clock it serves; the role set and the semantics are untouched.

import type { UserRole } from '@/lib/auth';

/** Roles that clock in and out. `admin` and `developer` are included so they can use and test the
 *  clock like anyone else. */
export const CLOCKABLE_ROLES: ReadonlySet<UserRole> = new Set<UserRole>([
  'admin',
  'developer',
  'field_crew',
  'drawer',
  'researcher',
  'equipment_manager',
  'tech_support',
]);

/** True when ANY role in `userRoles` clocks in. */
export function isClockEligible(userRoles: UserRole[] | null | undefined): boolean {
  if (!userRoles || userRoles.length === 0) return false;
  for (const r of userRoles) {
    if (CLOCKABLE_ROLES.has(r)) return true;
  }
  return false;
}

/** The subset of `userRoles` that clock in. */
export function clockableRoles(userRoles: UserRole[] | null | undefined): UserRole[] {
  if (!userRoles) return [];
  return userRoles.filter((r) => CLOCKABLE_ROLES.has(r));
}
