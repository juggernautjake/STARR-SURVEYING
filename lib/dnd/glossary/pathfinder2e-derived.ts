// lib/dnd/glossary/pathfinder2e-derived.ts — the PF2 glossary articles that are DERIVED from the
// PF2 catalog rather than hand-written, so a tooltip has something to show for every condition,
// skill and damage type the sheet can name (CX-12).
//
// WHY DERIVED AND NOT HAND-AUTHORED. `data/conditions.ts` already holds a paraphrased mechanical
// summary for all 42 conditions, written under the same ORC/never-invent ground rules as this file.
// Re-typing those 42 summaries into a second file would create two copies of the same rule that drift
// apart the moment one is corrected — and a rules reference that contradicts itself is worse than one
// with a gap. So the catalog stays the single source of truth and this module PROJECTS it into
// GlossaryEntry shape. Same rule term-index.ts states for its abbreviations: if it cannot be derived,
// it does not belong here.
//
// The hand-written articles in `pathfinder2e.ts` are richer (worked examples, the arguments tables
// have) and they WIN — `PF2_DERIVED_ENTRIES` deliberately skips any term that file already defines,
// so this module only ever fills holes. Nothing here overrides an authored article.
//
// GROUND RULE 3 — never invent a rule. Every sentence below is either projected verbatim-in-substance
// from repo data or is a statement of PF2's universal check maths that `Proficiency Rank` in
// `pathfinder2e.ts` already states. Where the repo does not know something (which skill actions exist
// for Survival, what a spirit-damage entry would say) this module says so in the article rather than
// filling the space — see PF2_GLOSSARY_GAPS.
import type { GlossaryEntry, SystemGlossary } from './types';
import { PF2_CONDITIONS, PF2_ACTIONS } from '@/lib/dnd/systems/pathfinder2e/data';
import { PF2_SKILLS } from '@/lib/dnd/systems/pathfinder2e/content';

/** The first sentence of a rules summary, for the one-line `short`. Falls back to the whole string
 *  when there is no sentence break, and never returns something too short to be a summary. */
function firstSentence(text: string, min = 40): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  // Take sentences until there is enough to read as a summary — several PF2 conditions open with a
  // four-word sentence ("You cannot see.") that would be a useless search result on its own.
  let out = '';
  for (const part of clean.split(/(?<=\.)\s+/)) {
    out = out ? `${out} ${part}` : part;
    if (out.length >= min) break;
  }
  return out;
}

// ── Conditions ────────────────────────────────────────────────────────────────────────────────
//
// The `valued` and `ends` fields carry real rules meaning that a bare effect string loses, so both
// are stated explicitly: "Frightened 2" is a different rule from "Frightened", and a condition with
// no `ends` genuinely ends when its source says so — that is an answer, not missing data (the note
// at the top of data/conditions.ts makes the same point).
function conditionEntry(c: (typeof PF2_CONDITIONS)[number]): GlossaryEntry {
  const parts = [c.effect];
  if (c.valued) {
    parts.push(
      `This condition is **valued**: it is written with a number (${c.name} 1, ${c.name} 2, …) and the ` +
      'number is the size of its effect. Effects that would apply it again do not stack — they raise the ' +
      'value only if the new value is higher.',
    );
  }
  parts.push(
    c.ends
      ? `**Ends:** ${c.ends}`
      : 'This condition defines no expiry of its own, so it lasts until the effect that applied it says ' +
        'otherwise. That is the rule, not a gap in this entry.',
  );
  parts.push(`Source: ${c.source} — Pathfinder 2e Remaster, ORC-licensed mechanics, paraphrased.`);
  return {
    term: c.name,
    kind: 'condition',
    short: firstSentence(c.effect),
    body: parts.join('\n\n'),
    aliases: c.valued ? [`${c.name.toLowerCase()} 1`, `${c.name.toLowerCase()} 2`] : undefined,
  };
}

// ── Skills ────────────────────────────────────────────────────────────────────────────────────

const ATTRIBUTE_NAME: Record<string, string> = {
  STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution',
  INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma',
};

/** Which catalogued actions belong to a skill. Read out of PF2_ACTIONS' own `skill` field rather than
 *  a hand-kept list here, so cataloguing a new skill action shows up in its skill's article for free. */
function actionsForSkill(skill: string): string[] {
  return PF2_ACTIONS.filter((a) => a.skill === skill).map((a) => a.name);
}

/** The universal PF2 skill-check maths, stated once. Identical to the `Proficiency Rank` article's
 *  numbers — deliberately, since a second, differently-worded copy is how two articles start
 *  disagreeing about the same rule. */
