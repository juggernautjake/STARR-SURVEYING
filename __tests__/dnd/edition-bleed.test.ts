// __tests__/dnd/edition-bleed.test.ts — the CROSS-catalog guard for the 5e spell lists.
//
// spells-2014.test.ts and spells-2024.test.ts each check one catalog against itself. Neither can
// see the failure mode that actually threatens this data: the two files DRIFTING TOGETHER. A
// catalog can be internally perfect and still be wrong, if its records were seeded by copying the
// other edition's and then only partly edited. That is edition bleed, and it is invisible from
// inside either file.
//
// This file exists because that bleed was found in a 2026-07-21 audit, not hypothesised. Four
// records in SPELLS_2024 carried 2014 values — all four now fixed and guarded above; see the block
// at the bottom of this file for what they were and how they were caught — and every
// one of them was in a spell whose OWN editionNote correctly described the change the data had
// failed to make. The signature is always the same: someone duplicated a record, updated the
// obvious fields, and missed one.
//
// WHY THIS IS A SEPARATE FILE and not more cases in the two sibling suites: an assertion here is
// about the RELATIONSHIP between two systems, so it belongs to neither. Putting it in one of them
// would also make that suite import the other catalog, which is the first step towards the shared
// module Ground Rule 1 forbids.
//
// WHAT IS DELIBERATELY *NOT* ASSERTED HERE, and why it matters:
//
//   Only differences VERIFIED against a permitted source are encoded. Permitted for 2014: SRD 5.1
//   (CC-BY-4.0), Wizards' free 2014 Basic Rules, dnd5e.wikidot.com, aidedd.org. Permitted for
//   2024: published 2024 PHB information. Never used: D&D Beyond, Roll20, 5e.tools.
//
//   Many spells did NOT change between editions — Fire Bolt, Mage Hand, Counterspell's stat block,
//   Create Food and Water, Find Familiar's structured fields. Their records SHOULD be identical,
//   and asserting a difference for them would be a fabricated rule that future maintainers would
//   "fix" the data to satisfy. A test that lies about the rules is worse than no test. So the
//   curated list below is short, specific, and every row cites what actually changed.
import { describe, it, expect } from 'vitest';
import { SPELLS_2014 } from '@/lib/dnd/spells/dnd5e-2014';
import { SPELLS_2024, type SpellDef } from '@/lib/dnd/spells/dnd5e-2024';
import { spellsForSystem } from '@/lib/dnd/spells';

const BY_KEY_2014 = new Map(SPELLS_2014.map((s) => [s.key, s]));
const BY_KEY_2024 = new Map(SPELLS_2024.map((s) => [s.key, s]));

/** Keys present in both catalogs — the only population where value bleed is possible. */
const SHARED_KEYS = [...BY_KEY_2014.keys()].filter((k) => BY_KEY_2024.has(k));

