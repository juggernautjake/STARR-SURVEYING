// lib/dnd/library.ts — shapes a system's authoritative catalog into the sections the library
// pages render, and provides the cross-system keyword search that backs the search box.
//
// Source of truth is lib/dnd/system-rules.ts (+ system-rules-extra.ts): complete, deterministic
// and DB-free. The dnd_system_entries store is an optional projection used for semantic retrieval;
// the pages deliberately do NOT depend on it, so the library is fully readable with no embeddings
// key and no seeded rows.
import { GAME_SYSTEMS, systemLabel, type CharacterSystem } from './systems';
import { rulesForSystem, type SystemRules } from './system-rules';
import { glossaryFor, searchGlossary } from './glossary';
import { classesForSystem } from './classes/registry';
import { FEATS_2024, type Feat } from './feats/dnd5e-2024';
import { BACKGROUNDS_2024, type Background as Dnd2024Background } from './backgrounds/dnd5e-2024';
import { LANGUAGES_2024, TOOLS_2024, type Language as Dnd2024Language, type Tool as Dnd2024Tool } from './languages/dnd5e-2024';
import { SPECIES_2024 } from './species/dnd5e-2024';
import { PF2_BACKGROUNDS, PF2_ARMORS, PF2_WEAPONS, PF2_CLASSES, PF2_SPELLS, type PF2BackgroundDef, type PF2ArmorDef, type PF2WeaponDef, type PF2SpellDef } from './systems/pathfinder2e/content';
import { IG_CONDITIONS, IG_STANCE_DEFS, IG_STANCE_RULES, IG_ANCESTRIES, IG_ANCESTRY_TRAIT_RULES, IG_POWERS, IG_DEFENSIVE_POWERS, IG_ACTIONS, IG_COMPANION_TYPES, IG_COMPANION_RULES, IG_BACKGROUND_DEFS, IG_CLASS_GROUPS, IG_CLASS_RULES, IG_SUBCLASSES, IG_CLASS_DETAILS, IG_CLASS_TAXONOMY_FINDING, IG_REDISTRIBUTION_RULES, type NamedEntry, type IGStance, type IGAncestry, type IGCompanionType, type IGBackground } from './systems/intuitive-games/content';
import { igAllFeats, type IGFeat } from './systems/intuitive-games/feats';
import { igAncestryArt, IG_ART_CREDIT } from './systems/intuitive-games/art';
import { IG_WEAPON_RULES, IG_WEAPON_CLASS_DATA, IG_WEAPON_PROPERTIES, IG_ARMOR_RULES, IG_ARMORS, IG_SHIELD_RULES, IG_SHIELDS, IG_EQUIPMENT_PACKS, IG_EQUIPMENT_NOTE, IG_TOOL_RULES, IG_MAGIC_ITEM_RULES, IG_ENCHANTMENTS } from './systems/intuitive-games/items';
import { IG_SKILL_RULES, IG_COMBAT_SKILL_RULES, IG_COMBAT_SKILLS, IG_BUILD_STEPS, IG_PROGRESSION_NOTE, IG_DAMAGE_SAVE_RULES, IG_DAMAGE_TYPE_DATA, IG_COVER, IG_MOVEMENT_RULES, IG_SIZE_CATEGORIES, IG_SIZE_NOTE, IG_SPELL_ROSTER, igSpellsMissingEffects } from './systems/intuitive-games/content';

/** The full feat registry for a system, or [] when only a catalog sample exists. System-keyed
 *  dispatcher (the pattern `findFeat`'s comment calls for) so a feat never leaks across systems. */
function featsForSystem(system: string): Feat[] {
  return system === 'dnd5e-2024' ? FEATS_2024 : [];
}

/** Conditions a system exposes WITH full mechanical text (vs. the name-only chip list). System-keyed so
 *  Intuitive Games' condition rules never surface under another system. IG's are transcribed verbatim
 *  from intuitivegames.net; the rest still render as name chips until authored. */
function conditionsWithTextFor(system: string): NamedEntry[] {
  return system === 'intuitive-games' ? IG_CONDITIONS : [];
}

/** Stances a system exposes (a tactical posture, one active at a time). System-keyed — Intuitive Games
 *  is the only system with a stance mechanic today, so its stances never surface elsewhere. */
function stancesForSystem(system: string): IGStance[] {
  return system === 'intuitive-games' ? IG_STANCE_DEFS : [];
}

/** Ancestries a system exposes WITH full trait text (vs. name chips + prose notes). System-keyed so IG's
 *  ancestry traits never surface under another system. IG's are transcribed verbatim from the site. */
function ancestriesWithTraitsFor(system: string): IGAncestry[] {
  return system === 'intuitive-games' ? IG_ANCESTRIES : [];
}

/** Intuitive Games feats with full text (prerequisites + effect). System-keyed so IG feats never surface
 *  under another system. IG uses its own IGFeat shape (not the 5e Feat), so it has a dedicated dispatcher. */
function igFeatsFor(system: string): IGFeat[] {
  return system === 'intuitive-games' ? igAllFeats() : [];
}

/** IG powers/spells (by school), defensive powers, and the 3-action-economy action list — each carries
 *  effect text in the content library; System-keyed so none surface under another system. */
function igPowersFor(system: string): NamedEntry[] {
  return system === 'intuitive-games' ? IG_POWERS : [];
}
function igDefensivePowersFor(system: string): NamedEntry[] {
  return system === 'intuitive-games' ? IG_DEFENSIVE_POWERS : [];
}
function igCompanionsFor(system: string): IGCompanionType[] {
  return system === 'intuitive-games' ? IG_COMPANION_TYPES : [];
}
function igBackgroundsFor(system: string): IGBackground[] {
  return system === 'intuitive-games' ? IG_BACKGROUND_DEFS : [];
}
/** The 2024 5e backgrounds — first-class rules content (they grant the ability increases + an Origin
 *  feat in 2024), so they belong in the library search like PF2's and IG's do. */
