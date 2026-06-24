// lib/hours/permissions.ts
//
// Pure permission predicates for employee time-log edits (slice H9 of
// the hours-correction plan). Centralizes the "which statuses can an
// employee still change?" rule so the API route and the UI agree and
// it's unit-testable. Admins are never gated by these — they can adjust
// any log (with a reason; the employee is notified).
//
//   pending   — submitted, awaiting review        → editable/deletable
//   rejected  — bounced back to fix and resubmit   → editable/deletable
//   approved  — locked in for pay                  → admin-only
//   adjusted  — a manager set the hours            → admin-only
//   disputed  — employee contested; admin resolves → admin-only

export const EMPLOYEE_EDITABLE_STATUSES = ['pending', 'rejected'] as const;

export type EmployeeEditableStatus = (typeof EMPLOYEE_EDITABLE_STATUSES)[number];

/** True when an employee may edit (PUT) their own log in this status. */
export function canEmployeeEdit(status: string | null | undefined): boolean {
  return status === 'pending' || status === 'rejected';
}

/** True when an employee may delete (DELETE) their own log in this status. */
export function canEmployeeDelete(status: string | null | undefined): boolean {
  // Same rule as edit today, kept separate so the two can diverge later
  // without re-touching every call site.
  return canEmployeeEdit(status);
}
