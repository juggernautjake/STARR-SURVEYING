'use client';
// lib/cad/store/hotkeys-store.ts
//
// Phase 8 §2.3 — user-binding store. Persists per-action
// overrides + tracks the active hotkey context (CANVAS /
// COMMAND_BAR / DIALOG / GLOBAL) so the engine can
// context-filter dispatches.
//
// User bindings are session-scoped here; cross-session
// persistence layers in once the settings page lands. The
// engine reads `userBindings` via `setUserBindings` whenever
// the array reference changes.

import { create } from 'zustand';

import type {
  ActionContext,
  UserBinding,
} from '../hotkeys';

interface HotkeysStore {
  /** User-customized bindings. Empty means "use defaults". */
  userBindings: UserBinding[];
  /** Active hotkey context. Set by the surface that owns
   *  focus — canvas defaults to CANVAS, dialog modals push
   *  DIALOG, the command bar pushes COMMAND_BAR. */
  activeContext: ActionContext;

  setBinding: (actionId: string, key: string | null) => void;
  removeBinding: (actionId: string) => void;
  resetAllBindings: () => void;
  setActiveContext: (context: ActionContext) => void;
}

export const useHotkeysStore = create<HotkeysStore>((set) => ({
  userBindings: [],
  activeContext: 'CANVAS',

  setBinding: (actionId, key) =>
    set((s) => {
      const others = s.userBindings.filter((b) => b.actionId !== actionId);
      // Null key removes the binding without leaving a stub
      // entry — `engine.setUserBindings` only honors entries
      // that flip the default; null in `userBindings` would
      // confuse the merge logic.
      if (key === null) {
        return { userBindings: others };
      }
      return { userBindings: [...others, { actionId, key }] };
    }),

  removeBinding: (actionId) =>
    set((s) => ({
      userBindings: s.userBindings.filter((b) => b.actionId !== actionId),
    })),

  resetAllBindings: () => set({ userBindings: [] }),

  setActiveContext: (context) => set({ activeContext: context }),
}));
