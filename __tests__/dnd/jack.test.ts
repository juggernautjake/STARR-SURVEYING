import { describe, it, expect } from 'vitest';
import { jack } from '@/app/dnd/_sheet/data/jack';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import { getSheetConfig } from '@/app/dnd/_sheet/registry';
import { deriveCharacter } from '@/app/dnd/_sheet/engine/character';
import { bestUnarmoredAC } from '@/app/dnd/_sheet/data/rangor';

describe('jack — the Rangor Pugilist build', () => {
  const c = jack('Jack');

  it('is a level-3 Rangor Pugilist of the Sweet Science', () => {
    expect(c.meta.level).toBe(3);
    expect(c.meta.className).toBe('Pugilist');
    expect(c.meta.subclass).toBe('Sweet Science');
    expect(c.meta.species).toBe('Rangor');
  });

  it('has the statline + derived AC/HP', () => {
    expect(c.abilities).toEqual({ str: 17, dex: 13, con: 15, int: 6, wis: 11, cha: 10 });
    // best-of unarmored AC: max(10+1, 13+1, 12+2) = 14, natural armor wins the tie.
    expect(c.combat.ac).toBe(14);
    // d10 L1 max (10) + 6/level ×2 + CON(+2)×3 + Tough(2×3=6) = 34.
    expect(c.combat.maxHp).toBe(34);
    expect(c.combat.currentHp).toBe(34);
    expect(c.combat.hitDiceSize).toBe(10);
  });

  it('is proficient in Str/Con saves and the right four skills', () => {
    expect(c.saves.str.proficient).toBe(true);
    expect(c.saves.con.proficient).toBe(true);
    for (const k of ['athletics', 'intimidation', 'animal', 'nature']) {
      expect(c.skills[k].prof).toBe('proficient');
    }
  });

  it('has the Moxie pool + Unstoppable Force pips', () => {
    const moxie = c.resources.find((r) => r.id === 'moxie');
    expect(moxie?.max).toBe(2);
    expect(c.resources.some((r) => r.id === 'unstoppable-force')).toBe(true);
  });

  it('has the Fisticuffs unarmed strike + the park bench as improvised weapons', () => {
    const unarmed = c.attacks.find((a) => a.id === 'unarmed');
    expect(unarmed?.ability).toBe('str');
    expect(unarmed?.damage).toBe('1d8');
    expect(unarmed?.notes).toMatch(/19.20/); // crit range shown
    const bench = c.attacks.find((a) => a.id === 'park-bench');
    expect(bench?.damage).toBe('1d8');
    expect(c.inventory.some((i) => i.id === 'bench')).toBe(true);
  });

  it('bundles the Rangor + Pugilist + Farmer feature cards and the L1-20 table', () => {
    const ids = c.features.map((f) => f.id);
    expect(ids).toContain('rangor-living-momentum');
    expect(ids).toContain('pug-fisticuffs');
    expect(ids).toContain('pug-sweet-science');
    expect(ids).toContain('feat-tough');
    expect(c.progression.length).toBe(20);
    expect(c.progression.find((r) => r.here)?.level).toBe(3);
  });

  it('is a structurally valid Character (blank keys + a few extras)', () => {
    const allowed = new Set([...Object.keys(blankCharacter('x')), 'progressionMeta', 'tokenFocus', 'traits', 'levelRules']);
    for (const k of Object.keys(c)) expect(allowed.has(k)).toBe(true);
    for (const k of Object.keys(blankCharacter('x'))) expect(k in c).toBe(true);
  });

  it('registers the jack sheet_type → rulebook skin + rangorTheme', () => {
    const cfg = getSheetConfig('jack');
    expect(cfg.skin).toBe('rulebook');
    expect(cfg.theme).toBeTruthy();
  });

  it('derives the same AC (14) through the shared engine (natural-armor path)', () => {
    const dexMod = Math.floor((c.abilities.dex - 10) / 2);
    const conMod = Math.floor((c.abilities.con - 10) / 2);
    const derived = deriveCharacter({
      abilities: c.abilities,
      level: c.meta.level,
      saveProficiencies: ['str', 'con'],
      unarmoredBaseAC: bestUnarmoredAC(dexMod, conMod).ac,
      items: [],
    });
    expect(derived.ac.ac).toBe(14);
    expect(derived.ac.ac).toBe(c.combat.ac); // engine agrees with the stored sheet AC
  });
});
