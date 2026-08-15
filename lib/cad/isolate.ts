// lib/cad/isolate.ts — C26, isolate as a mode you can leave
//
// ── WHAT ISOLATE WAS ────────────────────────────────────────────────────────────────────────────
//
// Two entry points, both a one-way destructive write:
//
//   LayerPanel "Isolate Layer"    for (const id of layerOrder) updateLayer(id, { visible: id === target })
//   layer.isolateBySelection      the same, keeping the layers holding the selection
//
// Neither remembers anything. The only way out is "Show All Layers", which turns **every** layer on
// — so a surveyor who had deliberately switched three layers off, isolated the boundary to work on
// it, and then came back, silently got those three layers back too. Un-isolating did not restore
// what they had; it restored something else, with no error and no way to tell.
//
// And nothing said isolate was on. C25's blank-canvas notice names the symptom: "an isolate left on
// from yesterday looks identical to a drawing that failed to load."
//
// ── WHAT MAKES IT A MODE ────────────────────────────────────────────────────────────────────────
//
// Entering captures the visibility it is about to overwrite; leaving puts it back exactly. That is
// the whole difference, and it is why this is a model file rather than three lines in a menu
// handler — the two traps below are both invisible until a surveyor loses work to them.

import type { Layer } from './types';

export interface IsolateSession {
  /** Layer id → `visible`, as it was the moment isolate was entered. */
  previous: Record<string, boolean>;
  /** The layers isolate kept on. */
  kept: string[];
  /** How it was entered — the badge says "Isolated: Boundary" vs "Isolated by selection". */
  origin: 'LAYER' | 'SELECTION';
  /** ISO timestamp, so a session restored from a saved drawing can say how old it is. */
  startedAt: string;
}

export interface IsolatePlan {
  /** Layer id → the visibility to write. Only layers that actually change. */
  updates: Record<string, boolean>;
  session: IsolateSession;
}

/**
 * Plan an isolate.
 *
 * **The trap: re-isolating while already isolated.** The naive version captures current visibility
 * every time, so isolating layer A, then layer B, then exiting restores *the layer-A isolate* — the
 * surveyor's real layer state is gone for good, overwritten by an intermediate one they never chose
 * to keep. So an existing session's `previous` is carried forward untouched; only `kept` and
 * `origin` move on. Exit always means "back to before any of this started".
 */
export function planIsolate(
  layers: Record<string, Layer>,
  keep: Iterable<string>,
  origin: IsolateSession['origin'],
  existing: IsolateSession | null | undefined,
  now: string,
): IsolatePlan {
  const keptSet = new Set(keep);
  const previous = existing
    ? existing.previous
    : Object.fromEntries(Object.values(layers).map((l) => [l.id, l.visible]));

  const updates: Record<string, boolean> = {};
  for (const l of Object.values(layers)) {
    const shouldBeVisible = keptSet.has(l.id);
    if (l.visible !== shouldBeVisible) updates[l.id] = shouldBeVisible;
  }

  return {
    updates,
    session: {
      previous,
      kept: [...keptSet],
      origin,
      startedAt: existing?.startedAt ?? now,
    },
  };
}

/**
 * Plan the exit: put back exactly what was there.
 *
 * **A layer created while isolated is not in `previous`, and is left alone rather than hidden.**
 * Same asymmetry of harm C8 reasoned through for layer states: a layer that stays visible when it
 * arguably should not is a nuisance the surveyor can see and fix, while one that vanishes on exit
 * looks like the isolate ate their new work. Deleted layers simply drop out.
 */
export function planExitIsolate(
  session: IsolateSession,
  layers: Record<string, Layer>,
): Record<string, boolean> {
  const updates: Record<string, boolean> = {};
  for (const l of Object.values(layers)) {
    const was = session.previous[l.id];
    if (was === undefined) continue;
    if (l.visible !== was) updates[l.id] = was;
  }
  return updates;
}

/** Layers that exist now but did not when isolate started. The exit leaves these alone; the badge
 *  can say so rather than letting the surveyor wonder why one layer stayed on. */
export function layersAddedDuringIsolate(
  session: IsolateSession,
  layers: Record<string, Layer>,
): string[] {
  return Object.keys(layers).filter((id) => session.previous[id] === undefined);
}

/** Short label for the on-screen badge. Names the layer when there is exactly one, because
 *  "Isolated" alone does not tell the surveyor what they are looking at. */
export function describeIsolate(
  session: IsolateSession,
  layers: Record<string, Layer>,
): string {
  if (session.origin === 'SELECTION') {
    return `Isolated by selection · ${session.kept.length} layer${session.kept.length === 1 ? '' : 's'}`;
  }
  if (session.kept.length === 1) {
    const l = layers[session.kept[0]];
    return `Isolated: ${l?.name ?? session.kept[0]}`;
  }
  return `Isolated · ${session.kept.length} layers`;
}

/**
 * Whether an isolate session still describes reality.
 *
 * A surveyor can leave isolate the long way round — turning layers back on by hand, or pressing
 * "Show All Layers". Once they have, the badge is lying and its exit button would *hide* layers
 * they just chose to show. So a session whose kept-set no longer matches what is visible is stale
 * and the caller should drop it.
 */
export function isIsolateCurrent(
  session: IsolateSession,
  layers: Record<string, Layer>,
): boolean {
  const kept = new Set(session.kept);
  for (const l of Object.values(layers)) {
    // Layers added since isolate started are not part of the claim.
    if (session.previous[l.id] === undefined) continue;
    if (l.visible !== kept.has(l.id)) return false;
  }
  return true;
}
