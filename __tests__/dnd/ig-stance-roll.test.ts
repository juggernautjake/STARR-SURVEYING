// __tests__/dnd/ig-stance-roll.test.ts — folding the active IG stance into a d20 roll (B5, BLOCKERS §C).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { igStanceRollEffect, igStanceDamageBonus } from '@/lib/dnd/stances/intuitive-games';

describe('igStanceRollEffect', () => {
  it('Offensive stance → advantage on attacks, disadvantage on Reflex saves', () => {
    const atk = igStanceRollEffect('Offensive', 1, 'attack');
    expect(atk.advantage).toBe(true);
    expect(atk.sources).toContain('Offensive stance');
    const ref = igStanceRollEffect('Offensive', 1, 'reflex_save');
    expect(ref.disadvantage).toBe(true);
  });

  it('Defensive stance → disadvantage on attacks, advantage on Reflex saves', () => {
    expect(igStanceRollEffect('Defensive', 1, 'attack').disadvantage).toBe(true);
    expect(igStanceRollEffect('Defensive', 1, 'reflex_save').advantage).toBe(true);
  });

  it('does not bleed onto an unrelated roll kind (Offensive leaves a Will save alone)', () => {
    const w = igStanceRollEffect('Offensive', 1, 'will_save');
    expect(w.advantage).toBe(false);
    expect(w.disadvantage).toBe(false);
  });

  it('a conditional stance effect ("when flanking") is a note, not auto-advantage', () => {
    const s = igStanceRollEffect('Swarming', 1, 'attack');
    expect(s.advantage).toBe(false);
    expect(s.conditional.join(' ')).toMatch(/flanking/i);
  });

  it('an unknown/custom stance folds to nothing (never invented)', () => {
    expect(igStanceRollEffect('Moon Prism Power', 3, 'attack')).toEqual({ advantage: false, disadvantage: false, sources: [], conditional: [] });
  });
});

describe('igStanceDamageBonus (folds into damage rolls)', () => {
  it('Offensive advanced (L5+) adds +half your level to damage', () => {
    expect(igStanceDamageBonus('Offensive', 6)).toEqual({ bonus: 3, source: 'Offensive stance' }); // floor(6/2)
    expect(igStanceDamageBonus('Offensive', 10)).toEqual({ bonus: 5, source: 'Offensive stance' });
  });
  it('Offensive BASIC (below L5) grants no damage bonus (advantage, not +damage)', () => {
    expect(igStanceDamageBonus('Offensive', 3)).toBeNull();
  });
  it('conditional damage effects (Precise sneak attack vs flanked) do NOT auto-fold', () => {
    expect(igStanceDamageBonus('Precise', 6)).toBeNull();
  });
  it('a non-damage stance folds nothing', () => {
    expect(igStanceDamageBonus('Defensive', 6)).toBeNull();
  });
});

describe('IGSheet rollLine folds the stance in', () => {
  // The stance roll-fold moved into the IG panel set (useIgPanels, T-6a); the Classic shell (IGSheet) is
  // now thin. Read both so the source anchor holds wherever the code lives.
  const SRC = readFileSync(join(process.cwd(), 'app/dnd/_ui/IGSheet.tsx'), 'utf8')
    + readFileSync(join(process.cwd(), 'app/dnd/_ui/ig/useIgPanels.tsx'), 'utf8');
  it('combines the condition + stance effects and cancels opposing adv/dis', () => {
    expect(SRC).toContain('igStanceRollEffect(ig.combat?.stances?.[0] ?? null, derived.level, kind)');
    expect(SRC).toContain('if (advantage && disadvantage) { advantage = false; disadvantage = false; }');
    expect(SRC).toContain('Math.max(rollNaturalD20(), rollNaturalD20())'); // advantage keeps the higher
    expect(SRC).toContain('Math.min(rollNaturalD20(), rollNaturalD20())'); // disadvantage keeps the lower
  });
});
