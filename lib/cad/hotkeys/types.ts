// lib/cad/hotkeys/types.ts
//
// Phase 8 §2.1 — bindable-action type model. Pure data
// shapes the registry, the user-config store, and the
// settings UI all share. No React, no Zustand.

export type ActionCategory =
  | 'FILE'
  | 'EDIT'
  | 'TOOLS'
  | 'ZOOM_PAN'
  | 'SELECTION'
  | 'DRAW'
  | 'MODIFY'
  | 'SNAP'
  | 'LAYERS'
  | 'ANNOTATIONS'
  | 'AI'
  | 'SURVEY_MATH'
  | 'VIEW'
  | 'APP';

export type ActionContext =
  | 'GLOBAL'
  | 'CANVAS'
  | 'COMMAND_BAR'
  | 'DIALOG';

export interface BindableAction {
  id:          string;
  category:    ActionCategory;
  label:       string;
  description: string;
  /** Canonical key string for the default binding. Single
   *  keys: `'s'`, `'escape'`, `'f3'`. Modifier-prefixed:
   *  `'ctrl+z'`, `'ctrl+shift+s'`. Chords (multi-key
   *  sequences) carry a single space between keys: `'z e'`
   *  / `'pl'` (chord of `'p'` then `'l'`). `null` means the
   *  action ships unbound. */
  defaultKey:  string | null;
  /** True when `defaultKey` represents a multi-key chord
   *  (`'z e'`, `'pl'`, `'sp'`). Drives the chord-buffer
   *  branch in the engine. */
  isChord:     boolean;
  context:     ActionContext;
}

/** A user override binding — same shape as a `BindableAction`
 *  but only the fields a user can change. */
export interface UserBinding {
  actionId: string;
  /** Null clears the binding entirely. */
  key:      string | null;
}
