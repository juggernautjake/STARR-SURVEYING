// lib/dnd/glossary/intuitive-games-derived.ts — the IG glossary articles DERIVED from the IG content
// module, so a tooltip has something to show for every condition, stance, skill and damage type an IG
// sheet can name (CX-12).
//
// WHY DERIVED. `systems/intuitive-games/content.ts` already holds the full rules text for all 18
// conditions and all 10 stances, transcribed from intuitivegames.net under the repo's never-invent
// ground rule. Copying that text into a second file would create two copies of one rule that drift the
// moment either is corrected. The content module stays the source of truth; this module projects it
// into GlossaryEntry shape. Same principle term-index.ts states for its abbreviations.
//
// The hand-authored articles in `intuitive-games.ts` are richer and WIN — `igDerivedEntries` skips any
// term that file already defines, so this module only fills holes.
//
// THE HONEST PART, and the reason to read this comment before "improving" the skill entries below.
// IG's site publishes the skill SYSTEM (the check formula, the DC guide, how combat skills resolve)
// but its per-skill breakdown was truncated when content.ts was authored — see the note above
// IG_COMBAT_SKILL_RULES. So the repo genuinely does not know what IG's Appraise does beyond "it is an
// Intelligence skill". Every skill article below therefore states ONLY what the repo can prove: the
// governing ability, whether it is a combat skill, the universal check maths, and an explicit line
// saying the per-skill uses are not published here. That reads as a thinner article than 5e's, and
// that is correct — a confident paragraph about IG's Appraise would have to be borrowed from another
// game, which is precisely the edition bleed this platform exists to prevent. Recorded in
// IG_GLOSSARY_GAPS as well, so it is findable without reading this file.
import type { GlossaryEntry, SystemGlossary } from './types';
import {
  IG_CONDITIONS, IG_STANCE_DEFS, IG_STANCE_RULES, IG_COMBAT_SKILLS,
  IG_SKILL_RULES, IG_COMBAT_SKILL_RULES, IG_DAMAGE_TYPE_DATA, IG_DAMAGE_SAVE_RULES,
} from '@/lib/dnd/systems/intuitive-games/content';
import { systemSkills } from '@/lib/dnd/system-rules';

/** Enough leading sentences to read as a summary — several IG conditions open with a short clause. */
function firstSentence(text: string, min = 40): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  let out = '';
  for (const part of clean.split(/(?<=\.)\s+/)) {
    out = out ? `${out} ${part}` : part;
    if (out.length >= min) break;
  }
  return out;
}

// ── Conditions ────────────────────────────────────────────────────────────────────────────────
// IG_CONDITIONS carries the full rules body, so the article is that body plus the one thing the body
// does not say: that the IG sheet auto-folds a condition's roll effects rather than leaving them to
// the player. That is IG-specific behaviour worth stating where a player will read it.
function conditionEntry(c: { name: string; effect?: string }): GlossaryEntry {
  const effect = c.effect ?? '';
  return {
    term: c.name,
    kind: 'condition',
    short: firstSentence(effect),
    body:
      `${effect}\n\n` +
      'Conditions in Intuitive Games apply to **d20 rolls** as flat penalties (Shaken and Sickened are −2 ' +
      'to everything) or as **disadvantage** on a specific category of roll. The sheet folds those into ' +
      'the roll for you and names the condition as the source; anything a roll modifier cannot express — ' +
      'losing your actions, an automatic failure, a behavioural rule — is shown for you to apply.',
    seeAlso: ['Core Roll', 'Degrees of Success'],
  };
}

// ── Stances ───────────────────────────────────────────────────────────────────────────────────
// Terms are "<Name> Stance" with the bare name as an alias: a bare "Precise" or "Mobile" entry is an
// ordinary English word, and an entry under that term would light up in every feature description the
// linkifier touches. The alias still resolves what a sheet actually stores, which is the bare name.
function stanceEntry(s: { name: string; basic: string; advanced: string }): GlossaryEntry {
  return {
    term: `${s.name} Stance`,
    kind: 'feature',
    short: `IG combat stance — below level 5: ${firstSentence(s.basic, 30)}`,
    body:
      `**${s.name}** is one of Intuitive Games' ten stances.\n\n` +
      `· **Basic** (below level 5): ${s.basic}\n` +
      `· **Advanced** (level 5+): ${s.advanced}\n\n` +
      `${IG_STANCE_RULES}\n\n` +
      'The Advanced benefit **replaces** the Basic one at level 5 — it is not added on top. Where a stance ' +
      'effect is unconditional the sheet folds it into your rolls and names the stance; where it depends ' +
      'on a situation the sheet cannot see (flanking, the target’s state) it is surfaced for you to apply, ' +
      'because guessing whether you are flanking would be inventing the table’s state.',
    seeAlso: ['Stances'],
    aliases: [s.name],
  };
}

// ── Skills ────────────────────────────────────────────────────────────────────────────────────

const ABILITY_NAME: Record<string, string> = {
  STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution',
  INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma',
};