function dnd2024BackgroundsFor(system: string): Dnd2024Background[] {
  return system === 'dnd5e-2024' ? BACKGROUNDS_2024 : [];
}
function dnd2024LanguagesFor(system: string): Dnd2024Language[] {
  return system === 'dnd5e-2024' ? LANGUAGES_2024 : [];
}
function dnd2024ToolsFor(system: string): Dnd2024Tool[] {
  return system === 'dnd5e-2024' ? TOOLS_2024 : [];
}
const IG_ECONOMY_COST: Record<string, string> = { Single: '1 action', Double: '2 actions', Triple: '3 actions', Reaction: 'Reaction', Other: 'Free / other' };

/** Backgrounds a system exposes as structured library data. System-keyed so PF2's backgrounds never
 *  surface under another system. Only Pathfinder 2e has these as first-class library entries today. */
function backgroundsForSystem(system: string): PF2BackgroundDef[] {
  return system === 'pathfinder2e' ? PF2_BACKGROUNDS : [];
}

/** Armor / weapons a system exposes as structured library data (PF2 only today). System-keyed so a
 *  PF2 breastplate or longsword never surfaces under a 5e system, whose gear lives elsewhere. */
function armorsForSystem(system: string): PF2ArmorDef[] {
  return system === 'pathfinder2e' ? PF2_ARMORS : [];
}
function weaponsForSystem(system: string): PF2WeaponDef[] {
  return system === 'pathfinder2e' ? PF2_WEAPONS : [];
}
function spellsForSystem(system: string): PF2SpellDef[] {
  return system === 'pathfinder2e' ? PF2_SPELLS : [];
}
const DMG_TYPE: Record<string, string> = { B: 'bludgeoning', P: 'piercing', S: 'slashing' };
const pf2RankLabel = (r: number) => (r === 0 ? 'cantrip' : `rank ${r}`);

/** The concrete subclass CHOICES per class (PF2 only): every Bloodline, Racket, Instinct, Doctrine, …
 *  as a searchable entry tied to its class + mechanism, so "draconic" or "thief racket" resolves. The
 *  glossary already explains the mechanism (Bloodline, Racket); this surfaces the individual options. */
function pf2SubclassOptions(system: string): { name: string; className: string; mechanism: string }[] {
  if (system !== 'pathfinder2e') return [];
  return PF2_CLASSES.flatMap((c) => c.subclassOptions.map((name) => ({ name, className: c.name, mechanism: c.subclassMechanism })));
}

export interface LibraryFact {
  label: string;
  value: string;
}

/** One named, individually-collapsible entry within a section (a condition, ancestry, feat…): the reader
 *  scans the names, and expands the one they want for its full detail. `brief` is an optional teaser shown
 *  on the (collapsed) summary line; `detail` is the full Rich-formatted text revealed on expand. */
export interface LibraryEntry {
  name: string;
  brief?: string;
  detail: string;
}

export interface LibrarySection {
  id: string;
  title: string;
  /** Short intro shown under the section heading. */
  lead?: string;
  /** Prose paragraphs. */
  body?: string[];
  /** Label/value rows (rendered as a definition table). */
  facts?: LibraryFact[];
  /** Simple chip lists (conditions, species…). */
  chips?: string[];
  /** Tabular data with headers. */
  table?: { headers: string[]; rows: string[][] };
  /** Individually-collapsible named entries — each expands from a name (+ optional brief) to its full
   *  detail. The per-entry disclosure the owner asked for (2026-07-17): a scannable list of names that
   *  expands on demand, much better than a wall-of-text table on mobile. */
  entries?: LibraryEntry[];
  /** An image gallery (e.g. ancestry portraits), with a shared credit line. */
  images?: { gallery: { src: string; caption: string }[]; credit?: string };
}

export interface LibrarySystemPage {
  key: string;
  name: string;
  publisher?: string;
  notes?: string;
  source: string;
  /** One-line characterisation, e.g. "d100 roll-under · no levels". */
  tagline: string;
  sections: LibrarySection[];
}

/** A short, honest characterisation of the system's core maths — the thing people scan for. */
export function taglineFor(r: SystemRules): string {
  const bits: string[] = [];
  const res = r.coreResolution.toLowerCase();
  if (res.includes('roll under')) bits.push('d100 roll-under');
  else if (res.includes('highest die')) bits.push('d6 pool · highest die');
  else if (res.includes('hits')) bits.push('d6 pool · count hits');
  else if (res.includes('1d10')) bits.push('1d10 + stat + skill');
  else if (res.includes('degrees of success')) bits.push('d20 · degrees of success');
  else bits.push('d20 + modifiers');

  bits.push(r.levelMin === r.levelMax ? 'no levels' : `levels ${r.levelMin}–${r.levelMax}`);
  const dice = r.content.classes.some((c) => c.hitDie != null);
  if (dice) bits.push('hit dice');
  else if (r.content.classes.some((c) => c.hpPerLevel != null)) bits.push('flat HP/level');
  return bits.join(' · ');
}

/** The system's noun for a "class" — used as a section heading so we don't call a playbook a class. */
function classNoun(key: string): string {
  if (key === 'blades') return 'Playbooks';
  if (key === 'cyberpunk-red') return 'Roles';
  if (key === 'shadowrun6e') return 'Archetypes';
  if (key === 'coc7e') return 'Occupations';
  return 'Classes';
}

/** The system's noun for a "species". */
function speciesNoun(key: string): string {
  if (key === 'blades') return 'Heritages';
  if (key === 'pathfinder2e' || key === 'pathfinder1e') return 'Ancestries';
  if (key === 'shadowrun6e') return 'Metatypes';
  return 'Species';
}

function featNoun(key: string): string {
  if (key === 'blades') return 'Special Abilities';
  if (key === 'cyberpunk-red') return 'Role Abilities';
  if (key === 'shadowrun6e') return 'Qualities';
  if (key === 'coc7e') return 'Signature Moves';
  return 'Feats';
}

