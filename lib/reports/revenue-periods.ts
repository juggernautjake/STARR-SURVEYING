// lib/reports/revenue-periods.ts
//
// hub-widget-excellence-11 — pure period-window math for the
// monthly-revenue report. Given a period + "now", returns the
// current-period-to-date window and the full previous-period window, so
// the report can sum job_payments for "this period so far" vs "all of
// last period". UTC-based + dependency-free for deterministic tests.

export type RevenuePeriod = 'month' | 'quarter' | 'year';

export interface PeriodWindow {
  /** Inclusive ISO start. */
  from: string;
  /** Exclusive ISO end. */
  to: string;
}

export interface RevenueWindows {
  current: PeriodWindow;
  previous: PeriodWindow;
}

/**
 * `current` = the start of the period containing `nowMs` → now.
 * `previous` = the full prior period (its start → the current start).
 */
export function periodWindows(period: RevenuePeriod, nowMs: number): RevenueWindows {
  const now = new Date(nowMs);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-11

  let curStartMs: number;
  let prevStartMs: number;

  if (period === 'year') {
    curStartMs = Date.UTC(y, 0, 1);
    prevStartMs = Date.UTC(y - 1, 0, 1);
  } else if (period === 'quarter') {
    const q = Math.floor(m / 3); // 0-3
    curStartMs = Date.UTC(y, q * 3, 1);
    prevStartMs = Date.UTC(y, q * 3 - 3, 1); // Date.UTC normalizes negative months
  } else {
    curStartMs = Date.UTC(y, m, 1);
    prevStartMs = Date.UTC(y, m - 1, 1);
  }

  return {
    current: { from: new Date(curStartMs).toISOString(), to: new Date(nowMs).toISOString() },
    previous: { from: new Date(prevStartMs).toISOString(), to: new Date(curStartMs).toISOString() },
  };
}

/** Sum the non-refund payment amounts. Pure helper used by the route +
 *  unit-tested. */
export function sumRevenue(
  payments: ReadonlyArray<{ amount?: number | null; payment_type?: string | null }>,
): number {
  return payments.reduce((sum, p) => {
    if (p.payment_type === 'refund') return sum;
    const amt = typeof p.amount === 'number' && Number.isFinite(p.amount) ? p.amount : 0;
    return sum + amt;
  }, 0);
}
