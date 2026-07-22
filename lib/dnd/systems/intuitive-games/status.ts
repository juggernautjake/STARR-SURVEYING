// lib/dnd/systems/intuitive-games/status.ts — how complete the Intuitive Games catalog actually is.
//
// IG-S5 of IG_FULL_PARITY_2026-07-21. Same job as `PF2_CATALOG_STATUS`, and the same reason for existing:
// a partial catalog is fine, a partial catalog that PRESENTS as complete is not, because a missing entry
// then reads as "IG has no such thing" rather than "we have not catalogued it yet".
//
// The difference from PF2 is the honest headline. PF2 has ~1,500 spells and ~2,500 feats and will be
// partial for a long time. IG is one designer's site with a countable amount of content, so "complete"
// is genuinely reachable — and for most kinds it is already true. That makes the INCOMPLETE ones worth
// saying out loud, because they are few enough to be actionable rather than a wall of caveats.
//
// Two things this shape adds over the PF2 one, both because IG can support them:
//  • `catalogKind` — the group kind `igCatalog()` emits for this content. That makes "is it REACHABLE?"
//    a checkable property rather than a claim: a kind can be catalogued in a data file and still be
//    invisible to every picker, which is exactly what backgrounds were until IG-S5. The test in
//    ig-catalog-status.test.ts fails if any status key names a kind the catalog does not emit.
//  • `complete: true` for most kinds. PF2 never gets to say that; IG mostly can, and a status object
//    that only ever says "partial" stops carrying information.
//
// Counts are DERIVED from the arrays, never typed in. A hand-maintained number drifts the first time
// someone adds content, and then the honesty object is itself dishonest.
import {
  IG_STANCES, IG_DEFENSIVE_POWERS, IG_WEAPON_TYPES, IG_MOVEMENT_TYPES, IG_ACTIONS, IG_CREATURES,
  IG_CREATURE_TYPES, IG_BACKGROUND_DEFS, IG_ANCESTRIES, IG_DAMAGE_TYPE_DATA, IG_COVER,
  IG_SIZE_CATEGORIES, IG_REDISTRIBUTION_MATERIALS, igAllSpellNames, igSpellsMissingEffects,
  igPowersNotInRoster,
} from './content';
import {
  IG_WEAPON_CLASS_DATA, IG_WEAPON_PROPERTIES, IG_ARMORS, IG_SHIELDS, IG_EQUIPMENT_PACKS,
  IG_PROFESSIONAL_KITS, IG_ENCHANTMENTS,
} from './items';
import { IG_COMPANION_TYPE_DEFS, IG_COMPANION_FEATURES, IG_COMPANION_ASPECTS, IG_COMPANION_SIZES } from './companions';
import { IG_CLASS_TAXONOMY, igParentClasses } from './taxonomy';
import { igAllFeats } from './feats';
import { systemSkills, systemConditions } from '../../system-rules';
import { IG_ATTACK_MATH_GAPS } from './attack';
import type { IGCatalogKind } from './catalog';

export interface IGCatalogKindStatus {
  /** How many entries exist. Always derived from the underlying array. */
  count: number;
  /** True only when this kind holds everything intuitivegames.net publishes for it. */
  complete: boolean;
  /** What is here, and for an incomplete kind, what is missing and why it was not filled in. */
  note: string;
  /** The `kind` that `igCatalog()` emits for this content, so reachability is testable. */
  catalogKind: IGCatalogKind;
}

export type IGCatalogStatusKey =
  | 'ancestries' | 'classes' | 'subclasses' | 'backgrounds' | 'stances' | 'feats' | 'powers'
  | 'defensivePowers' | 'weaponTypes' | 'weaponClasses' | 'weaponProperties' | 'armor' | 'shields'
  | 'equipment' | 'enchantments' | 'movementTypes' | 'skills' | 'conditions' | 'creatures'
  | 'companionTypes' | 'companionFeatures' | 'companionSizes' | 'damageTypes' | 'cover'
  | 'sizeCategories' | 'redistributionMaterials' | 'actions';

