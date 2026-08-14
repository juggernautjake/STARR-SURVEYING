// __tests__/receipts/filters.test.ts — slice F1 of
// docs/planning/in-progress/RECEIPT_REVIEW_SLIDESHOW_2026-08-14.md
//
// The rules behind "review receipts by job, by date, by type, by location, by card". Two of them
// are the kind that returns plausible-but-wrong rows rather than an error:
//
//   · WHICH DATE. `from`/`to` bounded `created_at` while the route's header said `transaction_at`.
//     "Show me April" meant *recorded* in April, so a 28 April purchase photographed on 2 May was
//     filed under May and no query could say otherwise.
//   · TEXT ESCAPING. PostgREST parses `,` and `.` as separators inside `or()`. An unescaped vendor
//     like "Smith, Jones & Co." does not error — it is read as extra filter terms and quietly
//     returns a different set.

import { describe, it, expect } from 'vitest';
import {
  parseReceiptFilters, normaliseLast4, escapeForOrIlike, vendorSearchExpression,
  describeFilters, truthy, DATE_COLUMN, DEFAULT_LIMIT, MAX_LIMIT,
} from '@/lib/receipts/filters';

describe('which date the range applies to', () => {
  it('bounds transaction_at when asked for the purchase date', () => {
    const f = parseReceiptFilters({ dateField: 'purchase', from: '2026-04-01' });
    expect(f.dateField).toBe('purchase');
    expect(f.dateColumn).toBe('transaction_at');
  });

  it('bounds created_at when asked for the recorded date', () => {
    expect(parseReceiptFilters({ dateField: 'recorded' }).dateColumn).toBe('created_at');
  });

  it('defaults to recorded, which is what every existing caller has been getting', () => {
    // Deliberately NOT changed to `purchase` even though that is arguably the more natural reading
    // of "April expenses": flipping the default would silently move every existing caller's
    // results, including the CSV export somebody reconciles against a bank statement.
    expect(parseReceiptFilters({}).dateColumn).toBe('created_at');
    expect(parseReceiptFilters({ dateField: null }).dateColumn).toBe('created_at');
  });

  it('falls back to recorded for a value it does not recognise', () => {
    for (const bad of ['txn', 'TRANSACTION', 'purchased', '1', '']) {
      expect(parseReceiptFilters({ dateField: bad }).dateColumn, bad).toBe('created_at');
    }
  });

  it('maps each choice to exactly one column', () => {
    expect(DATE_COLUMN.purchase).toBe('transaction_at');
    expect(DATE_COLUMN.recorded).toBe('created_at');
  });
});

describe('a typed card number', () => {
  it('takes the last four digits of whatever was typed', () => {
    // People type card numbers every way there is. All of these mean the same card.
    for (const typed of ['4824', '**** 4824', '4111-1111-1111-4824', '4111 1111 1111 4824']) {
      expect(normaliseLast4(typed), typed).toBe('4824');
    }
  });

  it('refuses fewer than four digits rather than filtering to nothing', () => {
    // A stray keystroke must not silently empty the list — that reads as "there are no receipts".
    for (const partial of ['48', '4', '', '   ', 'abcd', null, undefined]) {
      expect(normaliseLast4(partial), String(partial)).toBeNull();
    }
  });

  it('never carries more than the last four anywhere', () => {
    // The receipt itself only ever prints four digits. Pasting a full PAN must not put one in a
    // query string, a log line, or a filter chip.
    const full = '4111111111114824';
    const out = normaliseLast4(full)!;
    expect(out).toHaveLength(4);
    expect(full.includes(out)).toBe(true);
    expect(out).toBe('4824');
  });
});

describe('escaping free text for a PostgREST or()', () => {
  it('neutralises the separators PostgREST parses', () => {
    // `,` and `.` end a term inside an or() list; a vendor with either would be read as extra
    // filter terms, which returns the wrong rows without erroring.
    const out = escapeForOrIlike('Smith, Jones & Co.');
    expect(out).not.toContain(',');
    expect(out).not.toContain('.');
    expect(out).toContain('Smith');
    expect(out).toContain('Jones');
  });

  it('escapes LIKE wildcards so a literal % is a literal %', () => {
    expect(escapeForOrIlike('100% Pure')).toContain('\\%');
    expect(escapeForOrIlike('a_b')).toContain('\\_');
  });

  it('leaves ordinary words alone', () => {
    expect(escapeForOrIlike('Desert Sands Hardware')).toBe('Desert Sands Hardware');
  });
});