describe('membership: neither catalog holds the other edition’s exclusive content', () => {
  it('sanity-checks that both catalogs are actually loaded', () => {
    // Every assertion below is a "for each" or a "not present" check, and all of those pass
    // vacuously against an empty array. If a future refactor breaks an export the way the 2014
    // catalog was once broken — authored but exporting nothing — this file would go green while
    // guarding nothing at all. So the population is pinned first.
    expect(SPELLS_2014.length).toBeGreaterThan(300);
    expect(SPELLS_2024.length).toBeGreaterThan(300);
    expect(SHARED_KEYS.length).toBeGreaterThan(250);
  });

  it('keeps every spell the 2024 PHB introduced out of the 2014 catalog', () => {
    // These did not exist before the 2024 printing, so a 2014 character cannot have learned them.
    // The 2014 catalog is sourced to SRD 5.1, which predates all of them — their presence would
    // mean the file had been topped up from the 2024 list rather than from the SRD.
    //
    // `befuddlement` is the interesting one: it is 2024's REPLACEMENT for Feeblemind, so seeing it
    // here would mean a rename had been applied backwards through both catalogs at once.
    const TWENTY_FOUR_ONLY = [
      'elementalism', 'sorcerous-burst', 'starry-wisp', 'befuddlement',
      // The 2024 Summon line. Not SRD 5.1 content, so it is doubly out of place in a
      // CC-BY-sourced 2014 file — a licensing problem as well as an edition one.
      'summon-beast', 'summon-fey', 'summon-undead', 'summon-aberration', 'summon-construct',
      'summon-elemental', 'summon-celestial', 'summon-dragon', 'summon-fiend',
    ];
    for (const key of TWENTY_FOUR_ONLY) {
      expect(BY_KEY_2014.has(key), `${key} is 2024-only and must not appear in SPELLS_2014`).toBe(false);
    }
  });

  it('keeps Feeblemind in 2014 and out of 2024, where it was replaced', () => {
    // The rename is a two-sided fact and both sides are worth pinning: 2024 renamed Feeblemind to
    // Befuddlement, so exactly one of the pair belongs in each catalog. A future bulk edit that
    // "unified" the naming would have to break one of these two lines to do it.
    expect(BY_KEY_2014.has('feeblemind'), 'Feeblemind is a real 2014/SRD spell').toBe(true);
    expect(BY_KEY_2024.has('feeblemind'), '2024 replaced Feeblemind with Befuddlement').toBe(false);
    expect(BY_KEY_2024.has('befuddlement'), 'Befuddlement is the 2024 replacement').toBe(true);
    expect(BY_KEY_2014.has('befuddlement'), 'Befuddlement did not exist in 2014').toBe(false);
  });

  it('keeps non-SRD 5.1 spells out of the 2014 catalog', () => {
    // The 2014 file claims SRD 5.1 as its licensing basis, so this is a COPYRIGHT boundary, not a
    // taste one. Each of these is a real 2014-era spell that is NOT in the SRD — from the 2014 PHB
    // proper, or from Xanathar's/Tasha's. Reproducing them under a CC-BY-4.0 header would be an
    // attribution claim the licence does not support.
    //
    // Note what is deliberately absent from this list: Hunter's Mark, Find Steed, Eldritch Blast,
    // Acid Arrow, Arcane Hand and Hideous Laughter are all IN the SRD (several under de-named
    // titles), are all present in the catalog, and are correct there.
    const NOT_IN_SRD_5_1 = [
      'hex', 'armor-of-agathys', 'arms-of-hadar',          // PHB 2014 warlock, not SRD
      'searing-smite', 'wrathful-smite', 'compelled-duel',  // PHB 2014 paladin, not SRD
      'ensnaring-strike', 'hail-of-thorns',                 // PHB 2014 ranger, not SRD
      'dragons-breath', 'absorb-elements', 'shadow-blade',  // Xanathar's
      'booming-blade', 'green-flame-blade', 'toll-the-dead', 'word-of-radiance', 'sword-burst',
      'healing-spirit', 'tiny-servant', 'find-greater-steed',
    ];
    for (const key of NOT_IN_SRD_5_1) {
      expect(BY_KEY_2014.has(key), `${key} is not SRD 5.1 content and must not appear in SPELLS_2014`).toBe(false);
    }
  });
});

describe('provenance: no record is labelled with the other edition’s source', () => {
  // spells-2014.test.ts already checks this one way round. It is restated here in BOTH directions
  // and derived from the data rather than from a hardcoded list, so that adding a new source
  // string to either catalog cannot silently create an overlap that neither sibling suite notices.

  it('uses two entirely disjoint sets of source strings', () => {
    const sources2014 = new Set(SPELLS_2014.map((s) => s.source));
    const sources2024 = new Set(SPELLS_2024.map((s) => s.source));
    const overlap = [...sources2014].filter((s) => sources2024.has(s));
    expect(overlap, `these source strings are used by BOTH catalogs: ${overlap.join(', ')}`).toEqual([]);
  });

  it('never labels a 2014 record with a source the 2024 catalog uses', () => {
    const sources2024 = new Set(SPELLS_2024.map((s) => s.source));
    for (const s of SPELLS_2014) {
      expect(sources2024.has(s.source), `${s.key} (2014) is sourced to "${s.source}", a 2024 source`).toBe(false);
    }
  });

  it('never labels a 2024 record with a source the 2014 catalog uses', () => {
    // The direction the sibling suites do not cover. A 2024 record reading `source: 'SRD 5.1'`
    // would be a false licensing claim as well as an edition error: SRD 5.1 is the 2014 document,
    // and nothing in the 2024 PHB is covered by it.
    const sources2014 = new Set(SPELLS_2014.map((s) => s.source));
    for (const s of SPELLS_2024) {
      expect(sources2014.has(s.source), `${s.key} (2024) is sourced to "${s.source}", a 2014 source`).toBe(false);
    }
  });
});

