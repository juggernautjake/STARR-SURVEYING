'use client';
// lib/cad/store/transfer-store.ts
//
// Phase 8 §11.7 — state for the Cross-Layer Copy / Move /
// Duplicate dialog. Holds:
//
//   - whether the dialog is open
//   - which features the surveyor has picked as the source
//     set (independent from `useSelectionStore` so picks
//     don't leak into the rest of the app's selection-driven
//     UI while the dialog is open)
//   - whether Pick mode is currently intercepting canvas
//     clicks
//   - the dialog's current options (operation, target layer
//     id, target traverse id, keep-originals flag, etc.)
//
// Session-scoped only — there's no reason to persist
// half-configured transfers across reloads.

import { create } from 'zustand';

export type TransferOperation = 'DUPLICATE' | 'MOVE' | 'COPY_TO_CLIPBOARD';

export interface TransferOptions {
  /** Defaults to DUPLICATE. */
  operation: TransferOperation;
  /** Required for DUPLICATE / MOVE; ignored for COPY_TO_CLIPBOARD. */
  targetLayerId: string | null;
  /** Optional: when set, POINT duplicates also get appended to this traverse. */
  targetTraverseId: string | null;
  /** Mirror of `operation === 'DUPLICATE'`; surveyor can override per Slice 6+. */
  keepOriginals: boolean;
  /** Renumber duplicated POINTs starting at this number. null = keep originals. */
  renumberStart: number | null;
  /** Strip codes that don't appear in the target layer's autoAssignCodes[]. */
  stripUnknownCodes: boolean;
  /** Auto-include polylines / polygons / arcs whose vertices include any of the picked POINTs. */
  bringAlongLinkedGeometry: boolean;
}

interface TransferStore {
  isOpen: boolean;
  /** Source set the surveyor has built up via Pick mode or Type IDs. */
  pickedIds: Set<string>;
  /** When true, canvas clicks add / remove from `pickedIds` instead of
   *  going to the active tool. */
  pickModeActive: boolean;
  /** LIFO history of pick events for the in-dialog Backspace / Ctrl+Z. */
  pickHistory: Array<{ op: 'ADD' | 'REMOVE'; id: string }>;
  options: TransferOptions;

  open: (initialPickedIds?: Iterable<string>) => void;
  close: () => void;
  setPickModeActive: (active: boolean) => void;
  /** Toggle a single feature in / out of the picked set. Records a
   *  history entry so Backspace / pick-undo can reverse it. */
  togglePick: (id: string) => void;
  addPick: (id: string) => void;
  removePick: (id: string) => void;
  /** Bulk operations. */
  addPicks: (ids: Iterable<string>) => void;
  removePicks: (ids: Iterable<string>) => void;
  clearPicks: () => void;
  /** LIFO pop the most recently added pick (Backspace shortcut). */
  popLastPick: () => void;
  setOptions: (patch: Partial<TransferOptions>) => void;
}

const DEFAULT_OPTIONS: TransferOptions = {
  operation: 'DUPLICATE',
  targetLayerId: null,
  targetTraverseId: null,
  keepOriginals: true,
  renumberStart: null,
  stripUnknownCodes: false,
  bringAlongLinkedGeometry: true,
};

export const useTransferStore = create<TransferStore>((set) => ({
  isOpen: false,
  pickedIds: new Set<string>(),
  pickModeActive: false,
  pickHistory: [],
  options: { ...DEFAULT_OPTIONS },

  open: (initialPickedIds) =>
    set(() => ({
      isOpen: true,
      pickedIds: new Set(initialPickedIds ?? []),
      pickModeActive: false,
      pickHistory: [],
      options: { ...DEFAULT_OPTIONS },
    })),

  close: () =>
    set(() => ({
      isOpen: false,
      pickModeActive: false,
      pickedIds: new Set<string>(),
      pickHistory: [],
    })),

  setPickModeActive: (active) => set(() => ({ pickModeActive: active })),

  togglePick: (id) =>
    set((s) => {
      const next = new Set(s.pickedIds);
      const op: 'ADD' | 'REMOVE' = next.has(id) ? 'REMOVE' : 'ADD';
      if (op === 'ADD') next.add(id);
      else next.delete(id);
      return { pickedIds: next, pickHistory: [...s.pickHistory, { op, id }] };
    }),

  addPick: (id) =>
    set((s) => {
      if (s.pickedIds.has(id)) return s;
      const next = new Set(s.pickedIds);
      next.add(id);
      return { pickedIds: next, pickHistory: [...s.pickHistory, { op: 'ADD', id }] };
    }),

  removePick: (id) =>
    set((s) => {
      if (!s.pickedIds.has(id)) return s;
      const next = new Set(s.pickedIds);
      next.delete(id);
      return { pickedIds: next, pickHistory: [...s.pickHistory, { op: 'REMOVE', id }] };
    }),

  addPicks: (ids) =>
    set((s) => {
      const next = new Set(s.pickedIds);
      const newHist = [...s.pickHistory];
      for (const id of ids) {
        if (!next.has(id)) {
          next.add(id);
          newHist.push({ op: 'ADD', id });
        }
      }
      return { pickedIds: next, pickHistory: newHist };
    }),

  removePicks: (ids) =>
    set((s) => {
      const next = new Set(s.pickedIds);
      const newHist = [...s.pickHistory];
      for (const id of ids) {
        if (next.has(id)) {
          next.delete(id);
          newHist.push({ op: 'REMOVE', id });
        }
      }
      return { pickedIds: next, pickHistory: newHist };
    }),

  clearPicks: () =>
    set((s) => {
      // Stamp every clearance as a single history block so a
      // future Pick-mode-Undo can restore the whole batch in one shot.
      const newHist = [...s.pickHistory];
      for (const id of s.pickedIds) newHist.push({ op: 'REMOVE', id });
      return { pickedIds: new Set<string>(), pickHistory: newHist };
    }),

  popLastPick: () =>
    set((s) => {
      // Walk backwards to the most recent ADD that's still in pickedIds
      // — popLastPick is "undo my last addition" not "undo any history."
      const next = new Set(s.pickedIds);
      const newHist = [...s.pickHistory];
      for (let i = newHist.length - 1; i >= 0; i -= 1) {
        const h = newHist[i];
        if (h.op === 'ADD' && next.has(h.id)) {
          next.delete(h.id);
          newHist.push({ op: 'REMOVE', id: h.id });
          return { pickedIds: next, pickHistory: newHist };
        }
      }
      return s;
    }),

  setOptions: (patch) =>
    set((s) => ({ options: { ...s.options, ...patch } })),
}));