const SKILL_MATH =
  'A skill check is **d20 + your attribute modifier + your proficiency bonus**, read on the four ' +
  '**Degrees of Success**. Proficiency is **+0 with your level NOT added** while Untrained, and ' +
  '**level + 2/4/6/8** at Trained / Expert / Master / Legendary — which is why an untrained character ' +
  'cannot meaningfully attempt a high-level task.';

function skillEntry(s: { name: string; attribute: string; armorPenalty?: boolean }): GlossaryEntry {
  const attr = ATTRIBUTE_NAME[s.attribute] ?? s.attribute;
  const acts = actionsForSkill(s.name);
  const parts = [
    `**${s.name}** is a **${attr}**-based skill.`,
    SKILL_MATH,
  ];
  if (acts.length) {
    parts.push(`**Catalogued skill actions:** ${acts.join(' · ')}. Look each one up for its own action cost and degrees of success.`);
  } else {
    // Honest rather than padded: several skills' actions are simply not in the catalog yet, and
    // inventing a plausible action list for Survival would be exactly the failure mode CX-12 exists
    // to avoid. Recorded in PF2_GLOSSARY_GAPS too, so it is findable without reading this file.
    parts.push(
      `No skill actions for ${s.name} are catalogued in this library yet. Most of its uses run through ` +
      '**Recall Knowledge** or a GM-set DC; check the rulebook for its specific actions rather than ' +
      'assuming this list is complete.',
    );
  }
  if (s.armorPenalty) {
    parts.push('Checks with this skill take the **armor check penalty** of the armor you are wearing.');
  }
  return {
    term: s.name,
    kind: 'term',
    short: `A ${attr}-based Pathfinder 2e skill${acts.length ? ` — ${acts.slice(0, 3).join(', ')}` : ''}.`,
    body: parts.join('\n\n'),
    seeAlso: ['Proficiency Rank', 'Degrees of Success'],
  };
}

/** Lore is PF2's open-ended 17th skill: a character writes their own (Sailing Lore, Warfare Lore), so
 *  it is not in PF2_SKILLS — which is correct, because the builder cannot offer a fixed list of them.
 *  A sheet still shows the word "Lore", so a tooltip still needs an article. */
const LORE_ENTRY: GlossaryEntry = {
  term: 'Lore',
  kind: 'term',
  short: 'PF2’s open-ended skill: each Lore is a narrow subject you name yourself, usually Intelligence-based.',
  body:
    '**Lore** is not one skill but a family of them. Each Lore names its own narrow subject — Sailing Lore, ' +
    'Warfare Lore, Underworld Lore — and you are trained in that one specifically, not in Lore generally. ' +
    'A background or class typically grants one, and it is usually **Intelligence**-based.\n\n' +
    `${SKILL_MATH}\n\n` +
    'Its main use is **Recall Knowledge** about its subject, where a relevant Lore is often easier than the ' +
    'broad skill would be. A Lore is deliberately narrow: the GM decides whether the subject at hand falls ' +
    'inside it, and a Lore broad enough to replace Arcana or Society is not a legal choice.\n\n' +
    'Because each Lore is written by the player, this library holds no list of them — that is by design, ' +
    'not a missing catalog.',
  seeAlso: ['Proficiency Rank', 'Recall Knowledge'],
};

// ── Damage types ──────────────────────────────────────────────────────────────────────────────
//
// PF2 has NO canonical damage-type list anywhere in this repo — no enum, no defs field; `damage` on a
// spell is free text. So this list is not derived from a structure; every type below was confirmed to
// appear as a damage type in the repo's OWN PF2 content (the spell catalog's `damage` strings, the
// weapon-rune and bomb entries, and builder.ts's B/P/S map) before being written. Types that could NOT
// be confirmed that way are omitted and recorded in PF2_GLOSSARY_GAPS rather than guessed at.
//
// Terms are named "<Type> Damage" rather than the bare word on purpose: a bare "Poison" entry would
// win an exact-term lookup over the **Poisoned** condition's alias, and in a sentence like "the target
// takes poison damage and is poisoned" the two are different things a reader may want either of.
interface Pf2DamageType { type: string; category: string; note: string }

