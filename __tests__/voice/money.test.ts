// __tests__/voice/money.test.ts
//
// Voice work is billed in fractional units — 1.5 hours of studio time, 0.75 of a session — which is
// why quantity is an integer of thousandths rather than a float. These tests exist to keep it that
// way: every one of them fails if someone "simplifies" quantity back to a decimal.

import { describe, expect, it } from 'vitest';

import {
  balanceCents,
  computeInvoiceTotals,
  daysUntilDue,
  deriveInvoiceStatus,
  dueDateFrom,
  formatCents,
  formatQuantity,
  lineAmountCents,
  nextDocumentNumber,
  normalizeLineItems,
  parseCents,
  parseQuantity,
} from '@/lib/voice/money';

describe('lineAmountCents', () => {
  it('multiplies fractional quantities without floating-point drift', () => {
    // 0.1 + 0.2 does not stop being 0.30000000000000004 because the other operand is an integer.
    expect(lineAmountCents({ quantity: 1500, unitCents: 12000 })).toBe(18000); // 1.5 × $120
    expect(lineAmountCents({ quantity: 750, unitCents: 8000 })).toBe(6000); // 0.75 × $80
    expect(lineAmountCents({ quantity: 100, unitCents: 3333 })).toBe(333); // 0.1 × $33.33
  });

  it('rounds half-up, the way an accountant expects', () => {
    // Banker's rounding would be defensible and would surprise everyone.
    expect(lineAmountCents({ quantity: 500, unitCents: 1 })).toBe(1); // 0.005 → 0.01
  });

  it('treats non-finite input as zero rather than producing NaN money', () => {
    expect(lineAmountCents({ quantity: NaN, unitCents: 5000 })).toBe(0);
    expect(lineAmountCents({ quantity: 1000, unitCents: Infinity })).toBe(0);
  });
});

describe('computeInvoiceTotals', () => {
  const items = [
    { description: 'Spot', quantity: 1000, unitCents: 65000 },
    { description: 'Cutdown', quantity: 1000, unitCents: 20000 },
  ];

  it('sums the lines', () => {
    expect(computeInvoiceTotals(items).totalCents).toBe(85000);
  });

  it('applies the discount BEFORE tax', () => {
    // Tax on money that was never charged is money paid to a state out of Andrew's own pocket.
    const t = computeInvoiceTotals(items, { discountCents: 5000, taxRateBasisPoints: 825 });
    expect(t.discountCents).toBe(5000);
    expect(t.taxCents).toBe(Math.round((80000 * 825) / 10000));
    expect(t.totalCents).toBe(80000 + t.taxCents);
  });

  it('will not let a discount exceed the subtotal and invert the invoice', () => {
    const t = computeInvoiceTotals(items, { discountCents: 999999 });
    expect(t.discountCents).toBe(85000);
    expect(t.totalCents).toBe(0);
  });

  it('uses basis points so a tax rate is exact', () => {
    expect(computeInvoiceTotals(items, { taxRateBasisPoints: 825 }).taxCents).toBe(7013);
  });
});

describe('normalizeLineItems', () => {
  it('recomputes the cached amount rather than trusting the client', () => {
    const [item] = normalizeLineItems([{ description: 'x', quantity: 1000, unitCents: 5000, amountCents: 1 }]);
    expect(item.amountCents).toBe(5000);
  });

  it('accepts the snake_case column name coming back from the database', () => {
    const [item] = normalizeLineItems([{ description: 'x', quantity: 1000, unit_cents: 4200 }]);
    expect(item.unitCents).toBe(4200);
  });

  it('drops rows that are entirely empty but keeps a zero-priced named line', () => {
    // A $0 line is real: a bonus take, a comp, a free pickup that should still be itemised.
    const out = normalizeLineItems([
      { description: '', quantity: 0, unitCents: 0 },
      { description: 'Complimentary pickup', quantity: 1000, unitCents: 0 },
    ]);
    expect(out.map((i) => i.description)).toEqual(['Complimentary pickup']);
  });
});

