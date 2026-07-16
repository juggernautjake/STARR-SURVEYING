// __tests__/dnd/ig-builder.test.ts — the "build as-is from the vanilla library" assembler (IG builder
// Slice 7b). A straight vanilla assemble is 100% VANILLA; a non-catalog pick is flagged CUSTOM with its
// correct kind (a bogus stance is a custom STANCE, not a mis-read feat).
import { describe, it, expect } from 'vitest';
import { assembleIGVanillaCharacter } from '@/lib/dnd/systems/intuitive-games/builder';
import { summarizeCharacterProvenance } from '@/lib/dnd/provenance';

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
    expect(c.features.find((f) => f.name === 'Offensive')?.body[0]).toMatch(/advantage on attacks/i);
    expect(c.features.some((f) => f.source === 'Power' && f.name === 'Mirror Image')).toBe(true);
    expect(c.attacks[0].name).toBe('Cutlass');
    // kinded igBuild is recorded
    expect(c.igBuild.stances).toEqual(['Offensive', 'Defensive']);
    expect(c.igBuild.powers).toEqual(['Mirror Image']);
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

  it('a DM grant lets a custom stance through (dm-granted, not blocking)', () => {
    const c = assembleIGVanillaCharacter({ className: 'Freebooter', stances: ['Berserker Fury'] });
    const s = summarizeCharacterProvenance(c, 'intuitive-games', [{ kind: 'stance', name: 'Berserker Fury', grantedBy: 'DM', mechanics: 'rage stance' }]);
    expect(s.dmGranted.some((e) => e.name === 'Berserker Fury')).toBe(true);
    expect(s.hasBlockingCustom).toBe(false);
  });
});
