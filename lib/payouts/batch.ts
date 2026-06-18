// lib/payouts/batch.ts
//
// P11 of payment-infrastructure-2026-06-18.md — pure helpers for the
// weekly payout batch wizard. Math + label building lives here so
// vitest can pin the contract without going through Supabase.

export interface BatchItemInput {
  hours_cents?: number;
  bonuses_cents?: number;
  reimbursements_cents?: number;
  adjustments_cents?: number;
}

/** Pure helper — clamp a single cents value to a non-negative
 *  integer. Adjustments are allowed to be negative (a clawback). */
function clampPositive(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}
function clampInt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.round(value);
}

/** Pure helper — per-line total. Hours + bonuses + reimbursements
 *  are always ≥ 0; adjustments can be negative. Final total is
 *  floored at 0 (negative payouts don't make sense). */
export function batchItemTotalCents(input: BatchItemInput): number {
  const sum = clampPositive(input.hours_cents)
    + clampPositive(input.bonuses_cents)
    + clampPositive(input.reimbursements_cents)
    + clampInt(input.adjustments_cents);
  return Math.max(0, sum);
}

/** Pure helper — sum every line's total to a batch grand total. */
export function batchTotalCents(items: ReadonlyArray<BatchItemInput>): number {
  return items.reduce((acc, item) => acc + batchItemTotalCents(item), 0);
}

/** Pure helper — friendly label like "Week 2026-06-15 → 2026-06-21".
 *  Built off the start date; doesn't try to localize because the
 *  office reads ISO weeks. */
export function buildBatchLabel(weekStart: Date, weekEnd: Date): string {
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return `Week ${fmt(weekStart)} → ${fmt(weekEnd)}`;
}

/** Pure helper — round a date to the most recent Monday (ISO week
 *  start) in UTC. The office builds the batch Friday afternoon for
 *  the week that just ended; this snaps "today" to the Monday of
 *  that week. */
export function snapToWeekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay(); // 0 = Sun, 1 = Mon, …
  const offset = (dow + 6) % 7; // Mon → 0, Sun → 6
  d.setUTCDate(d.getUTCDate() - offset);
  return d;
}

/** Pure helper — the Sunday after `snapToWeekStart`. */
export function snapToWeekEnd(start: Date): Date {
  const d = new Date(start);
  d.setUTCDate(d.getUTCDate() + 6);
  return d;
}

export interface NormalizedBatchItem {
  user_email: string;
  user_name: string | null;
  hours_cents: number;
  bonuses_cents: number;
  reimbursements_cents: number;
  adjustments_cents: number;
  total_cents: number;
  method: 'venmo' | 'cashapp' | 'zelle' | 'ach' | 'cash' | null;
  method_handle: string | null;
  notes: string | null;
}

const VALID_METHODS = new Set(['venmo', 'cashapp', 'zelle', 'ach', 'cash']);

/** Pure helper — normalize a request body row into the shape we
 *  store. Returns null when the row is missing the user_email or
 *  every cents column is zero (an empty row from the wizard). */
export function normalizeBatchItem(raw: unknown): NormalizedBatchItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const user_email = typeof r.user_email === 'string' ? r.user_email.trim().toLowerCase() : '';
  if (!user_email) return null;
  const total = batchItemTotalCents({
    hours_cents: r.hours_cents as number,
    bonuses_cents: r.bonuses_cents as number,
    reimbursements_cents: r.reimbursements_cents as number,
    adjustments_cents: r.adjustments_cents as number,
  });
  if (total === 0) return null;
  const method = typeof r.method === 'string' && VALID_METHODS.has(r.method)
    ? (r.method as NormalizedBatchItem['method'])
    : null;
  return {
    user_email,
    user_name: typeof r.user_name === 'string' ? r.user_name.trim() || null : null,
    hours_cents: clampPositive(r.hours_cents),
    bonuses_cents: clampPositive(r.bonuses_cents),
    reimbursements_cents: clampPositive(r.reimbursements_cents),
    adjustments_cents: clampInt(r.adjustments_cents),
    total_cents: total,
    method,
    method_handle: typeof r.method_handle === 'string' ? r.method_handle.trim() || null : null,
    notes: typeof r.notes === 'string' ? r.notes.trim() || null : null,
  };
}