/** Build the full, renderable page for one system. */
export function libraryPageFor(key: CharacterSystem): LibrarySystemPage | null {
  const r = rulesForSystem(key);
  if (!r) return null;
  const meta = GAME_SYSTEMS.find((s) => s.key === key);
  const sections: LibrarySection[] = [];

  sections.push({
    id: 'core',
    title: 'How the game resolves',
    lead: 'The core maths — everything else hangs off this.',
    facts: [
      { label: 'Core resolution', value: r.coreResolution },
      { label: 'Action economy', value: r.actionEconomy },
      { label: 'Saving throws', value: r.saves },
      { label: 'Rest & recovery', value: r.rest },
    ],
  });

  sections.push({
    id: 'abilities',
    title: 'Abilities & attributes',
    lead: `${r.ability.abilities.length} attributes: ${r.ability.abilities.join(' · ')}`,
    facts: [
      { label: 'How they are generated', value: r.ability.generation },
      { label: 'Range & cap', value: r.ability.range },
      { label: 'Modifier', value: r.ability.modifier },
    ],
  });

  sections.push({
    id: 'advancement',
    title: 'Advancement & competence',
    facts: [
      { label: 'Levels', value: r.levelMin === r.levelMax ? 'This system has NO character levels.' : `Levels ${r.levelMin}–${r.levelMax}.` },
      { label: 'Advancement', value: r.advancement },
      { label: 'Proficiency / competence', value: r.proficiency },
      { label: 'When stats change', value: r.progressionCadence },
    ],
  });

  // Character building (IG) — the level-1 creation order + the L2–10 progression, from the site.
  if (key === 'intuitive-games') {
    sections.push({
      id: 'character-building',
      title: 'Building a character',
      lead: 'The order of choices at level 1 (each step lists what it grants):',
      body: [...IG_BUILD_STEPS, IG_PROGRESSION_NOTE],
    });
    // Combat & damage mechanics (from /core-rules): the damage Fortitude save, damage types, cover, movement.
    sections.push({
      id: 'damage',
      title: 'Damage, cover & movement',
      lead: IG_DAMAGE_SAVE_RULES,
      table: { headers: ['Damage type', 'Notes'], rows: IG_DAMAGE_TYPE_DATA.map((d) => [d.name, d.note]) },
      body: [
        `Cover: ${IG_COVER.map((c) => `${c.name} — ${c.effect}`).join(' ')}`,
        IG_MOVEMENT_RULES,
        `${IG_SIZE_NOTE} Sizes: ${IG_SIZE_CATEGORIES.join(', ')}.`,
      ],
    });
  }

  if (r.keyFacts.length) {
    sections.push({
      id: 'gotchas',
      title: 'Must-know facts',
      lead: 'The things most often got wrong — usually by importing another system’s assumptions.',
      body: r.keyFacts,
    });
  }

  if (key === 'intuitive-games') {
    // IG: the full 13-class roster grouped into its four groups (the generic table only carries a 3-class
    // sample). Per-class feature ladders are a follow-up; this gives the complete roster + how classes work.
    const total = IG_CLASS_GROUPS.reduce((n, g) => n + g.classes.length, 0);
    // Per-class detail captured so far (from /classes). More classes are a follow-up; the site's class↔
    // subclass split (Fighter as a parent of Freebooter/Marksman/Sohei/Champion) differs from the flat
    // roster above — surfaced honestly as a note, not silently reconciled.
    const detailLines = IG_CLASS_DETAILS.map((c) => {
      const head = [c.classification, c.primaryAbility, c.hp, c.grantedStance && `${c.grantedStance} stance`, c.defensivePower && `${c.defensivePower} defensive power`].filter(Boolean).join('; ');
      const start = c.startingPower ? ` Starting power: ${c.startingPower}.` : '';
      const powers = c.powers?.length ? ` Powers: ${c.powers.join(', ')}.` : '';
      const spec = c.specializations?.length ? ` Specializations: ${c.specializations.join('; ')}.` : '';
      return `${c.name} — ${head}.${start}${powers}${spec}${c.note ? ` ${c.note}` : ''}`;
    });
    sections.push({
      id: 'classes',
      title: 'Classes',
      lead: `${total} classes in ${IG_CLASS_GROUPS.length} groups. ${IG_CLASS_RULES} Subclasses (chosen within a class): ${IG_SUBCLASSES.join(', ')}.`,
      table: {
        headers: ['Group', 'Classes'],
        rows: IG_CLASS_GROUPS.map((g) => [g.group, g.classes.join(', ')]),
      },
      body: [
        `Per-class detail (${IG_CLASS_DETAILS.length} entries). NOTE: ${IG_CLASS_TAXONOMY_FINDING}`,
        ...detailLines,
      ],
    });
  } else if (r.content.classes.length) {
    const hpHeader = r.content.classes.some((c) => c.hitDie != null) ? 'Hit die' : 'HP / level';
    sections.push({
      id: 'classes',
      title: classNoun(r.key),
      lead: `${r.content.classes.length} in the core line-up.`,
      table: {
        headers: ['Name', 'Key ability', hpHeader, 'Saves', 'Casting'],
        rows: r.content.classes.map((c) => [
          c.name,
          c.keyAbility,
          c.hitDie != null ? `d${c.hitDie}` : c.hpPerLevel != null ? String(c.hpPerLevel) : '—',
          c.saves.length ? c.saves.join(', ') : '—',
          c.caster === 'none' ? '—' : c.caster,
        ]),
      },
    });
  }

  if (r.content.skills.length) {
    const igSkills = key === 'intuitive-games';
    sections.push({
      id: 'skills',
      title: 'Skills',
      lead: igSkills ? IG_SKILL_RULES : `${r.content.skills.length} skills and the attribute each is governed by.`,
      table: {
        headers: ['Skill', 'Governed by'],
        rows: r.content.skills.map((s) => [s.name, s.ability]),
      },
    });
    // Combat skills (IG) — a distinct subsystem with its own resolution (opposed vs Reflex).
    if (igSkills) {
      sections.push({
        id: 'combat-skills',
        title: 'Combat Skills',
        lead: IG_COMBAT_SKILL_RULES,
        chips: [...IG_COMBAT_SKILLS],
      });
    }
  }

  if (r.content.species.length) {
    const ancestries = ancestriesWithTraitsFor(key);
    if (ancestries.length) {
      // Full trait text (IG today): each ancestry with its two traits spelled out — "fully fleshed out",
      // per the owner. One row per ancestry; the traits column lists "TraitName: text" for each.
      // Brendan's per-ancestry portraits (those the site publishes) as a gallery beneath the trait table.
      const gallery = ancestries
        .map((a) => ({ src: igAncestryArt(a.name), caption: a.name }))
        .filter((g): g is { src: string; caption: string } => !!g.src);
      sections.push({
        id: 'species',
        title: speciesNoun(r.key),
        lead: IG_ANCESTRY_TRAIT_RULES,
        // Per-entry collapsibles (MOB2c/d): each ancestry shows its trait NAMES as a brief teaser and expands
        // to the full trait text — the owner's exact example ("a race name, a brief description… click to
        // expand every detail"). Portraits stay as the gallery beneath.
        entries: ancestries.map((a) => ({
          name: a.name,
          brief: a.traits.map((t) => t.name).join(' · '),
          detail: a.traits.map((t) => `**${t.name}** — ${t.text}`).join('\n\n'),
        })),
        images: gallery.length ? { gallery, credit: IG_ART_CREDIT } : undefined,
      });
    } else {
      sections.push({
        id: 'species',
        title: speciesNoun(r.key),
        chips: r.content.species,
        body: r.content.ancestryNotes?.length ? r.content.ancestryNotes : undefined,
      });
    }
  }

  // Backgrounds (PF2 only today) — a real table of what each grants, since backgrounds are a level-1
  // choice as consequential as ancestry/class in Pathfinder 2e.
  const backgrounds = backgroundsForSystem(key);
  if (backgrounds.length) {
    sections.push({
      id: 'backgrounds',
      title: 'Backgrounds',
      lead: `${backgrounds.length} backgrounds — each grants attribute boosts, a trained skill, a Lore, and a skill feat.`,
      table: {
        headers: ['Background', 'Boosts', 'Trained skill', 'Skill feat'],
        rows: backgrounds.map((b) => [b.name, b.boosts.join(', '), `${b.skill} · ${b.lore}`, b.feat]),
      },
    });
  }

  // Backgrounds (5e 2024) — the 2024 rule moved the ability increases onto the background (never the
  // species), and each grants an Origin feat + skills + a tool. As consequential as the PF2 ones above.
  const dnd2024Backgrounds = dnd2024BackgroundsFor(key);
  if (dnd2024Backgrounds.length) {
    sections.push({
      id: 'backgrounds',
      title: 'Backgrounds',
      lead: `${dnd2024Backgrounds.length} backgrounds — in 2024 the background grants your ability increases (choose from three), an Origin feat, two skills, and a tool.`,
      table: {
        headers: ['Background', 'Ability options', 'Origin feat', 'Skills', 'Tool'],
        rows: dnd2024Backgrounds.map((b) => [
          b.name,
          b.abilityScores.map((a) => a.toUpperCase()).join(' / '),
          b.originFeat.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '),
          b.skillProficiencies.join(', '),
          b.toolProficiency,
        ]),
      },
    });
  }

  // Backgrounds (IG) — each grants starting HP, ability boosts, proficiencies, and a base Stance.
  const igBackgrounds = igBackgroundsFor(key);
  if (igBackgrounds.length) {
    sections.push({
      id: 'backgrounds',
      title: 'Backgrounds',
      lead: `${igBackgrounds.length} backgrounds — each grants starting HP, two ability boosts, skill proficiencies, and a Stance (Advanced at Lv 5).`,
      table: {
        headers: ['Background', 'HP', 'Ability boosts', 'Proficiencies', 'Stance'],
        rows: igBackgrounds.map((b) => [b.name, String(b.hp), b.boosts, b.proficiencies.join(', '), b.stance]),
      },
    });
  }

  // Languages (5e 2024) — the standard + rare list players pick from, with who speaks each. Shipped as
  // data but previously surfaced nowhere in the library.
  const languages = dnd2024LanguagesFor(key);
  if (languages.length) {
    const rare = languages.filter((l) => l.rarity === 'rare').length;
    sections.push({
      id: 'languages',
      title: 'Languages',
      lead: `${languages.length} languages (${languages.length - rare} standard, ${rare} rare) — you learn Common plus more from your species and background.`,
      table: {
        headers: ['Language', 'Rarity', 'Typical speakers'],
        rows: languages.map((l) => [l.name, l.rarity, l.origin]),
      },
    });
  }

  // Tools (5e 2024) — the tool proficiencies backgrounds/classes grant, grouped by family.
  const tools = dnd2024ToolsFor(key);
  if (tools.length) {
    const families = Array.from(new Set(tools.map((t) => t.family)));
    sections.push({
      id: 'tools',
      title: 'Tools',
      lead: `${tools.length} tools across ${families.length} families — a background or class grants proficiency with specific ones.`,
      table: {
        headers: ['Family', 'Tools'],
        rows: families.map((f) => [f, tools.filter((t) => t.family === f).map((t) => t.name).join(', ')]),
      },
    });
  }

  // Armor + weapons (PF2 only today) — the gear tables players scan for.
  const armors = armorsForSystem(key).filter((a) => a.category !== 'unarmored');
  if (armors.length) {
    sections.push({
      id: 'armor',
      title: 'Armor',
      lead: `${armors.length} armors — AC bonus, Dex cap, and the Strength that waives their penalties.`,
      table: {
        headers: ['Armor', 'Category', 'AC', 'Dex cap', 'Str', 'Check', 'Speed'],
        rows: armors.map((a) => [a.name, a.category, `+${a.acBonus}`, `+${a.dexCap ?? '∞'}`, `+${a.strength}`, `${a.checkPenalty}`, `${a.speedPenalty} ft`]),
      },
    });
  }
  const weapons = weaponsForSystem(key);
  if (weapons.length) {
    sections.push({
      id: 'weapons',
      title: 'Weapons',
      lead: `${weapons.length} weapons — damage, type, and traits.`,
      table: {
        headers: ['Weapon', 'Category', 'Damage', 'Group', 'Traits'],
        rows: weapons.map((w) => [w.name, w.category, `${w.damageDie} ${w.damageType}${w.range ? ` (${w.range} ft)` : ''}`, w.group, w.traits.join(', ') || '—']),
      },
    });
  }

  const spells = spellsForSystem(key);
  if (spells.length) {
    sections.push({
      id: 'spells',
      title: 'Spells',
      lead: `${spells.length} spells — a representative sample (rank, traditions, effect), not the full list.`,
      table: {
        headers: ['Spell', 'Rank', 'Traditions', 'Cast', 'Effect'],
        rows: spells.map((s) => [s.name, pf2RankLabel(s.rank), s.traditions.join(', '), s.cast, s.effect]),
      },
    });
  }

  // Stances (IG only today) — a tactical posture, one active at a time, with a Basic (below Lv 5) and an
  // Advanced (Lv 5+) benefit. System-scoped so they never leak to a system without the mechanic.
  const stances = stancesForSystem(key);
  if (stances.length) {
    sections.push({
      id: 'stances',
      title: 'Stances',
      lead: IG_STANCE_RULES,
      entries: stances.map((s) => ({
        name: s.name,
        detail: `**Basic (below Lv 5):** ${s.basic}\n\n**Advanced (Lv 5+):** ${s.advanced}`,
      })),
    });
  }

  if (r.content.conditions.length) {
    const condText = conditionsWithTextFor(key).filter((c) => c.effect);
    if (condText.length) {
      // Full rules text (IG today): each condition is its own collapsible entry (MOB2c) — the reader scans
      // the 18 names and expands the one they need for its full mechanical effect, instead of a wall-of-text
      // two-column table. Far more usable on mobile; the full effect still reaches the AI via the digest.
      sections.push({
        id: 'conditions',
        title: 'Conditions',
        lead: `${condText.length} standardized states — tap a condition for its full rules text.`,
        entries: condText.map((c) => ({ name: c.name, detail: c.effect as string })),
      });
    } else {
      sections.push({ id: 'conditions', title: 'Conditions', lead: `${r.content.conditions.length} standardized states.`, chips: r.content.conditions });
    }
  }

  const igFeats = igFeatsFor(key);
  if (igFeats.length) {
    // Full feat text (IG): a table of Feat / Prerequisites / Effect — the complete list from the site,
    // not a sample. Grouped label in the lead so a reader knows General vs Combat coverage.
    const gen = igFeats.filter((f) => f.category === 'General').length;
    const com = igFeats.length - gen;
    sections.push({
      id: 'feats',
      title: featNoun(r.key),
      lead: `${igFeats.length} feats from intuitivegames.net (${gen} General${com ? ` · ${com} Combat` : ''}) — tap a feat for its full effect.`,
      // 151 feats: a scannable name list beats a 151-row table. The prerequisite (if any) is the brief teaser
      // on the summary; the full effect + category are revealed on expand.
      entries: igFeats.map((f) => ({
        name: f.name,
        brief: f.prerequisites ? `Requires ${f.prerequisites}` : undefined,
        detail: `**${f.category} feat${f.prerequisites ? ` · Prerequisites: ${f.prerequisites}` : ''}**\n\n${f.effect}`,
      })),
    });
  } else if (r.content.sampleFeats.length) {
    sections.push({ id: 'feats', title: featNoun(r.key), lead: 'A representative sample — not the complete list.', chips: r.content.sampleFeats });
  }

  // Powers / spells (IG): grouped by school, each with its effect. Defensive powers + the action economy
  // follow — all system-scoped so they never surface under a system without the mechanic.
  const igPowers = igPowersFor(key);
  if (igPowers.length) {
    // The complete site spell roster (names by school) so the library lists EVERY spell, plus the effect
    // table for the ones we have text for; spells still awaiting Brendan's verbatim effect text are flagged.
    const rosterLines = Object.entries(IG_SPELL_ROSTER).map(([school, names]) => `${school}: ${names.join(', ')}.`);
    const missing = igSpellsMissingEffects();
    sections.push({
      id: 'powers',
      title: 'Powers & Spells',
      lead: `${igPowers.length} powers with full effect text across ${new Set(igPowers.map((p) => p.category)).size} schools — tap a power for its effect. The complete site roster (all schools) is listed below; each site spell has Description/Advanced/Expert tiers.`,
      entries: igPowers.map((p) => ({
        name: p.name,
        brief: p.category ?? undefined,
        detail: p.effect ?? '—',
      })),
      body: [
        'Complete spell roster from intuitivegames.net/spell-list:',
        ...rosterLines,
        missing.length ? `Awaiting verbatim effect text from the site/Brendan (${missing.length}): ${missing.join(', ')}.` : 'All roster spells have effect text.',
      ],
    });
  }
  const igDef = igDefensivePowersFor(key);
  if (igDef.length) {
    sections.push({
      id: 'defensive-powers',
      title: 'Defensive Powers',
      lead: `${igDef.length} reactions spent to blunt or avoid an attack — tap for the effect.`,
      entries: igDef.map((d) => ({ name: d.name, detail: d.effect ?? '—' })),
    });
  }
  if (key === 'intuitive-games' && IG_ACTIONS.length) {
    sections.push({
      id: 'actions',
      title: 'Actions (3-action economy)',
      lead: 'Each turn you have three actions plus one reaction. What the common actions cost:',
      table: {
        headers: ['Action', 'Cost'],
        rows: IG_ACTIONS.map((a) => [a.note ? `${a.name} (${a.note})` : a.name, IG_ECONOMY_COST[a.economy] ?? a.economy]),
      },
    });
  }
  if (key === 'intuitive-games') {
    // Redistribution — the Conduit's signature ability (its own /redistribution page on the site).
    sections.push({ id: 'redistribution', title: 'Redistribution', lead: 'The Conduit’s signature material-shaping ability.', body: [IG_REDISTRIBUTION_RULES] });
  }

  const igCompanions = igCompanionsFor(key);
  if (igCompanions.length) {
    sections.push({
      id: 'companions',
      title: 'Companion Creatures',
      lead: IG_COMPANION_RULES,
      table: {
        headers: ['Companion type', 'Class', 'Details'],
        rows: igCompanions.map((c) => [c.name, c.subclass, c.text]),
      },
    });
  }

  // Gear (IG) — weapons (a WIP framework: classes + properties, no named roster yet), armor (the DR
  // mechanic + full roster), and shields. System-scoped.
  if (key === 'intuitive-games') {
    sections.push({
      id: 'weapons',
      title: 'Weapons',
      lead: IG_WEAPON_RULES,
      table: {
        headers: ['Class', 'Kind', 'Cost', 'Notes'],
        rows: IG_WEAPON_CLASS_DATA.map((w) => [w.name, w.kind, w.cost, w.notes]),
      },
    });
    sections.push({
      id: 'weapon-properties',
      title: 'Weapon Properties',
      lead: 'A weapon has one base property; extra properties cost more and cost damage dice.',
      table: {
        headers: ['Property', 'Applies to', 'Effect'],
        rows: IG_WEAPON_PROPERTIES.map((p) => [p.name, p.appliesTo, p.text]),
      },
    });
    sections.push({
      id: 'armor',
      title: 'Armor',
      lead: IG_ARMOR_RULES,
      table: {
        headers: ['Armor', 'Group', 'DR', 'Strength', 'Cost', 'Notes'],
        rows: IG_ARMORS.map((a) => [a.name, a.group, a.dr, a.strength, a.cost, a.notes || '—']),
      },
    });
    sections.push({
      id: 'shields',
      title: 'Shields',
      lead: IG_SHIELD_RULES,
      table: {
        headers: ['Shield', 'Group', 'Cost', 'Notes'],
        rows: IG_SHIELDS.map((s) => [s.name, s.group, s.cost, s.notes || '—']),
      },
    });
    sections.push({
      id: 'equipment',
      title: 'Equipment',
      lead: IG_EQUIPMENT_NOTE,
      table: {
        headers: ['Pack', 'Cost', 'Contents'],
        rows: IG_EQUIPMENT_PACKS.map((p) => [p.name, p.cost, p.contents]),
      },
    });
    sections.push({ id: 'tools', title: 'Tools', body: [IG_TOOL_RULES] });
    sections.push({
      id: 'magical-items',
      title: 'Magical Items (Eldritch Jewels)',
      lead: IG_MAGIC_ITEM_RULES,
      table: {
        headers: ['Enchantment', 'Effect'],
        rows: IG_ENCHANTMENTS.map((e) => [e.name, e.effect]),
      },
    });
  }

  return {
    key: r.key,
    name: r.label,
    publisher: meta?.publisher,
    notes: meta?.notes,
    source: r.source,
    tagline: taglineFor(r),
    sections,
  };
}

