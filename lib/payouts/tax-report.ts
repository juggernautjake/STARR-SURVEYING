// lib/payouts/tax-report.ts
//
// P16 of payment-infrastructure-2026-06-18.md — pure helpers for the
// annual + quarterly payout tax export.
//
// 1099-NEC vs W-2 cut: this app doesn't try to classify the
// employee — that's the office's call. We aggregate the totals;
// the tax preparer maps them to the right form. The export labels
// every employee uniformly and the office annotates downstream.

export type PayoutMethodKey = 'venmo' | 'cashapp' | 'zelle' | 'ach' | 'cash' | 'stripe' | 'other';

export interface PaidItemForTax {
  user_email: string;
  user_name: string | null;
  method: string | null;
  total_cents: number;
  paid_at: string | null;
}

export interface EmployeeTaxRow {
  user_email: string;
  user_name: string | null;
  total_cents: number;
  by_method: Record<PayoutMethodKey, number>;
  payment_count: number;
  first_paid_at: string | null;
  last_paid_at: string | null;
}

const KNOWN_METHODS: PayoutMethodKey[] = ['venmo', 'cashapp', 'zelle', 'ach', 'cash', 'stripe', 'other'];

function emptyByMethod(): Record<PayoutMethodKey, number> {
  return { venmo: 0, cashapp: 0, zelle: 0, ach: 0, cash: 0, stripe: 0, other: 0 };
}
function normalizeMethod(raw: string | null | undefined): PayoutMethodKey {
  if (typeof raw === 'string' && (KNOWN_METHODS as string[]).includes(raw)) {
    return raw as PayoutMethodKey;
  }
  return 'other';
}

/** Pure helper — fold paid items into per-employee rows. Input is
 *  expected to be already filtered to `status='paid'` rows. */
export function aggregateForTaxReport(items: ReadonlyArray<PaidItemForTax>): EmployeeTaxRow[] {
  const by_email = new Map<string, EmployeeTaxRow>();
  for (const item of items) {
    const email = item.user_email.toLowerCase();
    let row = by_email.get(email);
    if (!row) {
      row = {
        user_email: email,
        user_name: item.user_name ?? null,
        total_cents: 0,
        by_method: emptyByMethod(),
        payment_count: 0,
        first_paid_at: null,
        last_paid_at: null,
      };
      by_email.set(email, row);
    }
    const amount = Math.max(0, Math.round(item.total_cents));
    row.total_cents += amount;
    row.by_method[normalizeMethod(item.method)] += amount;
    row.payment_count += 1;
    if (item.paid_at) {
      if (!row.first_paid_at || item.paid_at < row.first_paid_at) row.first_paid_at = item.paid_at;
      if (!row.last_paid_at || item.paid_at > row.last_paid_at) row.last_paid_at = item.paid_at;
    }
    if (!row.user_name && item.user_name) row.user_name = item.user_name;
  }
  return Array.from(by_email.values()).sort((a, b) => b.total_cents - a.total_cents);
}

/** Pure helper — total of every employee's total (the report
 *  footer). */
export function totalsAcrossRows(rows: ReadonlyArray<EmployeeTaxRow>): { total_cents: number; payment_count: number } {
  return rows.reduce(
    (acc, r) => ({
      total_cents: acc.total_cents + r.total_cents,
      payment_count: acc.payment_count + r.payment_count,
    }),
    { total_cents: 0, payment_count: 0 },
  );
}

const HEADER = [
  'user_email',
  'user_name',
  'payment_count',
  'first_paid_at',
  'last_paid_at',
  'total_usd',
  'venmo_usd',
  'cashapp_usd',
  'zelle_usd',
  'ach_usd',
  'cash_usd',
  'stripe_usd',
  'other_usd',
];

function csvField(s: unknown): string {
  const text = s == null ? '' : String(s);
  return /[,"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Pure helper — emit a single CSV row for an employee. */
export function buildTaxCsvRow(row: EmployeeTaxRow): string {
  return [
    csvField(row.user_email),
    csvField(row.user_name ?? ''),
    String(row.payment_count),
    csvField(row.first_paid_at ?? ''),
    csvField(row.last_paid_at ?? ''),
    dollars(row.total_cents),
    dollars(row.by_method.venmo),
    dollars(row.by_method.cashapp),
    dollars(row.by_method.zelle),
    dollars(row.by_method.ach),
    dollars(row.by_method.cash),
    dollars(row.by_method.stripe),
    dollars(row.by_method.other),
  ].join(',');
}

/** Pure helper — full CSV body: header + per-employee rows. */
export function buildTaxCsv(rows: ReadonlyArray<EmployeeTaxRow>): string {
  return [HEADER.join(','), ...rows.map(buildTaxCsvRow)].join('\n');
}

/** Pure helper — date-range labels for the office's UX. */
export function describeRange(fromIso: string, toIso: string): string {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (
    from.getUTCMonth() === 0 && from.getUTCDate() === 1 &&
    to.getUTCMonth() === 11 && to.getUTCDate() === 31 &&
    from.getUTCFullYear() === to.getUTCFullYear()
  ) {
    return `Tax year ${from.getUTCFullYear()}`;
  }
  const quarter = quarterOf(from);
  if (quarter && isQuarterEnd(to, quarter, from.getUTCFullYear())) {
    return `Q${quarter} ${from.getUTCFullYear()}`;
  }
  return `${fromIso} → ${toIso}`;
}
function quarterOf(d: Date): 1 | 2 | 3 | 4 | null {
  if (d.getUTCDate() !== 1) return null;
  switch (d.getUTCMonth()) {
    case 0: return 1;
    case 3: return 2;
    case 6: return 3;
    case 9: return 4;
    default: return null;
  }
}
function isQuarterEnd(d: Date, quarter: 1 | 2 | 3 | 4, year: number): boolean {
  const ends: Record<1 | 2 | 3 | 4, [number, number]> = {
    1: [2, 31], 2: [5, 30], 3: [8, 30], 4: [11, 31],
  };
  const [m, day] = ends[quarter];
  return d.getUTCFullYear() === year && d.getUTCMonth() === m && d.getUTCDate() === day;
}
