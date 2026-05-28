// __tests__/lib/research-confidence.test.ts
//
// Coverage for the confidence-score → level / color / symbol mapping.
// These functions are pure threshold buckets, but they're used in the
// validation report, the per-element panel, AND the server-side SVG
// renderer — pinning the boundary values prevents silent drift between
// the three.

import { describe, it, expect } from 'vitest';
import {
  getConfidenceLevel,
  getConfidenceColor,
  getConfidenceDescription,
  getConfidenceSymbol,
  formatConfidenceSymbol,
  summariseConfidenceSymbols,
} from '@/lib/research/confidence';

describe('getConfidenceLevel — bucket boundaries', () => {
  it('≥ 90 → very_high', () => {
    expect(getConfidenceLevel(100)).toBe('very_high');
    expect(getConfidenceLevel(90)).toBe('very_high');
  });

  it('75–89 → high', () => {
    expect(getConfidenceLevel(89)).toBe('high');
    expect(getConfidenceLevel(75)).toBe('high');
  });

  it('55–74 → moderate', () => {
    expect(getConfidenceLevel(74)).toBe('moderate');
    expect(getConfidenceLevel(55)).toBe('moderate');
  });

  it('35–54 → low', () => {
    expect(getConfidenceLevel(54)).toBe('low');
    expect(getConfidenceLevel(35)).toBe('low');
  });

  it('< 35 → very_low', () => {
    expect(getConfidenceLevel(34)).toBe('very_low');
    expect(getConfidenceLevel(0)).toBe('very_low');
  });
});

describe('getConfidenceColor — matches the level boundaries', () => {
  // The renderer relies on these being real hex codes (server-side SVG
  // attribute literals don't resolve CSS var()), so check each bucket
  // returns a `#RRGGBB` string.
  it('returns a 7-char hex per bucket', () => {
    for (const score of [100, 80, 60, 40, 10]) {
      const c = getConfidenceColor(score);
      expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('top + bottom buckets are distinct (green vs red)', () => {
    expect(getConfidenceColor(95)).not.toBe(getConfidenceColor(10));
  });
});

describe('getConfidenceDescription', () => {
  it('returns the matching tier description', () => {
    expect(getConfidenceDescription(95)).toMatch(/Very High/);
    expect(getConfidenceDescription(80)).toMatch(/^High/);
    expect(getConfidenceDescription(60)).toMatch(/Moderate/);
    expect(getConfidenceDescription(40)).toMatch(/^Low/);
    expect(getConfidenceDescription(10)).toMatch(/Very Low/);
  });
});

describe('getConfidenceSymbol — 5-symbol notation', () => {
  it('≥ 88 → CONFIRMED ✓', () => {
    const r = getConfidenceSymbol(88);
    expect(r.symbol).toBe('CONFIRMED');
    expect(r.display).toBe('✓');
  });

  it('65 ≤ score < 88 → DEDUCED ~', () => {
    const r = getConfidenceSymbol(65);
    expect(r.symbol).toBe('DEDUCED');
    expect(r.display).toBe('~');
  });

  it('45 ≤ score < 65 → UNCONFIRMED ?', () => {
    expect(getConfidenceSymbol(45).symbol).toBe('UNCONFIRMED');
    expect(getConfidenceSymbol(64).symbol).toBe('UNCONFIRMED');
  });

  it('20 ≤ score < 45 → DISCREPANCY ✗', () => {
    expect(getConfidenceSymbol(20).symbol).toBe('DISCREPANCY');
    expect(getConfidenceSymbol(44).symbol).toBe('DISCREPANCY');
  });

  it('< 20 → CRITICAL ✗✗', () => {
    expect(getConfidenceSymbol(0).symbol).toBe('CRITICAL');
    expect(getConfidenceSymbol(19).display).toBe('✗✗');
  });

  it('carries the original score in the rating', () => {
    expect(getConfidenceSymbol(72.5).score).toBe(72.5);
  });
});

describe('formatConfidenceSymbol', () => {
  it('hides the score by default', () => {
    expect(formatConfidenceSymbol(90)).toBe('✓ CONFIRMED');
  });

  it('shows a rounded score with showScore=true', () => {
    expect(formatConfidenceSymbol(89.7, true)).toBe('✓ CONFIRMED (90)');
  });
});

describe('summariseConfidenceSymbols', () => {
  it('counts each bucket (CONFIRMED 3, DEDUCED 1, UNCONFIRMED 2, DISCREPANCY 1, CRITICAL 1)', () => {
    const scores = [95, 92, 88, 70, 60, 50, 30, 10];
    const out = summariseConfidenceSymbols(scores);
    expect(out.counts.CONFIRMED).toBe(3);
    expect(out.counts.DEDUCED).toBe(1);
    expect(out.counts.UNCONFIRMED).toBe(2);
    expect(out.counts.DISCREPANCY).toBe(1);
    expect(out.counts.CRITICAL).toBe(1);
  });

  it('computes overallPct as the rounded average of the scores', () => {
    // (95+92+88+70+60+50+30+10) / 8 = 495 / 8 = 61.875 → 62
    const out = summariseConfidenceSymbols([95, 92, 88, 70, 60, 50, 30, 10]);
    expect(out.overallPct).toBe(62);
  });

  it('dominantSymbol is the symbol for the OVERALL AVERAGE, not the most-frequent count', () => {
    // The function name is mildly misleading: "dominant" here means
    // "the symbol bucket of the average score" — for [95, 92, 88, …, 10]
    // the most-frequent count is CONFIRMED (3) but the average (62)
    // falls in UNCONFIRMED. The test pins the function's actual contract.
    const out = summariseConfidenceSymbols([95, 92, 88, 70, 60, 50, 30, 10]);
    expect(out.dominantSymbol.symbol).toBe('UNCONFIRMED');
  });

  it('handles an empty score array gracefully', () => {
    const out = summariseConfidenceSymbols([]);
    expect(out.counts.CONFIRMED).toBe(0);
    expect(out.counts.CRITICAL).toBe(0);
    expect(out.overallPct).toBe(0);
    expect(out.dominantSymbol.symbol).toBe('CRITICAL'); // 0 → CRITICAL
  });
});
