// lib/dnd/roll-stats.ts — what the roll log says about a table (P3-3).
//
// P3-1 made every sheet roll reach `dnd_roll_log`. This reads it back. No migration and no new capture: the
// table already carries `actor_name`, `result`, `breakdown`, `crit`, `fumble`, `session_id` and
// `created_at`, which is exactly the "falls out of P3-1 for almost nothing" the slice predicted.
//
// THE ONE STATISTIC THAT IS EASY TO GET WRONG is "average d20". `result` is the TOTAL — after ability
// modifiers, proficiency, bless, guidance and whatever else. Averaging it produces a number that rises when
// a character levels up and says nothing whatsoever about luck. The natural die face is a different thing,
// and it lives in the breakdown, which the roller writes as `1d20[14] + 7`.
//
// So: the face is PARSED where it can be, counted where it cannot, and `averageD20` is **null** rather than
// a guess when there is nothing to average. A luck statistic that quietly averages totals is worse than no
// luck statistic, because it looks right.

export interface RollRow {
  actor_name?: string | null;
  result?: number | null;
  breakdown?: string | null;
  formula?: string | null;
  crit?: boolean | null;
  fumble?: boolean | null;
  session_id?: string | null;
  created_at?: string | null;
}

export interface ActorStats {
  actor: string;
  rolls: number;
  /** d20 rolls whose natural face we could actually read. The denominator for `averageD20`. */
  d20Rolls: number;
  nat20s: number;
  nat1s: number;
  /** Mean NATURAL d20 face, or null when no face could be read. Never a mean of totals. */
  averageD20: number | null;
}

/**
 * The natural d20 face from a breakdown, or null.
 *
 * `rollFeedBuild.ts` and `lib/dice.ts` emit TWO shapes, and handling only the first is a bug I shipped in
 * the first draft of this file:
 *   · `d20[14] + 7`      — a straight roll; the face is in the bracket.
 *   · `d20[7,18]→18 + 3` — advantage/disadvantage; the bracket holds BOTH dice and the arrow holds the
 *                          KEPT one, which is the roll that actually happened.
 *
 * A regex requiring `]` straight after the digits matches only the first, so every advantage roll would be
 * silently dropped from the average. At most tables a large share of attacks are made with advantage, so
 * that is not a rounding error — it is a biased sample that still renders a confident-looking number.
 *
 * The `→kept` group is preferred when present; otherwise the single bracketed face. Anything else (damage,
 * an IRL-recorded roll, a mixed pool) returns null and is not counted rather than folded in.
 */
export function naturalD20(breakdown: string | null | undefined): number | null {
  // Same shape SigilStack parses, deliberately: one format, one reading of it.
  const m = /d20\[([^\]]*)\](?:→(\d+))?/i.exec(breakdown ?? '');
  if (!m) return null;
  const kept = m[2] ?? m[1];
  // The bracket of an adv/dis roll holds a pair; without a `→kept` we cannot say which was used, so we
  // decline rather than picking one.
  if (!/^\d+$/.test((kept ?? '').trim())) return null;
  const n = Number(kept);
  // A face outside 1–20 means the breakdown is not what we think it is; discarding beats trusting it.
  return n >= 1 && n <= 20 ? n : null;
}

/**
 * Was this a d20 roll at all? Used so `crit`/`fumble` are only counted where they mean nat-20/nat-1.
 *
 * NOT `\bd20\b`. There is no word boundary between the `1` and the `d` in `1d20`, so that pattern misses
 * every roll whose formula is written with an explicit count — which is how a DM-typed roll arrives.
 * `dieShape.ts` documents the same trap for the same reason; this is the second time it has bitten.
 * The trailing `(?![0-9])` is what still keeps `d200` out.
 */
export function isD20Roll(row: RollRow): boolean {
  return /d20(?![0-9])/i.test(`${row.breakdown ?? ''} ${row.formula ?? ''}`);
}

const nameOf = (row: RollRow) => (row.actor_name ?? '').trim() || 'Unknown';

/**
 * Per-actor statistics.
 *
 * `crit` and `fumble` are the authoritative flags — the sheet set them when the die landed, so they beat
 * re-deriving from the face. But they are counted ONLY on d20 rolls: a critical hit's *damage* roll also
 * carries `crit`, and counting it would report two nat-20s for one lucky attack.
 */
