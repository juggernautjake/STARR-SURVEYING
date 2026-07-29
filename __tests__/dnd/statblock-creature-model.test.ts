// __tests__/dnd/statblock-creature-model.test.ts — the rest of a creature (P13-1).
//
// P6-13 modelled a statblock's numeric core: AC, HP, speed, the six abilities. A bestiary needs the rest —
// senses, languages, CR, resistances, immunities, condition immunities, spellcasting, and the traits /
// actions / reactions / legendary / lair entries.
//
// The constraint that shapes all of it: this model is ALREADY PERSISTED inside `payload`, so it can only
// grow. Every test below is about additions being invisible to what came before.
import { describe, it, expect } from 'vitest';
import {
  normalizeStatblock, isStatblockEmpty, entriesOfKind, STATBLOCK_ENTRY_KINDS,
} from '@/lib/dnd/homebrew/statblock';

describe('the new fields are additive', () => {
  it('a statblock saved before they existed parses unchanged', () => {
    const old = { ac: 15, hp: 45, speed: '30 ft.', abilities: { str: 16 } };
    expect(normalizeStatblock(old)).toEqual(old);
  });

  it('reads senses, languages, CR and the defence lines', () => {
    const s = normalizeStatblock({
      cr: '1/4', xp: 50, senses: 'darkvision 60 ft.', languages: 'Common, Draconic',
      resistances: 'cold', immunities: 'poison', vulnerabilities: 'fire',
      conditionImmunities: 'charmed, frightened', spellcasting: 'DC 13, +5 to hit.',
    });
    expect(s.cr).toBe('1/4');           // a STRING: 5e CR is fractional below 1
    expect(s.xp).toBe(50);
    expect(s.senses).toBe('darkvision 60 ft.');
    expect(s.conditionImmunities).toBe('charmed, frightened');
  });

  it('drops blanks rather than storing empty strings', () => {
    const s = normalizeStatblock({ senses: '   ', languages: '', cr: null });
    expect(s.senses).toBeUndefined();
    expect(s.languages).toBeUndefined();
    expect(s.cr).toBeUndefined();
  });
});

describe('entries', () => {
  const raw = {
    entries: [
      { kind: 'trait', name: 'Amphibious', body: 'Can breathe air and water.' },
      { kind: 'action', name: 'Bite', body: 'Melee weapon attack.', toHit: '+7', damage: '2d6 + 4 piercing' },
      { kind: 'legendary', name: 'Tail Attack', body: 'Makes a tail attack.' },
    ],
  };

  it('keeps the authored order and tags each with its kind', () => {
    const s = normalizeStatblock(raw);
    expect(s.entries).toHaveLength(3);
    expect(entriesOfKind(s, 'action')[0].toHit).toBe('+7');
    expect(entriesOfKind(s, 'legendary')[0].name).toBe('Tail Attack');
    expect(entriesOfKind(s, 'reaction')).toEqual([]);
  });

  it('keeps toHit and damage OUT of the body, so a sheet can roll them', () => {
    // The reason these are separate fields at all: an interactive stat block has to offer the attack roll
    // without parsing prose. Folding them into `body` would make every future roll a regex.
    const bite = entriesOfKind(normalizeStatblock(raw), 'action')[0];
    expect(bite.body).not.toContain('+7');
    expect(bite.damage).toBe('2d6 + 4 piercing');
  });

  it('drops an entry with neither name nor body', () => {
    // A half-parsed action is worse than a missing one: a DM reads it off the page mid-combat and cannot
    // tell it is incomplete.
    const s = normalizeStatblock({ entries: [{ kind: 'action' }, { kind: 'action', name: 'Slam', body: '' }] });
    expect(s.entries).toHaveLength(1);
    expect(s.entries![0].name).toBe('Slam');
  });

  it('falls back to `action` for an unknown kind rather than discarding the text', () => {
    // Losing authored rules text is the greater harm; a mis-filed heading is recoverable by reading it.
    const s = normalizeStatblock({ entries: [{ kind: 'mythic', name: 'X', body: 'Y' }] });
    expect(s.entries![0].kind).toBe('action');
  });

  it('ignores a non-array `entries`', () => {
    expect(normalizeStatblock({ entries: 'Bite' }).entries).toBeUndefined();
    expect(normalizeStatblock({ entries: { kind: 'action' } }).entries).toBeUndefined();
  });

  it('every declared kind round-trips', () => {
    const s = normalizeStatblock({ entries: STATBLOCK_ENTRY_KINDS.map((k) => ({ kind: k, name: k, body: 'b' })) });
    for (const k of STATBLOCK_ENTRY_KINDS) expect(entriesOfKind(s, k)).toHaveLength(1);
  });
});

describe('isStatblockEmpty accounts for the new fields', () => {
  it('a creature described ONLY by its actions is not empty', () => {
    // The bug this prevents: a hazard or swarm token written with no AC and no HP would report empty, the
    // renderer would omit the block, and everything the author typed would silently vanish.
    const s = normalizeStatblock({ entries: [{ kind: 'action', name: 'Slam', body: 'Hits.' }] });
    expect(isStatblockEmpty(s)).toBe(false);
  });

  it('nor is one with only senses, a CR, or a spellcasting block', () => {
    for (const f of [{ senses: 'darkvision' }, { cr: '5' }, { spellcasting: 'DC 15' }, { xp: 1800 }]) {
      expect(isStatblockEmpty(normalizeStatblock(f)), JSON.stringify(f)).toBe(false);
    }
  });

  it('genuinely empty is still empty', () => {
    expect(isStatblockEmpty(normalizeStatblock({}))).toBe(true);
    expect(isStatblockEmpty(normalizeStatblock({ entries: [] }))).toBe(true);
  });

  it('AC 0 is still not empty — the falsy-zero rule survives the additions', () => {
    expect(isStatblockEmpty(normalizeStatblock({ ac: 0 }))).toBe(false);
  });
});
