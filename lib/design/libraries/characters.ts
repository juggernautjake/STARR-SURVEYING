// lib/design/libraries/characters.ts — every emoji and symbol, ready to search.
//
// Slice C8 of docs/planning/completed/DESIGN_STUDIO_2026-08-23.md.
//
// Owner: *"Please make sure we have access to all emojis, text font, symbols, etc."*
//
// The data is generated, not typed: `scripts/generate-emoji-data.mjs` walks the emoji planes and
// keeps what the JavaScript runtime itself says is a real, assigned, colour emoji
// (`\p{Extended_Pictographic}` ∩ `\p{Assigned}`). Re-running it picks up whatever Unicode has added
// since. 1,112 emoji across nine groups, plus 229 symbols — arrows, maths, currency, typography,
// box drawing, and the survey marks (° ′ ″ ± Δ) that a generic picker never has.
//
// Search works on the sixty-odd characters this business actually reaches for ("calendar",
// "warning", "truck", "receipt"), and everything else stays browsable by group — which is how
// people find an emoji anyway.

import data from './emoji.json';

export interface CharacterGroup {
  id: string;
  label: string;
  chars: { c: string; k?: string[] }[];
}

export const EMOJI_GROUPS: CharacterGroup[] = data.emoji as CharacterGroup[];
export const SYMBOL_GROUPS: CharacterGroup[] = data.symbols as CharacterGroup[];
export const CHARACTER_COUNTS = data.counts as { emoji: number; symbols: number; named: number };

/**
 * Find characters by keyword.
 *
 * An empty query returns everything, grouped — because browsing is the normal way to pick an emoji
 * and a picker that demands a query before showing anything is a picker nobody uses.
 */
export function searchCharacters(groups: CharacterGroup[], query: string): CharacterGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;

  return groups
    .map((group) => ({
      ...group,
      chars: group.chars.filter((entry) => {
        // The character itself: pasting an emoji into the box should find it.
        if (entry.c === q) return true;
        if (entry.k?.some((k) => k.includes(q))) return true;
        // The group name, so "arrow" finds the arrows group and "food" the food one.
        return group.label.toLowerCase().includes(q) || group.id.includes(q);
      }),
    }))
    .filter((group) => group.chars.length > 0);
}