export function actorStats(rows: readonly RollRow[]): ActorStats[] {
  const by = new Map<string, { rolls: number; d20Rolls: number; nat20s: number; nat1s: number; faceSum: number; faceCount: number }>();

  for (const row of rows ?? []) {
    const key = nameOf(row);
    const acc = by.get(key) ?? { rolls: 0, d20Rolls: 0, nat20s: 0, nat1s: 0, faceSum: 0, faceCount: 0 };
    acc.rolls += 1;

    if (isD20Roll(row)) {
      acc.d20Rolls += 1;
      if (row.crit) acc.nat20s += 1;
      if (row.fumble) acc.nat1s += 1;
      const face = naturalD20(row.breakdown);
      if (face != null) { acc.faceSum += face; acc.faceCount += 1; }
    }
    by.set(key, acc);
  }

  return [...by.entries()]
    .map(([actor, a]) => ({
      actor,
      rolls: a.rolls,
      d20Rolls: a.d20Rolls,
      nat20s: a.nat20s,
      nat1s: a.nat1s,
      averageD20: a.faceCount ? Math.round((a.faceSum / a.faceCount) * 10) / 10 : null,
    }))
    // Most rolls first, then alphabetically — a stable order, so the panel does not reshuffle on every load.
    .sort((x, y) => y.rolls - x.rolls || x.actor.localeCompare(y.actor));
}

export interface SessionLuck {
  sessionId: string;
  rolls: number;
  nat20s: number;
  nat1s: number;
  /** nat-20s minus nat-1s. Simple on purpose — see below. */
  swing: number;
}

/**
 * The luckiest session, by nat-20s minus nat-1s.
 *
 * Deliberately NOT normalised by roll count. A "luck rate" would crown a session with one lucky roll over a
 * whole evening of them, which is not what anyone means by "our luckiest session" — the memorable one is
 * the night the dice kept coming up 20, and that is a count. A minimum of 5 d20 rolls keeps a stray
 * two-roll session from winning on a technicality.
 */
export function luckiestSession(rows: readonly RollRow[], minRolls = 5): SessionLuck | null {
  const by = new Map<string, SessionLuck>();
  for (const row of rows ?? []) {
    const id = (row.session_id ?? '').trim();
    if (!id || !isD20Roll(row)) continue;
    const acc = by.get(id) ?? { sessionId: id, rolls: 0, nat20s: 0, nat1s: 0, swing: 0 };
    acc.rolls += 1;
    if (row.crit) acc.nat20s += 1;
    if (row.fumble) acc.nat1s += 1;
    acc.swing = acc.nat20s - acc.nat1s;
    by.set(id, acc);
  }
  const eligible = [...by.values()].filter((s) => s.rolls >= minRolls);
  if (!eligible.length) return null;
  return eligible.sort((a, b) => b.swing - a.swing || b.rolls - a.rolls)[0];
}

export interface TableStats {
  totalRolls: number;
  d20Rolls: number;
  nat20s: number;
  nat1s: number;
  /** Table-wide mean natural d20, or null. */
  averageD20: number | null;
  actors: ActorStats[];
  luckiest: SessionLuck | null;
}

/** Everything a stats panel needs, in one pass-friendly shape. */
export function tableStats(rows: readonly RollRow[]): TableStats {
  const actors = actorStats(rows);
  const d20Rolls = actors.reduce((n, a) => n + a.d20Rolls, 0);
  // Weight each actor's mean by how many faces it came from, so the table average is the true mean of all
  // faces rather than a mean of means — which would let a player with three rolls sway it as much as one
  // with three hundred.
  let faceSum = 0;
  let faceCount = 0;
  for (const row of rows ?? []) {
    const face = naturalD20(row.breakdown);
    if (face != null) { faceSum += face; faceCount += 1; }
  }
  return {
    totalRolls: (rows ?? []).length,
    d20Rolls,
    nat20s: actors.reduce((n, a) => n + a.nat20s, 0),
    nat1s: actors.reduce((n, a) => n + a.nat1s, 0),
    averageD20: faceCount ? Math.round((faceSum / faceCount) * 10) / 10 : null,
    actors,
    luckiest: luckiestSession(rows),
  };
}
