// lib/payments/rls-allowlist.ts
//
// P18 of payment-infrastructure-2026-06-18.md — canonical list of
// every payment-domain table + its expected RLS posture.
//
// Used by:
//   - the audit vitest spec (asserts every payment seed enables
//     RLS + adds the service-role policy)
//   - the runbook in docs/security/payments-pci-scope.md
//
// Schema: row contains the table name, the seed that creates it, a
// flag for whether the table accepts employee-self-read on its own
// rows (employee viewing own payout history / own ACH methods), and
// a one-line rationale.

export type RLSEmployeeSelfRead = 'none' | 'by_user_email';

export interface PaymentRlsRow {
  table: string;
  seed: string;
  employee_self_read: RLSEmployeeSelfRead;
  rationale: string;
}

export const PAYMENT_RLS_ALLOWLIST: ReadonlyArray<PaymentRlsRow> = [
  // P1 — invoices + receipts + intents (customer-facing rows)
  { table: 'invoices',             seed: '323_payment_foundations.sql', employee_self_read: 'none', rationale: 'Customer-facing; route-mediated by invoice_number / public_slug; never employee-self-read.' },
  { table: 'payments',             seed: '323_payment_foundations.sql', employee_self_read: 'none', rationale: 'Office reconciles; customer sees only sanitized PublicPaymentSummary via the route.' },
  { table: 'payment_intents',      seed: '323_payment_foundations.sql', employee_self_read: 'none', rationale: 'Stripe shadow rows; service-role only.' },
  { table: 'payment_attempts',     seed: '323_payment_foundations.sql', employee_self_read: 'none', rationale: 'Customer-initiated; service-role only — the route gates by invoice number on insert.' },
  { table: 'payment_receipts',     seed: '323_payment_foundations.sql', employee_self_read: 'none', rationale: 'Send audit log; service-role only.' },
  // P2 — employee_payment_methods (sensitive ACH + handles)
  { table: 'employee_payment_methods', seed: '324_employee_payment_methods.sql', employee_self_read: 'by_user_email', rationale: 'Employee can read their own row to verify the handle they registered; admin reads via service-role.' },
  // P11 — payout batches + items
  { table: 'payout_batches',       seed: '325_payout_batches.sql',      employee_self_read: 'none', rationale: 'Office-side; employee sees their own line via payout_batch_items + the per-employee API route.' },
  { table: 'payout_batch_items',   seed: '325_payout_batches.sql',      employee_self_read: 'by_user_email', rationale: 'Employee can read their own line — own payout history.' },
  // P17 — secret audit log (append-only paper trail)
  { table: 'payment_secret_reads', seed: '327_payment_secret_audit.sql', employee_self_read: 'none', rationale: 'Compliance officer reads via service-role; no employee-self-read — surveillance metadata stays internal.' },
];

/** Pure helper — return the canonical pattern an audit spec should
 *  expect in a seed file for a given allowlist row. */
export function expectedPolicyNamesForTable(table: string): string[] {
  const names: string[] = [`service_role_full_access_${table}`];
  const entry = PAYMENT_RLS_ALLOWLIST.find((r) => r.table === table);
  if (entry?.employee_self_read === 'by_user_email') {
    // employee_payment_methods uses a shorter name (predates the
    // table-name convention). We tolerate either.
    names.push(`employee_self_read_${table}`, 'employee_self_read_payment_methods');
  }
  return names;
}