/** Every IG content kind, its size, and whether it is finished. */
export const IG_CATALOG_STATUS: Record<IGCatalogStatusKey, IGCatalogKindStatus> = {
  ancestries: {
    count: IG_ANCESTRIES.length, complete: true, catalogKind: 'ancestry',
    note: `All ${IG_ANCESTRIES.length} ancestries from /traits-ancestries, each with its blurb and its exclusive traits. The four STANDARD (non-ancestry) traits any character may take are held as prose in IG_ANCESTRY_TRAIT_RULES rather than as pickable entries, because the site presents them as a rule rather than a list.`,
  },
  classes: {
    count: igParentClasses().length, complete: true, catalogKind: 'class',
    note: `The ${igParentClasses().length} parent classes (Fighter, Wizard, Archon, Conduit). IG_CLASS_DETAILS carries per-class HP, primary ability, granted stance, defensive power and starting power, and IG_CLASS_POWER_EFFECTS the verbatim effect text for the named powers. What is NOT modelled is a per-level ladder: the site summarises progression instead of publishing one, so there is no level-by-level feature table to catalogue and none was invented.`,
  },
  subclasses: {
    count: IG_CLASS_TAXONOMY.flatMap((t) => t.subclasses).length, complete: true, catalogKind: 'subclass',
    note: `All ${IG_CLASS_TAXONOMY.flatMap((t) => t.subclasses).length} subclasses across the four families, with powers and specializations per subclass. IG_CLASS_RULES says "13 classes in four groups" while the taxonomy resolves to 4 parents + these subclasses — the site's own two framings of the same set, reconciled in taxonomy.ts (Area T1), not a missing entry.`,
  },
  backgrounds: {
    count: IG_BACKGROUND_DEFS.length, complete: true, catalogKind: 'background',
    note: `All ${IG_BACKGROUND_DEFS.length} backgrounds with HP, boosts, proficiencies and granted stance. These were catalogued in content.ts and recognised by the classifier but emitted by NO catalog group until IG-S5 — so the builder picker and the AI grounding, which both read igCatalog(), could not offer one.`,
  },
  stances: {
    count: IG_STANCES.length, complete: true, catalogKind: 'stance',
    note: `All ${IG_STANCES.length} stances with Basic and Advanced text, and the roll effects of each are wired into both the roll path and the displayed numbers.`,
  },
  feats: {
    count: igAllFeats().length, complete: true, catalogKind: 'feat',
    note: `All ${igAllFeats().length} General and Combat feats from /feats-general and /feats-combat, each with effect text. The shorter legacy IG_FEATS list from the sheet template is reconciled against this one at catalog build time; anything it holds that the full list does not is surfaced under "Feats · Unlisted" rather than dropped.`,
  },
  powers: {
    count: igAllSpellNames().length, complete: true, catalogKind: 'power',
    note: `All ${igAllSpellNames().length} spells from /spell-list, grouped by school, and the depth is complete too: ${igAllSpellNames().length - igSpellsMissingEffects().length} carry verbatim Description text and all ${igAllSpellNames().length} carry their Advanced and Expert tier text (spell-tiers.ts). ${igPowersNotInRoster().length} further names from the sheet template are not on the current site roster — five are defensive/class powers filed here rather than spells, the rest look like renames (e.g. "Detect Thoughts" vs the roster's "Detect Thoughts/Emotions"). Only the designer can confirm which, so they are surfaced under "Powers · Unlisted" rather than deleted or silently merged.`,
  },
  defensivePowers: {
    count: IG_DEFENSIVE_POWERS.length, complete: false, catalogKind: 'defensive-power',
    note: `The ${IG_DEFENSIVE_POWERS.length} defensive powers named on the character sheet template. Incomplete because the CLASS tables grant three more — Mage Armor (Arcanist), Misdirection (Magician) and Life Connection (Shaman) are all listed as subclass defensive powers in IG_CLASS_DETAILS and are absent from this list, so the defensive-power group cannot offer a Magician the one their own subclass grants. Their text exists in IG_POWERS; merging the two lists is a content decision (are they spells or defensive powers?) that has not been made, and guessing it would put a power in the wrong slot.`,
  },
  weaponTypes: {
    count: IG_WEAPON_TYPES.length, complete: true, catalogKind: 'weapon-type',
    note: `The full {class × damage type} proficiency grid (${IG_WEAPON_TYPES.length} combinations), which is what "proficient with Heavy Slashing" means. Note this grid's classes do not match IG_WEAPON_CLASS_DATA's — see IG_ATTACK_MATH_GAPS.`,
  },
  weaponClasses: {
    count: IG_WEAPON_CLASS_DATA.length, complete: false, catalogKind: 'weapon-class',
    note: `The ${IG_WEAPON_CLASS_DATA.length} weapon classes with costs and notes. Incomplete in the sense that matters to a player: the site's /weapons page is a declared WORK IN PROGRESS that defines the framework and lists NO named weapons at all. There is no weapon roster to catalogue, so a player builds a weapon from a class plus properties rather than picking one off a list.`,
  },
  weaponProperties: {
    count: IG_WEAPON_PROPERTIES.length, complete: true, catalogKind: 'weapon-property',
    note: `All ${IG_WEAPON_PROPERTIES.length} published properties with their text. Catalogued and now structured onto resolved attacks (IG-S4), but NONE is folded into the to-hit or damage — see IG_ATTACK_PROPERTIES[].why for the per-property reason.`,
  },
  armor: {
    count: IG_ARMORS.length, complete: true, catalogKind: 'armor',
    note: `All ${IG_ARMORS.length} armors with DR, Strength requirement, cost and vulnerabilities. The /armor-shields page is complete on the site. The non-proficiency Reflex penalty is published but not computed — the model has no armor-proficiency flag (IG_ATTACK_MATH_GAPS).`,
  },
  shields: {
    count: IG_SHIELDS.length, complete: true, catalogKind: 'shield',
    note: `All ${IG_SHIELDS.length} shields across both groups, with costs and notes.`,
  },
  equipment: {
    count: IG_EQUIPMENT_PACKS.length + IG_PROFESSIONAL_KITS.length, complete: false, catalogKind: 'equipment',
    note: `The ${IG_EQUIPMENT_PACKS.length} starting packs with contents, plus the ${IG_PROFESSIONAL_KITS.length} professional kits. Incomplete because the site's Outdoor Equipment, Tools, Refined Items, Sustenance and Materials tables exist as EMPTY HEADERS — there is published structure with no published content, and the /tools page likewise explains the concept and lists no tools.`,
  },
  enchantments: {
    count: IG_ENCHANTMENTS.length, complete: true, catalogKind: 'enchantment',
    note: `All ${IG_ENCHANTMENTS.length} Eldritch Jewel enchantments with effects; the jewel system itself (slots, crafting DCs, pricing, burnout) is prose in IG_MAGIC_ITEM_RULES. The /magical-items page is complete on the site.`,
  },
  movementTypes: {
    count: IG_MOVEMENT_TYPES.length, complete: true, catalogKind: 'movement-type',
    note: `The movement-type options as the character sheet template enumerates them (None/Fast plus Fly/Climb/Burrow/Swim at 10/20/30 ft).`,
  },
  skills: {
    count: systemSkills('intuitive-games').length, complete: true, catalogKind: 'skill',
    note: `All ${systemSkills('intuitive-games').length} skills including the nine combat skills, each with its governing ability. Held in the shared system-rules catalog rather than in content.ts, so the sheet, the builder and the classifier read one list.`,
  },
  conditions: {
    count: systemConditions('intuitive-games').length, complete: true, catalogKind: 'condition',
    note: `All ${systemConditions('intuitive-games').length} conditions. The mechanical ones (flat penalties, disadvantage by roll category) are wired into both the roll path and the displayed numbers via lib/dnd/conditions/intuitive-games.ts.`,
  },
  creatures: {
    count: IG_CREATURES.length + IG_CREATURE_TYPES.length, complete: false, catalogKind: 'creature-type',
    note: `${IG_CREATURES.length} bestiary entries in ${IG_CREATURE_TYPES.length} groups. NAMES ONLY — no statblocks. The list comes from the character sheet template's creature page, which enumerates what a companion can be without publishing stats for any of them, so a DM gets a legal name and builds the creature themselves.`,
  },
  companionTypes: {
    count: IG_COMPANION_TYPE_DEFS.length, complete: true, catalogKind: 'companion-type',
    note: `All ${IG_COMPANION_TYPE_DEFS.length} companion types, one per Archon subclass, with their ability adjustments, skill options and size limits.`,
  },
  companionFeatures: {
    count: IG_COMPANION_FEATURES.length + IG_COMPANION_ASPECTS.length, complete: false, catalogKind: 'companion-feature',
    note: `${IG_COMPANION_FEATURES.length} features and ${IG_COMPANION_ASPECTS.length} aspects, verbatim. Incomplete for the reason IG_COMPANION_RULES states: the site does not publish how a companion is DIRECTED in combat or what its action economy is, so the build options are complete but the play rules are not.`,
  },
  companionSizes: {
    count: IG_COMPANION_SIZES.length, complete: true, catalogKind: 'companion-size',
    note: `The ${IG_COMPANION_SIZES.length} sizes a companion can be, with reach and ability/stealth/damage-step modifiers. Catalogued and NOT computed: nothing applies these to a companion's attacks or skills, and damageStep needs a die ladder IG does not publish (IG_ATTACK_MATH_GAPS).`,
  },
  damageTypes: {
    count: IG_DAMAGE_TYPE_DATA.length, complete: true, catalogKind: 'damage-type',
    note: `All ${IG_DAMAGE_TYPE_DATA.length} damage categories from /core-rules, each saying whether DR applies and whether it affects incorporeal creatures.`,
  },
  cover: {
    count: IG_COVER.length, complete: true, catalogKind: 'cover',
    note: `All ${IG_COVER.length} cover levels with their effects on Reflex saves and Stealth.`,
  },
  sizeCategories: {
    count: IG_SIZE_CATEGORIES.length, complete: false, catalogKind: 'size',
    note: `The ${IG_SIZE_CATEGORIES.length} size category NAMES. Incomplete on purpose: the site says each size adjusts reach, ability scores and stealth/damage relative to Medium but publishes no per-size table for characters, and the companion size table only covers Tiny–Large. The per-size numbers for the other five were not invented to fill the gap.`,
  },
  redistributionMaterials: {
    count: IG_REDISTRIBUTION_MATERIALS.length, complete: true, catalogKind: 'redistribution-material',
    note: `All ${IG_REDISTRIBUTION_MATERIALS.length} Conduit redistribution materials with descriptions and Launch Material damage types.`,
  },
  actions: {
    count: IG_ACTIONS.length, complete: true, catalogKind: 'action',
    note: `${IG_ACTIONS.length} actions across the three-action economy plus reactions, from the sheet template's reference page.`,
  },
};

