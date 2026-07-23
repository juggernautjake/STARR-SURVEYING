// __tests__/dnd/ig-level-milestones.test.ts — B13 (first slice): the documented IG level milestones,
// read from real data. Honest about what IG publishes: milestone LEVELS + specialization OPTIONS, not the
// unpublished per-level trait/feat/boost schedule (that's B12, blocked on the owner).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { igLevelMilestones } from '@/lib/dnd/systems/intuitive-games/levelup';
import { IG_CLASS_DETAILS } from '@/lib/dnd/systems/intuitive-games/content';

it('is wired into the IG builder as a read-only milestone preview (not an orphan)', () => {
  const src = readFileSync(join(process.cwd(), 'app/dnd/_ui/IGCharacterBuilder.tsx'), 'utf8');
  expect(src).toContain("import { igLevelMilestones }");
  expect(src).toContain('igLevelMilestones(subclass || className, level)');
  expect(src).toContain('data-testid="ig-milestones"');
});

describe('igLevelMilestones (B13)', () => {
  it('surfaces the documented milestones up to the target level, in order', () => {
    const m = igLevelMilestones('Freebooter', 10);
    expect(m.map((x) => x.level)).toEqual([4, 6, 8, 10]);
    expect(m.map((x) => x.kind)).toEqual(['specialization', 'unique-power', 'greater-specialization', 'capstone']);
  });

  it('shows nothing before level 4 (the first milestone)', () => {
    expect(igLevelMilestones('Freebooter', 3)).toEqual([]);
  });

  it('the level-4 specialization carries the subclass real catalogued options', () => {
    const freebooter = IG_CLASS_DETAILS.find((c) => c.name === 'Freebooter')!;
    const spec = igLevelMilestones('Freebooter', 4).find((x) => x.kind === 'specialization')!;
    expect(spec.options).toEqual(freebooter.specializations);
    expect(spec.options).toContain('Dabbler (gain subclass powers from other classes)');
  });

  it('does NOT fake options for the moments the site does not enumerate', () => {
    const m = igLevelMilestones('Freebooter', 10);
    for (const kind of ['unique-power', 'greater-specialization', 'capstone'] as const) {
      expect(m.find((x) => x.kind === kind)!.options).toBeUndefined();
    }
  });

  it('a class/subclass with no catalogued specializations gets the milestone without an options list', () => {
    // Conduit is catalogued with specializations: [] — the prompt still appears, just with no fixed options.
    const spec = igLevelMilestones('Conduit', 4).find((x) => x.kind === 'specialization')!;
    expect(spec).toBeTruthy();
    expect(spec.options).toBeUndefined();
  });

  it('an unknown subclass still returns the documented milestone LEVELS (no options)', () => {
    const m = igLevelMilestones('Totally Homebrew', 8);
    expect(m.map((x) => x.level)).toEqual([4, 6, 8]);
    expect(m.every((x) => x.options === undefined)).toBe(true);
  });

  it('clamps the target level (0 → level 1 → no milestones; 99 → capped, all four)', () => {
    expect(igLevelMilestones('Marksman', 0)).toEqual([]);
    expect(igLevelMilestones('Marksman', 99).map((x) => x.level)).toEqual([4, 6, 8, 10]);
  });
});
