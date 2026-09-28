// lib/files/selection.ts — the rules of picking several files, shared by every file list.
//
// Owner, 2026-09-27: *"We should also be able to just do a selection of the images and delete
// groups of images."*
//
// Pure so it is tested once and every screen behaves the same:
//
//   - click a checkbox            → that one toggles; it becomes the ANCHOR
//   - Shift-click another         → everything between the anchor and it takes the clicked box's
//                                   new state (the way every file manager does it), in the order
//                                   the items are SHOWN — not the order they were loaded
//   - "Select all"                → every visible item; again, when all are selected, clears
//   - items that disappear (deleted, filtered out, folder changed) drop out of the selection, so a
//     "3 selected" bar can never act on something the person can no longer see.

export interface SelectionState {
  selected: ReadonlySet<string>;
  anchor: string | null;
}

export const EMPTY_SELECTION: SelectionState = { selected: new Set(), anchor: null };

/** Toggle `id`; with `shift`, apply its new state to the whole range from the anchor. */
export function toggle(state: SelectionState, id: string, order: readonly string[], shift = false): SelectionState {
  const next = new Set(state.selected);
  const turnOn = !next.has(id);
  const from = shift && state.anchor ? order.indexOf(state.anchor) : -1;
  const to = order.indexOf(id);
  if (from >= 0 && to >= 0) {
    const [a, b] = from <= to ? [from, to] : [to, from];
    for (let i = a; i <= b; i++) {
      if (turnOn) next.add(order[i]!);
      else next.delete(order[i]!);
    }
  } else if (turnOn) {
    next.add(id);
  } else {
    next.delete(id);
  }
  return { selected: next, anchor: id };
}

/** Select every visible item — or, if they are all already selected, clear. */
export function toggleAll(state: SelectionState, order: readonly string[]): SelectionState {
  const all = order.length > 0 && order.every((id) => state.selected.has(id));
  return all ? EMPTY_SELECTION : { selected: new Set(order), anchor: state.anchor };
}

/** Drop anything no longer on screen. Returns the SAME object when nothing changed (cheap for React). */
export function prune(state: SelectionState, order: readonly string[]): SelectionState {
  const visible = new Set(order);
  let changed = false;
  for (const id of state.selected) if (!visible.has(id)) { changed = true; break; }
  if (!changed) return state;
  const selected = new Set([...state.selected].filter((id) => visible.has(id)));
  return { selected, anchor: state.anchor && visible.has(state.anchor) ? state.anchor : null };
}

/** "all" / "some" / "none" — drives the Select-all checkbox (checked / indeterminate / empty). */
export function allState(state: SelectionState, order: readonly string[]): 'all' | 'some' | 'none' {
  const n = order.filter((id) => state.selected.has(id)).length;
  if (n === 0) return 'none';
  return n === order.length ? 'all' : 'some';
}

/** Names for a confirmation: the first `max`, and how many more. */
export function namesForConfirm(names: string[], max = 8): { shown: string[]; more: number } {
  return { shown: names.slice(0, max), more: Math.max(0, names.length - max) };
}
