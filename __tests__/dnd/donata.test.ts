import { describe, it, expect } from 'vitest';
import { donataDime } from '@/app/dnd/_sheet/data/donata';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import { getSheetConfig } from '@/app/dnd/_sheet/registry';

describe('donataDime — the bespoke MLM cleric build', () => {
  const c = donataDime('Donata Dime');

  it('is a structurally valid Character (blank keys + progressionMeta)', () => {
    const expected = new Set([...Object.keys(blankCharacter('x')), 'progressionMeta']);
    for (const k of Object.keys(c)) expect(expected.has(k)).toBe(true);
    // The always-present blank keys must all still be there.
    for (const k of Object.keys(blankCharacter('x'))) expect(k in c).toBe(true);
  });

  it('is a level-3 Saurian Cleric of the Abundance Domain', () => {
    expect(c.meta.level).toBe(3);
    expect(c.meta.className).toBe('Cleric');
    expect(c.meta.species).toContain('Saurian');
    expect(c.meta.subclass).toContain('Abundance');
  });

  it('has the sheet ability scores + derived combat numbers', () => {
    expect(c.abilities).toEqual({ str: 14, dex: 14, con: 14, int: 10, wis: 16, cha: 11 });
    expect(c.combat.ac).toBe(16);
    expect(c.combat.maxHp).toBe(24);
    expect(c.combat.hitDiceSize).toBe(8);
    expect(c.combat.hitDiceTotal).toBe(3);
    expect(c.combat.saveDCOverride).toBe(13); // WIS-based spell save DC
  });

  it('is proficient in the cleric saves and the closer’s skills', () => {
    expect(c.saves.wis.proficient).toBe(true);
    expect(c.saves.cha.proficient).toBe(true);
    const prof = Object.entries(c.skills).filter(([, v]) => v.prof !== 'none').map(([k]) => k).sort();
    expect(prof).toEqual(['deception', 'insight', 'medicine', 'persuasion', 'religion']);
  });

  it('carries the MLM-reskinned kit (resources, attacks, features)', () => {
    const resIds = c.resources.map((r) => r.id);
    expect(resIds).toEqual(expect.arrayContaining(['slot1', 'slot2', 'channel', 'starterkit']));
    expect(c.attacks.map((a) => a.id)).toContain('guidingbolt');
    expect(c.features.length).toBeGreaterThanOrEqual(6);
    // The signature homebrew subclass feature is present.
    expect(c.features.some((f) => /Abundance Domain/.test(f.name))).toBe(true);
  });

  it('encodes Rank = Level: 3 progression rows, current row highlighted', () => {
    expect(c.progression).toHaveLength(3);
    const cur = c.progression.find((r) => r.here);
    expect(cur?.level).toBe(3);
    // Column 3 is relabelled to the company rank.
    expect(c.progressionMeta?.col3).toBe('Company Rank');
  });

  it('keeps the Krayta currency shape (credits/harmonyte/scrip)', () => {
    expect(c.currency).toHaveProperty('harmonyte');
    expect(Object.keys(c.currency).sort()).toEqual(['credits', 'harmonyte', 'scrip']);
  });
});

describe('registry — the "donata" sheet type', () => {
  it('maps to the bespoke donata skin + mlm module', () => {
    const cfg = getSheetConfig('donata');
    expect(cfg.skin).toBe('donata');
    expect(cfg.modules).toContain('mlm');
    expect(cfg.label).toBe('Donata Dime');
    expect(cfg.initiative).toBeTruthy();
  });

  it('falls back to generic for an unknown sheet type', () => {
    const cfg = getSheetConfig('nope');
    expect(cfg.label).toBe('Generic');
    expect(cfg.skin).toBeUndefined();
  });
});
