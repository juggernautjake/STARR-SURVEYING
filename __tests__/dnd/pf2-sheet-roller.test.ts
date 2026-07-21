// __tests__/dnd/pf2-sheet-roller.test.ts — Area R1b/IGS6, PF2 parity. The PF2 sheet's in-app roller: tap a
// save/skill/Strike to roll it (or a Strike's damage) through the shared engine. Source-anchors the wiring.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sheet = readFileSync(join(process.cwd(), 'app/dnd/_ui/PF2Sheet.tsx'), 'utf8');

describe('PF2 sheet is interactive — tap to roll (R1b)', () => {
  it('uses the shared roll engine with the pathfinder2e system (four-step degrees)', () => {
    expect(sheet).toContain("from '@/lib/dnd/roll'");
    expect(sheet).toContain("system: 'pathfinder2e'");
  });

  it('shows the last roll in the generic banner (total + detail + tone)', () => {
    expect(sheet).toMatch(/lastRoll\.total/);
    expect(sheet).toMatch(/lastRoll\.detail/);
    expect(sheet).toMatch(/lastRoll\.tone/);
  });

  it('saves, skills, Strikes AND Strike damage are all tap-to-roll', () => {
    expect(sheet).toMatch(/rollLine\(`\$\{s\} save`/);           // saves
    expect(sheet).toMatch(/rollLine\(`\$\{sk\.name\} \(\$\{sk\.attribute\}\)`/); // skills
    expect(sheet).toMatch(/rollLine\(`\$\{a\.name\} Strike`/);   // Strikes (to-hit)
    // Damage now rolls the RESOLVED expression, not the raw stored die (S15d). `a.damage` is the
    // base die; traits, striking runes and the attribute modifier are applied by pf2ResolveStrike,
    // so rolling `a.damage` directly would ignore every one of them.
    expect(sheet).toMatch(/rollDamage\(`\$\{a\.name\} damage`, strike\.damage\)/);
  });
});
