// lib/hub/work-mode-eligibility.ts
//
// Decides whether the "Enter Work Mode" button should render on the
// hub greeting card. Slice 88 ships the placeholder render + the
// eligibility check; Slice 157 fans this out into role-specific
// destinations.
//
// A user is eligible if they hold AT LEAST ONE of the work-mode
// roles. Students + teachers don't get work mode per the planning
// doc (§6.1) — they use the hub directly.

import type { UserRole } from '@/lib/auth';

/** Roles that get a Work Mode tile in the role picker. `admin` is in
 *  here so admins can use any work mode for previewing / training. */
export const WORK_MODE_ROLES: ReadonlySet<UserRole> = new Set<UserRole>([
  'admin',
  'developer',
  'field_crew',
  'drawer',
  'researcher',
  'equipment_manager',
  'tech_support',
]);

/** True when ANY role in `userRoles` is in `WORK_MODE_ROLES`. */
export function isWorkModeEligible(userRoles: UserRole[] | null | undefined): boolean {
  if (!userRoles || userRoles.length === 0) return false;
  for (const r of userRoles) {
    if (WORK_MODE_ROLES.has(r)) return true;
  }
  return false;
}

/** Returns the subset of `userRoles` that have a Work Mode. Used by
 *  the role-picker (Slice 157) to decide between fast-path and tile
 *  selection. */
export function eligibleWorkModeRoles(userRoles: UserRole[] | null | undefined): UserRole[] {
  if (!userRoles) return [];
  return userRoles.filter((r) => WORK_MODE_ROLES.has(r));
}