function skillEntry(s: { name: string; ability: string }): GlossaryEntry {
  const ability = ABILITY_NAME[s.ability] ?? s.ability;
  const isCombat = IG_COMBAT_SKILLS.has(s.name);
  const parts = [
    `**${s.name}** is ${isCombat ? 'a **combat skill**' : 'a general skill'} governed by **${ability}**.`,
    IG_SKILL_RULES,
  ];
  if (isCombat) parts.push(IG_COMBAT_SKILL_RULES);
  parts.push(
    `The per-use breakdown for ${s.name} is not published in this library — intuitivegames.net's skills ` +
    'page did not carry one when this content was captured. What is above is certain: the governing ' +
    'ability, the check maths, and (for a combat skill) how it resolves. Ask your GM for the specific ' +
    'uses rather than borrowing another game’s version of this skill.',
  );
  return {
    term: s.name,
    kind: 'term',
    short: `${isCombat ? 'An Intuitive Games combat skill' : 'An Intuitive Games skill'} governed by ${ability}.`,
    body: parts.join('\n\n'),
    seeAlso: isCombat ? ['Combat Skills', 'Proficiency'] : ['Proficiency', 'Core Roll'],
  };
}

// ── Damage types ──────────────────────────────────────────────────────────────────────────────
//
// IG_DAMAGE_TYPE_DATA names its groups as "Physical (Piercing / Bludgeoning / Slashing)" — one row per
// group, with the members inside the parentheses. A tooltip is asked for the member ("Slashing"), not
// the group, so this splits the row into an article for the group AND one for each member, each
// carrying the group's own rules note. Splitting rather than hand-listing keeps a new IG damage type
// covered the moment it is added to the content module.
interface IgDamageTerm { term: string; group: string; note: string }

function damageTerms(): IgDamageTerm[] {
  const out: IgDamageTerm[] = [];
  for (const d of IG_DAMAGE_TYPE_DATA) {
    const m = d.name.match(/^([^(]+?)\s*\(([^)]+)\)$/);
    const group = (m ? m[1] : d.name).trim();
    out.push({ term: group, group, note: d.note });
    if (m) for (const member of m[2].split('/').map((s) => s.trim()).filter(Boolean)) {
      out.push({ term: member, group, note: d.note });
    }
  }
  return out;
}

function damageEntry(d: IgDamageTerm): GlossaryEntry {
  const isGroup = d.term === d.group;
  return {
    term: `${d.term} Damage`,
    kind: 'term',
    short: isGroup
      ? `${d.term} damage in Intuitive Games — ${d.note}`
      : `${d.term} damage — one of Intuitive Games' ${d.group} damage types.`,
    body:
      `**${d.term}** damage${isGroup ? '' : `, one of the **${d.group}** damage types`}.\n\n` +
      `${d.note}\n\n` +
      `Damage in Intuitive Games is not only a number off your hit points: ${IG_DAMAGE_SAVE_RULES}\n\n` +
      '**Damage Reduction (DR)** subtracts from each instance of a damage type it applies to — the note ' +
      'above says whether this type is subject to DR at all, which is the single thing most worth ' +
      'knowing about it.',
    seeAlso: ['Damage Reduction'],
  };
}

// ── Assembly ──────────────────────────────────────────────────────────────────────────────────

/** Everything this module can offer, before the authored articles get first refusal. */
function candidates(): SystemGlossary {
  return [
    ...IG_CONDITIONS.map(conditionEntry),
    ...IG_STANCE_DEFS.map(stanceEntry),
    ...systemSkills('intuitive-games').map(skillEntry),
    ...damageTerms().map(damageEntry),
  ];
}

/**
 * The derived entries, minus every term the hand-authored glossary already covers.
 *
 * `taken` is passed in rather than imported so this module never imports `intuitive-games.ts` while
 * that file imports this one — a cycle that Vite resolves to `undefined` at module scope in whichever
 * file loses the race, failing as a silently blank glossary rather than as an error.
 */
export function igDerivedEntries(taken: readonly GlossaryEntry[]): SystemGlossary {
  const authored = new Set(taken.map((e) => e.term.trim().toLowerCase()));
  return candidates().filter((e) => !authored.has(e.term.trim().toLowerCase()));
}

/** What this module knows it does NOT cover, recorded next to the data rather than only in a doc. */
export const IG_GLOSSARY_GAPS: string[] = [
  'IG skills: no per-skill rules text exists anywhere in the repo — intuitivegames.net\'s skills page was ' +
    'truncated when content.ts was captured, and only the general skill system and the combat-skill ' +
    'resolution survived. Every IG skill article therefore states the governing ability, the check ' +
    'maths and (for combat skills) the resolution, and then says plainly that the per-use breakdown is ' +
    'not published here. Filling that space from 5e or PF2 would be edition bleed.',
  'IG combat skills: content.ts records that per-skill mechanics beyond Dirty Trick were truncated on ' +
    'the source page, so the nine combat skills share one resolution article rather than nine specific ones.',
  'IG damage types: articles are derived from IG_DAMAGE_TYPE_DATA, whose notes state DR interaction and ' +
    'incorporeal interaction only. No per-type resistance list, immunity list or damage-die guidance ' +
    'exists in the repo to derive from.',
];
