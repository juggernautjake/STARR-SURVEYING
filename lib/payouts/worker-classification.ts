// lib/payouts/worker-classification.ts
//
// G5 / Phase 2.1 of BUSINESS_GO_LIVE_FINANCE_PAYMENTS_2026-06-25 — pure helpers
// for W-2 vs 1099 worker classification on the payout tax report.
//
// Composes with the P16 aggregator (tax-report.ts) WITHOUT modifying its
// source-locked output: it takes EmployeeTaxRow[] + a per-email classification
// lookup (from registered_users.worker_classification, seed 382) and returns
// the W-2/1099 split plus the 1099-NEC reportables.
//
// The app does not make the legal W-2/1099 determination — the office sets each
// worker's classification; this just groups + flags so the tax preparer (or a
// payroll provider) gets clean numbers.

import type { EmployeeTaxRow } from './tax-report';

export type WorkerClassification = 'unclassified' | 'w2' | 'contractor_1099';

export const WORKER_CLASSIFICATIONS: readonly WorkerClassification[] = [
  'unclassified',
  'w2',
  'contractor_1099',
];

/** The IRS 1099-NEC reporting threshold: $600 in a calendar year. */
export const NEC_1099_THRESHOLD_CENTS = 60000;

/** Pure — coerce any stored/raw value to a valid classification. */
export function normalizeClassification(raw: string | null | undefined): WorkerClassification {
  return (WORKER_CLASSIFICATIONS as readonly string[]).includes(raw ?? '')
    ? (raw as WorkerClassification)
    : 'unclassified';
}

/** Pure — human label for the UI. */
export function classificationLabel(c: WorkerClassification): string {
  switch (c) {
    case 'w2':
      return 'W-2 employee';
    case 'contractor_1099':
      return '1099 contractor';
    default:
      return 'Unclassified';
  }
}

/** Pure — a 1099 contractor paid >= $600 in the window needs a 1099-NEC. */
export function is1099NecReportable(c: WorkerClassification, annualPaidCents: number): boolean {
  return c === 'contractor_1099' && annualPaidCents >= NEC_1099_THRESHOLD_CENTS;
}

export interface ClassifiedTaxRow extends EmployeeTaxRow {
  classification: WorkerClassification;
  /** 1099 contractor whose total in the window >= $600. */
  nec_reportable: boolean;
}

export interface ClassificationSummary {
  rows: ClassifiedTaxRow[];
  by_classification: Record<WorkerClassification, { count: number; total_cents: number }>;
  /** 1099 contractors who crossed the $600 NEC threshold this window. */
  nec_reportable: ClassifiedTaxRow[];
}

/** Pure — annotate each tax row with its classification + NEC flag and roll up
 *  per-classification totals. `classByEmail` keys are matched case-insensitively. */
export function classifyTaxRows(
  rows: ReadonlyArray<EmployeeTaxRow>,
  classByEmail: Readonly<Record<string, WorkerClassification | undefined>> = {},
): ClassificationSummary {
  const by_classification: Record<WorkerClassification, { count: number; total_cents: number }> = {
    unclassified: { count: 0, total_cents: 0 },
    w2: { count: 0, total_cents: 0 },
    contractor_1099: { count: 0, total_cents: 0 },
  };
  const rows_out: ClassifiedTaxRow[] = rows.map((row) => {
    const classification = normalizeClassification(classByEmail[row.user_email.toLowerCase()]);
    const nec_reportable = is1099NecReportable(classification, row.total_cents);
    by_classification[classification].count += 1;
    by_classification[classification].total_cents += Math.max(0, row.total_cents);
    return { ...row, classification, nec_reportable };
  });
  return {
    rows: rows_out,
    by_classification,
    nec_reportable: rows_out.filter((r) => r.nec_reportable),
  };
}
