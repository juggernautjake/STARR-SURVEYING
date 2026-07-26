// statgen/assemble5e — turn manual-builder picks into a 5e character DATA PATCH (MB-2b).
//
// The manual builder captures CHOICES (class, level, species, subclass, background, final abilities, feats);
// the sheet derives the MECHANICS (HP, AC, proficiency, class features by level, saves, spell slots) from
// those choices via the class registry + ledger. So assembly is not a from-scratch character build — it is a
// focused patch of the identity + abilities fields the sheet reads. Pure + unit-tested so the mapping (class
// KEY → label, subclass key → label, primary abilities, the 2024 background spread) can't drift; the route
// (MB-2b wiring) merges this patch onto the character row's `data`.
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';
import { abilityMod, maxHpForLevel } from '@/app/dnd/_sheet/rules/dnd';
import { findClass, subclassesFor } from '@/lib/dnd/classes/registry';

export interface Dnd5eAssembleInput {
  system: string;
  level: number;
  name?: string;
  species?: string;
  /** The class KEY (as chosen in the builder dropdown). */
  className?: string;
  /** The subclass KEY. */
  subclass?: string;
  background?: string;
  /** The FINAL ability scores (base + racial/background increases already folded in — running totals). */
  abilities: Record<AbilityKey, number>;
  /** The 2024 background spread, stored so it can be exactly reversed later (2014 leaves this empty). */
  backgroundAbilities?: Partial<Record<AbilityKey, number>>;
  /** Feats chosen at build time, by catalog name. */
  feats?: string[];
}

export interface Dnd5eAssembly {
  meta: {
    name: string;
    className: string;
    species: string;
    subclass: string;
    level: number;
    background?: string;
    backgroundAbilities?: Partial<Record<AbilityKey, number>>;
  };
  abilities: Record<AbilityKey, number>;
  primaryAbilities: AbilityKey[];
  /** Feats to record as sheet features (name + a placeholder body the sheet/route can enrich from the catalog). */
  feats: { name: string; body: string }[];
  /**
   * The combat facts that follow from the CLASS and cannot be re-derived from `meta` alone.
   *
   * The header above says the sheet derives HP from these choices, and it does — but only when the level
   * changes *through the sheet's own setter*, and that setter reads `combat.hitDiceSize`. A character built
   * straight to level 8 from the builder never trips the setter and never had its hit die set, so it kept
   * the blank character's d8 default and its stored `maxHp: 1`: a level-8 Fighter rendered with **1 hit
   * point and no hit dice**. The class knows its own die; writing it here is what closes that gap.
   */
  combat: { hitDiceSize: number; hitDiceTotal: number; hitDiceRemaining: number; maxHp: number; currentHp: number; ac: number };
  /** Save proficiencies from the class (a Fighter is STR + CON). The sheet stores these per-ability and had
   *  no other source for them, so every manually-built character was proficient in NO saves. */
  saves: Partial<Record<AbilityKey, { proficient: boolean }>>;
}

const clampLevel = (n: number) => Math.max(1, Math.min(20, Math.round(n)));

/** Build the identity + abilities patch from the picks. Resolves the class + subclass KEYS to their display
 *  LABELS (the sheet's `meta` stores labels), pulls the class's primary abilities, and keeps the 2024
 *  background spread for reversibility. Unknown class/subclass fall back to the raw key so nothing is lost. */
export function assembleDnd5e(input: Dnd5eAssembleInput): Dnd5eAssembly {
  const cls = input.className ? findClass(input.system, input.className) : null;
  const classLabel = cls?.name ?? input.className ?? '';

  let subclassLabel = input.subclass ?? '';
  if (cls && input.subclass) {
    const sub = subclassesFor(input.system, cls.key).find(
      (s) => s.key === input.subclass || s.name.toLowerCase() === input.subclass!.toLowerCase(),
    );
    subclassLabel = sub?.name ?? input.subclass;
  }

  return {
    meta: {
      name: input.name?.trim() || 'New character',
      className: classLabel,
      species: input.species ?? '',
      subclass: subclassLabel,
      level: clampLevel(input.level),
      ...(input.background ? { background: input.background } : {}),
      ...(input.backgroundAbilities && Object.keys(input.backgroundAbilities).length
        ? { backgroundAbilities: input.backgroundAbilities }
        : {}),
    },
    abilities: { ...input.abilities },
    primaryAbilities: cls?.primaryAbility ? [...cls.primaryAbility] : [],
    feats: (input.feats ?? []).map((name) => ({ name, body: '' })),
    combat: combatFor(cls, clampLevel(input.level), input.abilities),
    saves: savesFor(cls),
  };
}

/** Hit die / hit dice / starting HP for a class at a level. Uses the sheet's OWN `maxHpForLevel` so a built
 *  character and a levelled-up one agree — two formulas would drift, and the whole point of writing these
 *  here is that the sheet's derivation never ran. An unknown class keeps the blank d8 default. */
function combatFor(cls: ReturnType<typeof findClass>, level: number, abilities: Record<AbilityKey, number>) {
  const hitDie = cls?.hitDie ?? 8;
  const conMod = abilityMod(abilities.con ?? 10);
  const maxHp = maxHpForLevel(level, conMod, hitDie);
  // Unarmored AC. `deriveAc` treats `combat.ac` as the "unarmored / manual" BASE and adds armour, shields
  // and effects on top — it never adds Dexterity itself, so an unarmored character shows exactly whatever
  // this value is. Left at the blank default a DEX-14 character rendered AC 10 instead of 12. Seeding it
  // here keeps the manual-override semantics intact: the player can still type over it, and equipping
  // armour replaces the base entirely.
  const ac = 10 + abilityMod(abilities.dex ?? 10);
  return { hitDiceSize: hitDie, hitDiceTotal: level, hitDiceRemaining: level, maxHp, currentHp: maxHp, ac };
}

/** The class's saving-throw proficiencies, as the sheet stores them. */
function savesFor(cls: ReturnType<typeof findClass>): Partial<Record<AbilityKey, { proficient: boolean }>> {
  const out: Partial<Record<AbilityKey, { proficient: boolean }>> = {};
  for (const k of cls?.savingThrows ?? []) out[k] = { proficient: true };
  return out;
}
