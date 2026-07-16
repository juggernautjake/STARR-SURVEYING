// lib/dnd/glossary/types.ts — the shape of a fully-explained rules term.
//
// The catalog in system-rules.ts carries each system's mechanical SKELETON (what the core roll is,
// what the classes are, the names of the conditions). That's enough to ground an AI build, but it
// is not enough to LOOK SOMETHING UP: "Blinded" as a bare name tells a player nothing.
//
// A GlossaryEntry is the readable article behind a name: what it is, what it actually does, and the
// edge cases people argue about. One per term, per system — never shared across systems, because
// the same word means different things in different games (a Blades "score" is not a D&D score, and
// PF2's Frightened is numeric where 5e's is binary).
export type GlossaryKind =
  | 'condition'
  | 'mechanic'   // core resolution, advantage, degrees of success, stress…
  | 'action'     // what you can do on a turn
  | 'term'       // vocabulary: AC, DC, initiative, Sanity…
  | 'class'      // a class/playbook/role's actual identity
  | 'feature'    // a notable class/species feature
  | 'stat';      // an attribute and what it governs

export interface GlossaryEntry {
  /** The canonical term, exactly as the rulebook writes it (e.g. "Off-Guard", not "off guard"). */
  term: string;
  kind: GlossaryKind;
  /** One sentence: what it IS. Shown as the search-result summary. */
  short: string;
  /**
   * The full explanation — what it does mechanically, with the real numbers. Markdown-lite:
   * **bold** for rule names, and lines starting with "· " for bullets. Several short paragraphs
   * separated by \n\n. This is what a player reads when they look the term up mid-session.
   */
  body: string;
  /** Other terms in the SAME system worth reading next. */
  seeAlso?: string[];
  /** Synonyms/abbreviations people actually type into search (e.g. "AC", "flat-footed"). */
  aliases?: string[];
}

/** A system's glossary: every term it defines, keyed by nothing — order is the reading order. */
export type SystemGlossary = GlossaryEntry[];
