// G2 / Phase 2.2 — source-lock for the money-in/out aggregators.
//
// 2026-08-07: advertising became a FOURTH stream. It had been missing entirely, so the P&L excluded
// what is plausibly the largest controllable expense in the business. The fourth parameter is REQUIRED
// rather than optional on purpose — an optional one lets a caller keep compiling while reporting an
// outflow with a whole category missing, and the resulting net-profit figure is wrong in the
// flattering direction, which is the kind nobody investigates.
import { describe, it, expect } from 'vitest';
import {
  summarizeFinances,
  financesByPeriod,
  type MoneyEvent,
} from '@/lib/payments/finance-overview';

const ev = (amount_cents: number, at: string): MoneyEvent => ({ amount_cents, at });

describe('finance-overview: summarizeFinances', () => {
  it('totals each stream and nets revenue minus outflow', () => {
    const out = summarizeFinances(
      [ev(100000, '2026-01-05'), ev(50000, '2026-02-10')],
      [ev(40000, '2026-01-20')],
      [ev(15000, '2026-01-22'), ev(5000, '2026-02-01')],
      [],
    );
    expect(out.revenue_cents).toBe(150000);
    expect(out.payouts_cents).toBe(40000);
    expect(out.expenses_cents).toBe(20000);
    expect(out.ad_spend_cents).toBe(0);
    expect(out.outflow_cents).toBe(60000);
    expect(out.net_cents).toBe(90000);
  });

  it('net can go negative; negative amounts are clamped to 0', () => {
    const out = summarizeFinances(
      [ev(10000, '2026-01-01')],
      [ev(30000, '2026-01-02')],
      [ev(-999, '2026-01-03')],
      [],
    );
    expect(out.expenses_cents).toBe(0);
    expect(out.net_cents).toBe(-20000);
  });

  it('counts advertising in outflow and takes it out of net', () => {
    // The whole point of the 2026-08-07 change. Before it this $250 was invisible and net read $1,000.
    const out = summarizeFinances([ev(100000, '2026-03-01')], [], [], [ev(25000, '2026-03-15')]);
    expect(out.ad_spend_cents).toBe(25000);
    expect(out.outflow_cents).toBe(25000);
    expect(out.net_cents).toBe(75000);
  });

  it('keeps advertising separate from receipts rather than blending them', () => {
    // Folding ad spend into `expenses` produces the same net and destroys the number the owner asked
    // to watch. This asserts the two stay individually readable.
    const out = summarizeFinances(
      [ev(100000, '2026-03-01')],
      [],
      [ev(4000, '2026-03-02')],
      [ev(6000, '2026-03-03')],
    );
    expect(out.expenses_cents).toBe(4000);
    expect(out.ad_spend_cents).toBe(6000);
    expect(out.outflow_cents).toBe(10000);
  });
});

describe('finance-overview: financesByPeriod', () => {
  it('buckets by month and nets per bucket, sorted by period start', () => {
    const rows = financesByPeriod(
      [ev(100000, '2026-01-05'), ev(60000, '2026-02-10')],
      [ev(40000, '2026-01-20')],
      [ev(10000, '2026-02-15')],
      [],
      'month',
    );
    expect(rows.map((r) => r.period_key)).toEqual(['2026-01', '2026-02']);
    expect(rows[0]).toMatchObject({
      revenue_cents: 100000, payouts_cents: 40000, expenses_cents: 0, ad_spend_cents: 0, net_cents: 60000,
    });
    expect(rows[1]).toMatchObject({
      revenue_cents: 60000, payouts_cents: 0, expenses_cents: 10000, ad_spend_cents: 0, net_cents: 50000,
    });
  });

  it('buckets advertising into the right month and nets it out', () => {
    const rows = financesByPeriod(
      [ev(200000, '2026-04-10')],
      [],
      [],
      [ev(30000, '2026-04-02'), ev(45000, '2026-05-20')],
      'month',
    );
    expect(rows.map((r) => r.period_key)).toEqual(['2026-04', '2026-05']);
    expect(rows[0]).toMatchObject({ ad_spend_cents: 30000, net_cents: 170000 });
    // A month with spend and no revenue is a loss, and the row must say so rather than reading 0.
    expect(rows[1]).toMatchObject({ ad_spend_cents: 45000, net_cents: -45000 });
  });

  it('honors the from/to window', () => {
    const rows = financesByPeriod(
      [ev(100000, '2025-12-31'), ev(50000, '2026-01-15')],
      [],
      [],
      [],
      'year',
      { from: '2026-01-01', to: '2026-12-31' },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ period_key: '2026', revenue_cents: 50000 });
  });

  it('applies the window to advertising too', () => {
    // A spend row outside the range must not leak in — otherwise "July spend" silently includes June.
    const rows = financesByPeriod(
      [],
      [],
      [],
      [ev(10000, '2026-06-30'), ev(20000, '2026-07-05')],
      'month',
      { from: '2026-07-01', to: '2026-07-31' },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ period_key: '2026-07', ad_spend_cents: 20000 });
  });

  it('skips unparseable dates', () => {
    const rows = financesByPeriod([ev(100, 'not-a-date'), ev(200, '2026-03-01')], [], [], [], 'month');
    expect(rows).toHaveLength(1);
    expect(rows[0].revenue_cents).toBe(200);
  });
});
