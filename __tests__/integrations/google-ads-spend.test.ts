// __tests__/integrations/google-ads-spend.test.ts — ad spend parsing and cost maths. A11.
//
// Three things the Ads API does that quietly break naive parsers are pinned here, because each fails as a
// PLAUSIBLE WRONG NUMBER rather than an exception: an array of chunks, int64-as-string, and two different
// money units in the same metrics object.
import { describe, it, expect } from 'vitest';
import {
  MICROS_PER_UNIT, buildSpendQuery, costPer, grainKey, parseSpendRows, toUnits, totalSpend,
} from '@/lib/integrations/google-ads/spend';

const result = (over: Record<string, unknown> = {}) => ({
  segments: { date: '2026-07-14' },
  campaign: { id: '111', name: 'Boundary Surveys — Doña Ana' },
  adGroup: { id: '222', name: 'residential' },
  metrics: {
    impressions: '4210',
    clicks: '96',
    costMicros: '12340000',   // $12.34
    conversions: 3.5,
    conversionsValue: 4800,   // dollars, NOT micros
  },
  ...over,
});

describe('parseSpendRows — the array of chunks', () => {
  it('reads EVERY chunk, not just the first', () => {
    // searchStream answers with an array. Reading body[0].results returns the first few hundred rows and
    // silently drops the rest, which reads as "we spent less last month".
    const rows = parseSpendRows([
      { results: [result({ segments: { date: '2026-07-01' } })] },
      { results: [result({ segments: { date: '2026-07-02' } })] },
      { results: [result({ segments: { date: '2026-07-03' } })] },
    ]);
    expect(rows.map((r) => r.spendDate)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
  });

  it('also accepts a single non-streamed object', () => {
    expect(parseSpendRows({ results: [result()] })).toHaveLength(1);
  });

  it('survives null, empty, and result-less chunks instead of throwing', () => {
    // A parser that throws on an unexpected body turns a partial import into a crashed cron.
    for (const body of [null, undefined, [], [{}], [{ results: null }], {}]) {
      expect(() => parseSpendRows(body)).not.toThrow();
      expect(parseSpendRows(body)).toEqual([]);
    }
  });
});

describe('parseSpendRows — int64 arrives as a STRING', () => {
  it('converts costMicros to a number, not a string', () => {
    // `"12340000" + "12340000"` is "1234000012340000". A month of spend becomes a 200-character number.
    const [row] = parseSpendRows([{ results: [result()] }]);
    expect(row.costMicros).toBe(12_340_000);
    expect(typeof row.costMicros).toBe('number');
    expect(row.impressions).toBe(4210);
    expect(row.clicks).toBe(96);
  });

  it('sums correctly across rows', () => {
    const rows = parseSpendRows([{ results: [result(), result({ segments: { date: '2026-07-15' } })] }]);
    expect(totalSpend(rows)).toBe(24_680_000);
  });

  it('treats a missing or unparseable metric as 0 rather than NaN', () => {
    // NaN propagates through every sum downstream and turns the whole dashboard blank.
    const [row] = parseSpendRows([{ results: [result({ metrics: { costMicros: 'abc' } })] }]);
    expect(row.costMicros).toBe(0);
    expect(row.clicks).toBe(0);
    expect(Number.isNaN(row.conversions)).toBe(false);
  });
});

describe('parseSpendRows — two different money units in one metrics object', () => {
  it('keeps costMicros in micros and converts conversionsValue INTO micros', () => {
    // costMicros is micros; conversionsValue is a double in currency units. Mixing them makes a
    // cost-per-conversion figure a million times too big.
    const [row] = parseSpendRows([{ results: [result()] }]);
    expect(row.costMicros).toBe(12_340_000);          // $12.34
    expect(row.conversionValueMicros).toBe(4_800_000_000); // $4,800
    expect(toUnits(row.costMicros)).toBeCloseTo(12.34, 5);
  });

  it('keeps fractional conversions as fractional', () => {
    // Google reports 3.5 conversions. Rounding to 4 inflates every conversion rate on the page.
    expect(parseSpendRows([{ results: [result()] }])[0].conversions).toBe(3.5);
  });

  it('rounds the conversion value rather than leaving float dust', () => {
    const [row] = parseSpendRows([{ results: [result({ metrics: { conversionsValue: 0.1 + 0.2 } })] }]);
    expect(row.conversionValueMicros).toBe(300_000);
    expect(Number.isInteger(row.conversionValueMicros)).toBe(true);
  });
});

describe('parseSpendRows — rows it refuses', () => {
  it('drops a row with no usable date', () => {
    // The table's grain is (date, campaign, ad group). A row with no date cannot be stored, and guessing
    // one attributes spend to the wrong day.
    expect(parseSpendRows([{ results: [result({ segments: {} }), result({ segments: { date: 'July' } })] }])).toEqual([]);
  });

  it('keeps a row with no campaign — account-level spend is still spend', () => {
    const [row] = parseSpendRows([{ results: [result({ campaign: undefined, adGroup: undefined })] }]);
    expect(row.campaignId).toBeNull();
    expect(row.costMicros).toBe(12_340_000);
  });

  it('stringifies a numeric campaign id so the grain key is stable', () => {
    // 111 and "111" must not become two rows for the same ad group.
    const [row] = parseSpendRows([{ results: [result({ campaign: { id: 111, name: 'x' } })] }]);
    expect(row.campaignId).toBe('111');
  });
});

describe('buildSpendQuery — GAQL has no parameter binding', () => {
  it('builds a range query at ad-group grain', () => {
    const q = buildSpendQuery('2026-07-01', '2026-07-31');
    expect(q).toContain("segments.date BETWEEN '2026-07-01' AND '2026-07-31'");
    expect(q).toContain('metrics.cost_micros');
    expect(q).toContain('FROM ad_group');
  });

  it('REJECTS anything that is not a bare date', () => {
    // The only safe input to an unparameterised query language is one that cannot contain anything else.
    for (const bad of ["2026-07-01' OR '1'='1", '2026/07/01', 'LAST_30_DAYS', '', '2026-7-1']) {
      expect(() => buildSpendQuery(bad, '2026-07-31')).toThrow();
      expect(() => buildSpendQuery('2026-07-01', bad)).toThrow();
    }
  });

  it('rejects a backwards range instead of returning nothing', () => {
    // An empty result would read as "we spent nothing", which is a worse answer than an error.
    expect(() => buildSpendQuery('2026-07-31', '2026-07-01')).toThrow(/backwards/);
  });
});

describe('costPer — dividing by zero leads is not a cost of zero', () => {
  it('computes cost per lead in currency units', () => {
    expect(costPer(63_000_000, 1)).toBeCloseTo(63, 5);
    expect(costPer(882_000_000, 14)).toBeCloseTo(63, 5);
  });

  it('returns NULL when there were no leads, not 0 and not Infinity', () => {
    // Spend with no leads is a question with no answer. Printing "$0.00 per lead" next to real money
    // spent is the single most misleading thing this page could say.
    expect(costPer(500_000_000, 0)).toBeNull();
    expect(costPer(500_000_000, -1)).toBeNull();
    expect(costPer(500_000_000, NaN)).toBeNull();
  });

  it('returns 0 when nothing was spent and leads arrived', () => {
    // Organic leads really do cost nothing. This is the one case where 0 is the true answer.
    expect(costPer(0, 5)).toBe(0);
  });
});

describe('grainKey — a re-import must update, not double', () => {
  it('is identical for the same date/campaign/ad group', () => {
    const r = { spendDate: '2026-07-14', campaignId: '111', adGroupId: '222' };
    expect(grainKey(r)).toBe(grainKey({ ...r }));
  });

  it('collapses null campaign and null ad group to a stable key', () => {
    // NULLs never collide in SQL, so a manual monthly total with no campaign would re-insert every time
    // and silently double the spend. The COALESCE in the index and this key agree on ''.
    expect(grainKey({ spendDate: '2026-07-14', campaignId: null, adGroupId: null }))
      .toBe('2026-07-14|google_ads||');
  });

  it('separates platforms', () => {
    const r = { spendDate: '2026-07-14', campaignId: null, adGroupId: null };
    expect(grainKey(r, 'facebook')).not.toBe(grainKey(r, 'google_ads'));
  });
});

describe('the unit constant', () => {
  it('is a million — micros, not cents', () => {
    // Confusing micros with cents is a factor of 10,000 and would read as a plausible number.
    expect(MICROS_PER_UNIT).toBe(1_000_000);
    expect(toUnits(1_000_000)).toBe(1);
  });
});
