// The creature statblock model (P6-13).
//
// The behaviour worth pinning is the DROP-don't-clamp rule. A statblock is read off the page mid-combat, so
// a typo'd value must render as absent rather than as a plausible-looking number the DM will use.
import { describe, expect, it } from 'vitest';
import {
  normalizeStatblock, isStatblockEmpty, abilityModifier, formatModifier, statblockBrief,
  STATBLOCK_ABILITIES,
} from '@/lib/dnd/homebrew/statblock';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fieldsForKind } from '@/lib/dnd/homebrew/kinds';

describe('normalizeStatblock drops what it cannot trust', () => {
  it('keeps values in range', () => {
    const s = normalizeStatblock({ ac: 17, hp: 136, speed: '40 ft.', abilities: { str: 20, dex: 11 } });
    expect(s).toMatchObject({ ac: 17, hp: 136, speed: '40 ft.' });
    expect(s.abilities).toEqual({ str: 20, dex: 11 });
  });

  it('DROPS an out-of-range or unparseable number rather than clamping it', () => {
    // Clamping would put a number on the page that the author never wrote. A DM reading "AC 99" off a
    // statblock mid-combat has no way to know it was invented.
    expect(normalizeStatblock({ ac: -5 }).ac).toBeUndefined();
    expect(normalizeStatblock({ ac: 'seventeen' }).ac).toBeUndefined();
    expect(normalizeStatblock({ hp: 99999 }).hp).toBeUndefined();
    expect(normalizeStatblock({ abilities: { str: 0, dex: 200, con: 14 } }).abilities).toEqual({ con: 14 });
  });

  it('drops blank strings instead of storing empties', () => {
    const s = normalizeStatblock({ speed: '   ', acNote: '', saves: 'DEX +5' });
    expect(s.speed).toBeUndefined();
    expect(s.acNote).toBeUndefined();
    expect(s.saves).toBe('DEX +5');
  });

  it('survives junk without throwing', () => {
    for (const junk of [null, undefined, 'nope', 42, []]) {
      expect(() => normalizeStatblock(junk)).not.toThrow();
      expect(normalizeStatblock(junk)).toEqual({});
    }
  });

  it('rounds a fractional score rather than rejecting it', () => {
    expect(normalizeStatblock({ ac: 15.4 }).ac).toBe(15);
  });
});

describe('isStatblockEmpty', () => {
  it('is true for nothing at all', () => {
    expect(isStatblockEmpty(normalizeStatblock({}))).toBe(true);
    expect(isStatblockEmpty(normalizeStatblock({ ac: 'junk' }))).toBe(true);
  });

  it('is false as soon as ANY field survives', () => {
    for (const one of [{ ac: 12 }, { hp: 8 }, { speed: '30 ft.' }, { saves: 'DEX +2' }, { abilities: { str: 10 } }]) {
      expect(isStatblockEmpty(normalizeStatblock(one)), JSON.stringify(one)).toBe(false);
    }
  });

  it('a zero AC counts as present — 0 is a real value, not an absence', () => {
    // `!s.ac` would treat AC 0 as empty. Unusual, but a legal statblock, and the kind of falsy-zero bug
    // that only shows up on the one creature that has it.
    const s = normalizeStatblock({ ac: 0 });
    expect(s.ac).toBe(0);
    expect(isStatblockEmpty(s)).toBe(false);
  });
});

describe('modifiers', () => {
  it('follows floor((score - 10) / 2)', () => {
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(11)).toBe(0);
    expect(abilityModifier(20)).toBe(5);
    expect(abilityModifier(1)).toBe(-5);
    expect(abilityModifier(9)).toBe(-1);
  });

  it('formats with a real minus sign, matching the sheets', () => {
    expect(formatModifier(3)).toBe('+3');
    expect(formatModifier(0)).toBe('+0');
    expect(formatModifier(-2)).toBe('−2');
    expect(formatModifier(-2)).not.toContain('-'); // U+2212, not a hyphen
  });
});

describe('statblockBrief', () => {
  it('summarises what is present, and says nothing when nothing is', () => {
    expect(statblockBrief(normalizeStatblock({ ac: 15, hp: 40, speed: '30 ft.' }))).toBe('AC 15 · HP 40 · 30 ft.');
    expect(statblockBrief(normalizeStatblock({}))).toBe('');
  });
});

describe('the editors the registry declares are now built', () => {
  const builder = readFileSync(join(process.cwd(), 'app/dnd/_ui/ContentBuilder.tsx'), 'utf8');

  it('statblock and list have real editors', () => {
    for (const t of ['statblock', 'list']) {
      expect(builder).toMatch(new RegExp(`IMPLEMENTED[\\s\\S]{0,220}'${t}'`));
    }
  });

  it('and are no longer listed as owed — a placeholder must not outlive its fix', () => {
    const owed = builder.slice(builder.indexOf('OWED_BY'), builder.indexOf('OWED_BY') + 200);
    expect(owed).not.toContain('statblock:');
    expect(owed).not.toContain('list:');
  });

  it('the creature kind collects everything a statblock prints', () => {
    const keys = fieldsForKind('creature').map((f) => f.key);
    for (const k of ['statblock', 'traits', 'actions', 'reactions', 'legendary', 'senses', 'languages']) {
      expect(keys, `creature is missing ${k}`).toContain(k);
    }
  });

  it('the list editor is reused by other kinds, not creature-only', () => {
    // Building it for creatures also unlocked species lineages/traits and class resources — the point of a
    // registry-driven form.
    expect(fieldsForKind('race').filter((f) => f.type === 'list').length).toBeGreaterThan(0);
    expect(fieldsForKind('class').filter((f) => f.type === 'list').length).toBeGreaterThan(0);
  });
});

describe('the detail page renders lists from the registry, not from a creature-shaped list', () => {
  it('derives its sections from fieldsForKind', () => {
    const page = readFileSync(join(process.cwd(), 'app/dnd/content/[id]/page.tsx'), 'utf8');
    expect(page).toContain('fieldsForKind');
    expect(page, 'a hard-coded creature field list would not render a species trait')
      .not.toMatch(/payload\.(traits|actions|reactions|legendary)\b/);
  });
});