describe('deriveInvoiceStatus', () => {
  const today = new Date('2026-08-02T12:00:00Z');

  it('reports overdue the morning it becomes true, with no nightly job', () => {
    const s = deriveInvoiceStatus(
      { status: 'sent', totalCents: 95000, paidCents: 0, dueDate: '2026-07-27' },
      today,
    );
    expect(s).toBe('overdue');
  });

  it('never calls a fully paid invoice overdue', () => {
    const s = deriveInvoiceStatus(
      { status: 'sent', totalCents: 95000, paidCents: 95000, dueDate: '2026-07-01' },
      today,
    );
    expect(s).toBe('paid');
  });

  it('leaves a void invoice void regardless of dates or money', () => {
    const s = deriveInvoiceStatus(
      { status: 'void', totalCents: 95000, paidCents: 0, dueDate: '2020-01-01' },
      today,
    );
    expect(s).toBe('void');
  });

  it('leaves a draft alone — it has not been sent to anyone', () => {
    const s = deriveInvoiceStatus(
      { status: 'draft', totalCents: 95000, paidCents: 0, dueDate: '2020-01-01' },
      today,
    );
    expect(s).toBe('draft');
  });
});

describe('balanceCents', () => {
  it('never goes negative on an overpayment', () => {
    expect(balanceCents(95000, 100000)).toBe(0);
  });
});

describe('daysUntilDue', () => {
  const today = new Date('2026-08-02T12:00:00Z');

  it('is negative once the date has passed', () => {
    expect(daysUntilDue('2026-07-27', today)).toBeLessThan(0);
  });

  it('returns null when there is no due date', () => {
    expect(daysUntilDue(null, today)).toBeNull();
  });
});

describe('dueDateFrom', () => {
  it('adds the terms to the issue date', () => {
    expect(dueDateFrom('2026-08-02', 14)).toBe('2026-08-16');
  });

  it('crosses a month boundary correctly', () => {
    expect(dueDateFrom('2026-08-25', 14)).toBe('2026-09-08');
  });
});

describe('nextDocumentNumber', () => {
  it('continues the sequence for the current year', () => {
    expect(nextDocumentNumber('AAV', ['AAV-2026-001', 'AAV-2026-002'], 2026)).toBe('AAV-2026-003');
  });

  it('restarts at 001 in a new year', () => {
    expect(nextDocumentNumber('AAV', ['AAV-2025-041'], 2026)).toBe('AAV-2026-001');
  });

  it('ignores numbers belonging to a different prefix', () => {
    expect(nextDocumentNumber('AAV', ['XYZ-2026-099'], 2026)).toBe('AAV-2026-001');
  });
});

describe('parsing what a human types', () => {
  it('reads a price with or without a currency symbol', () => {
    expect(parseCents('$1,250.00')).toBe(125000);
    expect(parseCents('1250')).toBe(125000);
    expect(parseCents('0.5')).toBe(50);
  });

  it('reads a fractional quantity into thousandths', () => {
    expect(parseQuantity('1.5')).toBe(1500);
    expect(parseQuantity('0.75')).toBe(750);
    expect(parseQuantity(2)).toBe(2000);
  });

  it('round-trips a quantity through its display form', () => {
    expect(formatQuantity(parseQuantity('1.5'))).toBe('1.5');
    expect(formatQuantity(1000)).toBe('1');
  });

  it('falls back rather than producing NaN, and the two fall back differently on purpose', () => {
    // An unreadable PRICE is zero: inventing a number someone did not type is how a client gets
    // billed for something nobody agreed. An unreadable QUANTITY is one, because a blank quantity
    // box next to "Explainer narration" means one of them — and zero would silently produce a $0
    // line that looks itemised and bills nothing.
    expect(parseCents('abc')).toBe(0);
    expect(parseQuantity('')).toBe(1000);
  });

  it('keeps a minus on a price but not on a quantity', () => {
    // parseCents keeps the sign because a negative line price is how a credit or an agreed reduction
    // is itemised. parseQuantity strips it, so "-4" reads as 4: a negative COUNT of a deliverable has
    // no meaning, and the only realistic way one gets typed is a stray keystroke.
    expect(parseCents('-50')).toBe(-5000);
    expect(parseQuantity('-4')).toBe(4000);
  });
});

describe('formatCents', () => {
  it('formats null as zero rather than "$NaN"', () => {
    expect(formatCents(null)).toBe('$0.00');
    expect(formatCents(undefined)).toBe('$0.00');
  });
});
