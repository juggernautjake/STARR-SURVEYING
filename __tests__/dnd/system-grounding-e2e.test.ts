// __tests__/dnd/system-grounding-e2e.test.ts — Slice 5 QA: the end-to-end guarantee that a
// character never gets the wrong mechanics for its system. For every system: (1) grounding always
// carries THAT system's facts with no embeddings/DB, (2) it never carries another system's signature
// mechanics, and (3) validation catches a planted cross-system build. Deterministic — no services.
import { describe, it, expect } from 'vitest';
import { systemGroundingBlock } from '@/lib/dnd/grounding';
import { validateCharacterForSystem } from '@/lib/dnd/system-validate';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import { GAME_SYSTEMS } from '@/lib/dnd/systems';

// Each system's EXCLUSIVE positive signatures — a phrase only that system states as its own rule
// (the blocks deliberately cross-reference other editions to warn against them, so a plain word like
// "tiered table" isn't exclusive; these are).
const SIGNATURE: Record<string, { must: RegExp; mustNot: RegExp[] }> = {
  'dnd5e-2014': { must: /Six saving throws/, mustNot: [/Fortitude, Reflex, Will/, /Origin Feat/i, /THREE actions/] },
  'dnd5e-2024': { must: /Origin Feat/i, mustNot: [/Fortitude, Reflex, Will/, /THREE actions/] },
  pathfinder2e: { must: /Fortitude, Reflex, Will/, mustNot: [/Six saving throws/, /Origin Feat/i] },
  // Intuitive Games: its own signatures (levels 1–10, degrees of success, three saves); never 5e's
  // six ability-saves or the 2024 Origin Feat.
  'intuitive-games': { must: /DEGREES OF SUCCESS/, mustNot: [/Six saving throws/, /Origin Feat/i] },
};

describe('system grounding + validation end-to-end (Slice 5 QA)', () => {
  it('grounding always carries the right system’s facts and never another’s (no embeddings needed)', async () => {
    for (const s of GAME_SYSTEMS) {
      const g = await systemGroundingBlock(s.key, '   '); // empty query → no RAG; deterministic block only
      expect(g.block, `${s.key} has a rules block`).toBeTruthy();
      const sig = SIGNATURE[s.key];
      expect(g.block, `${s.key} signature`).toMatch(sig.must);
      for (const anti of sig.mustNot) expect(g.block, `${s.key} must-not ${anti}`).not.toMatch(anti);
      // The instruction pins it to this system only.
      expect(g.instruction).toMatch(/NEVER borrow mechanics from another game system/);
    }
  });

  it('validation catches a deliberately cross-system character in every direction', () => {
    // A PF2 class + a 2024 species dropped onto a 2014 character.
    const c = blankCharacter('Mixed');
    c.meta.level = 3; c.meta.className = 'Witch'; c.meta.species = 'Goliath';
    const v14 = validateCharacterForSystem(c, 'dnd5e-2014');
    expect(v14.some((x) => x.field === 'meta.className')).toBe(true); // Witch is PF2, not 5e
    expect(v14.some((x) => x.field === 'meta.species')).toBe(true);   // Goliath is 2024, not 2014
    // Same sheet under PF2 flags the species (Goliath isn't a PF2 ancestry) but accepts Witch.
    const vpf = validateCharacterForSystem(c, 'pathfinder2e');
    expect(vpf.some((x) => x.field === 'meta.className')).toBe(false);
    expect(vpf.some((x) => x.field === 'meta.species')).toBe(true);
  });

  it('a clean, in-system character passes with no violations', () => {
    const c = blankCharacter('Clean');
    c.meta.level = 4; c.meta.className = 'Wizard'; c.meta.species = 'Elf';
    expect(validateCharacterForSystem(c, 'dnd5e-2014')).toEqual([]);
    expect(validateCharacterForSystem(c, 'dnd5e-2024')).toEqual([]);
  });
});
