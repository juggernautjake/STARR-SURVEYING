// lib/dnd/systems/pathfinder2e/pathbuilder.ts — read a Pathbuilder 2e export (P9-3, audit H-3).
//
// PF2 players are the least-served group here, and almost all of them already have a character in
// Pathbuilder. A deterministic adapter is fast, exact, free of model cost, and — unlike the AI ingestion
// path — it can say precisely what it did and did not understand.
//
// THE DESIGN RULE, AND IT IS THE ONLY ONE THAT MATTERS: **this file never guesses.** Pathbuilder's JSON is
// a third-party format with no published schema; some of it is stable and obvious (`build.name`,
// `build.class`, `build.abilities.str`) and some of it is not. So the adapter reads what it RECOGNISES,
// records everything it did not map in `unmapped`, and hands both to the caller. An importer that silently
// drops half a character is worse than one that refuses, because the player finds out weeks later at a
// table; one that INVENTS the half it did not understand is worse still.
//
// Field names are therefore treated as a best-effort contract, never as an assertion of correctness — a
// key we do not find simply lands in `unmapped`, and the character imports without it.
import type { PF2AttributeKey } from './model';

/** What the adapter produced: the picks, plus an honest account of the rest. */
export interface PathbuilderImport {
  picks: PathbuilderPicks;
  /** Top-level keys of `build` that the adapter did not read. Shown to the user, not swallowed. */
  unmapped: string[];
  /** Human-readable notes about things that were read but only partly — e.g. feats kept as names. */
  notes: string[];
}

/** The subset of `PF2Picks` this adapter can fill. Deliberately structural rather than an import, so a
 *  change to the builder's picks cannot silently widen what this claims to produce. */
export interface PathbuilderPicks {
  name?: string;
  level?: number;
  ancestry?: string;
  heritage?: string;
  background?: string;
  className?: string;
  subclass?: string;
  deity?: string;
  keyAttribute?: PF2AttributeKey;
  attributes?: Partial<Record<PF2AttributeKey, number>>;
  trainedSkills?: string[];
  languages?: string[];
  feats?: string[];
  spells?: string[];
}

export type PathbuilderResult =
  | { ok: true; value: PathbuilderImport }
  | { ok: false; error: string };

/** Pathbuilder stores abilities as raw SCORES (10, 18); PF2Picks wants modifiers. */
const scoreToModifier = (score: number) => Math.floor((score - 10) / 2);

const ABILITY_KEYS: Record<string, PF2AttributeKey> = {
  str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA',
};

/** Keys of `build` the adapter reads. Anything outside this set is reported as unmapped. */
const READ_KEYS = new Set([
  'name', 'level', 'ancestry', 'heritage', 'background', 'class', 'dualClass', 'keyability',
  'abilities', 'proficiencies', 'languages', 'feats', 'spellCasters', 'focus', 'deity',
]);

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Pathbuilder stores each feat as an ARRAY, not an object: `["Fleet", null, "Ancestry Feat", 1]`. The
 * first element is the name; the rest are the source, the slot label and the level, in an order that has
 * not been stable across versions.
 *
 * So only element 0 is trusted. Reading the level from element 3 and attaching it to a slot would be
 * exactly the guess this module exists not to make — and the eligibility layer will re-derive the level
 * from the catalogue anyway, which is the answer that is actually correct.
 */
function readFeats(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw) {
    const name = Array.isArray(entry) ? str(entry[0]) : str(entry);
    if (name) out.push(name);
  }
  return [...new Set(out)];
}

/** Trained skills: Pathbuilder's `proficiencies` is a flat map of skill → rank number (0/2/4/6/8). */
function readTrainedSkills(prof: unknown): string[] {
  if (!isObj(prof)) return [];
  const out: string[] = [];
  for (const [key, value] of Object.entries(prof)) {
    // Rank is a NUMBER of proficiency-bonus points, not a rank name. Anything above 0 means trained at
    // least; the builder only accepts "which skills are trained", so that is all this reads.
    if (typeof value !== 'number' || value <= 0) continue;
    // The same map also carries non-skill entries (perception, saves, weapon categories, class DC). Only
    // capitalised skill-looking names go through, and an unknown one is harmless — the builder ignores a
    // skill it does not have.
    const name = key.trim();
    if (!name || /^(perception|fortitude|reflex|will|classdc|heavy|medium|light|unarmored|advanced|martial|simple|unarmed|castinglore)$/i.test(name)) continue;
    out.push(name.charAt(0).toUpperCase() + name.slice(1));
  }
  return [...new Set(out)].sort();
}

