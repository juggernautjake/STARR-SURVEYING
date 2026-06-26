// lib/payments/finance-overview.ts
//
// G2 / Phase 2.2 of BUSINESS_GO_LIVE_FINANCE_PAYMENTS_2026-06-25 — pure
// aggregators for the unified "money in vs money out" (P&L / cash-flow) view.
//
// Three streams feed it, each reduced to {amount_cents, at}:
//   - revenue  = cleared customer payments        (money IN)
//   - payouts  = paid employee payout items       (money OUT — labor)
//   - expenses = approved business receipts        (money OUT — expenses)
//
// Pure → unit-tested with frozen inputs, decoupled from the exact DB columns
// (the route maps rows → MoneyEvent), and reusable from a CSV export.

export interface MoneyEvent {
  amount_cents: number;
  /** ISO timestamp the money moved (payment cleared / payout paid / receipt date). */
  at: string;
}

export interface FinanceOverview {
  revenue_cents: number;
  payouts_cents: number;
  expenses_cents: number;
  /** payouts + expenses. */
  outflow_cents: number;
  /** revenue - outflow (can be negative). */
  net_cents: number;
}

function sumEvents(xs: ReadonlyArray<MoneyEvent>): number {
  return xs.reduce((s, e) => s + Math.max(0, Math.round(e.amount_cents)), 0);
}

/** Pure — top-line totals across the whole window. */
export function summarizeFinances(
  revenue: ReadonlyArray<MoneyEvent>,
  payouts: ReadonlyArray<MoneyEvent>,
  expenses: ReadonlyArray<MoneyEvent>,
): FinanceOverview {
  const revenue_cents = sumEvents(revenue);
  const payouts_cents = sumEvents(payouts);
  const expenses_cents = sumEvents(expenses);
  const outflow_cents = payouts_cents + expenses_cents;
  return {
    revenue_cents,
    payouts_cents,
    expenses_cents,
    outflow_cents,
    net_cents: revenue_cents - outflow_cents,
  };
}

export type Granularity = 'day' | 'week' | 'month' | 'year';

export interface PeriodRow {
  period_key: string;
  period_start: string;
  revenue_cents: number;
  payouts_cents: number;
  expenses_cents: number;
  net_cents: number;
}

export interface WindowOptions {
  from?: string | null;
  to?: string | null;
}

/** Pure — bucket all three streams by period and net them per bucket. */
export function financesByPeriod(
  revenue: ReadonlyArray<MoneyEvent>,
  payouts: ReadonlyArray<MoneyEvent>,
  expenses: ReadonlyArray<MoneyEvent>,
  granularity: Granularity,
  opts: WindowOptions = {},
): PeriodRow[] {
  const from = opts.from ? Date.parse(opts.from) : null;
  const to = opts.to ? Date.parse(opts.to) : null;
  const buckets = new Map<string, PeriodRow>();

  const add = (events: ReadonlyArray<MoneyEvent>, field: 'revenue_cents' | 'payouts_cents' | 'expenses_cents'): void => {
    for (const e of events) {
      const t = Date.parse(e.at);
      if (Number.isNaN(t)) continue;
      if (from !== null && t < from) continue;
      if (to !== null && t > to) continue;
      const d = new Date(t);
      const key = periodKey(d, granularity);
      let row = buckets.get(key);
      if (!row) {
        row = {
          period_key: key,
          period_start: periodStart(d, granularity).toISOString(),
          revenue_cents: 0,
          payouts_cents: 0,
          expenses_cents: 0,
          net_cents: 0,
        };
        buckets.set(key, row);
      }
      row[field] += Math.max(0, Math.round(e.amount_cents));
    }
  };

  add(revenue, 'revenue_cents');
  add(payouts, 'payouts_cents');
  add(expenses, 'expenses_cents');

  const rows = Array.from(buckets.values());
  for (const r of rows) r.net_cents = r.revenue_cents - r.payouts_cents - r.expenses_cents;
  return rows.sort((a, b) => a.period_start.localeCompare(b.period_start));
}

// ── period internals (UTC, ISO-week Monday) ──────────────────────────
function periodKey(d: Date, g: Granularity): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  switch (g) {
    case 'day':
      return `${y}-${m}-${day}`;
    case 'week': {
      const monday = startOfIsoWeek(d);
      const yy = monday.getUTCFullYear();
      const mm = String(monday.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(monday.getUTCDate()).padStart(2, '0');
      return `${yy}-${mm}-${dd}`;
    }
    case 'month':
      return `${y}-${m}`;
    case 'year':
      return `${y}`;
  }
}

function periodStart(d: Date, g: Granularity): Date {
  switch (g) {
    case 'day':
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    case 'week':
      return startOfIsoWeek(d);
    case 'month':
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    case 'year':
      return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  }
}

function startOfIsoWeek(d: Date): Date {
  const day = d.getUTCDay(); // Sunday=0
  const shift = (day + 6) % 7; // Monday=0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - shift));
}
