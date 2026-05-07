// lib/cad/hotkeys/index.ts
// Phase 8 §2 — hotkey package barrel.

export {
  DEFAULT_ACTIONS,
  DEFAULT_ACTIONS_BY_ID,
  findActionById,
} from './registry';
export {
  formatKeyForDisplay,
  normalizeBindingString,
  normalizeKeyboardEvent,
} from './key-format';
export type { NormalizedKey } from './key-format';
export { createHotkeyEngine } from './engine';
export type { HotkeyEngine, HotkeyEngineConfig } from './engine';
export type {
  ActionCategory,
  ActionContext,
  BindableAction,
  UserBinding,
} from './types';
