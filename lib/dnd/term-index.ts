// lib/dnd/term-index.ts — every term in the library that can be clicked and explained.
//
// S3 of DND_2024_COMPLETE_LIBRARY_2026-07-20 (owner 2026-07-20): "if there are any words in a
// stat block or rule set that contain the name of a feat, class, ability, skill, condition,
// spell, effect, mechanic, damage type, weapon — we need to be able to click on it and see the
// full info", via a short tooltip with a Read-more link to the full entry.
//
// THE ABBREVIATIONS ARE DERIVED, NOT HAND-WRITTEN. Hand-authoring a blurb for several hundred
// terms would be a large pile of prose that immediately drifts from the content it summarises.
// Every `short` here projects from text the entry already carries — the glossary's own `short`,
// a condition's `note`, a spell's `summary`, a feat's benefit — truncated on a sentence
// boundary. Same rule as the tag vocabulary: if it can't be derived, it doesn't belong here.
//
// Matching rules that matter (see `buildTermMatcher`):
//   • Longest term first, so "Magic Missile" wins over "Magic".
//   • Whole words only, so "action" doesn't light up inside "reaction".
//   • A term never links to itself — a spell's own description shouldn't link its own name.

import { CONDITION_MECHANICS_5E } from './conditions/dnd5e';
import { spellsForSystem } from './spells';
import { SPELL_MECHANICS } from './spells/mechanics';
import { COMPANION_RULE_SETS } from './companions/dnd5e-2024';
import { glossaryFor } from './glossary';
import { FEATS_2024 } from './feats/dnd5e-2024';
import { RULES_2024 } from './mechanics/dnd5e-2024';

export type TermKind =
  | 'condition' | 'damage' | 'spell' | 'feat' | 'mechanic' | 'glossary' | 'companion';

export interface LibraryTerm {
  /** The word or phrase as it appears in text. */
  term: string;
  kind: TermKind;
  /** A short, self-contained explanation — one or two sentences. */
  short: string;
  /** Where "Read more" goes. */
  href: string;
  /** Alternate spellings that should also match (plurals, shorthand). */
  aliases?: string[];
}

/** Trim to a whole sentence under `max` chars, so a tooltip never ends mid-clause. */
export function abbreviate(text: string, max = 220): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return lastStop > max * 0.4 ? cut.slice(0, lastStop + 1) : `${cut.trimEnd()}…`;
}

// ── Damage types ────────────────────────────────────────────────────────────
// The one category with no existing entry to project from: damage types are referenced
// constantly but never defined anywhere in the library. Short, mechanical, paraphrased.
export const DAMAGE_TYPES: { term: string; short: string }[] = [
  { term: 'acid', short: 'Corrosive damage that eats through material — from black dragon breath, oozes, and corrosive vials.' },
  { term: 'bludgeoning', short: 'Blunt-force damage from hammers, falling, and constriction. One of the three physical damage types.' },
  { term: 'cold', short: 'Freezing damage. Creatures native to cold environments often resist it; it can slow or freeze liquids.' },
  { term: 'fire', short: 'Burning damage. The most commonly resisted type in the game, and it ignites unattended flammable objects.' },
  { term: 'force', short: 'Pure magical energy. Almost nothing resists force damage, which is why it is the most reliable damage in the game.' },
  { term: 'lightning', short: 'Electrical damage, often in a line. Conducts through metal armour and water.' },
  { term: 'necrotic', short: 'Withering life-force damage. It commonly prevents healing, and undead are typically immune.' },
  { term: 'piercing', short: 'Puncturing damage from arrows, spears, and bites. One of the three physical damage types.' },
  { term: 'poison', short: 'Toxic damage, frequently paired with the Poisoned condition. Very widely resisted — constructs and undead are usually immune.' },
  { term: 'psychic', short: 'Damage to the mind itself. Rarely resisted, but mindless creatures are often immune.' },
  { term: 'radiant', short: 'Searing divine or solar light. Undead and fiends are usually vulnerable to it.' },
  { term: 'slashing', short: 'Cutting damage from swords and claws. One of the three physical damage types.' },
  { term: 'thunder', short: 'Concussive sound damage. It is audible far beyond its area, so it is a poor choice when staying quiet matters.' },
];

// ── Build the index ─────────────────────────────────────────────────────────

