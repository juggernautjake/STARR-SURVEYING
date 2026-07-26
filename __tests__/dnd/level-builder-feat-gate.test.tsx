// __tests__/dnd/level-builder-feat-gate.test.tsx — the TWO feat pickers must enforce the same rule.
//
// Slice 3 gated the Foundations picker with `featEligibilityForSystem`. The level walker has its own ASI
// feat dropdown, and it was already the better of the two — it filtered by category and minLevel, which
// Foundations did not. But after slice 3 they disagreed in the other direction: Foundations HARD-BLOCKED a
// feat whose ability prerequisite wasn't met, while the walker offered it with a "(needs STR 13)" hint.
// One rule, one edition, two enforcement levels, depending on which screen you happened to be on.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { featEligibilityForSystem } from '@/lib/dnd/feats/eligibility';

const SRC = readFileSync(join(process.cwd(), 'app/dnd/_ui/LevelBuilder.tsx'), 'utf8');

describe('the level walker gates ASI feats like the Foundations picker', () => {
  it('runs the shared eligibility gate, not a local rule', () => {
    expect(SRC).toContain('featEligibilityForSystem');
    expect(SRC).toMatch(/slot: 'asi', level, abilities/);
  });

  it('takes the character’s ability scores from the page', () => {
    expect(SRC).toMatch(/abilities\?: Partial<Record<AbilityKey, number>>/);
    expect(SRC).toMatch(/asiFeatChoices\(system, current\.level, plan\?\.homebrewFeats \?\? \[\], abilities\)/);
  });

  it('falls back to the previous behaviour when scores are unknown, rather than hiding legal feats', () => {
    // Hiding choices we cannot judge would be the worse failure — a caller without abilities keeps the
    // hint-only list it always had.
    expect(SRC).toMatch(/if \(!abilities\) return pool;/);
  });

  it('keeps the prerequisite hint for the feats it DOES offer', () => {
    // The hint explains what a feat needs; it is not a substitute for the gate, and both belong.
    expect(SRC).toContain('prereqHint');
    expect(SRC).toMatch(/\(needs \$\{parts\.join\(', '\)\}\)/);
  });

  it('and the shared gate really does refuse an unmet ability prerequisite', () => {
    // The behaviour the wiring buys: Grappler needs STR 13.
    const low = { slot: 'asi' as const, level: 4, abilities: { str: 10, dex: 14, con: 14, int: 10, wis: 10, cha: 10 } };
    const high = { ...low, abilities: { ...low.abilities, str: 16 } };
    expect(featEligibilityForSystem('dnd5e-2024', 'Grappler', low).ok).toBe(false);
    expect(featEligibilityForSystem('dnd5e-2024', 'Grappler', high).ok).toBe(true);
  });

  it('leaves the custom-feat escape hatch in place', () => {
    // Gating is only defensible because there is an explicit way past it.
    expect(SRC).toContain('__custom__');
    expect(SRC).toContain('✎ Custom feat…');
  });
});