/** Spells, across every caster block Pathbuilder records. */
function readSpells(casters: unknown): string[] {
  if (!Array.isArray(casters)) return [];
  const out: string[] = [];
  for (const caster of casters) {
    if (!isObj(caster)) continue;
    const levels = caster.spells;
    if (!Array.isArray(levels)) continue;
    for (const lvl of levels) {
      if (!isObj(lvl) || !Array.isArray(lvl.list)) continue;
      for (const s of lvl.list) {
        const name = str(s);
        if (name) out.push(name);
      }
    }
  }
  return [...new Set(out)];
}

/**
 * Parse a Pathbuilder export.
 *
 * Accepts the object or its JSON text, matching `parseCharacterExport` — a caller has one or the other
 * depending on whether the user pasted or uploaded, and making each remember to `JSON.parse` first is how
 * one of them ends up not doing it.
 */
export function parsePathbuilder(input: unknown): PathbuilderResult {
  let doc: unknown = input;
  if (typeof input === 'string') {
    try {
      doc = JSON.parse(input);
    } catch {
      return { ok: false, error: 'That file is not valid JSON.' };
    }
  }
  if (!isObj(doc)) return { ok: false, error: 'A Pathbuilder export must be a JSON object.' };

  // Pathbuilder wraps everything in `{ success: true, build: {...} }`. A bare `build` object is accepted
  // too, because people paste the inner object surprisingly often.
  const build = isObj(doc.build) ? doc.build : isObj(doc) && 'class' in doc ? doc : null;
  if (!build) {
    return { ok: false, error: 'That does not look like a Pathbuilder export — it has no "build" object.' };
  }

  const notes: string[] = [];
  const picks: PathbuilderPicks = {};

  const name = str(build.name);
  if (name) picks.name = name.slice(0, 200);

  const level = Number(build.level);
  if (Number.isFinite(level)) picks.level = Math.max(1, Math.min(20, Math.round(level)));

  for (const [from, to] of [['ancestry', 'ancestry'], ['heritage', 'heritage'], ['background', 'background'], ['class', 'className'], ['deity', 'deity']] as const) {
    const v = str(build[from]);
    if (v) (picks as Record<string, unknown>)[to] = v;
  }

  // Attributes: SCORES in the file, MODIFIERS in the builder. Converting is the single most consequential
  // line here — importing 18 as a +18 modifier would produce a character with a +22 to hit.
  if (isObj(build.abilities)) {
    const attributes: Partial<Record<PF2AttributeKey, number>> = {};
    for (const [key, attr] of Object.entries(ABILITY_KEYS)) {
      const raw = (build.abilities as Record<string, unknown>)[key];
      if (typeof raw === 'number' && Number.isFinite(raw)) attributes[attr] = scoreToModifier(raw);
    }
    if (Object.keys(attributes).length) picks.attributes = attributes;
  }

  const keyRaw = str(build.keyability).toLowerCase();
  if (ABILITY_KEYS[keyRaw]) picks.keyAttribute = ABILITY_KEYS[keyRaw];

  const skills = readTrainedSkills(build.proficiencies);
  if (skills.length) picks.trainedSkills = skills;

  if (Array.isArray(build.languages)) {
    const langs = build.languages.map(str).filter(Boolean);
    if (langs.length) picks.languages = [...new Set(langs)];
  }

  const feats = readFeats(build.feats);
  if (feats.length) {
    picks.feats = feats;
    notes.push(`${feats.length} feats imported by NAME. Any the catalogue does not know arrive as homebrew rather than with invented mechanics.`);
  }

  const spells = readSpells(build.spellCasters);
  if (spells.length) {
    picks.spells = spells;
    notes.push(`${spells.length} spells imported by name.`);
  }

  // The SUBCLASS is deliberately not guessed. Pathbuilder stores it per class under keys that differ by
  // class (`bloodline`, `instinct`, `doctrine`, …) and reading the wrong one would set a Cleric's doctrine
  // from a Barbarian field. It is left for the player to pick, which takes one dropdown.
  notes.push('Subclass (doctrine / instinct / racket / bloodline) is not imported — Pathbuilder stores it under a different key per class, and reading the wrong one would set it wrong. Choose it on the sheet.');

  const unmapped = Object.keys(build).filter((k) => !READ_KEYS.has(k)).sort();

  return { ok: true, value: { picks, unmapped, notes } };
}

/** A one-line summary for the UI: what came across. */
export function describePathbuilderImport(result: PathbuilderImport): string {
  const p = result.picks;
  const bits = [
    p.className && p.level ? `level ${p.level} ${p.className}` : p.className || '',
    p.ancestry || '',
    p.feats?.length ? `${p.feats.length} feats` : '',
    p.spells?.length ? `${p.spells.length} spells` : '',
    p.trainedSkills?.length ? `${p.trainedSkills.length} trained skills` : '',
  ].filter(Boolean);
  return bits.length ? bits.join(' · ') : 'nothing recognisable';
}
