import { describe, it, expect } from 'vitest';
import {
  defaultCurrencies, baseCurrency, totalInBase, convert, exchangeRate, totalIn,
  conversionTable, fmtAmount, DEFAULT_CURRENCIES_5E, DEFAULT_CURRENCIES_PF2,
  type Currency,
} from '@/lib/dnd/currency';

const cur = (id: string, amount: number, rate: number, name = id): Currency => ({ id, name, amount, rate });

describe('default currency sets', () => {
  it('5e has cp/sp/ep/gp/pp valued in copper', () => {
    expect(DEFAULT_CURRENCIES_5E.map((c) => c.id)).toEqual(['cp', 'sp', 'ep', 'gp', 'pp']);
    expect(DEFAULT_CURRENCIES_5E.find((c) => c.id === 'gp')!.rate).toBe(100);
  });
  it('PF2 drops electrum', () => {
    expect(DEFAULT_CURRENCIES_PF2.map((c) => c.id)).toEqual(['cp', 'sp', 'gp', 'pp']);
  });
  it('defaultCurrencies dispatches by system and returns a fresh copy', () => {
    const a = defaultCurrencies('pathfinder2e');
    const b = defaultCurrencies('dnd5e-2024');
    expect(a.map((c) => c.id)).toEqual(['cp', 'sp', 'gp', 'pp']);
    expect(b.map((c) => c.id)).toContain('ep');
    a[0].amount = 5;
    expect(defaultCurrencies('pathfinder2e')[0].amount).toBe(0); // not mutated
  });
});

describe('base currency + totals', () => {
  const coins = [cur('cp', 50, 1), cur('sp', 3, 10), cur('gp', 2, 100)]; // 50 + 30 + 200 = 280 cp
  it('base is the lowest positive rate', () => {
    expect(baseCurrency(coins)!.id).toBe('cp');
    expect(baseCurrency([])).toBeNull();
  });
  it('total in base sums amount × rate', () => {
    expect(totalInBase(coins)).toBe(280);
  });
  it('total in a chosen currency divides by its rate', () => {
    expect(totalIn(coins, coins[2])).toBe(2.8); // 280 cp / 100 = 2.8 gp
    expect(totalIn(coins)).toBe(280);            // default = base (cp)
  });
  it('ignores non-finite / non-positive rates without throwing', () => {
    expect(totalInBase([cur('x', 5, 0), cur('gp', 1, 100)])).toBe(100);
  });
});

describe('conversion', () => {
  const gp = cur('gp', 0, 100), sp = cur('sp', 0, 10);
  it('converts by the rate ratio', () => {
    expect(convert(2, 100, 10)).toBe(20);   // 2 gp → 20 sp
    expect(convert(20, 10, 100)).toBe(2);    // 20 sp → 2 gp
  });
  it('exchangeRate reads "1 gp = 10 sp"', () => {
    expect(exchangeRate(gp, sp)).toBe(10);
    expect(exchangeRate(sp, gp)).toBe(0.1);
  });
  it('guards divide-by-zero', () => {
    expect(convert(5, 100, 0)).toBe(0);
  });
});

describe('custom currency with an arbitrary rate', () => {
  it('a Guild Mark worth 5 gp folds into the total and cross-converts', () => {
    const coins = [cur('gp', 10, 100), { id: 'gm', name: 'Guild Mark', amount: 4, rate: 500 }];
    // 10 gp = 1000 cp; 4 marks × 500 = 2000 cp; total 3000 cp = 30 gp.
    expect(totalInBase(coins)).toBe(3000);
    expect(totalIn(coins, coins[0])).toBe(30);
    expect(exchangeRate(coins[1] as Currency, coins[0])).toBe(5); // 1 mark = 5 gp
  });
});

describe('conversionTable', () => {
  it('gives each currency its rate against every other', () => {
    const table = conversionTable([cur('cp', 0, 1), cur('gp', 0, 100)]);
    expect(table).toHaveLength(2);
    const gpRow = table.find((r) => r.from.id === 'gp')!;
    expect(gpRow.rates[0].to.id).toBe('cp');
    expect(gpRow.rates[0].rate).toBe(100); // 1 gp = 100 cp
  });
});

describe('fmtAmount', () => {
  it('keeps whole numbers whole and trims trailing zeros', () => {
    expect(fmtAmount(5)).toBe('5');
    expect(fmtAmount(2.8)).toBe('2.8');
    expect(fmtAmount(2.5)).toBe('2.5');
    expect(fmtAmount(3.0)).toBe('3');
  });
});
