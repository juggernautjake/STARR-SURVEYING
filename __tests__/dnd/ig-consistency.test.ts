// __tests__/dnd/ig-consistency.test.ts — a cross-cutting guard that the Intuitive Games system is
// INTERNALLY CONSISTENT: every element the library/data publishes is recognized by the provenance
// classifier the builder + approval panel use, so a real IG feat/spell/stance/condition/ancestry/background
// never gets wrongly flagged CUSTOM. Catches drift between "what we show" and "what we recognize".
import { describe, it, expect } from 'vitest';
import {
  IG_STANCE_DEFS, IG_CONDITIONS, IG_ANCESTRIES, IG_BACKGROUND_DEFS, IG_POWERS, IG_DEFENSIVE_POWERS,
  igIsVanilla, igAllSpellNames,
} from '@/lib/dnd/systems/intuitive-games/content';
import { igAllFeats } from '@/lib/dnd/systems/intuitive-games/feats';
import { systemSpecies, systemConditions } from '@/lib/dnd/system-rules';

describe('Intuitive Games internal consistency (no library element is unrecognized)', () => {
  it('every authored feat (General + Combat, 150+) is recognized vanilla', () => {
    const feats = igAllFeats();
    expect(feats.length).toBeGreaterThanOrEqual(150);
    for (const f of feats) expect(igIsVanilla('feat', f.name), `feat "${f.name}" not recognized`).toBe(true);
  });

  it('every spell in the site roster is recognized vanilla (power + spell kinds)', () => {
    for (const name of igAllSpellNames()) {
      expect(igIsVanilla('spell', name), `spell "${name}" not recognized`).toBe(true);
      expect(igIsVanilla('power', name), `power "${name}" not recognized`).toBe(true);
    }
  });

  it('every stance + defensive power is recognized', () => {
    for (const s of IG_STANCE_DEFS) expect(igIsVanilla('stance', s.name)).toBe(true);
    for (const d of IG_DEFENSIVE_POWERS) expect(igIsVanilla('defensive-power', d.name)).toBe(true);
    // IG_POWERS (the effect-carrying set) is a subset of the recognized powers.
    for (const p of IG_POWERS) expect(igIsVanilla('power', p.name)).toBe(true);
  });

  it('conditions + ancestries + backgrounds line up with the system lists (no drift)', () => {
    expect(IG_CONDITIONS.map((c) => c.name)).toEqual(systemConditions('intuitive-games'));
    expect(IG_ANCESTRIES.map((a) => a.name)).toEqual(systemSpecies('intuitive-games'));
    for (const b of IG_BACKGROUND_DEFS) expect(igIsVanilla('background', b.name), `background "${b.name}"`).toBe(true);
    // Each background grants a real stance.
    const stances = new Set(IG_STANCE_DEFS.map((s) => s.name));
    for (const b of IG_BACKGROUND_DEFS) expect(stances.has(b.stance), `${b.name}'s stance "${b.stance}"`).toBe(true);
  });

  it('invented content is still rejected (the guard has teeth)', () => {
    expect(igIsVanilla('feat', 'Totally Made Up Feat')).toBe(false);
    expect(igIsVanilla('spell', 'Fabricated Bolt')).toBe(false);
    expect(igIsVanilla('stance', 'Nonsense Stance')).toBe(false);
  });
});
