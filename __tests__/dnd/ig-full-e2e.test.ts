// __tests__/dnd/ig-full-e2e.test.ts — the full Intuitive Games character (all 9 tabs) end-to-end
// (full-sheet Slice 11 QA). One vanilla build exercises every tab of the model, the rules engine resolves
// it, provenance flags it all-vanilla and passes a vanilla-only campaign; then a custom element blocks it,
// and a DM grant unblocks it — the whole guarantee, through the real deterministic libs (zero services).
import { describe, it, expect } from 'vitest';
import { assembleIGVanillaCharacter } from '@/lib/dnd/systems/intuitive-games/builder';
import { igDerived, igSaves, igResolveAttack } from '@/lib/dnd/systems/intuitive-games/rules';
import { isIGCharacter } from '@/lib/dnd/systems/intuitive-games/model';
import { summarizeCharacterProvenance } from '@/lib/dnd/provenance';
import { evaluateSubmission } from '@/lib/dnd/submission';

const FULL = {
  name: 'Kestrel Vane', level: 5, ancestry: 'Migoi', className: 'Freebooter', subclass: 'Champion',
  specialization: 'Duelist', background: 'Sky-pirate', alignment: 'Chaotic Good', culture: 'Aether Corsairs',
  abilities: { STR: 16, DEX: 18, CON: 14, INT: 10, WIS: 12, CHA: 13 },
  stances: ['Offensive', 'Precise'], powers: ['Mirror Image', 'Elemental Blast'], feats: ['Power Attack', 'Toughness'],
  weaponTypes: ['Light Slashing', 'Ranged Piercing'], defensivePower: 'Sidestep',
  weapons: ['Cutlass', 'Flintlock'], companionType: 'Griffon', companionName: 'Skree',
};

describe('IG full character end-to-end (full-sheet Slice 11 QA)', () => {
  const c = assembleIGVanillaCharacter(FULL);

  it('the sidecar model populates every tab', () => {
    expect(isIGCharacter(c.ig)).toBe(true);
    // identity
    expect(c.ig.identity).toMatchObject({ level: 5, className: 'Freebooter', subclass: 'Champion', specialization: 'Duelist', background: 'Sky-pirate', ancestry: 'Migoi', alignment: 'Chaotic Good' });
    // scores + skills (Sheet 2/4)
    expect(c.ig.abilities.DEX).toBe(18);
    expect(c.ig.skills.length).toBeGreaterThanOrEqual(36);
    expect(c.ig.skills.some((s) => s.combat)).toBe(true);
    // combat (Sheet 3)
    expect(c.ig.combat.stances).toEqual(['Offensive', 'Precise']);
    expect(c.ig.combat.defensivePower).toBe('Sidestep');
    expect(c.ig.combat.attacks.map((a) => a.name)).toEqual(['Cutlass', 'Flintlock']);
    // feats split (Sheet 2/5), weapon groups, powers
    expect(c.ig.feats.combat).toContain('Power Attack');
    expect(c.ig.feats.general).toContain('Toughness');
    expect(c.ig.weaponGroups).toEqual(['Light Slashing', 'Ranged Piercing']);
    expect(c.ig.powers).toContain('Elemental Blast');
    // companion (Sheet 7)
    expect(c.ig.companion?.name).toBe('Skree');
    expect(c.ig.companion?.creatureType).toBe('Griffon');
  });

  it('the rules engine resolves the whole sheet coherently', () => {
    const d = igDerived(c.ig);
    expect(d.proficiency).toBe(5);
    expect(d.abilityMods).toMatchObject({ DEX: 4, STR: 3, CON: 2 });
    // three saves: rank 0 + level 5 + governing attribute
    expect(igSaves(c.ig)).toEqual({ Fortitude: 5 + 2, Reflex: 5 + 4, Will: 5 + 1 });
    // an attack resolves with DEX not set as ability (defaults STR) → STR melee bonus
    expect(igResolveAttack(c.ig, c.ig.combat.attacks[0]).toHit).toBe(3 /*STR*/ + 5 /*prof*/);
  });

  it('provenance flags it all-vanilla and it passes a vanilla-only campaign', () => {
    const s = summarizeCharacterProvenance(c, 'intuitive-games', []);
    expect(s.custom).toHaveLength(0);
    expect(s.hasBlockingCustom).toBe(false);
    expect(evaluateSubmission(false, s).allowed).toBe(true); // vanilla-only accepts a pure-vanilla build
    // every kind is represented + vanilla: class, subclass, ancestry, stance, power, feat, weapon-type,
    // defensive-power, creature-type
    const kinds = new Set(s.vanilla.map((e) => e.kind));
    for (const k of ['class', 'subclass', 'ancestry', 'stance', 'power', 'feat', 'weapon-type', 'defensive-power', 'creature-type']) expect(kinds.has(k as never)).toBe(true);
  });

  it('a custom element blocks a vanilla-only submit; a DM grant unblocks it', () => {
    const custom = assembleIGVanillaCharacter({ ...FULL, stances: ['Offensive', 'Shadowdance'] });
    const blocked = summarizeCharacterProvenance(custom, 'intuitive-games', []);
    expect(blocked.custom.find((e) => e.name === 'Shadowdance')?.kind).toBe('stance');
    expect(evaluateSubmission(false, blocked).allowed).toBe(false);
    const granted = summarizeCharacterProvenance(custom, 'intuitive-games', [{ kind: 'stance', name: 'Shadowdance', grantedBy: 'DM', mechanics: 'shadow stance' }]);
    expect(evaluateSubmission(false, granted).allowed).toBe(true);
  });
});
