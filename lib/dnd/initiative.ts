// lib/dnd/initiative.ts — initiative order + turn-advance math (Phase G4). Pure so
// the API and the tracker UI (G5) share one source of truth and it's unit-tested.

export interface OrderableEntry {
  initiative: number | null;
  sort_order: number;
}

/** Turn order: highest initiative first; ties broken by sort_order (add order). */
export function orderEntries<T extends OrderableEntry>(entries: T[]): T[] {
  return [...entries].sort(
    (a, b) => (b.initiative ?? -Infinity) - (a.initiative ?? -Infinity) || a.sort_order - b.sort_order,
  );
}

/**
 * Advance the turn cursor. Wrapping forward past the last combatant starts the next
 * round; wrapping backward before the first goes to the previous round (min 1).
 */
export function advanceTurn(
  count: number,
  index: number,
  round: number,
  dir: 'next' | 'prev',
): { index: number; round: number } {
  if (count <= 0) return { index: 0, round };
  if (dir === 'next') {
    const next = index + 1;
    return next >= count ? { index: 0, round: round + 1 } : { index: next, round };
  }
  const prev = index - 1;
  return prev < 0 ? { index: count - 1, round: Math.max(1, round - 1) } : { index: prev, round };
}
