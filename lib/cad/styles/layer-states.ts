// lib/cad/styles/layer-states.ts
//
// C8 of docs/planning/completed/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
//
// Named layer states: "field check", "client plat", "for the RPLS". Save which layers are on, and
// get back to it in one click.
//
// ── WHY THIS IS WHAT MAKES A DEEP LAYER LIST USABLE ─────────────────────────────────────────────
//
// C6 gave layers real properties and C7 gave them real operations, and both make the list LONGER.
// A drawing with forty layers has a visibility combination per task — the plat you send a client,
// the set you take to the field, the set you check closure against — and rebuilding one by clicking
// forty eyes is how people end up leaving layers on and printing something wrong. Isolate solves
// exactly one of those combinations (this layer, nothing else); a named state solves all of them.
//
// ── THE DECISION THAT MATTERS: LAYERS THE STATE HAS NEVER SEEN ──────────────────────────────────
//
// A state saved on Monday is restored on Friday, and by then the drawing has three new layers. They
// are not in the snapshot, so the state has no opinion about them. Two possible answers:
//
//   Turn them off — "the state is the whole truth", which is what AutoCAD offers as an option.
//   Leave them alone — the state only speaks about what it knew.
//
// This takes the second, and the reason is asymmetry of harm. Leaving an unknown layer visible
// shows something the surveyor did not ask for and can see. Turning it off hides work they just
// did, from a control they may not connect to the disappearance — and hidden geometry that looks
// deleted is the most expensive failure this editor has. `restoreLayerState` therefore returns
// exactly the layers it knows about, and names the rest so the UI can say so out loud.

import type { Layer } from '../types';

/** The per-layer visibility a state remembers. Deliberately NOT the whole layer: a state restores
 *  what is SHOWN, not what things look like. Restoring colour and line weight would make a state a
 *  second, competing source of truth for style — and C6 just made those properly editable. */
export interface LayerStateEntry {
  visible: boolean;
  frozen: boolean;
  locked: boolean;
}

export interface LayerState {
  id: string;
  name: string;
  /** ISO 8601. Shown in the list so "which of these is current" has a tiebreaker. */
  created: string;
  /** layerId → what it looked like. Layers absent from this map are untouched on restore. */
  entries: Record<string, LayerStateEntry>;
}

export const LAYER_STATE_NAME_MAX = 40;

/** Snapshot the visibility of every layer currently in the drawing. */
export function captureLayerState(
  name: string,
  layers: Readonly<Record<string, Layer>>,
  now: string,
  id: string,
): LayerState {
  const entries: Record<string, LayerStateEntry> = {};
  for (const [layerId, layer] of Object.entries(layers)) {
    entries[layerId] = {
      visible: layer.visible,
      frozen: layer.frozen,
      locked: layer.locked,
    };
  }
  return { id, name: name.trim().slice(0, LAYER_STATE_NAME_MAX), created: now, entries };
}

export interface RestorePlan {
  /** layerId → the patch to apply. Only layers the state knows about AND that still exist. */
  patches: Record<string, LayerStateEntry>;
  /** In the drawing now, but not in the state. Left untouched — see the header. */
  unknownLayerIds: string[];
  /** In the state, but no longer in the drawing. Ignored; reported so the UI can be honest. */
  missingLayerIds: string[];
}

/**
 * Work out what restoring a state would do, without doing it.
 *
 * Pure, and separated from the store write for the same reason `planLayerMerge` is: the two
 * interesting cases — layers the state has never seen, and layers it remembers that are gone — are
 * testable without an editor, and the wrapper is left with nothing to get wrong.
 */
export function planLayerStateRestore(
  state: LayerState,
  layers: Readonly<Record<string, Layer>>,
): RestorePlan {
  const patches: Record<string, LayerStateEntry> = {};
  const missingLayerIds: string[] = [];

  for (const [layerId, entry] of Object.entries(state.entries)) {
    if (layers[layerId]) patches[layerId] = entry;
    else missingLayerIds.push(layerId);
  }

  const unknownLayerIds = Object.keys(layers).filter((id) => !(id in state.entries));

  return { patches, unknownLayerIds, missingLayerIds };
}

/** True when the drawing already matches this state — so the UI can mark the current one instead of
 *  making the surveyor remember which they last clicked. */
export function isLayerStateCurrent(
  state: LayerState,
  layers: Readonly<Record<string, Layer>>,
): boolean {
  for (const [layerId, entry] of Object.entries(state.entries)) {
    const layer = layers[layerId];
    // A layer the state remembers that no longer exists does not make the state stale — it makes it
    // partially inapplicable, which `planLayerStateRestore` reports separately.
    if (!layer) continue;
    if (layer.visible !== entry.visible) return false;
    if (layer.frozen !== entry.frozen) return false;
    if (layer.locked !== entry.locked) return false;
  }
  return true;
}

/** A name that is not blank and does not collide with an existing state. Returns null when valid. */
export function validateLayerStateName(
  name: string,
  existing: ReadonlyArray<LayerState>,
  ignoreId?: string,
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Give the state a name.';
  if (trimmed.length > LAYER_STATE_NAME_MAX) return `Keep it under ${LAYER_STATE_NAME_MAX} characters.`;
  const clash = existing.some(
    (s) => s.id !== ignoreId && s.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  // Case-insensitive, because "Field check" and "field check" in one list is a trap rather than a
  // distinction.
  if (clash) return 'A layer state with that name already exists.';
  return null;
}