/** Every linkable term for a system, derived from that system's own content. */
export function termIndexFor(system: string): LibraryTerm[] {
  const out: LibraryTerm[] = [];
  const lib = `/dnd/library/${system}`;
  // Conditions and damage types are 5e's, not universal — an unknown or non-5e system must not
  // inherit them. (Caught by test: the first version pushed both unconditionally, so
  // `termIndexFor('nonsense')` handed back the 5e condition list.)
  const is5e = system === 'dnd5e-2024' || system === 'dnd5e-2014';

  // Conditions — the note IS the rules text, so it abbreviates cleanly.
  if (is5e) for (const c of CONDITION_MECHANICS_5E) {
    out.push({
      term: c.name,
      kind: 'condition',
      short: abbreviate(c.note || `${c.name} — see the conditions section.`),
      href: `${lib}#conditions`,
    });
  }

  // Damage types, including their adjective forms as they appear in text.
  if (is5e) for (const d of DAMAGE_TYPES) {
    out.push({
      term: d.term,
      kind: 'damage',
      short: d.short,
      href: `${lib}#glossary`,
      aliases: [`${d.term} damage`],
    });
  }

  // Spells — the summary is already a paraphrased one-liner.
  for (const s of spellsForSystem(system)) {
    out.push({
      term: s.name,
      kind: 'spell',
      short: abbreviate(`${s.level === 0 ? 'Cantrip' : `Level ${s.level}`} ${s.school}. ${s.summary}`),
      href: `${lib}#spells`,
    });
  }

  // Glossary — it already carries a purpose-written `short`, so use it verbatim.
  for (const g of glossaryFor(system)) {
    out.push({
      term: g.term,
      kind: 'glossary',
      short: abbreviate(g.short || g.body),
      href: `${lib}#term-${g.term.replace(/\s+/g, '-').toLowerCase()}`,
      aliases: g.aliases,
    });
  }

  if (system === 'dnd5e-2024') {
    for (const f of FEATS_2024) {
      out.push({ term: f.name, kind: 'feat', short: abbreviate(f.benefit), href: `${lib}#feats` });
    }
    for (const m of SPELL_MECHANICS) {
      out.push({ term: m.title, kind: 'mechanic', short: abbreviate(m.rule), href: `${lib}#spells` });
    }
    for (const c of COMPANION_RULE_SETS) {
      out.push({ term: c.name, kind: 'companion', short: abbreviate(c.rules[0] ?? c.grantedBy), href: `${lib}#classes` });
    }
    // Core rules — cover, surprise, death saves, the action list. These are the terms that
    // appear constantly inside other entries' text ("gains the Prone condition", "takes the
    // Dash action") and previously had nothing to click through to.
    for (const r of RULES_2024) {
      out.push({ term: r.name, kind: 'mechanic', short: abbreviate(r.rule), href: `${lib}#overview` });
    }
  }

  // De-duplicate by lowercased term. First writer wins, and the order above is deliberate:
  // conditions and damage types outrank a same-named spell, because in a sentence like
  // "the target is Frightened" the reader means the condition.
  const seen = new Set<string>();
  return out.filter((t) => {
    const k = t.term.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ── Matching text against the index ─────────────────────────────────────────

export interface TermMatch {
  /** The exact text matched, with its original casing preserved. */
  text: string;
  term: LibraryTerm;
  start: number;
  end: number;
}

/** Escape a term for safe use inside a RegExp. */
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Find every linkable term in a block of text.
 *
 *  `selfTerm` suppresses self-linking: a spell's own description should not turn its own name
 *  into a link back to itself. Matches never overlap — the longest one at a position wins, so
 *  "Magic Missile" is one link rather than "Magic" plus stray text. */
export function findTerms(text: string, index: LibraryTerm[], selfTerm?: string): TermMatch[] {
  if (!text) return [];
  const self = selfTerm?.trim().toLowerCase();

  // Longest first so multi-word terms beat their own prefixes.
  const candidates = index
    .flatMap((t) => [{ phrase: t.term, term: t }, ...(t.aliases ?? []).map((a) => ({ phrase: a, term: t }))])
    .filter((c) => c.phrase && c.phrase.length > 2 && c.term.term.trim().toLowerCase() !== self)
    .sort((a, b) => b.phrase.length - a.phrase.length);

  const matches: TermMatch[] = [];
  const taken: boolean[] = new Array(text.length).fill(false);

  for (const c of candidates) {
    // \b…\b keeps "action" out of "reaction"; 'gi' finds every occurrence.
    const re = new RegExp(`\\b${esc(c.phrase)}\\b`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      // Skip anything overlapping a longer match already claimed.
      let free = true;
      for (let i = start; i < end; i++) if (taken[i]) { free = false; break; }
      if (!free) continue;
      for (let i = start; i < end; i++) taken[i] = true;
      matches.push({ text: m[0], term: c.term, start, end });
    }
  }

  return matches.sort((a, b) => a.start - b.start);
}

/** Split text into plain and linked segments, ready to render. */
export interface Segment { text: string; term?: LibraryTerm }

export function segmentText(text: string, index: LibraryTerm[], selfTerm?: string): Segment[] {
  const matches = findTerms(text, index, selfTerm);
  if (!matches.length) return [{ text }];
  const out: Segment[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start > cursor) out.push({ text: text.slice(cursor, m.start) });
    out.push({ text: m.text, term: m.term });
    cursor = m.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor) });
  return out;
}
