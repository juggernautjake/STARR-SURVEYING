// __tests__/dnd/roll-feed-build.test.ts — the shared ActiveRoll builders (RO-5).
//
// PF2 and IG publish their rolls into the RollFeed via these builders. The animated stages PARSE
// `entry.breakdown` (`d20[7,18]→18 + 3`) to draw the die + the adv/dis kept pair, so this format is a
// contract — if it drifts, the die renders blank. These pin it, browser-free.
import { describe, it, expect } from 'vitest';
import { buildD20ActiveRoll, buildDamageActiveRoll } from '@/app/dnd/_sheet/components/rollers/rollFeedBuild';

describe('buildD20ActiveRoll — the d20 feed entry', () => {
  it('a straight roll is d20[nat] + mod, landing on the natural, isD20', () => {
    const r = buildD20ActiveRoll({ token: 1, label: 'STR check', natural: 13, total: 16, modifier: 3, crit: false, fumble: false });
    expect(r.isD20).toBe(true);
    expect(r.landing).toBe(13);
    expect(r.entry.breakdown).toBe('d20[13] + 3');
    expect(r.entry.total).toBe(16);
    expect(r.entry.mode).toBeUndefined();
  });

  it('advantage emits BOTH faces then the kept one — d20[7,18]→18 — with mode adv', () => {
    const r = buildD20ActiveRoll({ token: 2, label: 'Reflex', natural: 18, total: 21, modifier: 3, faces: [7, 18], mode: 'adv', crit: false, fumble: false });
    expect(r.entry.breakdown).toBe('d20[7,18]→18 + 3');
    expect(r.entry.mode).toBe('adv');
    expect(r.landing).toBe(18); // the kept die factors into the total
  });

  it('a negative modifier renders with a minus sign', () => {
    const r = buildD20ActiveRoll({ token: 3, label: 'x', natural: 10, total: 8, modifier: -2, crit: false, fumble: false });
    expect(r.entry.breakdown).toBe('d20[10] − 2');
  });

  it('carries crit/fumble, tag, and named boosts/penalties through', () => {
    const r = buildD20ActiveRoll({ token: 4, label: 'save', natural: 20, total: 25, modifier: 5, crit: true, fumble: false, tag: 'vs DC 20 → critical-success', boosts: ['Offensive stance'], penalties: [] });
    expect(r.crit).toBe(true);
    expect(r.entry.tag).toBe('vs DC 20 → critical-success');
    expect(r.entry.boosts).toEqual(['Offensive stance']);
  });
});

describe('buildDamageActiveRoll — the damage feed entry', () => {
  it('is not a d20, lands on the total, and passes the breakdown verbatim', () => {
    const r = buildDamageActiveRoll({ token: 5, label: 'Longsword damage', total: 11, breakdown: 'd8[3,5] + 3' });
    expect(r.isD20).toBe(false);
    expect(r.landing).toBe(11);
    expect(r.entry.kind).toBe('damage');
    expect(r.entry.breakdown).toBe('d8[3,5] + 3');
    expect(r.crit).toBe(false);
  });
});
