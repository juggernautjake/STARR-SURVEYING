import { describe, it, expect } from 'vitest';
import {
  ANALYSIS_RATE_USD_PER_PAGE,
  estimateAnalysis,
  estimateForDocuments,
  pageCountOf,
  formatEta,
  formatUsd,
} from '@/lib/research/analysis-estimate';

// Plan GATHER_AND_REVIEW_SPLIT E1 — the standardized $/page analysis quote. The number the UI shows
// (total and per file) and the cap a per-file "Analyze this" button sends all come from here, so the
// price a user is quoted is exactly the price a button charges. Pin the arithmetic and the edges.

describe('estimateAnalysis — fixed per-page quote', () => {
  it('prices at the standardized rate', () => {
    expect(estimateAnalysis(10)).toEqual({
      pages: 10,
      costUsd: round2(10 * ANALYSIS_RATE_USD_PER_PAGE),
      etaSeconds: 80,
    });
  });

  it('treats zero / negative / NaN pages as a $0 quote', () => {
    expect(estimateAnalysis(0).costUsd).toBe(0);
    expect(estimateAnalysis(-5).costUsd).toBe(0);
    expect(estimateAnalysis(NaN).costUsd).toBe(0);
  });

  it('rounds fractional pages up (a partial page still processes)', () => {
    expect(estimateAnalysis(2.1).pages).toBe(3);
  });
});

describe('pageCountOf + estimateForDocuments — the whole-project quote', () => {
  it('counts a missing/zero page_count as one page, not zero', () => {
    expect(pageCountOf({})).toBe(1);
    expect(pageCountOf({ page_count: null })).toBe(1);
    expect(pageCountOf({ page_count: 0 })).toBe(1);
    expect(pageCountOf({ page_count: 4 })).toBe(4);
  });

  it('sums pages across files at the fixed rate', () => {
    const docs = [{ page_count: 3 }, { page_count: 1 }, {}, { page_count: 10 }];
    const est = estimateForDocuments(docs); // 3 + 1 + 1 + 10 = 15 pages
    expect(est.pages).toBe(15);
    expect(est.costUsd).toBe(round2(15 * ANALYSIS_RATE_USD_PER_PAGE));
  });

  it('quotes $0 for no documents', () => {
    expect(estimateForDocuments([]).costUsd).toBe(0);
  });
});

describe('formatting', () => {
  it('formats an ETA in sec / min / hr', () => {
    expect(formatEta(45)).toBe('~45 sec');
    expect(formatEta(180)).toBe('~3 min');
    expect(formatEta(3900)).toBe('~1 hr 5 min');
    expect(formatEta(0)).toBe('~0 sec');
  });

  it('formats a USD price to cents', () => {
    expect(formatUsd(3.25)).toBe('$3.25');
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(-1)).toBe('$0.00');
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
