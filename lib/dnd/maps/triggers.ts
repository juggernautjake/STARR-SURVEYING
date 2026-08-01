// lib/dnd/maps/triggers.ts — when → then, both data. M6-4 and M6-5.
//
// The plan: *"Composable, `once`-able, armable/disarmable, and **fully previewable by the DM** ('fire this
// now') — an untestable trigger is a trap for its author. This is the machinery behind 'really complex
// encounters and puzzles and challenges'."*
//
// And M6-5: *"Cycle detection and a depth cap on trigger chains, with the chain shown in the DM's log. A
// puzzle that infinite-loops must fail loudly, not hang the table."*
//
// ── THE ENGINE IS PURE, AND THAT IS THE WHOLE POINT ────────────────────────────────────────────────
//
// Nothing here reads a database or performs an effect. `resolve()` takes an event and a set of triggers
// and returns **a plan** — an ordered list of actions, plus the chain that produced them. The caller
// executes it, or shows it to a DM without executing it, and both use the same code.
//
// That is what makes "fire this now" honest. A preview built from a second, parallel code path is a
// preview of something other than what will happen, which is worse than no preview at all: the DM tests
// the puzzle, it works, and the real firing does something else.
//
// ── WHY A CYCLE IS FAILED LOUDLY RATHER THAN QUIETLY BROKEN ────────────────────────────────────────
//
// Trigger A fires B, B fires A. The obvious guard is "stop when you have seen it before", which silently
// produces half a puzzle: the DM sees the first two effects happen, the third not, and no reason given.
// So a cycle is REPORTED — it appears in the plan's `problems`, with the path that closed the loop, and
// the chain still returns whatever it safely resolved. A puzzle that fails must say which link failed.
//
// Pure and total: no I/O, no clock, no randomness.

/** The events a trigger can listen for. */
export type TriggerEventKind =
  | 'token_enters' | 'token_leaves'
  | 'object_discovered'
  | 'check_passed' | 'check_failed'
  | 'turn_starts' | 'turn_ends'
  | 'door_opened'
  | 'manual';

export interface TriggerEvent {
  kind: TriggerEventKind;
  /** The region/object/token the event happened to, when it had one. */
  targetId?: string | null;
  /** Who caused it. */
  actorId?: string | null;
}

/** One `then` step. `kind` is open — an unknown action is REPORTED, never silently dropped. */
export interface TriggerAction {
  kind: string;
  [key: string]: unknown;
}

export interface MapTrigger {
  id: string;
  name: string | null;
  firesWhen: { kind?: string; targetId?: string | null; [k: string]: unknown };
  firesThen: TriggerAction[];
  once: boolean;
  armed: boolean;
  firedAt: string | null;
}

/** Chain depth. Deep enough for any real puzzle, shallow enough that a runaway fails in milliseconds. */
export const MAX_DEPTH = 8;
/** Total actions in one resolution. A fan-out bomb is as bad as a cycle and a depth cap does not catch it. */
export const MAX_ACTIONS = 200;

export type ProblemKind = 'cycle' | 'depth' | 'action-limit' | 'missing-trigger' | 'unknown-action';

export interface Problem {
  kind: ProblemKind;
  /** The trigger ids walked to get here — the "chain shown in the DM's log". */
  path: string[];
  detail: string;
}

export interface Plan {
  /** What to do, in order. */
  actions: Array<TriggerAction & { fromTriggerId: string; depth: number }>;
  /** Trigger ids that matched and were walked, in order. */
  fired: string[];
  /** Everything that went wrong. EMPTY is the normal case; non-empty must reach the DM. */
  problems: Problem[];
}

/** Actions this engine knows how to describe. An unrecognised one is reported, not dropped. */
export const KNOWN_ACTIONS = new Set([
  'reveal_object', 'hide_object', 'show_description', 'move_token', 'apply_condition',
  'apply_damage', 'roll_check', 'play_sound', 'spawn_creature', 'fire_trigger', 'post_feed',
]);

/**
 * Does this trigger listen for this event?
 *
 * A `targetId` on the trigger NARROWS it; absent means "any". That asymmetry is deliberate: a DM writing
 * `{ kind: 'token_enters' }` means *any* token entering, and requiring them to enumerate every token
 * would make the common case the hardest to write.
 */
export function matches(trigger: MapTrigger, event: TriggerEvent): boolean {
  if (!trigger.armed) return false;
  // `once` and already fired: not armed any more in practice, whatever the flag says.
  if (trigger.once && trigger.firedAt) return false;
  if (trigger.firesWhen?.kind !== event.kind) return false;
  const want = trigger.firesWhen?.targetId;
  if (want == null || want === '') return true;
  return want === event.targetId;
}

/**
 * Build the plan for one event.
 *
 * `fire_trigger` actions recurse; everything else is collected. The recursion carries the PATH rather
 * than a visited set alone, because the path is what the DM needs to read — "A → B → A" says where the
 * loop is, while "cycle detected" says only that there is one.
 */
