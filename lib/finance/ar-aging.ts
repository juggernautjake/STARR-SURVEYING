// lib/finance/ar-aging.ts — the receivables aging vocabulary (audit §3, Phase 2 item 11).
//
// Lifted out of the route handler, which may export only its handlers: Next.js type-checks generated
// route types against a "no other exports" constraint, and a stray `export const BUCKETS` fails the
// production build. The page that renders the table needs the same order and the same labels, so
// they belong in a module both can import rather than in whichever of them declared them first.

export type AgingBucket = 'current' | '1_30' | '31_60' | '61_90' | '90_plus' | 'no_terms';

export interface AgingRow {
  id: string;
  invoice_number: string;
  job_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  total_cents: number;
  paid_cents: number;
  balance_cents: number;
  issued_at: string | null;
  due_at: string | null;
  status: string;
  days_overdue: number | null;
  bucket: AgingBucket;
}

/** Order matters: an accountant reads left to right, worst on the right. */
export const BUCKETS: AgingBucket[] = ['current', '1_30', '31_60', '61_90', '90_plus', 'no_terms'];

export const BUCKET_LABEL: Record<AgingBucket, string> = {
  current: 'Current',
  '1_30': '1–30 days',
  '31_60': '31–60 days',
  '61_90': '61–90 days',
  '90_plus': '90+ days',
  // Not a bucket so much as a warning: an invoice with no due date can never be overdue, so it will
  // never appear in a collections list and never be chased. Surfaced rather than hidden among
  // "current", which is where it would otherwise sit forever.
  no_terms: 'No due date set',
};