describe('identity: the catalogs never share a record object', () => {
  it('holds no record that is the same object in both arrays', () => {
    // The strongest, cheapest form of the separation claim. If a record is literally shared, then
    // mutating a 2014 sheet's spell would alter a 2024 sheet's, and no field-by-field test could
    // ever detect the two "editions" had become one.
    const objects2024 = new Set<SpellDef>(SPELLS_2024);
    const shared = SPELLS_2014.filter((s) => objects2024.has(s)).map((s) => s.key);
    expect(shared, `these records are the SAME object in both catalogs: ${shared.join(', ')}`).toEqual([]);
  });

  it('serves distinct arrays through the dispatcher', () => {
    const a = spellsForSystem('dnd5e-2014');
    const b = spellsForSystem('dnd5e-2024');
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
  });
});

// ─── VERIFIED DIVERGENCES ────────────────────────────────────────────────────
//
// One row per spell whose 2014 and 2024 forms genuinely differ in a field this schema models, and
// which was confirmed against a permitted source. `field` names what must not be flattened; `why`
// records the actual rules change so a future reader can re-derive the assertion without trusting
// this comment blindly.
//
// The point of asserting NON-equality rather than pinning both literal values: a literal pin fails
// on any edit, including correct ones, and gets weakened until it is meaningless. Asserting only
// that the two sides still disagree leaves both catalogs free to be corrected independently while
// making a copy-paste that collapses them into each other fail loudly.
type Field = 'level' | 'school' | 'castTime' | 'range' | 'components' | 'duration' | 'heal';

const VERIFIED_DIVERGENCES: ReadonlyArray<{ key: string; field: Field; why: string }> = [
  // Healing rewrites: 2024 doubled the base die and moved the healing line to Abjuration.
  { key: 'cure-wounds', field: 'heal', why: '2014 heals 1d8; 2024 heals 2d8' },
  { key: 'cure-wounds', field: 'school', why: '2014 Evocation; 2024 Abjuration' },
  { key: 'healing-word', field: 'heal', why: '2014 heals 1d4; 2024 heals 2d4' },
  { key: 'healing-word', field: 'school', why: '2014 Evocation; 2024 Abjuration' },
  { key: 'mass-healing-word', field: 'heal', why: '2014 heals 1d4; 2024 heals 2d4' },
  // Promoted from KNOWN BLEED (2026-07-21): the 2024 record held 2014's 3d8 while its own
  // editionNote said 5d8. The school HAD been updated to Abjuration, which is the classic
  // fingerprint of a copied record — edit the obvious field, miss the number.
  { key: 'mass-cure-wounds', field: 'heal', why: '2014 heals 3d8; 2024 heals 5d8' },
  { key: 'mass-healing-word', field: 'school', why: '2014 Evocation; 2024 Abjuration' },
  { key: 'prayer-of-healing', field: 'school', why: '2014 Evocation; 2024 Abjuration' },
  { key: 'heal', field: 'school', why: '2014 Evocation; 2024 Abjuration' },
  { key: 'mass-heal', field: 'school', why: '2014 Evocation; 2024 Abjuration' },

  // Cantrip rewrites — the headline edition differences, and the ones a player notices first.
  { key: 'true-strike', field: 'range', why: '2014 is a 30-foot Divination; 2024 is a Self-range weapon attack' },
  { key: 'true-strike', field: 'duration', why: '2014 is concentration up to 1 round; 2024 is Instantaneous' },
  { key: 'chill-touch', field: 'range', why: '2014 is a 120-foot ranged attack; 2024 is a melee attack at Touch' },
  { key: 'chill-touch', field: 'duration', why: '2014 lasts 1 round (blocks healing); 2024 is Instantaneous' },
  { key: 'acid-splash', field: 'school', why: '2014 Conjuration; 2024 Evocation' },
  { key: 'poison-spray', field: 'school', why: '2014 Conjuration; 2024 Necromancy' },
  { key: 'poison-spray', field: 'range', why: '2014 reaches 10 feet; 2024 reaches 30 feet' },
  { key: 'dancing-lights', field: 'school', why: '2014 Evocation; 2024 Illusion' },
  { key: 'shillelagh', field: 'range', why: '2014 is Touch; 2024 is Self' },
  { key: 'spare-the-dying', field: 'castTime', why: '2014 is an action; 2024 is a bonus action' },
  { key: 'spare-the-dying', field: 'range', why: '2014 is Touch; 2024 reaches 15 feet' },
  { key: 'resistance', field: 'components', why: '2014 needs a material (a miniature cloak); 2024 dropped it' },

  // Levelled-spell rewrites.
  { key: 'sleep', field: 'range', why: '2014 reaches 90 feet; 2024 reaches 60 feet' },
  { key: 'barkskin', field: 'castTime', why: '2014 is an action; 2024 is a bonus action' },
  { key: 'conjure-animals', field: 'duration', why: '2014 lasts up to 1 hour; 2024 lasts 10 minutes' },
  { key: 'conjure-fey', field: 'castTime', why: '2014 takes 1 minute; 2024 takes 1 action' },
  { key: 'conjure-fey', field: 'range', why: '2014 reaches 90 feet; 2024 reaches 60 feet' },
  { key: 'conjure-celestial', field: 'castTime', why: '2014 takes 1 minute; 2024 takes 1 action' },
  { key: 'conjure-elemental', field: 'castTime', why: '2014 takes 1 minute; 2024 takes 1 action' },
  { key: 'conjure-elemental', field: 'components', why: '2014 needs elemental materials; 2024 dropped them' },
  { key: 'banishment', field: 'range', why: '2014 reaches 60 feet; 2024 reaches 30 feet' },
  { key: 'blindness-deafness', field: 'school', why: '2014 Necromancy; 2024 Transmutation' },
  { key: 'blindness-deafness', field: 'range', why: '2014 reaches 30 feet; 2024 reaches 120 feet' },
  { key: 'revivify', field: 'school', why: '2014/SRD Conjuration; 2024 Necromancy' },
  { key: 'sending', field: 'school', why: '2014/SRD Evocation; 2024 Divination' },
  { key: 'goodberry', field: 'school', why: '2014 Transmutation; 2024 Conjuration' },
  { key: 'stoneskin', field: 'school', why: '2014 Abjuration; 2024 Transmutation' },
  { key: 'glibness', field: 'school', why: '2014 Transmutation; 2024 Enchantment' },
  { key: 'etherealness', field: 'school', why: '2014 Transmutation; 2024 Conjuration' },
  { key: 'earthquake', field: 'school', why: '2014 Evocation; 2024 Transmutation' },
  { key: 'hallow', field: 'school', why: '2014 Evocation; 2024 Abjuration' },
  { key: 'contingency', field: 'school', why: '2014 Evocation; 2024 Abjuration' },
  { key: 'reincarnate', field: 'school', why: '2014 Transmutation; 2024 Necromancy' },
  { key: 'giant-insect', field: 'school', why: '2014 Transmutation; 2024 Conjuration' },
  { key: 'divine-favor', field: 'school', why: '2014 Evocation; 2024 Transmutation' },
  { key: 'branding-smite', field: 'school', why: '2014/SRD Evocation; 2024 Transmutation' },
  { key: 'find-steed', field: 'castTime', why: '2014 takes 10 minutes; 2024 takes 1 action' },
];

