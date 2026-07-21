// __tests__/dnd/ig-catalog-status.test.ts — IG-S5: every IG content kind is catalogued, reachable, and
// honestly reported.
//
// The failure this file exists to prevent is the quiet one. A kind can be fully transcribed into a data
// file and still be invisible to every picker, because nothing connects the data to `igCatalog()` — which
// is exactly what backgrounds were before IG-S5: ten of them, recognised by the classifier, and offerable
// by nothing. Tests that read the data arrays directly would all have passed.
//
// So the load-bearing test here is the REACHABILITY one: every status key names a `catalogKind`, and the
// catalog must actually emit a group of that kind. Add a data collection without wiring it in, or wire it
// in without declaring it, and one of these fails.
import { describe, it, expect } from 'vitest';
import { igCatalog, igCatalogCount, type IGCatalogKind } from '@/lib/dnd/systems/intuitive-games/catalog';
import {
  IG_CATALOG_STATUS, IG_KNOWN_GAPS, igCatalogIsComplete, igIncompleteKinds,
  type IGCatalogStatusKey,
} from '@/lib/dnd/systems/intuitive-games/status';
import {
  IG_BACKGROUND_DEFS, IG_ANCESTRIES, IG_ACTIONS, IG_COVER, IG_DAMAGE_TYPE_DATA,
  IG_REDISTRIBUTION_MATERIALS, IG_SIZE_CATEGORIES, igAllSpellNames, igSpellsMissingEffects,
} from '@/lib/dnd/systems/intuitive-games/content';
import { IG_SPELL_TIERS } from '@/lib/dnd/systems/intuitive-games/spell-tiers';
import {
  IG_WEAPON_CLASS_DATA, IG_WEAPON_PROPERTIES, IG_ARMORS, IG_SHIELDS, IG_ENCHANTMENTS,
} from '@/lib/dnd/systems/intuitive-games/items';
import { IG_COMPANION_TYPE_DEFS, IG_COMPANION_SIZES } from '@/lib/dnd/systems/intuitive-games/companions';
import { igAllFeats } from '@/lib/dnd/systems/intuitive-games/feats';

const groups = igCatalog();
const emitted = new Set<IGCatalogKind>(groups.map((g) => g.kind));
const keys = Object.keys(IG_CATALOG_STATUS) as IGCatalogStatusKey[];

describe('every catalogued kind is REACHABLE from igCatalog()', () => {
  for (const key of keys) {
    it(`${key} is emitted as a "${IG_CATALOG_STATUS[key].catalogKind}" group`, () => {
      expect(emitted.has(IG_CATALOG_STATUS[key].catalogKind)).toBe(true);
    });
  }

  it('and nothing is emitted that the status object fails to describe', () => {
    // The other direction, and the one that catches an UNCATALOGUED kind: a group appearing with no
    // status entry means content was surfaced without anyone recording how complete it is.
    const declared = new Set(keys.map((k) => IG_CATALOG_STATUS[k].catalogKind));
    const undeclared = [...emitted].filter((k) => !declared.has(k));
    expect(undeclared, `catalog emits kinds with no status entry: ${undeclared.join(', ')}`).toEqual([]);
  });

  it('the kinds that had NO catalog presence before IG-S5 are all present now', () => {
    // Named individually rather than counted, because "13 groups" is a number that means nothing when
    // it breaks. Each of these was catalogued in a data file and offered by nothing.
    for (const k of [
      'background', 'weapon-class', 'weapon-property', 'armor', 'shield', 'equipment', 'enchantment',
      'companion-type', 'companion-feature', 'companion-size', 'damage-type', 'cover', 'size',
      'redistribution-material',
    ] as IGCatalogKind[]) {
      expect(emitted.has(k), `${k} should be browsable`).toBe(true);
    }
  });

  it('backgrounds specifically reach the picker, with what the choice decides', () => {
    // The concrete regression: the builder reads igCatalog() and could not offer a single background.
    const bg = groups.find((g) => g.kind === 'background')!;
    expect(bg.entries).toHaveLength(IG_BACKGROUND_DEFS.length);
    const soldier = bg.entries.find((e) => e.name === 'Soldier')!;
    expect(soldier.effect).toMatch(/12 HP/);
    expect(soldier.effect).toMatch(/Menacing stance/);
  });
});

