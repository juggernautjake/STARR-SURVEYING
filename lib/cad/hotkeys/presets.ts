// lib/cad/hotkeys/presets.ts
//
// Phase 8 §2.1 — preset binding maps. Surveyors who come from
// AutoCAD shouldn't have to retrain muscle memory; activating
// the AUTOCAD preset rewrites the bindings to AutoCAD-style
// chord aliases (L, M, CO, RO, MI, SC, TR, EX, F, etc.).
//
// Pure data + a single `applyHotkeyPreset` helper. Persistence
// rides on the existing `useHotkeysStore` zustand store with
// the `persist` middleware — once a preset is applied, the
// new bindings survive page reloads.

import { useHotkeysStore } from '../store/hotkeys-store';

/**
 * A preset is a sparse map: actionId → key string. Any action
 * not listed in the map keeps its default binding from the
 * registry. The empty preset (DEFAULT) clears every user
 * binding so the registry defaults take over again.
 */
export type HotkeyPreset = Record<string, string>;

/**
 * AutoCAD-style aliases. Keeps file/edit/view shortcuts the
 * same as the platform defaults (Ctrl+S, Ctrl+Z, etc.) since
 * those are universal — only the in-canvas tool aliases swap
 * to the AutoCAD chord conventions.
 */
export const AUTOCAD_PRESET: HotkeyPreset = {
  // Drawing tools — single-letter aliases for the most common
  // shapes match AutoCAD's command-line aliases.
  'tool.line':       'l',
  'tool.polyline':   'p l',
  'tool.polygon':    'p o l',
  'tool.point':      'p o',
  'tool.arc':        'a',
  'tool.spline':     's p l',
  'tool.text':       'd t',

  // Modify tools — AutoCAD's two-letter chord aliases.
  'tool.move':       'm',
  'tool.copyTool':   'c o',
  'tool.rotate':     'r o',
  'tool.mirror':     'm i',
  'tool.scale':      's c',
  'tool.offset':     'o',
  'tool.trim':       't r',
  'tool.extend':     'e x',
  'tool.fillet':     'f',
  'tool.erase':      'e',

  // Selection
  'tool.select':     'escape',
  'edit.selectAll':  'ctrl+a',
};

/**
 * Empty preset = "use registry defaults." Applying it clears
 * any previously-applied custom bindings without forcing the
 * surveyor to reset each one manually.
 */
export const DEFAULT_PRESET: HotkeyPreset = {};

export const HOTKEY_PRESETS = {
  AUTOCAD: AUTOCAD_PRESET,
  DEFAULT: DEFAULT_PRESET,
} as const;

export type HotkeyPresetName = keyof typeof HOTKEY_PRESETS;

/**
 * Apply a preset to the hotkey store. For DEFAULT this just
 * clears every user binding (so registry defaults take over).
 * For other presets it first clears existing bindings then
 * sets each action in the preset map. The hotkey engine
 * picks up the change automatically through its store
 * subscription.
 */
export function applyHotkeyPreset(name: HotkeyPresetName): void {
  const preset = HOTKEY_PRESETS[name];
  const store = useHotkeysStore.getState();
  // Reset first so removing entries from a preset doesn't
  // leave stale bindings behind.
  store.resetAllBindings();
  for (const [actionId, key] of Object.entries(preset)) {
    store.setBinding(actionId, key);
  }
}