describe('value bleed: spells that changed between editions must still differ', () => {
  it.each(VERIFIED_DIVERGENCES)('$key — $field differs ($why)', ({ key, field, why }) => {
    const a = BY_KEY_2014.get(key);
    const b = BY_KEY_2024.get(key);
    // A missing record is a real failure, not a skip: the curated list only names spells that are
    // supposed to be in both catalogs, so an absence means one of them lost a spell.
    expect(a, `${key} is missing from SPELLS_2014`).toBeDefined();
    expect(b, `${key} is missing from SPELLS_2024`).toBeDefined();
    expect(
      a![field],
      `${key}.${field} is identical in both catalogs ("${a![field]}"). ${why}. ` +
        'Either one catalog was copied from the other, or this rule changed and this row needs revisiting.',
    ).not.toBe(b![field]);
  });

  it('keeps the concentration rewrites apart in both directions', () => {
    // Concentration is stored as an optional boolean, so `undefined` and `false` both mean "no".
    // Comparing the raw fields would let `false` vs `undefined` read as a difference that is not
    // one, so both sides are normalised first — a test that passes for the wrong reason is a
    // liability, not a win.
    const conc = (k: string, m: Map<string, SpellDef>) => !!m.get(k)?.concentration;
    const cases: Array<[string, string]> = [
      ['spiritual-weapon', '2014 needs NO concentration (the reason a 2014 Cleric can also hold Spirit Guardians); 2024 added it'],
      ['barkskin', '2014 requires concentration; 2024 dropped it'],
      ['magic-weapon', '2014 requires concentration; 2024 dropped it'],
      ['divine-favor', '2014 requires concentration; 2024 dropped it'],
      ['animal-shapes', '2014 requires concentration; 2024 dropped it'],
      ['sleep', '2014 needs no concentration (it is a flat hit-point pool); 2024 added it'],
      ['enthrall', '2014 needs no concentration; 2024 added it'],
      ['forcecage', '2014 needs no concentration; 2024 added it'],
      ['true-strike', '2014 is concentration up to 1 round; 2024 is an instantaneous weapon attack'],
    ];
    for (const [key, why] of cases) {
      expect(BY_KEY_2014.has(key) && BY_KEY_2024.has(key), `${key} must exist in both catalogs`).toBe(true);
      expect(
        conc(key, BY_KEY_2014),
        `${key}: both catalogs agree on concentration=${conc(key, BY_KEY_2014)}. ${why}.`,
      ).not.toBe(conc(key, BY_KEY_2024));
    }
  });

  it('keeps Inflict Wounds an attack roll in 2014 and a saving throw in 2024', () => {
    // Worth its own case because the change is a swap between two different fields rather than a
    // new value in one, so no generic field comparison can express it. 2014 is a melee spell
    // attack for 3d10; 2024 is a Constitution save for 2d10.
    const a = BY_KEY_2014.get('inflict-wounds')!;
    const b = BY_KEY_2024.get('inflict-wounds')!;
    expect(a.attack, '2014 Inflict Wounds is a melee spell attack').toBe(true);
    expect(b.save?.ability, '2024 Inflict Wounds is a Constitution save').toBe('con');
    expect(a.damage?.[0]?.dice, '2014 deals 3d10').toBe('3d10');
    expect(b.damage?.[0]?.dice, '2024 deals 2d10').toBe('2d10');
  });

  it('keeps the damage-die changes apart', () => {
    // Only the two cantrips whose die genuinely changed and where BOTH catalogs record a damage
    // array. Flame Strike is knowingly excluded: 2024 deals 5d6 fire AND 5d6 radiant, and the
    // 2024 record currently lists only the fire half, so an assertion here would lock in a bug.
    const dice = (k: string, m: Map<string, SpellDef>) => m.get(k)?.damage?.[0]?.dice;
    expect(dice('chill-touch', BY_KEY_2014), '2014 Chill Touch is 1d8').toBe('1d8');
    expect(dice('chill-touch', BY_KEY_2024), '2024 Chill Touch is 1d10').toBe('1d10');
    expect(dice('vicious-mockery', BY_KEY_2014), '2014 Vicious Mockery is 1d4').toBe('1d4');
    expect(dice('vicious-mockery', BY_KEY_2024), '2024 Vicious Mockery is 1d6').toBe('1d6');
  });

  it('keeps Contagion as two genuinely different spells', () => {
    // Promoted from KNOWN BLEED (2026-07-21). This was the worst find of the edition audit: the
    // 2024 record WAS the 2014 spell, `attack: true` and all, so a 2024 Cleric's sheet rendered an
    // attack button and rolled to hit for a spell that cannot miss — and never surfaced the save
    // the 2024 version is built around.
    //
    // Asserted on the two fields that actually drive the sheet's behaviour, not on prose.
    const a = BY_KEY_2014.get('contagion')!;
    const b = BY_KEY_2024.get('contagion')!;
    expect(a.attack, '2014 Contagion is a melee spell attack').toBe(true);
    expect(b.attack, '2024 Contagion has NO attack roll — if this is true again, the bleed is back').toBeFalsy();
    expect(b.save?.ability, '2024 Contagion is a Constitution save').toBe('con');
    expect(b.damage?.[0]?.dice, '2024 Contagion deals 11d8 necrotic').toBe('11d8');
  });

  it('keeps the class-list widenings apart', () => {
    // 2024 broadened several spell lists. Compared as sets so that a pure reordering — which is
    // meaningless — cannot be mistaken for an edition difference in either direction.
    const cls = (k: string, m: Map<string, SpellDef>) => [...(m.get(k)?.classes ?? [])].sort().join(',');
    const cases: Array<[string, string]> = [
      ['detect-magic', 'SRD 5.1 has no Warlock; 2024 adds it'],
      ['protection-from-evil-and-good', 'SRD 5.1 has no Druid; 2024 adds it'],
      ['spare-the-dying', '2014 is Cleric-only; 2024 adds Druid'],
      ['dancing-lights', '2014 has no Druid; 2024 adds it'],
      ['continual-flame', 'SRD 5.1 has no Druid; 2024 adds it'],
      ['magic-weapon', 'SRD 5.1 is Paladin/Wizard; 2024 adds Ranger and Sorcerer'],
      ['mass-healing-word', '2014 is Cleric-only; 2024 adds Bard'],
      // Promoted from KNOWN BLEED when the 2024 records were corrected (2026-07-21). Both were
      // carrying the narrower 2014 list while their own editionNote described the widening.
      ['cone-of-cold', '2014 is Sorcerer/Wizard; 2024 adds Druid'],
      ['greater-restoration', '2014 is Bard/Cleric/Druid; 2024 adds Paladin and Ranger'],
    ];
    for (const [key, why] of cases) {
      expect(
        cls(key, BY_KEY_2014),
        `${key}: both catalogs list the same classes. ${why}.`,
      ).not.toBe(cls(key, BY_KEY_2024));
    }
  });
});

