// lib/dnd/xp-award.ts — awarding XP to a whole party (P3-4b).
//
// P3-4 gave each character an XP value and a progress bar. This is the DM-facing half: "the party gets 450
// XP" as one action rather than eight edits.
//
// THE PROBLEM THAT MAKES THIS MORE THAN A LOOP is that a table can be mixed, and the systems do not agree
// on what XP even IS:
//   · **5e (both editions)** — cumulative thresholds; 450 XP moves you along a curve.
//   · **Pathfinder 2e** — a flat 1000 per level, and PF2 resets XP to 0 at each level-up rather than
//     accumulating. Both are handled by `levelForXp`, which owns the arithmetic.
//   · **Intuitive Games** — **milestone**. No XP table has been sourced (`xp.ts` says so plainly), so there
//     is no number to add. Awarding XP to an IG character would write a value nothing reads and no rule
//     interprets.
//
// So this plans the award BEFORE anything is written, and reports per character what will happen — including
// "nothing, and here is why". Silently skipping the IG characters would leave a DM believing the whole party
// was awarded; silently writing XP to them would be worse, because the number would look real.
import { levelForXp, normalizeXp, xpProgress, xpRulesFor, type XpModel } from './xp';
import { normalizeSystem, type CharacterSystem } from './systems';

export interface AwardTarget {
  id: string;
  name: string;
  system: CharacterSystem | string | null | undefined;
  /** Current XP, from `data.meta.xp`. */
  xp?: number | null;
  /** Current level, for reporting a level-up. */
  level?: number | null;
}

export interface AwardOutcome {
  id: string;
  name: string;
  model: XpModel;
  /** False when this character cannot take an XP award at all — see `reason`. */
  applied: boolean;
  /** Why nothing happened. Present only when `applied` is false. */
  reason?: string;
  xpBefore: number;
  xpAfter: number;
  levelBefore: number;
  levelAfter: number;
  /** True when the award crosses a threshold — what the DM actually wants to know. */
  leveledUp: boolean;
}

export interface AwardPlan {
  amount: number;
  outcomes: AwardOutcome[];
  /** Characters that will actually change. */
  awarded: number;
  /** Characters that cannot take XP (milestone systems). */
  skipped: number;
  levelUps: AwardOutcome[];
}

/**
 * Work out what an award would do, without doing it.
 *
 * Pure, so the route can show a DM the consequences and the tests can assert them without a database. The
 * `amount` may be negative — a DM correcting an over-award is a real thing, and XP floors at 0 rather than
 * going negative.
 */
export function planAward(targets: readonly AwardTarget[], amount: number): AwardPlan {
  const delta = Math.round(Number(amount) || 0);
  const outcomes: AwardOutcome[] = (targets ?? []).map((t) => {
    const system = normalizeSystem(t.system);
    const rules = xpRulesFor(system);
    const xpBefore = normalizeXp(t.xp);
    const levelBefore = Math.max(1, Math.round(Number(t.level) || 1));

    if (rules.model === 'milestone') {
      // Not an error and not a silent skip. The DM is told, per character, that this system does not use
      // XP — which is also the answer to "why didn't Kesh's bar move?".
      return {
        id: t.id, name: t.name, model: rules.model, applied: false,
        reason: rules.note,
        xpBefore, xpAfter: xpBefore, levelBefore, levelAfter: levelBefore, leveledUp: false,
      };
    }

    const xpAfter = normalizeXp(xpBefore + delta);
    const levelAfter = levelForXp(system, xpAfter);
    return {
      id: t.id, name: t.name, model: rules.model, applied: true,
      xpBefore, xpAfter, levelBefore,
      levelAfter,
      // Compared against the level the XP implied BEFORE, not against the stored level: a character whose
      // stored level is behind their XP (levelled by hand, or awarded before P3-4 existed) would otherwise
      // report a level-up they already had.
      leveledUp: levelAfter > levelForXp(system, xpBefore),
    };
  });

  return {
    amount: delta,
    outcomes,
    awarded: outcomes.filter((o) => o.applied).length,
    skipped: outcomes.filter((o) => !o.applied).length,
    levelUps: outcomes.filter((o) => o.leveledUp),
  };
}

/**
 * A one-line summary for the DM.
 *
 * Names the skipped characters rather than counting them: "2 skipped" invites the question this sentence
 * should already have answered.
 */
export function summarizeAward(plan: AwardPlan): string {
  const parts: string[] = [];
  const verb = plan.amount < 0 ? 'Removed' : 'Awarded';
  parts.push(`${verb} ${Math.abs(plan.amount)} XP to ${plan.awarded} character${plan.awarded === 1 ? '' : 's'}.`);
  if (plan.levelUps.length) {
    parts.push(`${plan.levelUps.map((o) => o.name).join(', ')} levelled up.`);
  }
  if (plan.skipped) {
    const names = plan.outcomes.filter((o) => !o.applied).map((o) => o.name).join(', ');
    parts.push(`${names} ${plan.skipped === 1 ? 'levels' : 'level'} by milestone, so no XP was added.`);
  }
  return parts.join(' ');
}

/**
 * Progress for one character after an award — what the notification links to.
 *
 * Re-exported through here rather than having callers reach into `xp.ts` directly, so the award flow has a
 * single import and the two modules cannot drift on what "progress" means.
 */
export function progressAfter(outcome: AwardOutcome, system: CharacterSystem | string | null | undefined) {
  return xpProgress(normalizeSystem(system), outcome.xpAfter, outcome.levelAfter);
}
