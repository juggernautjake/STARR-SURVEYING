// lib/dnd/system-detect.ts — decide whether a rules question is actually about a DIFFERENT
// game system than the one the chat is focused on.
//
// The library chat is always FOCUSED on one system so its answers are grounded in that system's
// rules only (see systemGroundingBlock). But people ask "how does rage work?" while focused on
// Call of Cthulhu, or "what's my proficiency bonus?" while focused on Blades. When that happens
// the chat should still answer, and ALSO ask whether they meant the other system.
//
// Deliberately deterministic (no LLM call): a cheap, testable signal the route can attach to the
// prompt. False positives are worse than misses here — a wrong "did you mean?" on every message
// would be noise — so a hit needs an explicit system name, or a mechanic that is BOTH strongly
// tied to another system AND absent from the focused one.
import { GAME_SYSTEMS, SYSTEM_AMBIGUOUS, type CharacterSystem } from './systems';
import { rulesForSystem } from './system-rules';

export interface SystemHint {
  /** The system the question looks like it's really about. */
  key: string;
  /** Display name, for the "did you mean…?" line. */
  name: string;
  /** What triggered it — quoted back to the user so the question isn't mysterious. */
  matched: string;
  /** 'named' = they said the system's name · 'mechanic' = a signature mechanic of that system. */
  reason: 'named' | 'mechanic';
}

/** Explicit names/aliases for each system. Matched case-insensitively on word boundaries. */
const ALIASES: Record<string, string[]> = {
  'dnd5e-2014': ['5e 2014', '2014 phb', "2014 player's handbook", 'fifth edition 2014'],
  'dnd5e-2024': ['5e 2024', '2024 phb', '2024 player’s handbook', 'one dnd', 'one d&d'],
  pathfinder2e: ['pathfinder 2e', 'pathfinder second edition', 'pf2e', 'pf2', 'remaster'],
  pathfinder1e: ['pathfinder 1e', 'pathfinder first edition', 'pf1e', 'pf1'],
  starfinder1e: ['starfinder'],
  coc7e: ['call of cthulhu', 'coc 7e', 'cthulhu', 'brp', 'basic roleplaying'],
  blades: ['blades in the dark', 'blades', 'forged in the dark', 'fitd'],
  'cyberpunk-red': ['cyberpunk red', 'cyberpunk', 'cprd'],
  shadowrun6e: ['shadowrun', 'sixth world', 'sr6'],
  'intuitive-games': ['intuitive games'],
};

/**
 * Mechanic terms and — explicitly — WHICH systems actually have them.
 *
 * A hint fires only when the focused system is NOT in `presentIn`. This is a hand-maintained
 * table on purpose: the first version inferred "does the focused system have this?" by scanning
 * that system's rules prose, which backfires badly, because the prose says things like "No
 * proficiency bonus. Competence is the action rating…" — a NEGATION that reads as evidence the
 * system has the concept. Listing membership explicitly is boring and correct.
 *
 * `suggest` is the system to point at when the term appears somewhere it doesn't belong.
 */
interface MechanicTerm {
  term: string;
  presentIn: string[];
  suggest: string;
}

