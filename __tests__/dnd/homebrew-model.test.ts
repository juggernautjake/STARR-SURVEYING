// __tests__/dnd/homebrew-model.test.ts — Area H1. The pure shareable-homebrew model: identity, attribution,
// system scope, visibility/approval, search, and the DM allowlist gate.
import { describe, it, expect } from 'vitest';
import {
  HOMEBREW_KINDS, homebrewKindLabel, isHomebrewKind, normalizeHomebrew, validateHomebrew,
  isHomebrewPublished, homebrewInSystem, homebrewMatchesSearch, canUseHomebrew, browseHomebrew,
  type HomebrewContent,
} from '@/lib/dnd/homebrew/model';

const base: HomebrewContent = {
  id: 'hb1', kind: 'weapon', name: 'Living Gauntlet', system: 'intuitive-games',
  creator: { name: 'Jacob', id: 'u1' }, status: 'approved', summary: 'A punchy homebrew fist',
  tags: ['brawler'], createdAt: '2026-07-01', updatedAt: '2026-07-10',
};

describe('kinds + labels (H1)', () => {
  it('covers every content kind the owner listed', () => {
    for (const k of ['weapon', 'item', 'potion', 'armor', 'spell', 'stance', 'effect', 'ability', 'skill', 'feat', 'race', 'class', 'subclass']) {
      expect(HOMEBREW_KINDS).toContain(k);
      expect(isHomebrewKind(k)).toBe(true);
    }
    expect(isHomebrewKind('nonsense')).toBe(false);
    expect(homebrewKindLabel('subclass')).toBe('Subclass');
  });
});

describe('normalizeHomebrew — defensive parse (H1)', () => {
  it('drops rows that cannot be valid content (no id / bad kind / no name / no creator)', () => {
    expect(normalizeHomebrew(null)).toBeNull();
    expect(normalizeHomebrew({ id: 'x', name: 'A', kind: 'weapon' })).toBeNull(); // no creator → anonymous
    expect(normalizeHomebrew({ id: 'x', name: 'A', kind: 'bogus', creator: { name: 'J' } })).toBeNull();
    expect(normalizeHomebrew({ name: 'A', kind: 'weapon', creator: { name: 'J' } })).toBeNull(); // no id
  });
  it('parses a valid row, normalizing system + defaulting status to draft', () => {
    const c = normalizeHomebrew({ id: 'h', name: '  Axe ', kind: 'weapon', system: 'dnd5e-2024', creator: { name: ' Sam ', id: 'u9' } });
    expect(c).toBeTruthy();
    expect(c!.name).toBe('Axe');
    expect(c!.creator).toEqual({ name: 'Sam', id: 'u9' });
    expect(c!.status).toBe('draft');
    expect(c!.system).toBe('dnd5e-2024');
  });
  it('keeps a system-agnostic "any" scope', () => {
    expect(normalizeHomebrew({ id: 'h', name: 'X', kind: 'effect', system: 'any', creator: { name: 'J' } })!.system).toBe('any');
  });
});

describe('validation (H1)', () => {
  it('requires name, kind, creator, and a system', () => {
    expect(validateHomebrew({})).toEqual(expect.arrayContaining([expect.stringMatching(/name/i), expect.stringMatching(/kind/i), expect.stringMatching(/creator|attribution/i), expect.stringMatching(/system/i)]));
    expect(validateHomebrew(base)).toEqual([]);
  });
});

describe('scope + search (H1/H2 seam)', () => {
  it('matches its own system + "any", not others', () => {
    expect(homebrewInSystem(base, 'intuitive-games')).toBe(true);
    expect(homebrewInSystem(base, 'dnd5e-2024')).toBe(false);
    expect(homebrewInSystem({ ...base, system: 'any' }, 'dnd5e-2024')).toBe(true);
  });
  it('searches name/summary/kind/tags/creator, case-insensitive; empty matches all', () => {
    expect(homebrewMatchesSearch(base, '')).toBe(true);
    expect(homebrewMatchesSearch(base, 'gauntlet')).toBe(true);
    expect(homebrewMatchesSearch(base, 'BRAWLER')).toBe(true);
    expect(homebrewMatchesSearch(base, 'jacob')).toBe(true);
    expect(homebrewMatchesSearch(base, 'wizard')).toBe(false);
  });
});

describe('DM allowlist gate (H4 core)', () => {
  const draft: HomebrewContent = { ...base, id: 'd1', status: 'draft' };
  it('players only ever use APPROVED content, and only when allowed', () => {
    expect(isHomebrewPublished(base)).toBe(true);
    expect(canUseHomebrew(base, {})).toBe(false); // approved but not allowlisted
    expect(canUseHomebrew(base, { allowedIds: ['hb1'] })).toBe(true);
    expect(canUseHomebrew(base, { allowAll: true })).toBe(true);
    expect(canUseHomebrew(draft, { allowAll: true })).toBe(false); // never a non-approved piece for a player
  });
  it('a DM may always use their campaign content, even a draft', () => {
    expect(canUseHomebrew(draft, { isDM: true })).toBe(true);
  });
});

describe('browse (H2 seam)', () => {
  const list: HomebrewContent[] = [
    base,
    { ...base, id: 'hb2', name: 'Old Relic', status: 'approved', updatedAt: '2026-06-01' },
    { ...base, id: 'hb3', name: 'Secret WIP', status: 'draft', updatedAt: '2026-07-20' },
    { ...base, id: 'hb4', name: 'PF Blade', system: 'pathfinder2e', status: 'approved', updatedAt: '2026-07-15' },
  ];
  it('shows only published, in-system pieces, newest first', () => {
    const r = browseHomebrew(list, { system: 'intuitive-games' });
    expect(r.map((c) => c.id)).toEqual(['hb1', 'hb2']); // hb3 draft hidden, hb4 wrong system; newest (hb1) first
  });
  it('includeUnpublished surfaces drafts (a creator/DM view)', () => {
    expect(browseHomebrew(list, { system: 'intuitive-games', includeUnpublished: true }).map((c) => c.id)).toContain('hb3');
  });
  it('a query narrows the results', () => {
    expect(browseHomebrew(list, { query: 'relic' }).map((c) => c.id)).toEqual(['hb2']);
  });
});
