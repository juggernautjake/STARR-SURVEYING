// __tests__/dnd/stream-influence.test.ts — patron-influence meter math (J11).
import { describe, it, expect } from 'vitest';
import { viewerFactor, computeInfluence, viewerDC, MAX_DC, MIN_DC, chatRatePerSec, viewerTierBounds, fluctuateViewers, engagementBoostFor, ENGAGEMENT_BOOST_CAP, organicDC, resolveDC, DC_ENGAGEMENT_NUDGE } from '@/lib/dnd/stream-influence';

describe('chatRatePerSec', () => {
  it('anchors to the DM spec (DC 15 ≈ 1/sec, DC 20 ≈ 2/sec) and is monotonic', () => {
    expect(chatRatePerSec(15)).toBe(1);
    expect(chatRatePerSec(20)).toBe(2);
    expect(chatRatePerSec(2)).toBeLessThan(0.1); // a lonely chat barely trickles
    expect(chatRatePerSec(25)).toBeGreaterThan(chatRatePerSec(20));
    let prev = 0;
    for (let dc = 2; dc <= 25; dc++) { expect(chatRatePerSec(dc)).toBeGreaterThanOrEqual(prev); prev = chatRatePerSec(dc); }
  });
});

describe('viewerTierBounds', () => {
  it('returns the [min,max] of the DC tier containing the count', () => {
    expect(viewerTierBounds(16)).toEqual([1, 100]);
    expect(viewerTierBounds(200_000)).toEqual([125_001, 250_000]);
    expect(viewerTierBounds(2e9)[0]).toBe(1_000_000_001);
  });
});

describe('fluctuateViewers', () => {
  it('keeps 0 at 0, and hovers small counts by a gentle ±spread (never below 1)', () => {
    for (const r of [0, 0.5, 0.999]) expect(fluctuateViewers(0, r)).toBe(0);
    // small crowds hover around the set value (a bit more, a bit less) but never below 1
    for (let i = 0; i < 200; i++) {
      const r = i / 200;
      const f10 = fluctuateViewers(10, r);
      expect(f10).toBeGreaterThanOrEqual(1);
      expect(f10).toBeLessThanOrEqual(12); // 10 ± max(1, round(1.5)=2)
      const f15 = fluctuateViewers(15, r);
      expect(f15).toBeGreaterThanOrEqual(13);
      expect(f15).toBeLessThanOrEqual(17);
    }
    // it actually moves off the set value at the extremes of the random range
    expect(fluctuateViewers(10, 0)).toBeLessThan(10);
    expect(fluctuateViewers(10, 0.999)).toBeGreaterThan(10);
  });
  it('16+ drifts but stays inside its DC tier (DC never changes)', () => {
    for (let i = 0; i < 200; i++) {
      const r = i / 200;
      const f16 = fluctuateViewers(16, r);
      expect(f16).toBeGreaterThanOrEqual(1);
      expect(f16).toBeLessThanOrEqual(100); // still DC 2
      expect(viewerDC(f16)).toBe(viewerDC(16));
      const f200k = fluctuateViewers(200_000, r);
      expect(f200k).toBeGreaterThanOrEqual(125_001);
      expect(f200k).toBeLessThanOrEqual(250_000);
      expect(viewerDC(f200k)).toBe(viewerDC(200_000));
    }
  });
});

describe('viewerFactor', () => {
  it('is 0 for an empty/tiny audience and approaches 1 at quadrillions', () => {
    expect(viewerFactor(0)).toBe(0);
    expect(viewerFactor(1)).toBe(0);
    expect(viewerFactor(1e15)).toBeCloseTo(1, 5);
  });
  it('is monotonic in viewers', () => {
    expect(viewerFactor(1e6)).toBeLessThan(viewerFactor(1e9));
  });
});

describe('computeInfluence', () => {
  it('rises with both engagement and viewers', () => {
    expect(computeInfluence(0, 0)).toBeCloseTo(0, 5);
    expect(computeInfluence(0, 100)).toBeLessThan(computeInfluence(1e15, 100));
    expect(computeInfluence(1000, 20)).toBeLessThan(computeInfluence(1000, 90));
  });
  it('is clamped to 0..1', () => {
    expect(computeInfluence(1e18, 999)).toBeLessThanOrEqual(1);
    expect(computeInfluence(-5, -50)).toBeGreaterThanOrEqual(0);
  });
});