const MECHANICS: MechanicTerm[] = [
  // ── cross-cutting d20 / D&D-isms ────────────────────────────────────────────────
  { term: 'rage', presentIn: ['dnd5e-2014', 'dnd5e-2024', 'pathfinder1e', 'pathfinder2e'], suggest: 'dnd5e-2024' },
  { term: 'raging', presentIn: ['dnd5e-2014', 'dnd5e-2024', 'pathfinder1e', 'pathfinder2e'], suggest: 'dnd5e-2024' },
  { term: 'proficiency bonus', presentIn: ['dnd5e-2014', 'dnd5e-2024'], suggest: 'dnd5e-2024' },
  { term: 'cantrip', presentIn: ['dnd5e-2014', 'dnd5e-2024', 'pathfinder1e', 'pathfinder2e', 'starfinder1e'], suggest: 'dnd5e-2024' },
  { term: 'spell slot', presentIn: ['dnd5e-2014', 'dnd5e-2024', 'pathfinder1e', 'pathfinder2e', 'starfinder1e'], suggest: 'dnd5e-2024' },
  { term: 'hit dice', presentIn: ['dnd5e-2014', 'dnd5e-2024', 'pathfinder1e'], suggest: 'dnd5e-2024' },
  { term: 'short rest', presentIn: ['dnd5e-2014', 'dnd5e-2024'], suggest: 'dnd5e-2024' },
  { term: 'armor class', presentIn: ['dnd5e-2014', 'dnd5e-2024', 'pathfinder1e', 'pathfinder2e', 'intuitive-games'], suggest: 'dnd5e-2024' },
  // ── per-system signatures ───────────────────────────────────────────────────────
  { term: 'bardic inspiration', presentIn: ['dnd5e-2014', 'dnd5e-2024'], suggest: 'dnd5e-2014' },
  { term: 'divine smite', presentIn: ['dnd5e-2014', 'dnd5e-2024'], suggest: 'dnd5e-2014' },
  { term: 'origin feat', presentIn: ['dnd5e-2024'], suggest: 'dnd5e-2024' },
  { term: 'weapon mastery', presentIn: ['dnd5e-2024'], suggest: 'dnd5e-2024' },
  { term: 'off-guard', presentIn: ['pathfinder2e'], suggest: 'pathfinder2e' },
  { term: 'three-action', presentIn: ['pathfinder2e'], suggest: 'pathfinder2e' },
  { term: 'focus point', presentIn: ['pathfinder2e'], suggest: 'pathfinder2e' },
  { term: 'flat-footed', presentIn: ['pathfinder1e', 'pathfinder2e', 'starfinder1e'], suggest: 'pathfinder1e' },
  { term: 'base attack bonus', presentIn: ['pathfinder1e', 'starfinder1e'], suggest: 'pathfinder1e' },
  { term: 'bab', presentIn: ['pathfinder1e', 'starfinder1e'], suggest: 'pathfinder1e' },
  { term: 'stamina point', presentIn: ['starfinder1e'], suggest: 'starfinder1e' },
  { term: 'resolve point', presentIn: ['starfinder1e'], suggest: 'starfinder1e' },
  { term: 'eac', presentIn: ['starfinder1e'], suggest: 'starfinder1e' },
  { term: 'kac', presentIn: ['starfinder1e'], suggest: 'starfinder1e' },
  { term: 'sanity', presentIn: ['coc7e'], suggest: 'coc7e' },
  { term: 'sanity check', presentIn: ['coc7e'], suggest: 'coc7e' },
  { term: 'push the roll', presentIn: ['coc7e'], suggest: 'coc7e' },
  { term: 'mythos', presentIn: ['coc7e'], suggest: 'coc7e' },
  { term: 'bout of madness', presentIn: ['coc7e'], suggest: 'coc7e' },
  { term: 'position and effect', presentIn: ['blades'], suggest: 'blades' },
  { term: 'devil’s bargain', presentIn: ['blades'], suggest: 'blades' },
  { term: "devil's bargain", presentIn: ['blades'], suggest: 'blades' },
  { term: 'flashback', presentIn: ['blades'], suggest: 'blades' },
  { term: 'trauma', presentIn: ['blades'], suggest: 'blades' },
  { term: 'stress', presentIn: ['blades'], suggest: 'blades' },
  { term: 'humanity loss', presentIn: ['cyberpunk-red'], suggest: 'cyberpunk-red' },
  { term: 'cyberpsychosis', presentIn: ['cyberpunk-red'], suggest: 'cyberpunk-red' },
  { term: 'stopping power', presentIn: ['cyberpunk-red'], suggest: 'cyberpunk-red' },
  { term: 'netrunner', presentIn: ['cyberpunk-red'], suggest: 'cyberpunk-red' },
  { term: 'essence', presentIn: ['shadowrun6e'], suggest: 'shadowrun6e' },
  { term: 'glitch', presentIn: ['shadowrun6e'], suggest: 'shadowrun6e' },
  { term: 'decker', presentIn: ['shadowrun6e'], suggest: 'shadowrun6e' },
  { term: 'technomancer', presentIn: ['shadowrun6e'], suggest: 'shadowrun6e' },
  { term: 'nuyen', presentIn: ['shadowrun6e'], suggest: 'shadowrun6e' },
  { term: 'metatype', presentIn: ['shadowrun6e'], suggest: 'shadowrun6e' },
];

