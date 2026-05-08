// lib/cad/hotkeys/conflicts.ts
//
// Phase 8 §3.3 — hotkey conflict detection. Scans the
// merged binding map (registry defaults + user overrides)
// for any (key, context) pair claimed by two or more
// actions. Conflicts in different contexts (e.g. one
// CANVAS, one COMMAND_BAR) don't count — those resolve at
// dispatch time. Conflicts in the same context (or when
// either side is GLOBAL) shadow each other and need
// surveyor attention.
//
// Pure data — the cheat-sheet overlay calls
// `findHotkeyConflicts` on every render and renders red
// badges next to any binding that's part of a collision.
// A future settings UI will reuse the same return shape.

import type { ActionContext, BindableAction, UserBinding } from './types';

export interface HotkeyConflict {
  /** Canonical key string (e.g. `ctrl+s`). */
  key: string;
  /** Context where the collision lives. When two actions
   *  share a key but one is GLOBAL the conflict is reported
   *  in every context the partner action covers. */
  context: ActionContext;
  /** All action ids competing for the same key in this context. */
  actionIds: string[];
}

/**
 * Two contexts collide when:
 * - they're identical, OR
 * - either of them is GLOBAL (since a GLOBAL hotkey fires
 *   regardless of which surface owns focus).
 */
function contextsOverlap(a: ActionContext, b: ActionContext): boolean {
  if (a === b) return true;
  if (a === 'GLOBAL' || b === 'GLOBAL') return true;
  return false;
}

/**
 * Compute the set of conflicts across the registry + any
 * user overrides. The user-binding side wins per action id —
 * a user override replaces the action's default key, it
 * doesn't double up. Returns an empty array when no
 * collisions exist.
 */
export function findHotkeyConflicts(
  actions: ReadonlyArray<BindableAction>,
  userBindings: ReadonlyArray<UserBinding>,
): HotkeyConflict[] {
  // Build the effective (actionId, key, context) tuple for
  // every action.
  const userMap = new Map(userBindings.map((u) => [u.actionId, u.key]));
  type Effective = { actionId: string; key: string; context: ActionContext };
  const effective: Effective[] = [];
  for (const a of actions) {
    const userKey = userMap.get(a.id);
    const key = userKey ?? a.defaultKey;
    if (!key) continue; // unbound action (no default, no override)
    effective.push({ actionId: a.id, key, context: a.context });
  }

  // Group by key — every group of size > 1 is a candidate
  // conflict. Within each group, partition by overlapping
  // context.
  const byKey = new Map<string, Effective[]>();
  for (const e of effective) {
    const arr = byKey.get(e.key) ?? [];
    arr.push(e);
    byKey.set(e.key, arr);
  }

  const conflicts: HotkeyConflict[] = [];
  for (const [key, members] of byKey.entries()) {
    if (members.length < 2) continue;
    // Cluster by overlapping contexts so we report one
    // conflict per cluster rather than one per pair.
    const visited = new Set<number>();
    for (let i = 0; i < members.length; i += 1) {
      if (visited.has(i)) continue;
      const cluster: number[] = [i];
      visited.add(i);
      for (let j = i + 1; j < members.length; j += 1) {
        if (visited.has(j)) continue;
        if (cluster.some((k) => contextsOverlap(members[k].context, members[j].context))) {
          cluster.push(j);
          visited.add(j);
        }
      }
      if (cluster.length < 2) continue;
      // Report under whichever non-GLOBAL context shows up
      // first (so users see "CANVAS" rather than "GLOBAL"
      // when the collision is mostly canvas-bound), falling
      // back to GLOBAL when nothing else is present.
      const ctxs = cluster.map((k) => members[k].context);
      const reported = ctxs.find((c) => c !== 'GLOBAL') ?? 'GLOBAL';
      conflicts.push({
        key,
        context: reported,
        actionIds: cluster.map((k) => members[k].actionId),
      });
    }
  }

  return conflicts;
}

/**
 * Convenience — for a given action id, return the conflict
 * record that involves it (or null when this action isn't
 * part of any conflict). Used by the cheat-sheet overlay
 * to mark individual rows.
 */
export function findConflictForAction(
  actionId: string,
  conflicts: ReadonlyArray<HotkeyConflict>,
): HotkeyConflict | null {
  for (const c of conflicts) {
    if (c.actionIds.includes(actionId)) return c;
  }
  return null;
}
