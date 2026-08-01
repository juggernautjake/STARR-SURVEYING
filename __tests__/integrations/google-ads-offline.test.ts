// __tests__/integrations/google-ads-offline.test.ts — the offline conversion CSV (A7).
//
// Everything here is pure, and every case is one that fails at UPLOAD TIME rather than at runtime — which
// is the worst place to find out, because the feedback is a rejection report in a different product, days
// later, about a file nobody has in front of them any more.
import { describe, it, expect } from 'vitest';
import {
  CLICK_COLUMNS, CLICK_WINDOW_DAYS, ENHANCED_COLUMNS, UPLOAD_TIMEZONE,
  buildCsv, buildRow, csvField, formatConversionTime, formatValue, isUploadable, withinClickWindow,
} from '@/lib/integrations/google-ads/offline';

const row = (over = {}) => ({
  clickId: 'Cj0KCQ-test',
  conversionName: 'Job — Won',
  occurredAt: '2026-03-12T15:04:05.000Z',
  valueCents: 480000,
  orderId: 'job_created:jobs:abc',
  ...over,
});

describe('formatConversionTime', () => {
  it('emits YYYY-MM-DD HH:MM:SS with an explicit offset', () => {
    expect(formatConversionTime('2026-03-12T15:04:05.000Z'))
      .toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  it('converts into the business timezone rather than reporting UTC', () => {
    // 15:04 UTC is 10:04 in Central Daylight Time. Uploading UTC while claiming Central would put every
    // conversion five hours out — invisible in a monthly total, obvious in an hour-of-day report.
    expect(formatConversionTime('2026-03-12T15:04:05.000Z')).toBe('2026-03-12 10:04:05-05:00');
  });

  it('gets the offset right on BOTH sides of daylight saving', () => {
    // The reason the offset is computed from the instant instead of hardcoded. A constant is wrong for
    // half the year, and the hour that repeats every autumn is exactly when nobody can explain the gap.
    expect(formatConversionTime('2026-01-15T18:00:00.000Z')).toContain('-06:00'); // CST
    expect(formatConversionTime('2026-07-15T18:00:00.000Z')).toContain('-05:00'); // CDT
  });

  it('writes midnight as 00, not 24', () => {
    // `hour12: false` yields "24" in some runtimes, and "24:00:00" is not a time Google accepts.
    //
    // The instant has to be picked with the offset in mind: midnight Central is 06:00 UTC in CST and
    // 05:00 UTC in CDT. The first version of this test used 06:00 UTC on a March date — which is inside
    // daylight saving, so it was 01:00 Central and the test was asserting the wrong hour. The code was
    // right; the expectation was not.
    expect(formatConversionTime('2026-01-15T06:00:00.000Z')).toBe('2026-01-15 00:00:00-06:00');
  });

  it('throws on an unparseable time rather than emitting a broken row', () => {
    // A row with a garbage timestamp is rejected by the importer and can take the file with it. Failing
    // while building is failing where somebody can see it.
    expect(() => formatConversionTime('not-a-date')).toThrow(/Unparseable/);
  });
});

describe('formatValue', () => {
  it('converts cents to a two-decimal string', () => {
    expect(formatValue(480000)).toBe('4800.00');
    expect(formatValue(1)).toBe('0.01');
  });

  it('sends 0 for an unvalued conversion, because the column is required', () => {
    expect(formatValue(null)).toBe('0');
    expect(formatValue(undefined)).toBe('0');
    expect(formatValue(NaN)).toBe('0');
  });
});

describe('csvField', () => {
  it('quotes anything with a comma, quote or newline', () => {
    // A scope note with a comma would otherwise shift every column after it and corrupt the upload
    // silently — the file still parses, it just means something else.
    expect(csvField('Boundary survey, 12 acres')).toBe('"Boundary survey, 12 acres"');
    expect(csvField('He said "no"')).toBe('"He said ""no"""');
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
  });

  it('leaves ordinary values alone and renders null as empty', () => {
    expect(csvField('Job — Won')).toBe('Job — Won');
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
  });
});

describe('isUploadable — a row with no identifier is EXCLUDED, not blanked', () => {
  it('requires a click id on the click path', () => {
    expect(isUploadable(row(), 'click')).toBe(true);
    expect(isUploadable(row({ clickId: null }), 'click')).toBe(false);
    expect(isUploadable(row({ clickId: '' }), 'click')).toBe(false);
  });

  it('requires an email OR a phone on the enhanced path', () => {
    expect(isUploadable(row({ clickId: null, hashedEmail: 'abc' }), 'enhanced')).toBe(true);
    expect(isUploadable(row({ clickId: null, hashedPhone: 'def' }), 'enhanced')).toBe(true);
    expect(isUploadable(row({ clickId: null }), 'enhanced')).toBe(false);
  });

  it('does not accept a click id as an enhanced identifier', () => {
    // Different match mechanism entirely. A gclid in the Email column matches nobody.
    expect(isUploadable(row({ hashedEmail: null, hashedPhone: null }), 'enhanced')).toBe(false);
  });
});

describe('buildCsv', () => {
  it('writes the timezone line, then the headers, then the rows', () => {
    const { csv } = buildCsv([row()], 'click');
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe(`Parameters:TimeZone=${UPLOAD_TIMEZONE}`);
    expect(lines[1]).toBe(CLICK_COLUMNS.join(','));
    expect(lines[2]).toContain('Cj0KCQ-test');
    expect(lines[2]).toContain('4800.00');
  });

  it('uses the enhanced column set for the enhanced format', () => {
    const { csv } = buildCsv([row({ clickId: null, hashedEmail: 'h1', hashedPhone: 'h2' })], 'enhanced');
    expect(csv.split('\n')[1]).toBe(ENHANCED_COLUMNS.join(','));
  });

  it('REPORTS the rows it skipped rather than dropping them silently', () => {
    // A CSV full of identifier-less rows is rejected wholesale, so one unusable row must not take the
    // whole upload down — but the operator has to be told how many did not make it.
    const res = buildCsv([row(), row({ clickId: null }), row({ clickId: null })], 'click');
    expect(res.included).toBe(1);
    expect(res.skipped).toBe(2);
    expect(res.csv.trim().split('\n')).toHaveLength(3); // params + header + 1 row
  });

  it('carries the Order ID, which is what makes a re-export safe', () => {
    // G3. Google treats Order ID as the conversion's identity, so re-uploading a row it has seen is
    // ignored rather than counted twice — idempotency by construction rather than by remembering.
    const { csv } = buildCsv([row()], 'click');
    expect(csv).toContain('job_created:jobs:abc');
  });

  it('produces a header-only file for an empty set, not an empty file', () => {
    const res = buildCsv([], 'click');
    expect(res.included).toBe(0);
    expect(res.csv).toContain(CLICK_COLUMNS.join(','));
  });
});

describe('withinClickWindow', () => {
  const click = '2026-01-01T00:00:00.000Z';

  it('accepts a conversion inside 90 days', () => {
    expect(CLICK_WINDOW_DAYS).toBe(90);
    expect(withinClickWindow(click, '2026-03-15T00:00:00.000Z')).toBe(true);
  });

  it('rejects one outside it', () => {
    // Rejected at upload is worse than absent: it produces an error report someone has to interpret and
    // makes a good upload look broken.
    expect(withinClickWindow(click, '2026-05-01T00:00:00.000Z')).toBe(false);
  });

  it('rejects a conversion BEFORE its click', () => {
    expect(withinClickWindow('2026-03-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')).toBe(false);
  });

  it('does not apply to the enhanced path, where there is no click', () => {
    expect(withinClickWindow(null, '2026-05-01T00:00:00.000Z')).toBe(true);
  });

  it('treats an unreadable date as OUTSIDE, never inside', () => {
    expect(withinClickWindow('nonsense', '2026-01-02T00:00:00.000Z')).toBe(false);
  });
});

describe('buildRow column order', () => {
  it('matches the header, position for position', () => {
    // Some Google importers match on position as well as name, so a reordered row is a silently wrong
    // upload — value in the currency column, and so on.
    expect(buildRow(row(), 'click')).toHaveLength(CLICK_COLUMNS.length);
    expect(buildRow(row({ hashedEmail: 'a', hashedPhone: 'b' }), 'enhanced')).toHaveLength(ENHANCED_COLUMNS.length);
    const [clickId, name, , value, currency, orderId] = buildRow(row(), 'click');
    expect(clickId).toBe('Cj0KCQ-test');
    expect(name).toBe('Job — Won');
    expect(value).toBe('4800.00');
    expect(currency).toBe('USD');
    expect(orderId).toBe('job_created:jobs:abc');
  });
});
