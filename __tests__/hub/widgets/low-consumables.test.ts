import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import {
  capForBucket,
  toLowConsumable,
  isLow,
  stockPct,
} from '@/lib/hub/widgets/low-consumables';

describe('low-consumables', () => {
  it('registers in equipment category', () => {
    expect(getWidget('low-consumables')?.category).toBe('equipment');
  });
  it('caps per bucket', () => {
    expect(capForBucket('tiny')).toBe(2);
    expect(capForBucket('xlarge')).toBe(24);
  });
});

describe('toLowConsumable (R1: real rows shape)', () => {
  it('maps quantity_on_hand / low_stock_threshold / unit / badge', () => {
    expect(toLowConsumable({
      id: 'c1', name: 'Lath stakes', unit: 'ea',
      quantity_on_hand: 12, low_stock_threshold: 50, reorder_badge: 'reorder_now',
    })).toEqual({
      id: 'c1', name: 'Lath stakes', unit: 'ea',
      current_qty: 12, reorder_threshold: 50, reorder_badge: 'reorder_now',
    });
  });
  it('falls back to "Item" + zeros when missing', () => {
    const m = toLowConsumable({ id: 'c2' });
    expect(m.name).toBe('Item');
    expect(m.current_qty).toBe(0);
  });
});

describe('isLow', () => {
  const base = { id: 'x', name: 'x', current_qty: 100, reorder_threshold: 50, unit: null } as const;
  it('is low when the server badge says reorder', () => {
    expect(isLow({ ...base, reorder_badge: 'reorder_now' }, 0)).toBe(true);
    expect(isLow({ ...base, reorder_badge: 'reorder_soon' }, 0)).toBe(true);
  });
  it('is low when at/under the threshold(s)', () => {
    expect(isLow({ ...base, current_qty: 40 }, 0)).toBe(true); // <= reorder_threshold 50
    expect(isLow({ ...base, current_qty: 100 }, 100)).toBe(true); // <= user threshold
  });
  it('is not low otherwise', () => {
    expect(isLow({ ...base, reorder_badge: 'ok' }, 0)).toBe(false);
  });
});

describe('stockPct', () => {
  it('is the clamped percent of the reorder threshold', () => {
    expect(stockPct({ id: 'x', name: 'x', current_qty: 25, reorder_threshold: 50, unit: null })).toBe(50);
    expect(stockPct({ id: 'x', name: 'x', current_qty: 100, reorder_threshold: 50, unit: null })).toBe(100);
    expect(stockPct({ id: 'x', name: 'x', current_qty: 10, reorder_threshold: 0, unit: null })).toBe(0);
  });
});
