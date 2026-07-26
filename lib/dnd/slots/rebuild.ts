// lib/dnd/slots/rebuild.ts — the parts of a Foundations rebuild that are the SAME in every system.
//
// S3 of the slot plan deferred "a shared slot vocabulary" with a good argument: 5e and PF2 each already had
// a working slot model, the two `builder-choices` modules were near-identical twins ON PURPOSE, and
// extracting before IG (S5) landed would have been abstraction ahead of evidence. Its own terms said to
// revisit once the third system showed what it actually needs.
//
// The third system landed, and then S6a/b/c added exception-stamping to all three — so the evidence now
// exists, and it is specific. These two behaviours ended up **byte-identical** in three files:
//   · indexing a build's accepted exceptions by name;
//   · the rebuild filter that decides which existing ledger rows survive.
// That is duplication I created, three times, while auditing this codebase for exactly that habit.
//
// WHAT IS DELIBERATELY NOT SHARED: the slot models themselves. `asiLevels` + `RecordedChoice`,
// `pf2LevelBreakdown` + tracks, and IG's scraped schedule are genuinely different shapes describing
// genuinely different rules, and the original deferral was right that flattening them would invent a
// vocabulary none of the three games uses. This extracts the mechanical overlap and nothing else.

/** How every picker in this repo compares a pick's name: case- and space-insensitively. */
export const normName = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Shape-only view of a recorded choice, so this stays free of all three ledger types. */
interface ChoiceLike { level: number; kind: string; exception?: unknown }

/** Index a build's accepted exceptions by normalized name, for stamping onto the slots they occupy. */
export function exceptionIndex<T extends { name: string }>(exceptions: readonly T[] | undefined): Map<string, T> {
  return new Map((exceptions ?? []).map((e) => [normName(e.name), e]));
}

/**
 * Which existing ledger rows survive a Foundations rebuild.
 *
 * A rebuild REPLACES the kinds it owns at the levels it covers — it is a rebuild, and it already replaces
 * its own features on the sheet for the same reason. Two exclusions make that safe:
 *
 *   · `other` is never "owned". All three builders emit that kind ONLY for an off-slot exception, so
 *     treating it as owned would silently delete anything else recorded at that kind — including a
 *     level walker's own rows.
 *   · but the builder's own `other` EXCEPTIONS are dropped, or rebuilding would stack a duplicate
 *     exception every time.
 *
 * Choices ABOVE the built level always survive: a player who walked to 12 and rebuilds the foundation at 8
 * keeps levels 9–12.
 */
export function keptOnRebuild<T extends ChoiceLike>(
  existing: readonly T[] | undefined,
  builder: readonly T[],
  builtLevel: number,
): T[] {
  const owned = new Set(builder.map((c) => c.kind).filter((k) => k !== 'other'));
  return (existing ?? []).filter((c) => {
    if (owned.has(c.kind) && c.level <= builtLevel) return false;
    if (c.kind === 'other' && c.exception && c.level <= builtLevel) return false;
    return true;
  });
}

/** The full merge: what survives, plus what this build produced, in level order. */
export function mergeOnRebuild<T extends ChoiceLike>(
  existing: readonly T[] | undefined,
  builder: readonly T[],
  builtLevel: number,
): T[] {
  return [...keptOnRebuild(existing, builder, builtLevel), ...builder].sort((a, b) => a.level - b.level);
}
