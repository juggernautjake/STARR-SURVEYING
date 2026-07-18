import { describe, it, expect } from 'vitest';
import { formatCents, parseCents } from '../../mobile/lib/money';

// mobile/lib/money.ts — cents↔dollar-string for receipts (receipts.total_cents) and pay. Pure, financial-
// correctness-critical, shipped untested. These pin the rounding-free conversion, the sign/thousands
// formatting, the tolerant-but-strict parser, and the round-trip invariant.

describe('formatCents', () => {
  it('formats whole and fractional dollars with 2-decimal cents', () => {
    expect(formatCents(1234)).toBe('$12.34');
    expect(formatCents(100)).toBe('$1.00');
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(5)).toBe('$0.05');  // zero-pads the cents
    expect(formatCents(99)).toBe('$0.99');
  });

  it('inserts thousands separators', () => {
    expect(formatCents(1_000_00)).toBe('$1,000.00');
    expect(formatCents(123456789)).toBe('$1,234,567.89');
  });

  it('renders a negative amount with a leading minus (refund/adjustment)', () => {
    expect(formatCents(-1234)).toBe('-$12.34');
    expect(formatCents(-5)).toBe('-$0.05');
  });

  it('returns an em-dash placeholder for null/undefined/non-finite (so render sites need no guard)', () => {
    expect(formatCents(null)).toBe('—');
    expect(formatCents(undefined)).toBe('—');
    expect(formatCents(NaN)).toBe('—');
    expect(formatCents(Infinity)).toBe('—');
  });
});

describe('parseCents', () => {
  it('parses plain, $-prefixed, comma-grouped, and whitespace-padded dollar strings', () => {
    expect(parseCents('12.34')).toBe(1234);
    expect(parseCents('$12.34')).toBe(1234);
    expect(parseCents('1,234.56')).toBe(123456);
    expect(parseCents('  12.34  ')).toBe(1234);
    expect(parseCents('12')).toBe(1200);   // no decimal → whole dollars
  });

  it('zero-pads a single-digit fraction (12.3 → 1230, not 1203)', () => {
    expect(parseCents('12.3')).toBe(1230);
    expect(parseCents('0.05')).toBe(5);
    expect(parseCents('0')).toBe(0);
  });

  it('returns null for empty/nullish input (mid-typing, not an error)', () => {
    expect(parseCents('')).toBeNull();
    expect(parseCents('   ')).toBeNull();
    expect(parseCents(null)).toBeNull();
    expect(parseCents(undefined)).toBeNull();
    expect(parseCents('.')).toBeNull(); // "12." mid-type variant
  });

  it('rejects malformed money: 3+ decimals, multiple dots, scientific notation, negatives, letters', () => {
    expect(parseCents('12.345')).toBeNull(); // over-precise
    expect(parseCents('12.3.4')).toBeNull();
    expect(parseCents('1e2')).toBeNull();
    expect(parseCents('-5')).toBeNull();     // refunds use a separate field, not a negative here
    expect(parseCents('abc')).toBeNull();
    expect(parseCents('$')).toBeNull();
  });
});

describe('round-trip', () => {
  it('parseCents(formatCents(x)) === x for representable non-negative amounts', () => {
    for (const cents of [0, 5, 99, 100, 1234, 100000, 123456789]) {
      expect(parseCents(formatCents(cents))).toBe(cents);
    }
  });
});