describe('a spell that did NOT change is allowed to be identical', () => {
  it('does not treat identical records as failures by default', () => {
    // Stated as an executable assertion rather than left to a comment, because the tempting next
    // step after writing this file is a blanket "no shared spell may be identical" rule. That rule
    // would be FALSE — most 5e spells came through 2024 untouched — and satisfying it would mean
    // inventing differences, which is precisely the corruption this suite is meant to prevent.
    //
    // Create Food and Water is the worked example: it carried an editionNote asserting a
    // difference that did not exist, the note was removed, and the records are now correctly
    // identical. This line makes sure nobody "fixes" that back.
    const a = BY_KEY_2014.get('create-food-and-water')!;
    const b = BY_KEY_2024.get('create-food-and-water')!;
    expect(a.level).toBe(b.level);
    expect(a.school).toBe(b.school);
    expect(a.editionNote, 'the 2014 note asserting a phantom difference was removed — keep it removed').toBeUndefined();
    expect(b.editionNote, 'the 2024 note asserting a phantom difference was removed — keep it removed').toBeUndefined();
  });

  it('lets a note decline to claim a difference', () => {
    // Branding Smite's note explicitly says concentration is UNCHANGED between editions. That is a
    // note doing its job: correcting a common misremembering without manufacturing a divergence.
    expect(!!BY_KEY_2014.get('branding-smite')?.concentration).toBe(true);
    expect(!!BY_KEY_2024.get('branding-smite')?.concentration).toBe(true);
  });
});

