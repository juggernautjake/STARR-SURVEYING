// lib/employee-pond/activity-history.ts
//
// employee-pond Slice E13 — typed shapes + table-name constants for
// the three new activity-history tables (employee_bonuses,
// employee_salary_history, payout_batch_items). E14 consumes these
// to render the admin "everything" page + the employee's own "My
// history" page.
//
// All amounts are stored in CENTS to dodge floating-point
// bookkeeping. The `formatCents` helper here is the canonical
// dollar-string formatter so every surface shows currency the
// same way.

export const ACTIVITY_TABLES = {
  bonuses: 'employee_bonuses',
  salary: 'employee_salary_history',
  // The payout ledger, since C-16 (2026-08-04). `employee_payouts` was a second, strictly weaker
  // copy — no batch, no approval, no status — and the history route now reads this one through
  // `lib/payroll/payout-ledger.ts`. This constant is what the page cites as its sources, so it has
  // to name the table actually read, or the footnote lies about where the numbers came from.
  payouts: 'payout_batch_items',
} as const satisfies Record<string, string>;

export type ActivityTable = (typeof ACTIVITY_TABLES)[keyof typeof ACTIVITY_TABLES];

export interface EmployeeBonus {
  id: string;
  user_email: string;
  amount_cents: number;
  reason: string;
  awarded_by: string | null;
  awarded_at: string;
  related_job_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeSalaryHistoryRow {
  id: string;
  user_email: string;
  base_hourly_rate_cents: number | null;
  base_annual_salary_cents: number | null;
  effective_from: string;
  effective_to: string | null;
  changed_by: string | null;
  change_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// This declared a FOURTH method vocabulary under the same type name as two others, including a
// `direct_deposit` that appears in no database row and no other list. Re-exported from the one
// place instead: two types sharing a name and disagreeing is worse than either of them.
export { type PayoutMethod } from '../payouts/methods.js';
import type { PayoutMethod } from '../payouts/methods.js';

export interface PayoutLineItem {
  /** Free-text label so payroll runs that introduce a new line
   *  item don't require a schema change. */
  label: string;
  /** Signed cents — positive for earnings, negative for
   *  deductions / taxes. */
  amount_cents: number;
  /** Optional hours associated with the line (regular / OT). */
  hours?: number;
}

export interface EmployeePayout {
  id: string;
  user_email: string;
  period_start: string;
  period_end: string;
  gross_cents: number;
  net_cents: number;
  items: PayoutLineItem[];
  paid_at: string;
  method: PayoutMethod;
  reference: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Canonical currency formatter for the activity history surfaces.
 *  Returns a USD string with comma separators ("$1,234.50"). Pure;
 *  used by both the admin everything-page and the employee my-
 *  history page. */
export function formatCents(cents: number | null | undefined): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '—';
  const dollars = cents / 100;
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

/** Hours-as-decimal formatter. 41.5 hours, 8.25 hours, etc. */
export function formatHours(hours: number | null | undefined): string {
  if (typeof hours !== 'number' || !Number.isFinite(hours)) return '—';
  return `${hours.toLocaleString('en-US', {
    maximumFractionDigits: 2,
  })} hr${Math.abs(hours) === 1 ? '' : 's'}`;
}

/** Pure helper — given the rows for the current user's salary
 *  history, returns the CURRENT row (`effective_to IS NULL` or
 *  the most recent if everything has an end). */
export function currentSalaryRow(
  rows: EmployeeSalaryHistoryRow[],
): EmployeeSalaryHistoryRow | null {
  if (rows.length === 0) return null;
  const open = rows.find((r) => r.effective_to == null);
  if (open) return open;
  // Fallback — return the row with the latest effective_from.
  return rows
    .slice()
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
}

/** Pure helper — sum the bonuses_cents for "year-to-date" display
 *  on the admin everything-page summary. The cutoff is inclusive. */
export function sumBonusesSince(
  bonuses: EmployeeBonus[],
  sinceIso: string,
): number {
  let total = 0;
  for (const b of bonuses) {
    if (b.awarded_at >= sinceIso) total += b.amount_cents;
  }
  return total;
}