describe('the search expression', () => {
  it('searches vendor name AND address, because nobody knows which column a town is in', () => {
    const expr = vendorSearchExpression('Las Cruces')!;
    expect(expr).toContain('vendor_name.ilike.%Las Cruces%');
    expect(expr).toContain('vendor_address.ilike.%Las Cruces%');
  });

  it('is null when there is nothing to search for', () => {
    expect(vendorSearchExpression(null)).toBeNull();
    expect(vendorSearchExpression('')).toBeNull();
  });

  it('is null when the text escapes down to nothing', () => {
    // '...' escapes to whitespace only. Searching for that should return everything, not an
    // expression matching '%   %' which would drop rows with no vendor.
    expect(vendorSearchExpression('...')).toBeNull();
  });
});

describe('the limit', () => {
  it('defaults to 100 and caps at 500', () => {
    expect(parseReceiptFilters({}).limit).toBe(DEFAULT_LIMIT);
    expect(parseReceiptFilters({ limit: 10_000 }).limit).toBe(MAX_LIMIT);
    expect(parseReceiptFilters({ limit: '250' }).limit).toBe(250);
  });

  it('never returns zero or a negative page', () => {
    for (const bad of ['0', '-5', 'abc', '', null]) {
      const n = parseReceiptFilters({ limit: bad }).limit;
      expect(n, String(bad)).toBeGreaterThan(0);
    }
  });
});

describe('whether the list is narrowed', () => {
  it('a date range alone is not "narrowed"', () => {
    // The queue opens on the current month by default. Calling that a filter would leave a
    // "you are filtering" banner on the ordinary view forever, and a banner that is always on is a
    // banner nobody reads.
    expect(parseReceiptFilters({ from: '2026-08-01', to: '2026-08-31' }).isNarrowed).toBe(false);
  });

  it('any real filter is', () => {
    for (const f of [
      { q: 'Sands' }, { category: 'fuel' }, { paymentMethod: 'card' },
      { last4: '4824' }, { cardId: 'abc' }, { jobId: 'j1' }, { email: 'a@b.com' },
    ]) {
      expect(parseReceiptFilters(f).isNarrowed, JSON.stringify(f)).toBe(true);
    }
  });
});

describe('saying what is being shown', () => {
  it('names each active filter in words', () => {
    const parts = describeFilters(parseReceiptFilters({ q: 'Sands', category: 'fuel', last4: '4824' }));
    expect(parts.join(' · ')).toContain('“Sands”');
    expect(parts.join(' · ')).toContain('category fuel');
    expect(parts.join(' · ')).toContain('card ending 4824');
  });

  it('says which date basis a range is on', () => {
    const purchase = describeFilters(parseReceiptFilters({ dateField: 'purchase', from: '2026-04-01', to: '2026-04-30' }));
    const recorded = describeFilters(parseReceiptFilters({ dateField: 'recorded', from: '2026-04-01', to: '2026-04-30' }));
    expect(purchase.join()).toContain('purchased');
    expect(recorded.join()).toContain('recorded');
  });

  it('prefers the card label over the raw last four when a saved card is chosen', () => {
    const parts = describeFilters(parseReceiptFilters({ cardId: 'abc', last4: '4824' }), 'Company Amex');
    expect(parts.join()).toContain('Company Amex');
    // Not both — "on Company Amex · card ending 4824" is the same fact twice.
    expect(parts.join()).not.toContain('card ending');
  });

  it('says nothing when nothing is filtered', () => {
    expect(describeFilters(parseReceiptFilters({}))).toEqual([]);
  });
});

describe('truthy', () => {
  it('accepts the spellings a URL, a checkbox and a curl each produce', () => {
    for (const yes of ['1', 'true', 'TRUE', 'yes', 'on']) expect(truthy(yes), yes).toBe(true);
    for (const no of ['0', 'false', '', 'no', null, undefined]) expect(truthy(no), String(no)).toBe(false);
  });
});