/** Every system's page, in the GAME_SYSTEMS order. */
export function allLibraryPages(): LibrarySystemPage[] {
  return GAME_SYSTEMS.map((s) => libraryPageFor(s.key)).filter((p): p is LibrarySystemPage => !!p);
}

export interface LibraryHit {
  system: string;
  systemName: string;
  kind: string;
  name: string;
  body: string;
  /** Higher is better. */
  score: number;
}

/**
 * Search the catalog — across ONE system, or across all of them when `system` is omitted.
 * Pure and DB-free, so the library's search box works with no embeddings key and no seeded rows.
 */
export function searchLibrary(query: string, system?: CharacterSystem | null, limit = 40): LibraryHit[] {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/).filter((w) => w.length > 1).slice(0, 6);
  if (!words.length) return [];

  const keys = system ? [system] : GAME_SYSTEMS.map((s) => s.key);
  const hits: LibraryHit[] = [];

  for (const key of keys) {
    const r = rulesForSystem(key);
    if (!r) continue;
    const name = systemLabel(key);

    // The GLOSSARY first: these are the fully-written articles, so a lookup returns a real
    // explanation rather than a one-line stub. Scored high so they outrank the generated
    // catalog lines for the same word (e.g. the "Blinded" article beats the conditions list).
    for (const g of searchGlossary(key, q, 30)) {
      hits.push({ system: key, systemName: name, kind: g.kind, name: g.term, body: g.body, score: g.score + 6 });
    }
    // Terms already covered by the glossary shouldn't also appear as thin catalog entries.
    const explained = new Set(glossaryFor(key).map((e) => e.term.toLowerCase()));
    const push = (kind: string, n: string, b: string) => {
      // Skip anything the glossary already explains properly — its article is strictly better
      // than the one-line summary generated here.
      if (explained.has(n.toLowerCase())) return;
      const hay = `${n}\n${b}`.toLowerCase();
      let score = 0;
      for (const w of words) {
        if (n.toLowerCase().includes(w)) score += 3;
        else if (hay.includes(w)) score += 1;
      }
      // Every word must appear somewhere, so "warlock slots" doesn't match everything with "slots".
      if (!words.every((w) => hay.includes(w))) return;
      if (n.toLowerCase() === q) score += 10;
      if (score > 0) hits.push({ system: key, systemName: name, kind, name: n, body: b, score });
    };

    push('rule', 'Core resolution', r.coreResolution);
    push('rule', 'Action economy', r.actionEconomy);
    push('rule', 'Saving throws', r.saves);
    push('rule', 'Rest & recovery', r.rest);
    push('rule', 'Proficiency', r.proficiency);
    push('rule', 'Advancement', r.advancement);
    push('rule', 'Progression cadence', r.progressionCadence);
    push('rule', 'Ability generation', r.ability.generation);
    push('rule', 'Ability range & cap', r.ability.range);
    push('rule', 'Ability modifier', r.ability.modifier);
    r.keyFacts.forEach((f, i) => push('rule', `Key fact ${i + 1}`, f));
    for (const c of r.content.classes) {
      const hp = c.hitDie != null ? `Hit die d${c.hitDie}` : c.hpPerLevel != null ? `${c.hpPerLevel} HP/level` : 'no hit die';
      push('class', c.name, `${c.name} — key ability ${c.keyAbility}; ${hp}; saves ${c.saves.join(' & ') || '—'}; ${c.caster === 'none' ? 'non-caster' : `${c.caster} caster`}.`);
    }
    for (const n of r.content.classNames ?? []) if (!r.content.classes.some((c) => c.name === n)) push('class', n, `${n} — a ${r.label} class.`);
    // Systems with FULL class data (dnd5e-2024 AND now dnd5e-2014) also expose every class feature by
    // name, so "action surge", "sneak attack", or "brutal critical" finds the actual rules text and
    // its level — the whole 2014 roster projects into library search automatically once registered.
    for (const c of classesForSystem(key)) {
      for (const f of c.features) {
        if (f.choice && !f.body) continue;
        push('feature', f.name, `${c.name} · level ${f.level} — ${f.body}`);
      }
    }
    for (const s of r.content.skills) push('skill', s.name, `${s.name} — governed by ${s.ability} in ${r.label}.`);
    if (key === 'intuitive-games') {
      for (const cs of IG_COMBAT_SKILLS) push('combat-skill', cs, `${cs} — an Intuitive Games combat skill (opposed vs the target's Reflex save). ${IG_COMBAT_SKILL_RULES}`);
      for (const d of IG_DAMAGE_TYPE_DATA) push('damage-type', d.name, `${d.name} — a damage type in ${r.label}: ${d.note}`);
      for (const c of IG_COVER) push('cover', c.name, `${c.name} cover in ${r.label}: ${c.effect}`);
      // The IG-specific core mechanics as searchable rules (so "redistribution" / "fortitude save on damage"
      // / "take 10" resolve to the real text, not just live inside a section body).
      push('rule', 'Taking damage (Fortitude save)', IG_DAMAGE_SAVE_RULES);
      push('rule', 'Skill checks', IG_SKILL_RULES);
      push('rule', 'Redistribution', IG_REDISTRIBUTION_RULES);
      push('rule', 'Movement', IG_MOVEMENT_RULES);
    }
    // Systems with full ancestry data (IG) expose each ancestry with its trait text, and each trait by
    // name ("barkskin", "cave vision"); the rest fall back to the name stub + prose notes.
    const igAncestries = ancestriesWithTraitsFor(key);
    if (igAncestries.length) {
      const noun = speciesNoun(r.key).toLowerCase().replace(/s$/, '');
      for (const a of igAncestries) {
        push('species', a.name, `${a.name} — a playable ${noun} in ${r.label}. ${a.blurb} Ancestry traits: ${a.traits.map((t) => `${t.name} (${t.text})`).join('; ')}`);
        for (const t of a.traits) push('trait', t.name, `${t.name} — a ${a.name} ancestry trait in ${r.label}: ${t.text}`);
      }
    } else {
      const noun = speciesNoun(r.key).toLowerCase().replace(/s$/, '');
      // 2024 5e species carry full trait text (SPECIES_2024) — surface it like IG does, so "what does a
      // Tiefling get" / "which species have Darkvision" resolve. Other systems fall back to the name blurb.
      const dnd2024Species = key === 'dnd5e-2024' ? new Map(SPECIES_2024.map((sp) => [sp.name.toLowerCase(), sp])) : null;
      for (const s of r.content.species) {
        const sp = dnd2024Species?.get(s.toLowerCase());
        if (sp) {
          push('species', s, `${s} — a playable ${noun} in ${r.label}: size ${sp.size}, speed ${sp.speed} ft${sp.darkvision ? `, darkvision ${sp.darkvision} ft` : ''}. Traits: ${sp.traits.map((t) => `${t.name} (${t.text})`).join('; ')}`);
          for (const t of sp.traits) push('trait', t.name, `${t.name} — a ${s} trait in ${r.label}: ${t.text}`);
        } else {
          push('species', s, `${s} — a playable ${noun} in ${r.label}.`);
        }
      }
      for (const n of r.content.ancestryNotes ?? []) push('species', n.split(/[—-]/)[0].trim() || 'Ancestry', n);
    }
    // Systems with full condition text (IG) expose each condition's real mechanical effect, so
    // "grappled" or "flat-footed" returns the actual rules; the rest fall back to a one-line stub.
    const condText = conditionsWithTextFor(key);
    if (condText.length) {
      for (const c of condText) push('condition', c.name, `${c.name} — ${c.effect ?? `a condition in ${r.label}.`}`);
    } else {
      for (const c of r.content.conditions) push('condition', c, `${c} — a condition in ${r.label}.`);
    }
    // Systems with a full FEATS registry (dnd5e-2024) expose EVERY feat with its real benefit text and
    // category, so "great weapon master" or "alert" returns the actual rules, not a one-line stub.
    const fullFeats = featsForSystem(key);
    const igFeatList = igFeatsFor(key);
    if (igFeatList.length) {
      // IG feats: each with its real prerequisites + effect, so "toughness" or "quick caster" resolves the
      // actual rules text (IG's own IGFeat shape).
      for (const f of igFeatList) push('feat', f.name, `${f.name} — ${f.category} feat${f.prerequisites ? ` (prereq: ${f.prerequisites})` : ''}: ${f.effect}`);
    } else if (fullFeats.length) {
      for (const f of fullFeats) push('feat', f.name, `${f.name} (${f.category} feat) — ${f.benefit}`);
    } else {
      for (const f of r.content.sampleFeats) push('feat', f, `${f} — ${featNoun(r.key).toLowerCase()} in ${r.label}.`);
    }
    // Backgrounds (PF2 only today): each grants attribute boosts, a trained skill, a Lore, and a skill
    // feat — real structured data from the PF2 content library, searchable by name or "background".
    for (const b of backgroundsForSystem(key)) {
      push('background', b.name, `${b.name} background — trains ${b.skill} + ${b.lore}; grants the ${b.feat} skill feat; boosts ${b.boosts.join(', ')}. ${b.summary}`);
    }
    // 2024 5e backgrounds — the ability increases + Origin feat live here in 2024, so they're first-class
    // rules content; surface them by name (they were shipped but nothing in the library referenced them).
    for (const b of dnd2024BackgroundsFor(key)) {
      push('background', b.name, `${b.name} background — ability options ${b.abilityScores.map((a) => a.toUpperCase()).join('/')}; Origin feat ${b.originFeat}; skills ${b.skillProficiencies.join(', ')}; tool ${b.toolProficiency}.`);
    }
    // 2024 languages + tools — findable by name ("is Draconic a standard language?", "what family is
    // Thieves' Tools?"). Shipped data that previously answered nothing in search.
    for (const l of dnd2024LanguagesFor(key)) push('rule', `${l.name} (language)`, `${l.name} — a ${l.rarity} language, spoken by ${l.origin}.`);
    for (const t of dnd2024ToolsFor(key)) push('rule', `${t.name} (tool)`, `${t.name} — a ${t.family} tool proficiency.`);
    // Armor + weapons (PF2 only today): the stats a player scans for — AC bonus / Dex cap / Strength for
    // armor; damage die + type + traits for weapons. System-scoped so 5e gear never surfaces here.
    for (const a of armorsForSystem(key)) {
      if (a.category === 'unarmored') continue;
      push('armor', a.name, `${a.name} — ${a.category} armor; +${a.acBonus} AC, Dex cap +${a.dexCap ?? '∞'}, Str ${a.strength}, check ${a.checkPenalty}, speed ${a.speedPenalty} ft.`);
    }
    for (const w of weaponsForSystem(key)) {
      push('weapon', w.name, `${w.name} — ${w.category} ${w.group.toLowerCase()}; ${w.damageDie} ${DMG_TYPE[w.damageType] ?? w.damageType}${w.range ? `, ranged ${w.range} ft` : ''}${w.traits.length ? `; ${w.traits.join(', ')}` : ''}.`);
    }
    for (const s of pf2SubclassOptions(key)) {
      push('subclass', s.name, `${s.name} — a ${s.className} ${s.mechanism} option in ${r.label}.`);
    }
    // Stances (IG): each searchable by name ("defensive stance") with its Basic + Advanced benefits.
    for (const st of stancesForSystem(key)) {
      push('stance', `${st.name} Stance`, `${st.name} Stance — Basic (below Lv 5): ${st.basic} Advanced (Lv 5+): ${st.advanced}`);
    }
    // Powers/spells + defensive powers (IG): searchable by name with full effect text.
    for (const p of igPowersFor(key)) push('power', p.name, `${p.name} — ${p.category ?? ''} power in ${r.label}: ${p.effect ?? ''}`);
    for (const d of igDefensivePowersFor(key)) push('defensive-power', d.name, `${d.name} — a defensive power (reaction) in ${r.label}: ${d.effect ?? ''}`);
    for (const c of igCompanionsFor(key)) push('companion', c.name, `${c.name} — a ${c.subclass} companion in ${r.label}: ${c.text}`);
    for (const b of igBackgroundsFor(key)) push('background', b.name, `${b.name} background — ${b.hp} HP; boosts ${b.boosts}; trains ${b.proficiencies.join(', ')}; grants the ${b.stance} Stance.`);
    // IG gear: weapon classes + properties, armor (with DR), and shields — searchable by name.
    if (key === 'intuitive-games') {
      for (const w of IG_WEAPON_CLASS_DATA) push('weapon', w.name, `${w.name} — a ${w.kind.toLowerCase()} weapon class in ${r.label}: ${w.cost}. ${w.notes}`);
      for (const p of IG_WEAPON_PROPERTIES) push('weapon-property', p.name, `${p.name} — a weapon property (${p.appliesTo}): ${p.text}`);
      for (const a of IG_ARMORS) push('armor', a.name, `${a.name} — ${a.group} armor, DR ${a.dr}, ${a.strength}, ${a.cost}${a.notes ? `; ${a.notes}` : ''}.`);
      for (const s of IG_SHIELDS) push('shield', s.name, `${s.name} — a ${s.group} shield in ${r.label}, ${s.cost}${s.notes ? `; ${s.notes}` : ''}.`);
      for (const p of IG_EQUIPMENT_PACKS) push('equipment', p.name, `${p.name} — ${p.cost}: ${p.contents}`);
      for (const e of IG_ENCHANTMENTS) push('magic-item', e.name, `${e.name} — an Eldritch Jewel enchantment in ${r.label}: ${e.effect}`);
    }
    for (const sp of spellsForSystem(key)) {
      push('spell', sp.name, `${sp.name} — ${pf2RankLabel(sp.rank)}, ${sp.traditions.join('/')}; ${sp.cast}. ${sp.effect}`);
    }
  }

  return hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}
