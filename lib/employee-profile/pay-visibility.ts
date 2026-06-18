// lib/employee-profile/pay-visibility.ts
//
// Slice EP6 — pure predicate for "can this signed-in user see
// someone else's pay info?" Lives outside the route so tests can
// import it without dragging next-auth into the vitest runtime.
//
// Self always passes the gate at the route level; this helper
// covers the "viewing someone else" branch.

const PAYROLL_ROLES = new Set(['admin', 'developer', 'tech_support']);

export function canSeeOthersPay(roles: string[] | null | undefined): boolean {
  if (!roles) return false;
  return roles.some((r) => PAYROLL_ROLES.has(r));
}
