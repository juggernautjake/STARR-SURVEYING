// __tests__/dnd/stream-influence.test.ts — patron-influence meter math (J11).
import { describe, it, expect } from 'vitest';
import { viewerFactor, computeInfluence, viewerDC, MAX_DC, engagementBoostFor, ENGAGEMENT_BOOST_CAP } from '@/lib/dnd/stream-influence';

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