describe('the status object never overstates coverage', () => {
  it('reports the catalog as incomplete overall, because some kinds are', () => {
    expect(igCatalogIsComplete()).toBe(false);
    expect(igIncompleteKinds().length).toBeGreaterThan(0);
  });

  it('every incomplete kind says what is missing', () => {
    // A bare `complete: false` tells a reader nothing; the note is the useful part.
    for (const key of igIncompleteKinds()) {
      expect(IG_CATALOG_STATUS[key].note, `${key} is incomplete and must say why`).toBeTruthy();
      expect(IG_CATALOG_STATUS[key].note.length, `${key}'s note is too short to be a reason`).toBeGreaterThan(60);
    }
  });

  it('every kind carries a note, complete or not — a complete one still needs its scope stated', () => {
    for (const key of keys) expect(IG_CATALOG_STATUS[key].note.length, key).toBeGreaterThan(40);
  });

  it('the kinds we know to be short are marked short', () => {
    // These are the honest gaps IG-S5 recorded rather than filled by invention. If any of them flips to
    // `complete: true`, it must be because the content landed — not because the flag was edited.
    expect(IG_CATALOG_STATUS.defensivePowers.complete).toBe(false); // three subclass ones are missing
    expect(IG_CATALOG_STATUS.creatures.complete).toBe(false);     // bestiary names, no statblocks
    expect(IG_CATALOG_STATUS.equipment.complete).toBe(false);     // the site's tables are empty headers
    expect(IG_CATALOG_STATUS.weaponClasses.complete).toBe(false); // the weapons page publishes no weapons
    expect(IG_CATALOG_STATUS.sizeCategories.complete).toBe(false);// names only, no per-size table
  });

  it('a kind marked COMPLETE has earned it — powers claim full depth, so check the depth', () => {
    // The risk with a `complete: true` is the opposite of the one with `false`: it is a claim nobody
    // checks. Powers is the biggest kind that claims completeness, and its claim is specific (every
    // roster spell has Description AND Advanced AND Expert text), so it can be verified rather than
    // trusted. If effect text ever goes missing, this fails instead of the note quietly becoming false.
    expect(IG_CATALOG_STATUS.powers.complete).toBe(true);
    expect(igSpellsMissingEffects()).toEqual([]);
    const tiered = new Set(Object.keys(IG_SPELL_TIERS).map((n) => n.trim().toLowerCase()));
    for (const n of igAllSpellNames()) expect(tiered.has(n.trim().toLowerCase()), `${n} has no Advanced/Expert tiers`).toBe(true);
  });

  it('counts come from the arrays rather than being hand-maintained numbers', () => {
    // A typed-in count drifts the moment content is added, and then the honesty object is lying.
    expect(IG_CATALOG_STATUS.ancestries.count).toBe(IG_ANCESTRIES.length);
    expect(IG_CATALOG_STATUS.backgrounds.count).toBe(IG_BACKGROUND_DEFS.length);
    expect(IG_CATALOG_STATUS.feats.count).toBe(igAllFeats().length);
    expect(IG_CATALOG_STATUS.powers.count).toBe(igAllSpellNames().length);
    expect(IG_CATALOG_STATUS.weaponClasses.count).toBe(IG_WEAPON_CLASS_DATA.length);
    expect(IG_CATALOG_STATUS.weaponProperties.count).toBe(IG_WEAPON_PROPERTIES.length);
    expect(IG_CATALOG_STATUS.armor.count).toBe(IG_ARMORS.length);
    expect(IG_CATALOG_STATUS.shields.count).toBe(IG_SHIELDS.length);
    expect(IG_CATALOG_STATUS.enchantments.count).toBe(IG_ENCHANTMENTS.length);
    expect(IG_CATALOG_STATUS.companionTypes.count).toBe(IG_COMPANION_TYPE_DEFS.length);
    expect(IG_CATALOG_STATUS.companionSizes.count).toBe(IG_COMPANION_SIZES.length);
    expect(IG_CATALOG_STATUS.damageTypes.count).toBe(IG_DAMAGE_TYPE_DATA.length);
    expect(IG_CATALOG_STATUS.cover.count).toBe(IG_COVER.length);
    expect(IG_CATALOG_STATUS.sizeCategories.count).toBe(IG_SIZE_CATEGORIES.length);
    expect(IG_CATALOG_STATUS.redistributionMaterials.count).toBe(IG_REDISTRIBUTION_MATERIALS.length);
    expect(IG_CATALOG_STATUS.actions.count).toBe(IG_ACTIONS.length);
  });

  it('a declared count matches what the catalog actually emits for that kind', () => {
    // Counting the data and surfacing the data are two different things; this pins them together for the
    // kinds where one group maps to one collection.
    const size = (k: IGCatalogKind) => groups.filter((g) => g.kind === k).reduce((n, g) => n + g.entries.length, 0);
    for (const key of ['backgrounds', 'armor', 'shields', 'enchantments', 'cover', 'damageTypes',
      'companionTypes', 'companionSizes', 'weaponClasses', 'weaponProperties', 'redistributionMaterials',
      'sizeCategories', 'actions'] as IGCatalogStatusKey[]) {
      const s = IG_CATALOG_STATUS[key];
      expect(size(s.catalogKind), `${key} declares ${s.count} but the catalog emits ${size(s.catalogKind)}`).toBe(s.count);
    }
  });
});

