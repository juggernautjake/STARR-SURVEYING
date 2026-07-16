// Regression guard: the sheet engine was originally Lazzuh Gun's sheet generalized in
// place, so his barbarian/Jenovan mechanics leaked onto every other character. These tests
// lock in the fixes — Susie's, Sarah's and Jack's sheets must have no rage system and none
// of Lazzuh's name/stats/feats/abilities.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { streamerCharacter } from '../../app/dnd/_sheet/data/streamer';
import { donataDime } from '../../app/dnd/_sheet/data/donata';
import { jack } from '../../app/dnd/_sheet/data/jack';
import { lazzuh } from '../../app/dnd/_sheet/data/lazzuh';
import { blankCharacter, normalizeCharacter } from '../../app/dnd/_sheet/data/blank';
import { maxHpForLevel, speedForLevel } from '../../app/dnd/_sheet/rules/dnd';
import { getSheetConfig } from '../../app/dnd/_sheet/registry';
import type { Character } from '../../app/dnd/_sheet/types';

const OTHERS: [string, Character][] = [
  ['streamer', streamerCharacter('xxRainbowKittenUwU37xx')],
  ['donata', donataDime('Donata Dime')],
  ['jack', jack('Jack')],
  ['blank', blankCharacter('Someone New')],
];

describe('no Lazzuh artifacts on other characters', () => {
  it.each(OTHERS)('%s: has no rage-named fields anywhere in its data', (_name, c) => {
    const json = JSON.stringify(c);
    expect(json).not.toMatch(/rageDamageBonus|"rages"|rageDmg|rageable/);
  });

  it.each(OTHERS)('%s: mentions neither Lazzuh nor his Jenovan species', (_name, c) => {
    // Donata's play tips legitimately name Lazzuh as a party member to combo with, so we
    // check the mechanical surfaces (not free-text bio/balance prose).
    const mechanical = JSON.stringify({
      meta: c.meta,
      abilities: c.abilities,
      combat: c.combat,
      attacks: c.attacks,
      features: c.features,
      progression: c.progression,
      resources: c.resources,
      traits: c.traits,
    });
    expect(mechanical).not.toMatch(/Lazzuh|Jenova/i);
  });

  it.each(OTHERS)('%s: has no Rage/Surge feature or resource', (_name, c) => {
    for (const f of c.features) expect(f.name).not.toMatch(/\bRage\b|\bSurge\b|Reckless/i);
    for (const r of c.resources) expect(r.name).not.toMatch(/\bRage\b|\bSurge\b/i);
  });

  it.each(OTHERS)('%s: does not register the forms or reckless modules', (name, _c) => {
    const mods = getSheetConfig(name === 'blank' ? undefined : name).modules;
    expect(mods).not.toContain('forms');
    expect(mods).not.toContain('reckless');
  });

  it('only Lazzuh registers forms + reckless', () => {
    expect(getSheetConfig('lazzuh').modules).toEqual(expect.arrayContaining(['forms', 'reckless']));
  });

  it.each(OTHERS)('%s: labels both progression columns (never defaults to Rages)', (_name, c) => {
    if (!c.progression.length) return; // blank has no table
    expect(c.progressionMeta?.col3).toBeTruthy();
    expect(c.progressionMeta?.col4).toBeTruthy();
    expect(c.progressionMeta?.col3).not.toMatch(/rage/i);
    expect(c.progressionMeta?.col4).not.toMatch(/rage/i);
  });
});

