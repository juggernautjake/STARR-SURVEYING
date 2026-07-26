// __tests__/dnd/builder-review-step.test.ts — the Review step must review the BUILD, not just the picks.
//
// "Review the character you built" listed only identity facts — species, class, background, level — which
// are the things the player literally just typed in two screens earlier. It could not tell you whether the
// build had worked, and for a while it wasn't: through slices 10–11 a level-8 Fighter was produced with
// 1 hit point and no class features, and this screen said "Fighter · Level 8" and looked perfectly happy.
//
// Source-anchored: the step is composed in a server component, so the guard is on how it is built.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'app/dnd/characters/[id]/builder/page.tsx'), 'utf8');

describe('the Review step surfaces the derived numbers', () => {
  it('collects build facts separately from identity facts', () => {
    expect(SRC).toContain('const buildFacts');
    expect(SRC).toContain('What the build produced');
  });

  it('shows the 5e numbers that were silently wrong before', () => {
    for (const label of ['Hit points', 'Hit dice', 'Armour class', 'Save proficiencies', 'Class features']) {
      expect(SRC, `Review omits "${label}"`).toContain(`'${label}'`);
    }
  });

  it('counts CLASS features specifically, not every feature on the sheet', () => {
    // Player/DM-added features and chosen feats are not evidence the class build worked.
    expect(SRC).toMatch(/\.filter\(\(f\) => f\.id\?\.startsWith\('cls-'\)\)/);
  });

  it('reads the same stored data the sheet renders, so agreeing here means agreeing there', () => {
    expect(SRC).toMatch(/data\.combat/);
    expect(SRC).toMatch(/data\.saves/);
  });

  it('covers the bespoke systems too, from their own sidecars', () => {
    expect(SRC).toMatch(/pf2\?\.combat/);
    expect(SRC).toMatch(/ig\?\.combat\?\.hitPoints/);
  });

  it('degrades to fewer rows rather than showing zeroes for a half-built character', () => {
    // Every push is behind a truthiness check, and the whole block is behind a length check — an unbuilt
    // character shows the "make your picks" message, not a table of noughts.
    expect(SRC).toMatch(/\{buildFacts\.length > 0 && \(/);
    expect(SRC).toMatch(/if \(cb\.maxHp\) buildFacts\.push/);
  });
});
