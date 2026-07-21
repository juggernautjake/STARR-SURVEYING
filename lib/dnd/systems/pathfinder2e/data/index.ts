// lib/dnd/systems/pathfinder2e/data/index.ts — one door to the PF2 catalog, and an honest count.
//
// The tranches (conditions, actions, equipment, feats, spells) were authored separately and were
// unreachable from anything until this file. It aggregates them and — more importantly — reports
// what is ACTUALLY covered.
//
// WHY THE STATUS OBJECT MATTERS MORE THAN THE DATA. This catalog is partial and will stay partial
// for a while: PF2 has roughly 1,500 spells and 2,500 feats. A partial catalog is fine; a partial
// catalog that PRESENTS as complete is not, because then a missing spell reads as "PF2 has no such
// spell" rather than "we haven't catalogued it". Every consumer that can show a "not the full list
// yet" notice should read `complete` here and do so — the 5e spell picker already does exactly
// this with SPELL_CATALOG_STATUS.
//
// Ground Rule 3 in practice: the authors of each tranche were told to OMIT anything they were not
// confident of rather than guess, and their reported omissions are summarised in `PF2_KNOWN_GAPS`
// so the gaps are searchable in the repo rather than buried in a chat log.
import { PF2_CONDITIONS, pf2Condition } from './conditions';
import { PF2_ACTIONS, pf2Action } from './actions';
import {
  PF2_WEAPONS_FULL, PF2_ARMORS_FULL, PF2_SHIELDS, PF2_RUNES, PF2_ITEMS, PF2_EQUIPMENT_GAPS,
} from './equipment';
import { PF2_FEATS_GENERAL, PF2_FEATS_SKILL, PF2_FEATS_GENERAL_SKILL, pf2GeneralOrSkillFeat } from './feats-general-skill';
import { PF2_SPELLS_R0_3, pf2SpellR0_3 } from './spells-0-3';
import { PF2_SPELLS_R4_10, PF2_FOCUS_SPELLS, pf2SpellR4_10 } from './spells-4-10';
import {
  PF2_CLASS_PROGRESSIONS, pf2ClassProgression, pf2ClassFeatLevels, pf2RankAtLevel,
  pf2MaxSpellRankFromProgression, PF2_CLASS_PROGRESSION_GAPS,
} from './classes';
import { PF2_CLASSES, PF2_ANCESTRIES } from '../content';
import type { PF2CatalogStatus } from '../defs';

export {
  PF2_CONDITIONS, pf2Condition,
  PF2_ACTIONS, pf2Action,
  PF2_WEAPONS_FULL, PF2_ARMORS_FULL, PF2_SHIELDS, PF2_RUNES, PF2_ITEMS,
  PF2_FEATS_GENERAL, PF2_FEATS_SKILL, PF2_FEATS_GENERAL_SKILL, pf2GeneralOrSkillFeat,
  PF2_SPELLS_R0_3, pf2SpellR0_3,
  PF2_SPELLS_R4_10, PF2_FOCUS_SPELLS, pf2SpellR4_10,
  PF2_CLASS_PROGRESSIONS, pf2ClassProgression, pf2ClassFeatLevels, pf2RankAtLevel,
  pf2MaxSpellRankFromProgression,
};
export type {
  PF2ClassProgression, PF2ProficiencyTrack, PF2ProficiencyStep, PF2ClassFeature,
  PF2ClassSpellcasting, PF2Subclass,
} from './classes';

/** Every catalogued feat, from whichever tranche holds it. Class and ancestry feats are not
 *  authored yet, so today this is the general/skill set — the shape is what matters, so adding a
 *  tranche later is one line here and nothing changes at the call sites. */
export const PF2_ALL_FEATS = [...PF2_FEATS_GENERAL_SKILL];

/** Every catalogued spell, slot-cast and focus alike. */
export const PF2_ALL_SPELLS = [...PF2_SPELLS_R0_3, ...PF2_SPELLS_R4_10, ...PF2_FOCUS_SPELLS];

/** What the catalog actually holds. `complete` is false wherever it is — no exceptions, and no
 *  rounding up. The notes say what is missing in one line so a reader does not have to diff. */
