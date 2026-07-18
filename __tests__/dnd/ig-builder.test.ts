// __tests__/dnd/ig-builder.test.ts — the "build as-is from the vanilla library" assembler (IG builder
// Slice 7b). A straight vanilla assemble is 100% VANILLA; a non-catalog pick is flagged CUSTOM with its
// correct kind (a bogus stance is a custom STANCE, not a mis-read feat).
import { describe, it, expect } from 'vitest';
import { assembleIGVanillaCharacter, buildIGModel } from '@/lib/dnd/systems/intuitive-games/builder';
import { summarizeCharacterProvenance } from '@/lib/dnd/provenance';
import { igDerived, igSaves } from '@/lib/dnd/systems/intuitive-games/rules';
import { isIGCharacter } from '@/lib/dnd/systems/intuitive-games/model';

describe('assembleIGVanillaCharacter (Slice 7b)', () => {
  it('builds a valid character and records a kinded igBuild', () => {
    const c = assembleIGVanillaCharacter({
      name: 'Kestrel', ancestry: 'Migoi', className: 'Freebooter', subclass: 'Arcanist',
      stances: ['Offensive', 'Defensive'], powers: ['Mirror Image'], feats: ['Toughness'], weapons: ['Cutlass'],
    });
    expect(c.meta.name).toBe('Kestrel');
    expect(c.meta.species).toBe('Migoi');
    expect(c.meta.className).toBe('Freebooter');
    // stances/powers/feats become displayable features with their catalog effect text
    expect(c.features.find((f) => f.name === 'Offensive')?.body[0]).toMatch(/advantage on all attack rolls/i);
    expect(c.features.some((f) => f.source === 'Power' && f.name === 'Mirror Image')).toBe(true);
    expect(c.attacks[0].name).toBe('Cutlass');
    // kinded igBuild is recorded
    expect(c.igBuild.stances).toEqual(['Offensive', 'Defensive']);
    expect(c.igBuild.powers).toEqual(['Mirror Image']);
  });

  it('carries specialization / background / defensive power / weapon groups (spreadsheet fields)', () => {
    const c = assembleIGVanillaCharacter({
      className: 'Freebooter', subclass: 'Arcanist', specialization: 'Duelist', background: 'Sky-pirate',
      defensivePower: 'Sidestep', weaponTypes: ['Light Slashing', 'Ranged Piercing'],
    });
    // Specialization/Background surface as chips; the defensive power is a gold feature with its effect
    expect(c.meta.chips.some((ch) => ch.text === 'Specialization: Duelist')).toBe(true);
    expect(c.meta.chips.some((ch) => ch.text === 'Background: Sky-pirate')).toBe(true);
    expect(c.features.some((f) => f.source === 'Defensive Power' && f.name === 'Sidestep')).toBe(true);
    // all of these are real catalog entries → 100% vanilla, correctly kinded
    const s = summarizeCharacterProvenance(c, 'intuitive-games', []);
    expect(s.custom).toHaveLength(0);
    expect(s.elements.find((e) => e.name === 'Sidestep')?.kind).toBe('defensive-power');
    expect(s.elements.find((e) => e.name === 'Light Slashing')?.kind).toBe('weapon-type');
    expect(s.elements.find((e) => e.name === 'Arcanist')?.kind).toBe('subclass');
  });

  it('a straight vanilla assemble is 100% vanilla (nothing blocks a vanilla-only submit)', () => {
    const c = assembleIGVanillaCharacter({
      ancestry: 'Migoi', className: 'Freebooter', stances: ['Offensive'], powers: ['Mirror Image'], feats: ['Toughness'],
    });
    const s = summarizeCharacterProvenance(c, 'intuitive-games', []);
    expect(s.custom).toHaveLength(0);
    expect(s.hasBlockingCustom).toBe(false);
    expect(s.vanilla.length).toBeGreaterThan(0);
  });

  it('flags a non-catalog pick as CUSTOM with the correct kind (stance, not feat)', () => {
    const c = assembleIGVanillaCharacter({ className: 'Freebooter', stances: ['Berserker Fury'], powers: ['Ultra Nuke'] });
    const s = summarizeCharacterProvenance(c, 'intuitive-games', []);
    const stance = s.custom.find((e) => e.name === 'Berserker Fury');
    const power = s.custom.find((e) => e.name === 'Ultra Nuke');
    expect(stance?.kind).toBe('stance');   // correctly kinded, not mis-read as a feat
    expect(power?.kind).toBe('power');
    expect(s.hasBlockingCustom).toBe(true);
  });

  it('attaches a full IGCharacter model sidecar the rules engine can resolve (Slice 3)', () => {
    const c = assembleIGVanillaCharacter({
      name: 'Vale', level: 4, ancestry: 'Migoi', className: 'Fighter', subclass: 'Champion',
      specialization: 'Duelist', abilities: { STR: 18, CON: 16 },
      stances: ['Offensive'], powers: ['Mirror Image'], feats: ['Toughness', 'Power Attack'],
      defensivePower: 'Armor Skin', weaponTypes: ['Two-Handed Slashing'], weapons: ['Greatsword'],
    });
    expect(isIGCharacter(c.ig)).toBe(true);
    expect(c.ig.identity.level).toBe(4);
    expect(c.ig.abilities.STR).toBe(18);
    expect(c.ig.combat.stances).toEqual(['Offensive']);
    expect(c.ig.combat.defensivePower).toBe('Armor Skin');
    expect(c.ig.combat.attacks[0].name).toBe('Greatsword');
    // feats split into general/combat by catalog category
    expect(c.ig.feats.combat).toContain('Power Attack');
    expect(c.ig.feats.general).toContain('Toughness');
    // the rules engine resolves the sidecar: three saves default-scale with level, CON drives Fortitude
    const d = igDerived(c.ig);
    expect(d.proficiency).toBe(4);
    expect(igSaves(c.ig).Fortitude).toBe(0 /*rank*/ + 4 /*level*/ + 3 /*CON+3*/);
  });

  it('buildIGModel is pure and standalone', () => {
    const ig = buildIGModel({ name: 'X', className: 'Wizard', powers: ['Detect Magic'] });
    expect(ig.identity.className).toBe('Wizard');
    expect(ig.powers).toEqual(['Detect Magic']);
  });

  it('seeds the full IG skill list grouped by ability with combat skills flagged (Slice 5)', () => {
    const ig = buildIGModel({ name: 'Sk', className: 'Freebooter' });
    expect(ig.skills.length).toBeGreaterThanOrEqual(36);
    // a general skill carries its governing ability
    expect(ig.skills.find((s) => s.name === 'Stealth')?.ability).toBe('DEX');
    expect(ig.skills.find((s) => s.name === 'Climb')?.ability).toBe('STR');
    // the nine combat skills are flagged
    expect(ig.skills.filter((s) => s.combat).map((s) => s.name)).toEqual(
      expect.arrayContaining(['Dirty Trick', 'Disarm', 'Feint', 'Grapple', 'Overrun', 'Reposition', 'Steal', 'Sunder', 'Trip']),
    );
    expect(ig.skills.find((s) => s.name === 'Grapple')?.combat).toBe(true);
    expect(ig.skills.find((s) => s.name === 'Stealth')?.combat).toBe(false);
  });

  it('seeds a companion creature and flags its type as a vanilla creature-type (Slice 8)', () => {
    const c = assembleIGVanillaCharacter({ className: 'Beastmaster', companionType: 'Griffon', companionName: 'Skree' });
    expect(c.ig.companion).not.toBeNull();
    expect(c.ig.companion?.name).toBe('Skree');
    expect(c.ig.companion?.creatureType).toBe('Griffon');
    expect(c.ig.companion?.abilities.INT).toBe(6); // companions default INT 6 (-2), like the template
    const s = summarizeCharacterProvenance(c, 'intuitive-games', []);
    expect(s.elements.find((e) => e.name === 'Griffon')?.kind).toBe('creature-type');
    expect(s.custom).toHaveLength(0); // a real bestiary creature is vanilla
    // no companion when none picked
    expect(assembleIGVanillaCharacter({ className: 'Fighter' }).ig.companion).toBeNull();
  });

  it('a DM grant lets a custom stance through (dm-granted, not blocking)', () => {
    const c = assembleIGVanillaCharacter({ className: 'Freebooter', stances: ['Berserker Fury'] });
    const s = summarizeCharacterProvenance(c, 'intuitive-games', [{ kind: 'stance', name: 'Berserker Fury', grantedBy: 'DM', mechanics: 'rage stance' }]);
    expect(s.dmGranted.some((e) => e.name === 'Berserker Fury')).toBe(true);
    expect(s.hasBlockingCustom).toBe(false);
  });
});