describe('level math is per-character, not barbarian-for-everyone', () => {
  it('maxHpForLevel uses the given hit die', () => {
    // d12 barbarian: 12 + (L-1)*7 at CON 0 — the old hardcoded formula.
    expect(maxHpForLevel(3, 0, 12)).toBe(26);
    // A d8 caster must NOT get the d12 result.
    expect(maxHpForLevel(3, 0, 8)).toBe(18);
    expect(maxHpForLevel(3, 0, 10)).toBe(22);
  });

  it('maxHpForLevel applies a flat per-level bonus (e.g. the Tough feat)', () => {
    expect(maxHpForLevel(3, 0, 10, 2)).toBe(22 + 6);
  });

  it('speedForLevel never invents Fast Movement without a ladder', () => {
    // No ladder → the character keeps its own speed, even at level 20.
    expect(speedForLevel(20, undefined, 30)).toBe(30);
    // Lazzuh's ladder still grants +10 at 5.
    const ladder = [{ level: 1, speed: 30 }, { level: 5, speed: 40 }];
    expect(speedForLevel(4, ladder, 30)).toBe(30);
    expect(speedForLevel(5, ladder, 30)).toBe(40);
  });

  it("Jack's own level rules give him d10 + Tough, and no rage/speed ladder", () => {
    const c = jack('Jack');
    expect(c.levelRules?.hitDie).toBe(10);
    expect(c.levelRules?.bonusHpPerLevel).toBe(2);
    expect(c.levelRules?.speedByLevel).toBeUndefined();
    expect(c.levelRules?.formDamageByLevel).toBeUndefined();
    // His sheet HP matches the shared generic formula for his own die.
    expect(c.combat.maxHp).toBe(maxHpForLevel(3, 2, 10, 2));
  });

  it('Lazzuh keeps his barbarian rules — on his own sheet', () => {
    expect(lazzuh.levelRules?.hitDie).toBe(12);
    expect(lazzuh.levelRules?.speedByLevel).toBeTruthy();
    expect(lazzuh.levelRules?.formDamageByLevel).toBeTruthy();
  });
});

describe('legacy stored sheets migrate off the rage field names', () => {
  it('maps rageDamageBonus → formDamageBonus and drops the old key', () => {
    const stored = { ...blankCharacter('Old'), combat: { ...blankCharacter('Old').combat, rageDamageBonus: 3 } };
    delete (stored.combat as Record<string, unknown>).formDamageBonus;
    const c = normalizeCharacter(stored);
    expect(c.combat.formDamageBonus).toBe(3);
    expect('rageDamageBonus' in c.combat).toBe(false);
  });

  it('maps progression rages/rageDmg → col3/col4', () => {
    const stored = {
      ...blankCharacter('Old'),
      progression: [{ level: 1, prof: '+2', rages: '2', rageDmg: '+2', features: 'Rage' }],
    };
    const c = normalizeCharacter(stored);
    expect(c.progression[0].col3).toBe('2');
    expect(c.progression[0].col4).toBe('+2');
    expect('rages' in c.progression[0]).toBe(false);
  });

  it('maps attacks rageable → formBoosted', () => {
    const stored = {
      ...blankCharacter('Old'),
      attacks: [{ id: 'f', name: 'Fist', ability: 'str', proficient: true, range: '5 ft', damage: '1d6', damageType: 'b', rageable: true }],
    };
    const c = normalizeCharacter(stored);
    expect(c.attacks[0].formBoosted).toBe(true);
    expect('rageable' in c.attacks[0]).toBe(false);
  });
});

describe('shared engine source contains no character-specific hardcoding', () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

  it('the store never imports Lazzuh (reset used to overwrite any sheet with him)', () => {
    const src = read('app/dnd/_sheet/state/store.tsx');
    expect(src).not.toMatch(/from '\.\.\/data\/lazzuh'/);
  });

  it('the Attacks panel does not special-case Lazzuh attack ids', () => {
    const src = read('app/dnd/_sheet/components/Attacks.tsx');
    expect(src).not.toMatch(/id === 'fist'|id === 'laser'/);
  });

  it('CombatPanel does not hardcode Jenovan traits or the rages/lasers long rest', () => {
    const src = read('app/dnd/_sheet/components/CombatPanel.tsx');
    expect(src).not.toMatch(/Beyond the Limit|Surge Blood|Regenerative Biology|rages, lasers|while Raging/i);
  });

  it('the Progression table does not default its columns to Rages', () => {
    const src = read('app/dnd/_sheet/components/Progression.tsx');
    expect(src).not.toMatch(/'Rages'|'Rage Dmg'/);
  });

  it('the Balance panel does not hardcode the Rage-economy lead', () => {
    const src = read('app/dnd/_sheet/components/Balance.tsx');
    expect(src).not.toMatch(/Rage economy/i);
  });
});
