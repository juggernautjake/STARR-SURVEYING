// lib/finances/compare-periods.ts
//
// "How much are we spending month to month" is a comparison, not a total. A single figure for July
// answers nothing on its own — $840 is either alarming or excellent depending entirely on June.
//
// Pure. The route computes two windows and hands both here.

/** One metric, this period against the last. */
export interface MetricDelta {
  current: number;
  previous: number;
  /** current - previous. Signed: negative means it went down, whatever the metric. */
  delta: number;
  /**
   * Fractional change, e.g. 0.25 for +25%.
   *
   * `null` when `previous` is 0, and that is not laziness. A jump from nothing to something is not a
   * percentage — it is a beginning. Returning Infinity would render as "∞%" and dividing anyway gives
   * NaN, both of which look like bugs to the person reading the screen. The UI shows "new" instead.
   */
  pct: number | null;
  /**
   * Whether `delta > 0` is good news. Revenue up is good; ad spend up is merely a fact, and cost per
   * job up is bad. Kept here rather than in the component so the colour of an arrow cannot disagree
   * between two screens showing the same number.
   */
  higherIsBetter: boolean | null;
}

export function compareMetric(
  current: number,
  previous: number,
  higherIsBetter: boolean | null = null,
): MetricDelta {
  const c = Number.isFinite(current) ? current : 0;
  const p = Number.isFinite(previous) ? previous : 0;
  return {
    current: c,
    previous: p,
    delta: c - p,
    pct: p === 0 ? null : (c - p) / Math.abs(p),
    higherIsBetter,
  };
}

/** The money side of a period, in cents. Mirrors `FinanceOverview` minus the derived fields. */
export interface PeriodTotals {
  revenue_cents: number;
  payouts_cents: number;
  expenses_cents: number;
  ad_spend_cents: number;
  net_cents: number;
  /** Marketing counts, so money and marketing can be read together rather than on two screens. */
  leads: number;
  jobs_won: number;
}

export interface PeriodComparison {
  revenue: MetricDelta;
  payouts: MetricDelta;
  expenses: MetricDelta;
  ad_spend: MetricDelta;
  net: MetricDelta;
  leads: MetricDelta;
  jobs_won: MetricDelta;
  /** Cents of advertising per lead. `null` when there were no leads — not 0, which reads as "free". */
  cost_per_lead: MetricDelta | null;
  /** Cents of advertising per won job. The number this whole project exists to make honest. */
  cost_per_job: MetricDelta | null;
}

/** Cents per unit, or null when the denominator is 0. Never Infinity, never NaN. */
export function perUnit(cents: number, units: number): number | null {
  if (!Number.isFinite(cents) || !Number.isFinite(units) || units <= 0) return null;
  return Math.round(cents / units);
}

export function comparePeriods(current: PeriodTotals, previous: PeriodTotals): PeriodComparison {
  const cplNow = perUnit(current.ad_spend_cents, current.leads);
  const cplPrev = perUnit(previous.ad_spend_cents, previous.leads);
  const cpjNow = perUnit(current.ad_spend_cents, current.jobs_won);
  const cpjPrev = perUnit(previous.ad_spend_cents, previous.jobs_won);

  return {
    revenue: compareMetric(current.revenue_cents, previous.revenue_cents, true),
    payouts: compareMetric(current.payouts_cents, previous.payouts_cents, null),
    expenses: compareMetric(current.expenses_cents, previous.expenses_cents, null),
    // Ad spend rising is neither good nor bad on its own — it is good if cost per job held. Marking it
    // "bad" would paint a successful scale-up red, which is how a dashboard teaches somebody to stop
    // advertising.
    ad_spend: compareMetric(current.ad_spend_cents, previous.ad_spend_cents, null),
    net: compareMetric(current.net_cents, previous.net_cents, true),
    leads: compareMetric(current.leads, previous.leads, true),
    jobs_won: compareMetric(current.jobs_won, previous.jobs_won, true),
    // Only comparable when BOTH periods have a denominator. Comparing against a period with no leads
    // would invent a baseline of 0 and report an infinite rise in costs that never happened.
    cost_per_lead:
      cplNow !== null && cplPrev !== null ? compareMetric(cplNow, cplPrev, false) : null,
    cost_per_job:
      cpjNow !== null && cpjPrev !== null ? compareMetric(cpjNow, cpjPrev, false) : null,
  };
}

/**
 * The window immediately before `[from, to]`, of equal length.
 *
 * Calendar-aware for whole months: June compared against July must be June in full, not "the 31 days
 * before July 1st", or February always looks like a collapse and a 31-day month always looks like
 * growth. Falls back to an equal-length span for arbitrary ranges.
 *
 * Dates in, dates out — YYYY-MM-DD, UTC throughout.
 */
export function previousWindow(from: string, to: string): { from: string; to: string } {
  const f = new Date(`${from}T00:00:00Z`);
  const t = new Date(`${to}T00:00:00Z`);

  const isWholeMonth =
    f.getUTCDate() === 1 &&
    t.getUTCMonth() === f.getUTCMonth() &&
    t.getUTCFullYear() === f.getUTCFullYear() &&
    t.getUTCDate() === new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();

  if (isWholeMonth) {
    const prevStart = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() - 1, 1));
    const prevEnd = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), 0));
    return { from: iso(prevStart), to: iso(prevEnd) };
  }

  const days = Math.round((t.getTime() - f.getTime()) / 86_400_000) + 1;
  const prevEnd = new Date(f.getTime() - 86_400_000);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86_400_000);
  return { from: iso(prevStart), to: iso(prevEnd) };
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