/** Word-boundary-ish containment (handles punctuation, avoids matching inside longer words). */
function mentions(haystack: string, needle: string): boolean {
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, 'i').test(haystack);
}

/**
 * The FOCUSED system's own proper nouns — its classes, ancestries, conditions, feats and skills.
 * Only NAMES (never prose), because the prose deliberately discusses other systems in order to
 * warn against them. A question that only names things the focused system has is fine.
 */
function focusedNames(system: CharacterSystem): string[] {
  const r = rulesForSystem(system);
  if (!r) return [];
  return [
    ...r.content.classes.map((c) => c.name),
    ...(r.content.classNames ?? []),
    ...r.content.species,
    ...r.content.conditions,
    ...r.content.sampleFeats,
    ...r.content.skills.map((s) => s.name),
  ].map((s) => s.toLowerCase());
}

/**
 * Does `question` look like it's about a system other than `focused`?
 * Returns the best hint, or null when the question fits the focused system fine.
 */
export function detectOtherSystem(question: string, focused: CharacterSystem): SystemHint | null {
  const q = (question || '').trim().toLowerCase();
  if (!q) return null;

  const known = new Set(GAME_SYSTEMS.map((s) => s.key));
  const nameOf = (k: string) => GAME_SYSTEMS.find((s) => s.key === k)?.name ?? k;

  // 1. An explicit name for another system always wins — it's unambiguous intent.
  for (const [key, aliases] of Object.entries(ALIASES)) {
    if (key === focused || !known.has(key)) continue;
    for (const a of aliases) {
      if (mentions(q, a)) return { key, name: nameOf(key), matched: a, reason: 'named' };
    }
  }

  // If the chat isn't focused anywhere, a signature mechanic isn't "wrong" — nothing to warn about.
  if (focused === SYSTEM_AMBIGUOUS || !rulesForSystem(focused)) return null;

  // 2. A mechanic the focused system does not have. Longest terms first, so "sanity check"
  //    reports before "sanity" and "base attack bonus" before "bab".
  const names = focusedNames(focused);
  const byLength = [...MECHANICS].sort((a, b) => b.term.length - a.term.length);

  for (const m of byLength) {
    if (m.presentIn.includes(focused)) continue;      // the focused system HAS this — fine
    if (names.includes(m.term)) continue;             // it's one of the focused system's own names
    if (m.suggest === focused || !known.has(m.suggest)) continue;
    if (!mentions(q, m.term)) continue;
    return { key: m.suggest, name: nameOf(m.suggest), matched: m.term, reason: 'mechanic' };
  }
  return null;
}

/**
 * The instruction appended to the chat's system prompt when a hint fires. The chat still ANSWERS
 * from the focused system (saying plainly if the concept doesn't exist there) and then asks the
 * one clarifying question — it never refuses or silently switches systems.
 */
export function crossSystemInstruction(hint: SystemHint, focusedLabel: string): string {
  const why =
    hint.reason === 'named'
      ? `they explicitly mentioned "${hint.matched}"`
      : `"${hint.matched}" is a signature mechanic of ${hint.name} and does not exist in ${focusedLabel}`;
  return [
    `POSSIBLE SYSTEM MISMATCH: this chat is focused on ${focusedLabel}, but the question looks like it may be about ${hint.name} — ${why}.`,
    `Do BOTH of the following, in this order:`,
    `1. Answer as best you can for ${focusedLabel}. If ${focusedLabel} genuinely has no such rule or concept, say so plainly in one sentence, and give the closest ${focusedLabel} equivalent if there is one. Never invent a ${focusedLabel} rule to fill the gap, and never answer using ${hint.name}'s rules.`,
    `2. End with ONE short question asking whether they meant ${hint.name}, and mention they can switch the chat's system focus to get answers grounded in it.`,
  ].join('\n');
}