// ─── The 2026-07-21 edition audit: what it found, and what happened to it ─────
//
// The audit compared every spell present in BOTH catalogs, field by field. The direction of the
// result is worth recording, because it is the opposite of what was expected: **the 2014 catalog
// was clean.** Membership, source strings, object identity, levels and ritual flags all passed.
// Every confirmed fault was in SPELLS_2024, carrying a 2014 value forward.
//
// All four are now FIXED and asserted above, in the same commit as the fix:
//
//   1. contagion           — 2024 record was the 2014 spell entire (attack: true, three-diseases
//                            summary). The sheet rendered an attack button for a spell that cannot
//                            miss. Guarded by 'keeps Contagion as two genuinely different spells'.
//   2. mass-cure-wounds    — 2024 heal was 2014's 3d8; corrected to 5d8. In VERIFIED_DIVERGENCES.
//   3. cone-of-cold        — 2024 class list was missing Druid. In the class-list case.
//   4. greater-restoration — 2024 class list was missing Paladin and Ranger. In the class-list case.
//
// THE TELL, worth remembering for the next audit: in cases 2–4 each spell's OWN editionNote
// already stated the correct difference while the data contradicted it. The notes were right and
// the values were stale, which means these were detectable from inside the repo with no external
// source at all. A cheap future check is simply: does a record agree with its own editionNote?
//
// STILL OPEN, lower severity and not bleed — but the reason bleed survives undetected. Several
// 2024 records omit the very field that carries their 2024 change: counterspell and
// power-word-stun have no `save`, spiritual-weapon lost `attack` and `damage`, flame-strike lists
// only half its damage (contradicting its own summary), divine-favor lost its 1d4 radiant. While
// those fields are blank the two catalogs read as identical no matter how far apart the rules
// actually are, and no comparison test can see the difference. Filling them is tracked in the 2024
// catalog's own follow-up, not here.
