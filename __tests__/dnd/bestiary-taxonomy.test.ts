// __tests__/dnd/bestiary-taxonomy.test.ts — the STANDARD creature classifications (P13-6, revised).
//
// Owner, 2026-07-29: *"Please use the standard classifications for all of the creatures in the bestiary.
// Not the ones I made up."*
//
// The previous version derived a bespoke browsing vocabulary (bosses, woodland, massive, demons, sea,
// birds, companions, folklore) from type + size + CR + name matching. The B5 audit measured what that
// cost: 320 of 829 creatures carried NO tag at all, because the type→tag map covered five of fifteen
// types and everything else depended on a word-list happening to match a name.
//
// The standard types do not have that failure mode, for a structural reason rather than a lucky one:
// every creature already HAS a type, because both source publications state one for every entry. These
// tests pin the two things that makes possible — total coverage, and one classification per creature
// instead of an overlapping set.
import { describe, it, expect } from 'vitest';
import { CREATURE_TAGS, TAG_LABELS, creatureTags, normalizeCreatureType } from '@/lib/dnd/bestiary/taxonomy';
import { deriveCreature } from '@/lib/dnd/bestiary/derive';

const c = (o: Record<string, unknown>) => ({ name: 'Thing', system: 'dnd5e-2024', ...o }) as never;

describe('the vocabulary itself', () => {
  it("carries 5e's fourteen standard types", () => {
    for (const t of ['aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental', 'fey',
      'fiend', 'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead']) {
      expect(CREATURE_TAGS, `${t} is a standard 5e type`).toContain(t);
    }
  });

  it("carries Pathfinder 2e's additions rather than squashing them into a 5e neighbour", () => {
    // `astral`, `dream` and `time` have no 5e equivalent. Mapping them to "aberration" would invent a
    // classification the source does not make.
    for (const t of ['astral', 'dream', 'ethereal', 'fungus', 'monitor', 'petitioner', 'shade', 'spirit', 'time']) {
      expect(CREATURE_TAGS).toContain(t);
    }
  });

  it("does NOT list `animal` — it is PF2's word for `beast`, not a separate type", () => {
    expect(CREATURE_TAGS as readonly string[]).not.toContain('animal');
  });

  it('labels every tag, so a filter never shows a raw key', () => {
    for (const t of CREATURE_TAGS) expect(TAG_LABELS[t], `${t} has no label`).toBeTruthy();
  });

  it('has no leftovers from the invented vocabulary', () => {
    for (const gone of ['boss', 'massive', 'woodland', 'sea', 'bird', 'companion', 'demonic', 'abyssal', 'folklore']) {
      expect(CREATURE_TAGS as readonly string[], `${gone} should be gone`).not.toContain(gone);
    }
  });
});

describe('normalizeCreatureType', () => {
  it('reads a plain type', () => {
    expect(normalizeCreatureType('dragon')).toBe('dragon');
    expect(normalizeCreatureType('Undead')).toBe('undead');
  });

  it('READS THE HEAD WORD, dropping the parenthetical subtype', () => {
    // Published types carry subtypes — "humanoid (goblinoid)", "fiend (demon)". Treating each as its own
    // category would fragment the humanoids into dozens of one-creature buckets.
    expect(normalizeCreatureType('humanoid (goblinoid)')).toBe('humanoid');
    expect(normalizeCreatureType('fiend (demon)')).toBe('fiend');
    expect(normalizeCreatureType('dragon (chromatic)')).toBe('dragon');
  });

  it("folds PF2's `animal` into `beast`, which is what makes one filter serve both systems", () => {
    // Without this, a filter for "beast" returns 5e's wolves and none of Pathfinder's.
    expect(normalizeCreatureType('animal')).toBe('beast');
  });

  it('returns null for an unknown type rather than guessing a neighbour', () => {
    expect(normalizeCreatureType('wibble')).toBeNull();
    expect(normalizeCreatureType('')).toBeNull();
    expect(normalizeCreatureType(null)).toBeNull();
    expect(normalizeCreatureType(undefined)).toBeNull();
  });

  it('tolerates the whitespace and punctuation real data carries', () => {
    expect(normalizeCreatureType('  Humanoid  ')).toBe('humanoid');
    expect(normalizeCreatureType('beast,')).toBe('beast');
  });
});

describe('creatureTags', () => {
  it('returns exactly ONE classification, because a creature has one type', () => {
    // The old vocabulary overlapped by design — a vampire lord was both `undead` and `boss`. A published
    // bestiary states one type, and returning two would misrepresent the source.
    expect(creatureTags(c({ type: 'undead' }))).toEqual(['undead']);
    expect(creatureTags(c({ type: 'humanoid (goblinoid)' }))).toEqual(['humanoid']);
  });

  it('returns an empty array rather than a wrong guess when the type is unusable', () => {
    expect(creatureTags(c({ type: null }))).toEqual([]);
    expect(creatureTags(c({ type: 'nonsense' }))).toEqual([]);
  });

  it('covers every type the B5 audit found untagged under the old scheme', () => {
    // A Mountain Oni (giant), an Aesra (celestial) and an Air Scamp (elemental) all came back bare.
    for (const t of ['giant', 'celestial', 'elemental', 'fey', 'plant', 'aberration', 'monstrosity']) {
      expect(creatureTags(c({ type: t })), `${t} must classify`).toEqual([t]);
    }
  });

  it('is deterministic', () => {
    expect(creatureTags(c({ type: 'dragon' }))).toEqual(creatureTags(c({ type: 'dragon' })));
  });
});

describe('deriveCreature still composes tags with eligibility', () => {
  it('tags and rates a creature in one call', () => {
    const d = deriveCreature(c({ name: 'Adult Red Dragon', type: 'dragon', cr: '17', statblock: {} }));
    expect(d.tags).toEqual(['dragon']);
    expect(d.variantEligible).toBe(true);
    expect(d.variants.length).toBe(2);
  });

  it('still emits no variants for a creature that does not warrant them', () => {
    const d = deriveCreature(c({ name: 'Rabbit', type: 'beast', cr: '0', statblock: {} }));
    expect(d.tags).toEqual(['beast']);
    expect(d.variants).toEqual([]);
  });
});
