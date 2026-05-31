'use client';
// lib/cad/store/calculator-store.ts
//
// cad-calculator-suite Slice 1 — zustand store for the calculator
// suite. Tracks the active calculator id + a per-calculator state
// blob so:
//
//   1. Closing + reopening the modal restores the LAST-USED
//      calculator (Slice 5 user ask).
//   2. Switching between calculators preserves each one's working
//      data independently (Slice 5 user ask).
//   3. A new session opens on the `'generic'` calculator (Slice 3
//      user ask).
//
// State blobs are typed `unknown` because each calculator owns
// its own shape; callers use the `getActiveState<T>()` helper to
// narrow at the call site. Persistence runs through the `persist`
// middleware so the active id + every state blob survives a
// page reload.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/** Stable ids the modal recognizes. The picker renders one entry
 *  per registered calculator; switching just changes
 *  `activeCalculatorId`. Adding a new calculator = registering a
 *  new id here + a matching component.  */
export type CalculatorId = 'generic' | 'curve';

export const DEFAULT_CALCULATOR_ID: CalculatorId = 'generic';

interface CalculatorStore {
  /** Which calculator the modal should render. Defaults to
   *  `'generic'`; restored from persisted state on reload. */
  activeCalculatorId: CalculatorId;
  /** Per-calculator state blob. Each calculator's component reads
   *  + writes its own slot independently. `unknown` because each
   *  calculator owns its own shape. */
  states: Partial<Record<CalculatorId, unknown>>;

  setActiveCalculator: (id: CalculatorId) => void;
  /** Read the current calculator's persisted state. `null` when
   *  the calculator hasn't written any state yet. Generic typed
   *  so the caller can narrow at the call site. */
  getActiveState: <T>() => T | null;
  /** Read a specific calculator's persisted state (any id). */
  getCalculatorState: <T>(id: CalculatorId) => T | null;
  /** Replace the active calculator's state blob. */
  setActiveState: (next: unknown) => void;
  /** Replace any calculator's state blob (used by tests + by
   *  cross-calculator workflows). */
  setCalculatorState: (id: CalculatorId, next: unknown) => void;
  /** Wipe every persisted calculator state. Active id resets to
   *  the default. */
  resetAll: () => void;
}

export const useCalculatorStore = create<CalculatorStore>()(
  persist(
    (set, get) => ({
      activeCalculatorId: DEFAULT_CALCULATOR_ID,
      states: {},

      setActiveCalculator: (id) => set({ activeCalculatorId: id }),

      getActiveState: <T,>(): T | null => {
        const s = get();
        return (s.states[s.activeCalculatorId] as T | undefined) ?? null;
      },

      getCalculatorState: <T,>(id: CalculatorId): T | null =>
        (get().states[id] as T | undefined) ?? null,

      setActiveState: (next) =>
        set((s) => ({ states: { ...s.states, [s.activeCalculatorId]: next } })),

      setCalculatorState: (id, next) =>
        set((s) => ({ states: { ...s.states, [id]: next } })),

      resetAll: () => set({ activeCalculatorId: DEFAULT_CALCULATOR_ID, states: {} }),
    }),
    {
      name: 'starr-cad-calc-suite-v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        activeCalculatorId: s.activeCalculatorId,
        states: s.states,
      }),
    },
  ),
);
