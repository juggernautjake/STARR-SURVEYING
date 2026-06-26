// G2 / Phase 2.2 — source-lock for the money-in/out aggregators.
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
    );
    expect(out.revenue_cents).toBe(150000);
    expect(out.payouts_cents).toBe(40000);
    expect(out.expenses_cents).toBe(20000);
    expect(out.outflow_cents).toBe(60000);
    expect(out.net_cents).toBe(90000);
  });
  it('net can go negative; negative amounts are clamped to 0', () => {
    const out = summarizeFinances([ev(10000, '2026-01-01')], [ev(30000, '2026-01-02')], [ev(-999, '2026-01-03')]);
    expect(out.expenses_cents).toBe(0);
    expect(out.net_cents).toBe(-20000);
  });
});

describe('finance-overview: financesByPeriod', () => {
  it('buckets by month and nets per bucket, sorted by period start', () => {
    const rows = financesByPeriod(
      [ev(100000, '2026-01-05'), ev(60000, '2026-02-10')],
      [ev(40000, '2026-01-20')],
      [ev(10000, '2026-02-15')],
      'month',
    );
    expect(rows.map((r) => r.period_key)).toEqual(['2026-01', '2026-02']);
    const jan = rows[0];
    expect(jan).toMatchObject({ revenue_cents: 100000, payouts_cents: 40000, expenses_cents: 0, net_cents: 60000 });
    const feb = rows[1];
    expect(feb).toMatchObject({ revenue_cents: 60000, payouts_cents: 0, expenses_cents: 10000, net_cents: 50000 });
  });

  it('honors the from/to window', () => {
    const rows = financesByPeriod(
      [ev(100000, '2025-12-31'), ev(50000, '2026-01-15')],
      [],
      [],
      'year',
      { from: '2026-01-01', to: '2026-12-31' },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ period_key: '2026', revenue_cents: 50000 });
  });

  it('skips unparseable dates', () => {
    const rows = financesByPeriod([ev(100, 'not-a-date'), ev(200, '2026-03-01')], [], [], 'month');
    expect(rows).toHaveLength(1);
    expect(rows[0].revenue_cents).toBe(200);
  });
});