export function resolve(
  event: TriggerEvent,
  triggers: readonly MapTrigger[],
  opts: { maxDepth?: number; maxActions?: number } = {},
): Plan {
  const maxDepth = opts.maxDepth ?? MAX_DEPTH;
  const maxActions = opts.maxActions ?? MAX_ACTIONS;
  const byId = new Map(triggers.map((t) => [t.id, t]));

  const plan: Plan = { actions: [], fired: [], problems: [] };

  const walk = (trigger: MapTrigger, path: string[], depth: number): void => {
    // A trigger already on THIS path is a cycle. Checked against the path, not a global visited set: two
    // separate branches legitimately firing the same trigger is a diamond, not a loop, and refusing it
    // would break composability — the thing this feature exists for.
    if (path.includes(trigger.id)) {
      plan.problems.push({
        kind: 'cycle',
        path: [...path, trigger.id],
        detail: `Trigger "${trigger.name ?? trigger.id}" fires itself through this chain. Nothing further was resolved down this branch.`,
      });
      return;
    }
    if (depth > maxDepth) {
      plan.problems.push({
        kind: 'depth',
        path,
        detail: `Chain went deeper than ${maxDepth} triggers. Stopped here.`,
      });
      return;
    }

    const here = [...path, trigger.id];
    plan.fired.push(trigger.id);

    for (const action of trigger.firesThen) {
      if (plan.actions.length >= maxActions) {
        plan.problems.push({
          kind: 'action-limit',
          path: here,
          detail: `More than ${maxActions} actions in one chain. Stopped — this is a runaway, not a puzzle.`,
        });
        return;
      }

      if (!action || typeof action.kind !== 'string') {
        plan.problems.push({ kind: 'unknown-action', path: here, detail: 'An action with no `kind` was skipped.' });
        continue;
      }

      if (action.kind === 'fire_trigger') {
        const nextId = typeof action.triggerId === 'string' ? action.triggerId : '';
        const next = byId.get(nextId);
        if (!next) {
          // Named and skipped, never silent: a DM who deleted a trigger another one calls has a broken
          // puzzle, and the only way they learn is if this says so.
          plan.problems.push({
            kind: 'missing-trigger',
            path: here,
            detail: `Fires trigger "${nextId || '(none set)'}", which does not exist on this map.`,
          });
          continue;
        }
        // A chained trigger is fired directly — it does not have to `match` the original event, because
        // "A fires B" is A's decision, not B's listener.
        walk(next, here, depth + 1);
        continue;
      }

      if (!KNOWN_ACTIONS.has(action.kind)) {
        plan.problems.push({
          kind: 'unknown-action',
          path: here,
          detail: `Action "${action.kind}" is not one this map knows how to perform. It was kept in the plan so nothing disappears silently.`,
        });
      }
      plan.actions.push({ ...action, fromTriggerId: trigger.id, depth });
    }
  };

  for (const trigger of triggers) {
    if (matches(trigger, event)) walk(trigger, [], 0);
  }

  return plan;
}

/**
 * "Fire this now" — the DM's preview.
 *
 * The SAME `resolve` the real path uses, with a `manual` event aimed at the trigger. A preview built from
 * a parallel code path is a preview of something else, and the DM would test the puzzle, see it work, and
 * watch the real firing do something different.
 *
 * `armed` and `once` are bypassed **on the chosen trigger only** — the point of a preview is to test a
 * trigger that has already fired or is currently disarmed. Everything it chains to is walked under the
 * ordinary rules, so a preview cannot make a disarmed downstream trigger fire either.
 */
export function preview(trigger: MapTrigger, triggers: readonly MapTrigger[]): Plan {
  const forced: MapTrigger = { ...trigger, armed: true, once: false, firedAt: null };
  const others = triggers.filter((t) => t.id !== trigger.id);
  return resolve(
    { kind: 'manual', targetId: trigger.id },
    // The forced copy first, and matching on `manual` regardless of what it normally listens for.
    [{ ...forced, firesWhen: { kind: 'manual', targetId: trigger.id } }, ...others],
  );
}

/** Parse a database row without trusting its jsonb. A half-authored trigger must not crash a map. */
export function readTrigger(row: {
  id: string; name?: string | null; fires_when?: unknown; fires_then?: unknown;
  once?: unknown; armed?: unknown; fired_at?: string | null;
}): MapTrigger {
  const when = (row.fires_when ?? {}) as Record<string, unknown>;
  const then = Array.isArray(row.fires_then) ? row.fires_then : [];
  return {
    id: row.id,
    name: typeof row.name === 'string' ? row.name : null,
    firesWhen: {
      kind: typeof when.kind === 'string' ? when.kind : undefined,
      targetId: typeof when.targetId === 'string' ? when.targetId : null,
    },
    firesThen: then.filter((a): a is TriggerAction => Boolean(a) && typeof a === 'object') as TriggerAction[],
    once: row.once === true,
    // Defaults to ARMED, matching the column default. A trigger whose flag is missing is one the DM
    // expects to work; defaulting to disarmed would make a puzzle fail with nothing to see.
    armed: row.armed !== false,
    firedAt: typeof row.fired_at === 'string' ? row.fired_at : null,
  };
}

/**
 * A one-line summary of a plan, for the DM's log.
 *
 * `fired` records each WALK, not each trigger — a diamond legitimately walks the same trigger twice — so
 * the count is deduplicated before it is called a number of triggers. Caught in the browser: a three-
 * trigger map printed *"across 4 triggers"*, which is a small lie in the one place a DM goes to find out
 * whether their puzzle is sane.
 */
export function describePlan(plan: Plan): string {
  const distinct = new Set(plan.fired).size;
  const parts = [`${plan.actions.length} action${plan.actions.length === 1 ? '' : 's'}`];
  if (distinct > 1) parts.push(`across ${distinct} triggers`);
  if (plan.problems.length) parts.push(`⚠ ${plan.problems.length} problem${plan.problems.length === 1 ? '' : 's'}`);
  return parts.join(' · ');
}
