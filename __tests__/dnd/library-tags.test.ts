// __tests__/dnd/library-tags.test.ts — the derived tag vocabulary (S2).
// Tags drive the visible chips, the filter facets, and the AI's retrieval payload from ONE
// source, so a wrong derivation shows up in all three. These pin the derivations and the
// faceting semantics.
import { describe, it, expect } from 'vitest';
import {
  tagsForSpell, tagsForEntry, matchesTagFilters, tagCounts, facetsFor,
  TAG_GROUP_ORDER, TAG_GROUP_LABEL, type TagGroup,
} from '@/lib/dnd/library-tags';
import { findSpell2024, SPELLS_2024 } from '@/lib/dnd/spells/dnd5e-2024';

const keys = (name: string) => tagsForSpell(findSpell2024(name)!).map((t) => t.key);

describe('spell tags are derived from the spell itself', () => {
  it('derives type, level, school and class list', () => {
    const k = keys('fireball');
    expect(k).toContain('type:spell');
    expect(k).toContain('level:3');
    expect(k).toContain('school:evocation');
    expect(k).toContain('class:wizard');
    expect(k).toContain('class:sorcerer');
  });

  it('calls a level-0 spell a cantrip, not "level 0"', () => {
    expect(keys('fire-bolt')).toContain('level:cantrip');
  });

  it('derives what the spell DOES from its structured resolution', () => {
    // The most useful filter and the one no single field carries.
    expect(keys('fireball')).toContain('effect:damage');
    expect(keys('fireball')).toContain('effect:saving-throw');
    expect(keys('fire-bolt')).toContain('effect:attack-roll');
    expect(keys('cure-wounds')).toContain('effect:healing');
    expect(keys('misty-step')).toContain('effect:utility');
  });

  it('derives damage types', () => {
    expect(keys('fireball')).toContain('damage:fire');
    expect(keys('toll-the-dead')).toContain('damage:necrotic');
  });

  it('buckets casting time, and flags rituals', () => {
    expect(keys('fireball')).toContain('casting:action');
    expect(keys('misty-step')).toContain('casting:bonus-action');
    expect(keys('shield')).toContain('casting:reaction');
    expect(keys('detect-magic')).toContain('casting:ritual');
    expect(keys('find-familiar')).toContain('casting:long'); // 1 hour
  });

  it('buckets duration and flags concentration', () => {
    expect(keys('fireball')).toContain('duration:instantaneous');
    expect(keys('hunters-mark')).toContain('duration:concentration');
    expect(keys('arcane-lock')).toContain('duration:permanent');
  });

  it('buckets range, and marks area effects', () => {
    expect(keys('misty-step')).toContain('range:self');
    expect(keys('cure-wounds')).toContain('range:touch');
    expect(keys('fireball')).toContain('range:ranged');
    // A shape in the range string means it hits an area — what people actually filter for.
    expect(keys('burning-hands')).toContain('range:area');
    expect(keys('spirit-guardians')).toContain('range:area');
  });

  it('never emits a duplicate key', () => {
    // A spell dealing two damage types of the same name must not carry the tag twice.
    for (const s of SPELLS_2024) {
      const k = tagsForSpell(s).map((t) => t.key);
      expect(new Set(k).size, s.key).toBe(k.length);
    }
  });

  it('tags every spell in the catalog with at least type, level, school and source', () => {
    for (const s of SPELLS_2024) {
      const groups = new Set(tagsForSpell(s).map((t) => t.group));
      for (const g of ['type', 'level', 'school', 'source'] as TagGroup[]) {
        expect(groups.has(g), `${s.key} missing ${g}`).toBe(true);
      }
    }
  });
});

describe('generic entries claim only what they can derive', () => {
  it('tags a kind and a source, and nothing invented', () => {
    const t = tagsForEntry('feat', 'PHB 2024');
    expect(t.map((x) => x.key)).toEqual(['type:feat', 'source:phb-2024']);
  });

  it('omits source when there is none', () => {
    expect(tagsForEntry('condition').map((x) => x.key)).toEqual(['type:condition']);
  });
});

describe('faceted filtering semantics', () => {
  const fireball = tagsForSpell(findSpell2024('fireball')!);

  it('no filters matches everything', () => {
    expect(matchesTagFilters(fireball, [])).toBe(true);
  });

  it('ORs within a group — two levels widen the results', () => {
    // AND within a group would make selecting two levels return nothing, which is the classic
    // faceted-search bug.
    expect(matchesTagFilters(fireball, ['level:3', 'level:5'])).toBe(true);
  });

  it('ANDs across groups — level AND school narrows', () => {
    expect(matchesTagFilters(fireball, ['level:3', 'school:evocation'])).toBe(true);
    expect(matchesTagFilters(fireball, ['level:3', 'school:necromancy'])).toBe(false);
  });

  it('rejects when a whole group misses', () => {
    expect(matchesTagFilters(fireball, ['class:bard'])).toBe(false);
  });
});

describe('facets and counts for the filter panel', () => {
  const all = SPELLS_2024.map(tagsForSpell);

  it('counts how many entries carry each tag', () => {
    const counts = tagCounts(all);
    expect(counts.get('type:spell')).toBe(SPELLS_2024.length);
    expect(counts.get('level:cantrip')).toBe(SPELLS_2024.filter((s) => s.level === 0).length);
  });

  it('groups facets in panel order and drops empty groups', () => {
    const facets = facetsFor(all);
    const groups = facets.map((f) => f.group);
    expect(groups).toEqual(TAG_GROUP_ORDER.filter((g) => groups.includes(g)));
    expect(facets.every((f) => f.tags.length > 0)).toBe(true);
    for (const f of facets) expect(f.label).toBe(TAG_GROUP_LABEL[f.group]);
  });

  it('sorts levels numerically with cantrip first, not alphabetically', () => {
    // Alphabetical would give "Level 1, Level 2 … Level 9" out of order once double digits or
    // "Cantrip" enter the mix.
    const levels = facetsFor(all).find((f) => f.group === 'level')!.tags.map((t) => t.key);
    expect(levels[0]).toBe('level:cantrip');
    expect(levels.slice(1)).toEqual(['level:1', 'level:2', 'level:3', 'level:4', 'level:5', 'level:6', 'level:7', 'level:8', 'level:9']);
  });
});