export const PF2_CATALOG_STATUS: PF2CatalogStatus = {
  spells: {
    count: PF2_ALL_SPELLS.length,
    complete: false,
    note: 'Partial at every rank. Spells whose remaster name or tradition list could not be confirmed were deliberately omitted — a wrong tradition silently breaks the eligibility gate, which is the worst failure available here because it looks fine. Psychic, Summoner, Magus and Thaumaturge focus spells are absent, and 46 focus spells carry source "Legacy" because their remastered form could not be confirmed.',
  },
  feats: {
    count: PF2_ALL_FEATS.length,
    complete: false,
    note: 'General and skill feats only. Class feats, ancestry feats and archetype feats are not catalogued yet.',
  },
  classes: {
    count: PF2_CLASSES.length,
    complete: false,
    note: `Level-1 definitions for ${PF2_CLASSES.length} classes in content.ts, plus full level 1–20 progressions for ${PF2_CLASS_PROGRESSIONS.length} of them in data/classes.ts (proficiency steps, class-feat schedule, features, subclass options). Still incomplete: class FEATS are not catalogued at all, spell-slot COUNTS are not modelled, and the Magus/Summoner reduced-caster slot tables are deliberately absent. See PF2_CLASS_PROGRESSION_GAPS.`,
  },
  ancestries: {
    count: PF2_ANCESTRIES.length,
    complete: false,
    note: 'Ancestries exist; heritages are not catalogued separately yet.',
  },
  weapons: { count: PF2_WEAPONS_FULL.length, complete: false, note: 'Simple and martial weapons are covered; most advanced weapons are omitted (uncommon, and their stat lines were not confirmable).' },
  armors: { count: PF2_ARMORS_FULL.length + PF2_SHIELDS.length, complete: true, note: 'All armor categories and the four shields. Precious materials are a separate shape and are not modelled.' },
  items: { count: PF2_ITEMS.length + PF2_RUNES.length, complete: false, note: 'Fundamental runes complete; several property-rune prices omitted rather than guessed. Mutagens, poisons, talismans, oils and specific magic items are not catalogued.' },
  conditions: { count: PF2_CONDITIONS.length, complete: true, note: 'All 42 conditions, with the 11 valued ones flagged.' },
  actions: { count: PF2_ACTIONS.length, complete: false, note: 'Basic and skill actions are covered; some degree-of-success entries were left incomplete rather than guessed.' },
};

/** Known gaps, in one searchable place.
 *
 *  These come from the tranche authors' own reports. Recording them here rather than only in a
 *  planning doc means the next person to touch this data finds them next to the data. */
export const PF2_KNOWN_GAPS: string[] = [
  ...PF2_EQUIPMENT_GAPS,
  'Spells: partial at every rank — entries were omitted wherever the remaster rename or tradition list could not be confirmed, because a wrong tradition silently breaks the eligibility gate.',
  'Spells: Psychic, Summoner, Magus and Thaumaturge focus spells are absent; 46 focus spells carry source "Legacy" because their remastered form is unconfirmed. Wizard school focus spells are the LEGACY schools — the remaster reorganised them entirely.',
  'Spells: Monk qi spells and Witch hexes carry an empty `traditions` list ON PURPOSE — a hex follows its patron and qi spells have no tradition. The focus branch of the gate returns before reading traditions, so this is safe.',
  'Feats: ancestry and archetype feats are absent; nothing is tagged "Player Core 2" because Remaster book attribution could not be separated from legacy content reliably.',
  'Feats: disjunctive prerequisites ("trained in Arcana OR Nature OR …") are held as prose, because the gate ANDs structured prereqs and would otherwise refuse legal picks.',
  'Actions: Repair and Coerce are the least certain entries; several degree outcomes are qualitative.',
  ...PF2_CLASS_PROGRESSION_GAPS.map((g) => `Classes: ${g}`),
];

/** Is any kind of the catalog complete? Used by UI that wants to say "partial" honestly. */
export function pf2CatalogIsComplete(): boolean {
  return Object.values(PF2_CATALOG_STATUS).every((k) => k.complete);
}
