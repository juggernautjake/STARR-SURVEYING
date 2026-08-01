// lib/dnd/maps/durations.ts — an area effect that stays on the map and runs out (M5-4).
//
// M5-4 shipped the conditions half and named this one as open: *"area effects persist on the map with
// their own duration — M5-3's templates are drawn from a URL and vanish on navigation. Persisting one
// needs a `dnd_map_objects` row with a duration and a turn counter to tick it, which is M5-5's territory
// and is better built once that exists than invented twice."*
//
// M5-5 exists, so this is that. And the note was right about the shape: the counter already exists, on
// `dnd_encounters.round`, and nothing here invents a second one.
//
// ── NOTHING TICKS. THE ROUND IS READ. ──────────────────────────────────────────────────────────────
//
// The obvious implementation is a decrementing `roundsLeft` that some next-turn handler counts down. It
// is wrong in three ways at once, and all three are quiet:
//
//   · A DM who rewinds the round (they do — "wait, we forgot Ana's turn") leaves every area stale, with
//     no way to tell which ones ticked and which did not.
//   · An area created while nobody is looking at the map never ticks at all.
//   · Two browsers open on the same encounter tick it twice.
//
// So an area stores the round it BEGAN on and how many rounds it lasts, and how much is left is
// arithmetic against the encounter's current round. Rewinding works, nothing runs in the background, and
// two readers cannot disagree — the same reason a token stores no HP and a spell area is parsed from the
// sheet rather than copied.
//
// Pure and total: no I/O, no clock.

export interface AreaDuration {
  /** The encounter round this area was placed on. */
  startRound: number;
  /** How many rounds it lasts. */
  rounds: number;
}

/** Read a duration off an object's `data`, or null when it carries none (an area with no clock). */
export function readDuration(data: unknown): AreaDuration | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const rounds = Number(d.durationRounds);
  const startRound = Number(d.startRound);
  // Both required. A duration with no start cannot be counted from, and rather than assuming round 1 —
  // which would expire a fresh area instantly in a round-9 fight — it is treated as no duration at all.
  if (!Number.isFinite(rounds) || rounds <= 0) return null;
  if (!Number.isFinite(startRound) || startRound < 0) return null;
  return { startRound, rounds };
}

/**
 * Rounds remaining, or null when this area has no duration.
 *
 * `null` for a live encounter's round means "no fight is running": an area then shows its FULL duration
 * rather than expiring, because a spell placed during exploration has not started counting down — and an
 * area that vanished the moment initiative ended would take the DM's prepared battlefield with it.
 */
export function roundsLeft(duration: AreaDuration | null, currentRound: number | null): number | null {
  if (!duration) return null;
  if (currentRound === null) return duration.rounds;
  const elapsed = currentRound - duration.startRound;
  // Elapsed is clamped at zero so a rewound round shows the full duration again rather than a negative
  // one — the DM has moved time backwards, and the honest answer is "it has not happened yet".
  return Math.max(0, duration.rounds - Math.max(0, elapsed));
}

/** Has it run out? Only ever true while an encounter is actually running. */
export function isExpired(duration: AreaDuration | null, currentRound: number | null): boolean {
  const left = roundsLeft(duration, currentRound);
  return left !== null && left <= 0;
}

/**
 * What the map says about it.
 *
 * An expired area is NOT hidden — it is labelled. A DM who placed a wall of fire needs to see that it
 * has gone out, and an area that silently disappeared would look like a bug or like something a player
 * dispelled. Removing it is a decision, and the object tools already do that in one press.
 */
export function describeDuration(duration: AreaDuration | null, currentRound: number | null): string | null {
  const left = roundsLeft(duration, currentRound);
  if (left === null) return null;
  if (left <= 0) return 'ended';
  return `${left} round${left === 1 ? '' : 's'} left`;
}
