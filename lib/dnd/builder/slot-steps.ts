// lib/dnd/builder/slot-steps.ts — the outstanding-choice list as a list of SCREENS (P5-7b).
//
// All three level walkers (`LevelBuilder`, `PF2LevelBuilder`, `IGLevelBuilder`) already fetch a plan whose
// `outstanding` array is exactly "one entry per choice this character still owes". All three then rendered
// `outstanding[0]` and nothing else, which had two costs:
//
//   · The player could not SEE the shape of what was left. "3 choices left" is a number; it does not say
//     that two of them are level-4 and one is the subclass you have been putting off.
//   · The player could not REACH any of them but the first. If you were undecided about your subclass you
//     could not skip ahead and record the ASI you had already decided — the whole level stalled behind one
//     choice, even though nothing about the rules requires that order.
//
// The order is not load-bearing and never was. The server records a choice by its own `(level, kind)` and
// recomputes `outstanding` from what is stored; no route asks whether a choice is the first one owed. The
// invariant that IS load-bearing — you cannot COMMIT a level while anything is outstanding — lives on the
// commit path (`plan.ready`) and is untouched by letting the player answer in the order they like.
//
// This module is the pure half: plan → screens, and screen-selection that survives the list changing under
// it. It knows no mechanic and no system; it takes `{ level, kind, label }` and gives back screens, which
// is why one copy serves 5e, PF2 and IG.

/** The shape every system's outstanding choice already has. Deliberately structural rather than a union of
 *  the three systems' types: this module must not learn what a `boosts` or a `subclass-power` is. */
export interface SlotChoiceLike {
  level: number;
  kind: string;
  label: string;
  /** PF2 only — two feat slots at one level differ by track, so the id has to carry it. */
  track?: string;
}

export interface SlotStep {
  /** Stable across refetches: derived from what identifies the choice, never from array position. An
   *  index-based id would silently re-point at a different choice the moment one is answered. */
  id: string;
  level: number;
  kind: string;
  /** The plan's own label, unchanged. */
  label: string;
  /** The label with a trailing "— level N" removed, because the chip prints the level itself. 5e appends
   *  it (`Ability Score Improvement or feat — level 4`); PF2 and IG do not. Stripping rather than asking
   *  each system to change its label keeps the three plans as they are. */
  short: string;
  /** 1-based, for "Choice 2 of 5". */
  position: number;
}

/** The identity of a choice, as a string. `track` is included because PF2 can owe a class feat AND a skill
 *  feat at the same level, and those are two screens rather than one. */
export function slotStepId(c: SlotChoiceLike): string {
  return `L${c.level}:${c.kind}${c.track ? `:${c.track}` : ''}`;
}

const LEVEL_SUFFIX = /\s*[—–-]\s*level\s+\d+\s*$/i;

/** Strip the "— level N" a label may end with. */
export function shortSlotLabel(label: string): string {
  return label.replace(LEVEL_SUFFIX, '').trim() || label;
}

/**
 * One screen per outstanding choice, in the plan's own order.
 *
 * Duplicate identities get a `#2`, `#3` suffix rather than a shared id. Nothing in the three current plans
 * is known to emit two identical `(level, kind, track)` triples, but if one ever does, two screens sharing
 * an id would make the second unreachable and make "answer this one" ambiguous — a silent wrong screen is
 * the worst failure available here, so the collision is handled rather than assumed away.
 */
export function slotSteps(outstanding: readonly SlotChoiceLike[] | null | undefined): SlotStep[] {
  const seen = new Map<string, number>();
  return (outstanding ?? []).map((c, i) => {
    const base = slotStepId(c);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return {
      id: n === 1 ? base : `${base}#${n}`,
      level: c.level,
      kind: c.kind,
      label: c.label,
      short: shortSlotLabel(c.label),
      position: i + 1,
    };
  });
}

/**
 * Which screen to show, given what the player last asked for.
 *
 * This is the whole reason the module exists rather than a `useState<number>` in each walker. The list
 * SHRINKS as choices are answered: answer the screen you are looking at and its id stops existing. Falling
 * back to the first remaining screen is right — it is what the walkers did before there was any selection
 * at all, so answering a choice still advances you — and a `null` focus (nothing chosen yet) lands there
 * too, which keeps the default behaviour identical to the previous one-screen walker.
 */
export function resolveSlotFocus(steps: readonly SlotStep[], focusId: string | null | undefined): SlotStep | null {
  if (!steps.length) return null;
  return steps.find((s) => s.id === focusId) ?? steps[0];
}

/** Neighbours of the active screen, for Back/Next. `null` at either end rather than wrapping: a wrap makes
 *  "Next" from the last screen look like progress when it is a return to the start. */
export function slotStepNav(
  steps: readonly SlotStep[],
  focusId: string | null | undefined,
): { prev: SlotStep | null; next: SlotStep | null; position: number; total: number } {
  const active = resolveSlotFocus(steps, focusId);
  const i = active ? steps.findIndex((s) => s.id === active.id) : -1;
  return {
    prev: i > 0 ? steps[i - 1] : null,
    next: i >= 0 && i < steps.length - 1 ? steps[i + 1] : null,
    position: i + 1,
    total: steps.length,
  };
}

/** The steps grouped by level, first-seen order preserved — so the strip reads "Level 1 · … / Level 4 · …"
 *  and a player can see that three of their five outstanding choices all belong to one level. */
export function slotStepsByLevel(steps: readonly SlotStep[]): { level: number; steps: SlotStep[] }[] {
  const order: number[] = [];
  const byLevel = new Map<number, SlotStep[]>();
  for (const s of steps) {
    if (!byLevel.has(s.level)) { byLevel.set(s.level, []); order.push(s.level); }
    byLevel.get(s.level)!.push(s);
  }
  return order.map((level) => ({ level, steps: byLevel.get(level)! }));
}
