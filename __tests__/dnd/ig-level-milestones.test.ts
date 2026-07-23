// __tests__/dnd/ig-level-milestones.test.ts — B12/B13: the IG per-level progression, scraped verbatim from
// intuitivegames.net/character-building. IG uses ONE universal schedule for every class; only the subclass
// option lists (powers/specializations) vary, and those come from IG_CLASS_DETAILS.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { igLevelBreakdown, IG_CAPSTONES } from '@/lib/dnd/systems/intuitive-games/levelup';
import { IG_CLASS_DETAILS } from '@/lib/dnd/systems/intuitive-games/content';

it('is wired into the IG builder as a read-only progression preview (not an orphan)', () => {
  const src = readFileSync(join(process.cwd(), 'app/dnd/_ui/IGCharacterBuilder.tsx'), 'utf8');
  expect(src).toContain('import { igLevelBreakdown }');
  expect(src).toContain('igLevelBreakdown(subclass || className, level)');
  expect(src).toContain('data-testid="ig-milestones"');
});

describe('igLevelBreakdown — the scraped universal IG schedule (B12/B13)', () => {
  it('runs levels 2..toLevel in order (level 1 is the base build, handled by the builder)', () => {
    const rows = igLevelBreakdown('Freebooter', 10);
    expect(rows.map((r) => r.level)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('matches the scraped cumulative Solidas table', () => {
    const solidas = Object.fromEntries(igLevelBreakdown('Freebooter', 10).map((r) => [r.level, r.solidasCumulative]));
    expect(solidas).toEqual({ 2: 50, 3: 75, 4: 115, 5: 175, 6: 265, 7: 400, 8: 600, 9: 900, 10: 1350 });
  });

  it('feats alternate: even levels grant a General Feat, odd levels a Combat Feat', () => {
    for (const r of igLevelBreakdown('Marksman', 10)) {
      const feat = r.gains.find((g) => g.kind === 'feat-general' || g.kind === 'feat-combat')!;
      expect(feat.kind).toBe(r.level % 2 === 0 ? 'feat-general' : 'feat-combat');
    }
  });

  it('ability boosts (×2) land at levels 3, 6, 9', () => {
    const boostLevels = igLevelBreakdown('Sohei', 10).filter((r) => r.gains.some((g) => g.kind === 'ability-boosts')).map((r) => r.level);
    expect(boostLevels).toEqual([3, 6, 9]);
    const b3 = igLevelBreakdown('Sohei', 3)[1].gains.find((g) => g.kind === 'ability-boosts')!;
    expect(b3.count).toBe(2);
  });

  it('specialization at 4, greater specialization at 8, unique power at 6, capstone + manifestation at 10', () => {
    const rows = igLevelBreakdown('Arcanist', 10);
    const at = (lvl: number) => rows.find((r) => r.level === lvl)!.gains.map((g) => g.kind);
    expect(at(4)).toContain('specialization');
    expect(at(8)).toContain('greater-specialization');
    expect(at(6)).toContain('unique-power');
    expect(at(10)).toContain('capstone');
    expect(at(10)).toContain('manifestation');
  });

  it('the specialization gain carries the subclass real catalogued options', () => {
    const arcanist = IG_CLASS_DETAILS.find((c) => c.name === 'Arcanist')!;
    const spec = igLevelBreakdown('Arcanist', 4).find((r) => r.level === 4)!.gains.find((g) => g.kind === 'specialization')!;
    expect(spec.options).toEqual(arcanist.specializations);
    expect(spec.choose).toBe(true);
  });

  it('the subclass-power gain carries the subclass power list; the capstone carries all 12 capstones', () => {
    const freebooter = IG_CLASS_DETAILS.find((c) => c.name === 'Freebooter')!;
    const pow = igLevelBreakdown('Freebooter', 3).find((r) => r.level === 3)!.gains.find((g) => g.kind === 'subclass-power')!;
    expect(pow.options).toEqual(freebooter.powers);
    const cap = igLevelBreakdown('Freebooter', 10).find((r) => r.level === 10)!.gains.find((g) => g.kind === 'capstone')!;
    expect(cap.options).toEqual(IG_CAPSTONES.map((c) => c.name));
    expect(IG_CAPSTONES).toHaveLength(12);
  });

  it('automatic grants are marked choose:false (defensive power, improved stances, manifestation, unique power)', () => {
    const rows = igLevelBreakdown('Beastmaster', 10);
    const kindChoose = new Map(rows.flatMap((r) => r.gains).map((g) => [g.kind, g.choose]));
    expect(kindChoose.get('subclass-defensive-power')).toBe(false);
    expect(kindChoose.get('improved-stances')).toBe(false);
    expect(kindChoose.get('manifestation')).toBe(false);
    expect(kindChoose.get('unique-power')).toBe(false); // DM-determined
    expect(kindChoose.get('feat-general')).toBe(true);
    expect(kindChoose.get('specialization')).toBe(true);
  });

  it('clamps the target level (≤1 → empty; 99 → capped at 10)', () => {
    expect(igLevelBreakdown('Marksman', 1)).toEqual([]);
    expect(igLevelBreakdown('Marksman', 99).map((r) => r.level)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
