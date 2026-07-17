// death-save.ts — the pure state transition for a single death saving throw (5e; identical in 2014 and
// 2024). Extracted from the store's rollDeathSave so this life-or-death rule is unit-testable and stated
// ONCE: the roll's log label and the tracked success/failure counts came from two separate copies of the
// same branch logic inline, which could silently drift. Pure + Expo/React-free, like derive-ac.
//
// The rules (RAW): a death save is a d20 vs DC 10 with no ability modifier (feats/effects may add a flat
// bonus, and 2024 exhaustion subtracts — the CALLER folds those into `total`; `natural` is the raw die).
//   • natural 20 → regain 1 HP and wake: both tracks reset, HP back to at least 1.
//   • natural 1  → TWO failures.
//   • total ≥ 10 → one success.
//   • total < 10 → one failure.
// Success/failure counts are capped at 3 (3 successes = stable, 3 failures = dead — the caller/UI reads
// the capped counts to decide those states).

export interface DeathSaveState {
  deathSuccess: number;
  deathFail: number;
  currentHp: number;
}

export interface DeathSaveResult extends DeathSaveState {
  /** Human-readable outcome for the roll log. */
  label: string;
}

/** Apply one death saving throw to the current tracks. `natural` is the raw d20; `total` is that die plus
 *  any folded bonus/penalty (the caller compares it to DC 10). Returns the new tracks + a log label. */
export function applyDeathSave(cur: DeathSaveState, natural: number, total: number): DeathSaveResult {
  if (natural === 20) {
    // Regain 1 HP and wake — both death-save tracks clear.
    return { deathSuccess: 0, deathFail: 0, currentHp: Math.max(1, cur.currentHp), label: 'NAT 20 — regain 1 HP!' };
  }
  if (natural === 1) {
    return { ...cur, deathFail: Math.min(3, cur.deathFail + 2), label: 'NAT 1 — two failures' };
  }
  if (total >= 10) {
    return { ...cur, deathSuccess: Math.min(3, cur.deathSuccess + 1), label: 'Success' };
  }
  return { ...cur, deathFail: Math.min(3, cur.deathFail + 1), label: 'Failure' };
}