describe('the gaps are recorded in the repo, not in a chat log', () => {
  it('rolls up every incomplete kind plus the attack-maths gaps', () => {
    expect(IG_KNOWN_GAPS.length).toBeGreaterThan(igIncompleteKinds().length);
  });

  it('names the specific absences a future author would otherwise re-derive', () => {
    const all = IG_KNOWN_GAPS.join('\n');
    expect(all).toMatch(/WORK IN PROGRESS|empty headers/i);   // the site's own WIP pages
    expect(all).toMatch(/statblock/i);                        // bestiary names without stats
    expect(all).toMatch(/background/i);                       // the provenance routing gap
    expect(all).toMatch(/Heavy Ranged/);                      // the weapon-class taxonomy mismatch
  });
});

describe('the catalog still holds everything it held before', () => {
  it('grew rather than replaced — the pre-IG-S5 sections are all still there', () => {
    const titles = groups.map((g) => g.title);
    for (const t of ['Ancestries', 'Classes', 'Subclasses', 'Stances', 'Defensive powers', 'Weapon types',
      'Movement types', 'Skills', 'Conditions', 'Companion creature types']) {
      expect(titles, `${t} went missing`).toContain(t);
    }
    expect(titles.some((t) => t.startsWith('Powers · '))).toBe(true);
    expect(titles.some((t) => t.startsWith('Feats'))).toBe(true);
    expect(titles.some((t) => t.startsWith('Creatures · '))).toBe(true);
    expect(titles.some((t) => t.startsWith('Actions · '))).toBe(true);
  });

  it('every entry is still flagged vanilla, in every new group too', () => {
    // The catalog IS the vanilla library; a new group that forgot `source` would read as custom content.
    expect(groups.every((g) => g.entries.every((e) => e.source === 'vanilla'))).toBe(true);
    expect(groups.every((g) => g.entries.length > 0)).toBe(true);
  });

  it('no group is emitted empty, and the count is the sum of the parts', () => {
    expect(igCatalogCount()).toBe(groups.reduce((n, g) => n + g.entries.length, 0));
  });
});