const PF2_DAMAGE_TYPES: Pf2DamageType[] = [
  { type: 'Bludgeoning', category: 'physical', note: 'Blunt force — hammers, falls, a constricting body. Written **B** on a weapon’s stat line.' },
  { type: 'Piercing', category: 'physical', note: 'Punctures — spears, arrows, fangs. Written **P** on a weapon’s stat line.' },
  { type: 'Slashing', category: 'physical', note: 'Cuts — swords, axes, claws. Written **S** on a weapon’s stat line.' },
  { type: 'Acid', category: 'energy', note: 'Corrosion. Acid weapon runes, acid flasks and several spells deal it, and armor runes can grant resistance to it.' },
  { type: 'Cold', category: 'energy', note: 'Freezing. One of the most commonly resisted energy types, and it is what most ice spells deal.' },
  { type: 'Electricity', category: 'energy', note: 'Lightning and shock. PF2 calls this **electricity**, never "lightning" — the trait and the resistance are both written that way.' },
  { type: 'Fire', category: 'energy', note: 'Burning. The most widely resisted energy type in the game, and the one most likely to set things alight.' },
  { type: 'Sonic', category: 'energy', note: 'Concussive sound. Needs a medium to travel through, and several sonic effects also deafen on a critical hit.' },
  { type: 'Vitality', category: 'energy', note: 'Life energy — the Remaster’s name for positive energy. It **heals living creatures and harms undead**.' },
  { type: 'Void', category: 'energy', note: 'Entropic energy — the Remaster’s name for negative energy. It **harms living creatures and heals undead**.' },
  { type: 'Force', category: 'energy', note: 'Raw magical energy. Very little resists it, which is why force effects are reliable against incorporeal creatures.' },
  { type: 'Mental', category: 'mental', note: 'An assault on the mind rather than the body. Creatures without a mind — most constructs, mindless undead — are immune.' },
  { type: 'Poison', category: 'poison', note: 'Toxins. Note that **PF2 has no "Poisoned" condition** — a poison is an *affliction* that advances through stages, and each stage typically deals poison damage and applies conditions such as **Enfeebled** or **Sickened**. So "poison damage" and "being poisoned" are separate things here in a way they are not in 5e.' },
  { type: 'Bleed', category: 'bleed', note: 'Blood loss, and it is always **persistent damage** — it repeats at the end of your turn until you pass a DC 15 flat check or someone helps you. Creatures without blood are immune.' },
  { type: 'Precision', category: 'precision', note: 'Not a kind of energy but a **rider**: extra damage from hitting a weak point (Sneak Attack, a Precision ranger’s hunted prey). It is dealt as the same type as the triggering attack, and anything **immune to precision damage** — many undead and oozes — simply ignores it.' },
];

function damageEntry(d: Pf2DamageType): GlossaryEntry {
  return {
    term: `${d.type} Damage`,
    kind: 'term',
    short: `${d.type} damage — the ${d.category} damage type in Pathfinder 2e.`,
    body:
      `**${d.type}** damage.\n\n${d.note}\n\n` +
      'Damage types matter through **resistance**, **weakness** and **immunity**: resistance subtracts its ' +
      'value from each instance of that type, weakness ADDS its value, and immunity reduces it to nothing. ' +
      'Weakness applies before resistance is checked, and a creature with both weakness and resistance to ' +
      'the same type applies both. Nothing about a damage type changes the attack roll — it changes only ' +
      'what the target does with the damage once it lands.',
    seeAlso: ['Degrees of Success'],
  };
}

// ── Assembly ──────────────────────────────────────────────────────────────────────────────────

/** Everything this module can offer, before the authored articles get first refusal. */
const CANDIDATES: SystemGlossary = [
  ...PF2_CONDITIONS.map(conditionEntry),
  ...PF2_SKILLS.map(skillEntry),
  LORE_ENTRY,
  ...PF2_DAMAGE_TYPES.map(damageEntry),
];

/**
 * The derived entries, minus every term the hand-authored glossary already covers.
 *
 * `taken` is passed in rather than imported so this module never imports `pathfinder2e.ts` while
 * `pathfinder2e.ts` imports it — that is a cycle, and under Vite it resolves to `undefined` at module
 * scope in whichever file loses the race, which fails as a blank glossary rather than as an error.
 */
export function pf2DerivedEntries(taken: readonly GlossaryEntry[]): SystemGlossary {
  const authored = new Set(taken.map((e) => e.term.trim().toLowerCase()));
  return CANDIDATES.filter((e) => !authored.has(e.term.trim().toLowerCase()));
}

/** What this module knows it does NOT cover, recorded next to the data rather than only in a doc. */
export const PF2_GLOSSARY_GAPS: string[] = [
  'PF2 skills: Arcana, Nature, Occultism, Performance, Religion, Society and Survival have no catalogued ' +
    'skill actions, because data/actions.ts does not hold them yet — their articles say so instead of ' +
    'listing invented ones.',
  'PF2 damage types: there is no canonical damage-type list anywhere in the repo, so the 15 types with ' +
    'articles are the ones attested in the repo\'s own PF2 content. Spirit, holy and unholy damage — the ' +
    'Remaster\'s replacements for alignment damage — are NOT catalogued, because nothing in the repo ' +
    'attests them as damage types and a guessed entry would read as authoritative.',
  'PF2 conditions: the 16 articles derived here reuse data/conditions.ts verbatim in substance, so they ' +
    'inherit that file\'s own omissions — several conditions deliberately omit a sub-clause whose exact ' +
    'wording was not confirmable.',
];
