// __tests__/dnd/statblock-tiers.test.ts — the per-tier tables a native stat block is built from (N1-1/N1-2).
//
// These are MEASURED from the licensed corpus rather than copied from a rulebook: D&D's *Monster Statistics
// by Challenge Rating* and Pathfinder's *Building Creatures* are DMG and Monster Core content, neither is
// in the SRD or the ORC remaster, and embedding either verbatim is the boundary this bestiary has refused
// all along. So the assertions here are about PROPERTIES of the measurement, not about matching a book —
// which is also the only kind of assertion that stays true when the corpus grows.
import { describe, it, expect } from 'vitest';
import { DND5E_TIERS, PF2_TIERS, type TierRow } from '@/lib/dnd/statblocks/tiers';

const SERIES: [string, TierRow[]][] = [['D&D 5e', DND5E_TIERS], ['Pathfinder 2e', PF2_TIERS]];

describe('the tables are usable', () => {
  for (const [label, rows] of SERIES) {
    it(`${label} covers a real span of tiers`, () => {
      expect(rows.length).toBeGreaterThan(20);
      expect(rows[0].tier).toBeLessThan(1);
      expect(rows[rows.length - 1].tier).toBeGreaterThan(19);
    });

    it(`${label} is sorted and has no duplicate tier`, () => {
      const tiers = rows.map((r) => r.tier);
      expect([...tiers].sort((a, b) => a - b)).toEqual(tiers);
      expect(new Set(tiers).size).toBe(tiers.length);
    });

    it(`${label} never gets FRAILER as the tier rises`, () => {
      // The property isotonic regression exists to guarantee. A dip here would tell a DM that a harder
      // creature is easier to kill — worse than a number that is merely a little off.
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i].ac, `${label} AC dips at tier ${rows[i].tier}`).toBeGreaterThanOrEqual(rows[i - 1].ac);
        expect(rows[i].hp, `${label} HP dips at tier ${rows[i].tier}`).toBeGreaterThanOrEqual(rows[i - 1].hp);
        expect(rows[i].attack, `${label} attack dips at tier ${rows[i].tier}`).toBeGreaterThanOrEqual(rows[i - 1].attack);
      }
    });

    it(`${label} states how many creatures each row was measured from`, () => {
      // A thin tier has to be VISIBLE rather than implied — a median of three creatures is a different
      // claim from a median of 250, and a consumer should be able to tell.
      for (const r of rows) expect(r.sample, `tier ${r.tier} has no sample size`).toBeGreaterThanOrEqual(3);
    });

    it(`${label} carries a real attack bonus at every tier`, () => {
      // THE BUG THIS CATCHES, which shipped in the first run: `Number('')` is 0 and `Number.isFinite(0)` is
      // true, so reading `toHit` without a missing-value guard pushed a zero for every trait, reaction and
      // Multiattack. The medians came out 0 at every tier in both systems — a table that read as "no
      // creature has an attack bonus" rather than as a parsing bug.
      for (const r of rows) expect(r.attack, `tier ${r.tier} has no attack bonus`).toBeGreaterThan(0);
    });
  }
});

describe('the numbers are plausible for the game they describe', () => {
  const at = (rows: TierRow[], tier: number) => rows.find((r) => r.tier === tier)!;

  it('5e stays on 5e’s scale', () => {
    // AC 10-25 across the whole game, and a CR 0 creature is a commoner rather than a boss.
    expect(at(DND5E_TIERS, 0).hp).toBeLessThan(15);
    for (const r of DND5E_TIERS) expect(r.ac).toBeGreaterThanOrEqual(10);
    expect(DND5E_TIERS[DND5E_TIERS.length - 1].ac).toBeLessThanOrEqual(30);
  });

  it('Pathfinder climbs far higher, which is why the two tables exist', () => {
    // The whole reason a 5e AC cannot be copied onto a PF2 creature: PF2's AC keeps rising with level into
    // the 40s while 5e's flattens in the high teens. Asserted so a future "simplification" into one shared
    // table fails loudly.
    const pf2Top = PF2_TIERS[PF2_TIERS.length - 1].ac;
    const dndTop = DND5E_TIERS[DND5E_TIERS.length - 1].ac;
    expect(pf2Top).toBeGreaterThan(dndTop + 15);
  });

  it('a mid-tier creature looks like one in each system', () => {
    expect(at(DND5E_TIERS, 5).ac).toBeGreaterThan(13);
    expect(at(DND5E_TIERS, 5).ac).toBeLessThan(18);
    expect(at(PF2_TIERS, 5).ac).toBeGreaterThan(18);
    expect(at(PF2_TIERS, 5).ac).toBeLessThan(25);
  });
});
