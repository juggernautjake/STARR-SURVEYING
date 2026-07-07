// __tests__/dnd/stream-influence.test.ts — patron-influence meter math (J11).
import { describe, it, expect } from 'vitest';
import { viewerFactor, computeInfluence, resistDC, isMaxed, MAX_INFLUENCE, engagementBoostFor, ENGAGEMENT_BOOST_CAP } from '@/lib/dnd/stream-influence';

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

describe('resistDC', () => {
  it('maps empty chat to an easy DC (2) and a maxed chat to the DC 25 ceiling', () => {
    expect(resistDC(0)).toBe(2);
    expect(resistDC(1)).toBe(25);
    expect(resistDC(0.5)).toBeGreaterThan(12);
  });
});

describe('isMaxed', () => {
  it('flips at the max threshold', () => {
    expect(isMaxed(MAX_INFLUENCE)).toBe(true);
    expect(isMaxed(0.5)).toBe(false);
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