describe('viewerDC', () => {
  it('sets the DC purely by the viewer-count tier table (2–25)', () => {
    // floor + first tier
    expect(viewerDC(0)).toBe(2);
    expect(viewerDC(1)).toBe(2);
    expect(viewerDC(100)).toBe(2);
    // tier boundaries are inclusive-max: 101 rolls to the next tier
    expect(viewerDC(101)).toBe(3);
    expect(viewerDC(500)).toBe(3);
    expect(viewerDC(501)).toBe(4);
    expect(viewerDC(1000)).toBe(4);
    expect(viewerDC(1001)).toBe(5);
    // a few milestones from the DM's table
    expect(viewerDC(200_000)).toBe(11);
    expect(viewerDC(1_000_000)).toBe(14);
    expect(viewerDC(10_000_000)).toBe(18);
    expect(viewerDC(100_000_000)).toBe(21);
    // last explicit tier vs the ceiling
    expect(viewerDC(1_000_000_000)).toBe(24);
    expect(viewerDC(1_000_000_001)).toBe(MAX_DC);
    expect(viewerDC(1e15)).toBe(25);
  });
  it('is monotonic non-decreasing in viewers', () => {
    let prev = 0;
    for (const v of [0, 250, 900, 4000, 60000, 300000, 3_000_000, 60_000_000, 3e9]) {
      const dc = viewerDC(v);
      expect(dc).toBeGreaterThanOrEqual(prev);
      prev = dc;
    }
  });
});

describe('organicDC', () => {
  it('neutral engagement (50) leaves the viewer-tier DC unchanged', () => {
    for (const v of [0, 1000, 200_000, 1e9]) expect(organicDC(v, 50)).toBe(viewerDC(v));
  });
  it('max engagement nudges the DC up, zero nudges it down — within the cap', () => {
    const base = viewerDC(200_000); // 11
    expect(organicDC(200_000, 100)).toBe(Math.min(MAX_DC, base + DC_ENGAGEMENT_NUDGE));
    expect(organicDC(200_000, 0)).toBe(Math.max(MIN_DC, base - DC_ENGAGEMENT_NUDGE));
  });
  it('stays clamped to [MIN_DC, MAX_DC] at the extremes', () => {
    expect(organicDC(0, 0)).toBe(MIN_DC);            // DC 2 floor, can't go below
    expect(organicDC(1e15, 100)).toBe(MAX_DC);       // DC 25 ceiling, can't go above
  });
});

describe('resolveDC', () => {
  it('manual mode pins the DM value, clamped 2–25', () => {
    expect(resolveDC({ mode: 'manual', manual: 17, viewers: 5, engagement: 50 })).toBe(17);
    expect(resolveDC({ mode: 'manual', manual: 999, viewers: 5, engagement: 50 })).toBe(MAX_DC);
    expect(resolveDC({ mode: 'manual', manual: -3, viewers: 5, engagement: 50 })).toBe(MIN_DC);
  });
  it('falls back to organic when manual is missing or mode is auto', () => {
    expect(resolveDC({ mode: 'manual', manual: null, viewers: 200_000, engagement: 50 })).toBe(viewerDC(200_000));
    expect(resolveDC({ mode: 'auto', viewers: 200_000, engagement: 100 })).toBe(organicDC(200_000, 100));
    expect(resolveDC({ viewers: 1000, engagement: 50 })).toBe(viewerDC(1000));
  });
});

describe('engagementBoostFor', () => {
  it('ranks big hype events above small ones', () => {
    expect(engagementBoostFor('raid')).toBeGreaterThan(engagementBoostFor('donation'));
    expect(engagementBoostFor('donation')).toBeGreaterThan(engagementBoostFor('sub'));
    expect(engagementBoostFor('sub')).toBeGreaterThan(engagementBoostFor('reaction'));
    expect(engagementBoostFor('reaction')).toBeGreaterThan(engagementBoostFor('chat'));
  });
  it('a single event never exceeds the boost cap', () => {
    for (const k of ['reaction', 'sub', 'resub', 'donation', 'raid', 'chat'] as const) {
      expect(engagementBoostFor(k)).toBeLessThanOrEqual(ENGAGEMENT_BOOST_CAP);
    }
  });
});