/** Is the whole IG catalog complete? Unlike PF2 this can honestly become true one day. */
export function igCatalogIsComplete(): boolean {
  return Object.values(IG_CATALOG_STATUS).every((k) => k.complete);
}

/** The kinds that are not finished, for a UI that wants to say so precisely. */
export function igIncompleteKinds(): IGCatalogStatusKey[] {
  return (Object.keys(IG_CATALOG_STATUS) as IGCatalogStatusKey[]).filter((k) => !IG_CATALOG_STATUS[k].complete);
}

/** Every known IG gap in one searchable place — content gaps from the status object, plus the attack-maths
 *  gaps from attack.ts. Recorded here rather than only in a planning doc, so the next person to touch this
 *  data finds them next to the data (the reasoning PF2_KNOWN_GAPS gives, and it holds identically here). */
export const IG_KNOWN_GAPS: string[] = [
  ...igIncompleteKinds().map((k) => `${k}: ${IG_CATALOG_STATUS[k].note}`),
  ...IG_ATTACK_MATH_GAPS,
  // Gaps that are not about a KIND being short, so they have nowhere else to live.
  'The provenance classifier does not route the `background` kind to IG. content.ts KIND_NAMES holds a background list, but provenance.ts IG_KINDS omits `background`, so classifyElement falls through to the untracked branch and returns "vanilla" for ANY background name, including an invented one. It fails open (never falsely flags), which is why it went unnoticed, but a custom background is not currently flagged as custom.',
  'IG has no `weapon` catalog in the ElementKind sense — no named weapons exist to catalogue (the site\'s weapons page is a framework). A weapon on an IG sheet is therefore always player-authored, and provenance treats it as untracked rather than custom.',
  // ── Builder-wiring findings (owner audit, 2026-07-21). The HP fix wired one contributor grant; the
  //    audit swept the rest. The concrete grants that COULD be wired now are (background stance + skill
  //    proficiencies, subclass stance + defensive power, class starting power, INT×level rank budget); the
  //    entries below are the ones that genuinely CANNOT be computed from published data and so were
  //    recorded rather than invented.
  'AC / defence: IG publishes NO Armor Class stat at all. Defence is the damage-save model (at the start of your next turn, Fortitude save vs DC = HP lost) plus Damage Reduction. So there is nothing for the builder to compute an "AC" into — the right value is its absence. DR itself is under-wired for a separate, already-recorded reason: armor grants DR but IGEquipment holds free-text strings with no structured DR (IG_ATTACK_MATH_GAPS), and the one ancestry DR source (Leshonki Barkskin, DR 2) is a TRAIT the player chooses with a trait slot, not an automatic ancestry grant — so the builder leaving combat.damageReduction at 0 is correct, not a gap to fill.',
  'Saves (Fortitude/Reflex/Will): the builder leaves every save `rank` at 0, and that is correct, not the HP bug repeated. IG has no published per-class save-proficiency table — IG_CLASS_DETAILS carries no save field and system-rules\' IG classes all list `saves: []` — and the save formula already adds LEVEL to every save unconditionally (proficiency = level), so a rank-0 save is a real, non-empty number. The save bonuses that DO exist (Dwarf Robust +2 Fortitude, Halfling Lucky +2 one save, Naga Elemental, etc.) are ANCESTRY TRAITS taken with a trait slot — player choices — so they are not auto-applied, for the same reason ability boosts are not.',
  'Class skill proficiency: a class "grants a skill proficiency" (IG_BUILD_STEPS) but WHICH skill is not published per class — IG_CLASS_DETAILS has no skill field — so the builder cannot flag it and does not guess. Background skill proficiencies ARE published (IG_BACKGROUND_DEFS.proficiencies) and are now wired; the class one is the honest remainder.',
  'Background ITEM proficiencies: a background\'s proficiency list can name armor/shield proficiencies rather than skills (Soldier → Armor, Shields). The builder now flags every proficiency that maps to a SKILL, but an item proficiency has no skill to flag and no field in the model to hold it (the same missing armor-proficiency flag noted above), so those names are left unwired rather than forced onto a wrong skill. This is why a Soldier-background character gains no skill proficiency from the background.',
];
