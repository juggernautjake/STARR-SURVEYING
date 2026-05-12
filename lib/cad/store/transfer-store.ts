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
  /** Phase 8 §11.7 Slice 17 — multi-target paste. Additional
   *  layer ids the duplicates also land on. On Confirm, the
   *  dialog runs the kernel once per (targetLayerId,
   *  ...additionalTargetLayerIds) with the same
   *  transferOperationId so all results share one audit
   *  group. Empty array (default) = single-target paste,
   *  identical to the previous behaviour. Only honored for
   *  DUPLICATE; Move ignores it (semantically odd to "move"
   *  the same feature to N layers). */
  additionalTargetLayerIds: string[];
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
  /** Optional translation applied to every duplicate. Distance
   *  in canonical feet; bearing in decimal-degree azimuth
   *  (0 = North, clockwise). When distance is 0 or null the
   *  duplicates land on top of the originals. */
  offsetDistanceFt: number;
  offsetBearingDeg: number;
  /** Surveyor toggle — true = applyOffset() runs, false = skip
   *  even if non-zero values were set. Lets the surveyor keep
   *  a baseline value typed in but disable it for one transfer. */
  applyOffset: boolean;
  /** When true, after a successful Duplicate, lock every
   *  layer the source features came from so the surveyor
   *  can't accidentally edit the originals while working
   *  on the duplicate. Move never triggers this — moved
   *  features no longer live on the source layer. */
  lockSourceAfterCopy: boolean;
  /** Phase 8 §11.7 Slice 10 — opt-in linked-instance mode.
   *  When true, every duplicate carries linkedSourceId +
   *  linkedOffsetX/Y so a background subscriber can
   *  regenerate the duplicate's geometry whenever the
   *  source's geometry changes. Editing the linked
   *  duplicate directly breaks the link. Off by default. */
  linkDuplicatesToSource: boolean;
  /** Phase 8 §11.7 Slice 19 — code-remap table. Keys are
   *  uppercased source codes; values are the target codes
   *  every feature carrying that source code should be
   *  rewritten to. Persists in saved presets so recurring
   *  "Working → Print" workflows reuse the same mapping. */
  codeMap: Record<string, string>;
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
  /** Phase 8 §11.7.12 — Pick-mode-scoped redo stack. Populated when
   *  `undoPick` rolls back a history entry; cleared whenever a fresh
   *  pick is added/removed so redo semantics match the conventional
   *  branching-undo behaviour. Separate from the document-wide undo
   *  stack so Ctrl+Z inside Pick mode doesn't accidentally roll back
   *  drawing edits. */
  pickRedoStack: Array<{ op: 'ADD' | 'REMOVE'; id: string }>;
  options: TransferOptions;
  /** Phase 8 §11.7 Slice 13 — which saved preset (if any)
   *  is currently loaded. Drives the preset-dropdown highlight
   *  and the Confirm-time use-count bump. */
  activePresetId: string | null;
  /** Phase 8 §11.7 Slice 15 — feature ids that just landed
   *  from a successful Confirm. CanvasViewport renders a
   *  short-lived green pulse around each so the surveyor
   *  visually confirms the right things changed. The dialog
   *  fires `flashRecentlyTransferred` which writes the ids
   *  + a started-at timestamp; a setTimeout clears the array
   *  after 1500 ms. */
  recentlyTransferred: { ids: string[]; startedAt: number } | null;

  open: (initialPickedIds?: Iterable<string>) => void;
  close: () => void;
  setPickModeActive: (active: boolean) => void;
  setActivePresetId: (id: string | null) => void;
  /** Flash a green pulse on these feature ids for ~1500 ms. */
  flashRecentlyTransferred: (ids: string[]) => void;
  clearRecentlyTransferred: () => void;
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
  /** Phase 8 §11.7.12 — Pick-mode-scoped Undo / Redo. Walks
   *  `pickHistory` / `pickRedoStack` without touching the document
   *  undo stack so Ctrl+Z inside Pick mode rolls back a pick (or
   *  re-applies one via Ctrl+Y) instead of a drawing edit. */
  undoPick: () => void;
  redoPick: () => void;
  setOptions: (patch: Partial<TransferOptions>) => void;
}

const DEFAULT_OPTIONS: TransferOptions = {
  operation: 'DUPLICATE',
  targetLayerId: null,
  additionalTargetLayerIds: [],
  targetTraverseId: null,
  keepOriginals: true,
  renumberStart: null,
  stripUnknownCodes: false,
  bringAlongLinkedGeometry: true,
  offsetDistanceFt: 0,
  offsetBearingDeg: 0,
  applyOffset: false,
  lockSourceAfterCopy: false,
  linkDuplicatesToSource: false,
  codeMap: {},
};

export const useTransferStore = create<TransferStore>((set) => ({
  isOpen: false,
  pickedIds: new Set<string>(),
  pickModeActive: false,
  pickHistory: [],
  pickRedoStack: [],
  options: { ...DEFAULT_OPTIONS },
  activePresetId: null,
  recentlyTransferred: null,

  open: (initialPickedIds) =>
    set(() => ({
      isOpen: true,
      pickedIds: new Set(initialPickedIds ?? []),
      pickModeActive: false,
      pickHistory: [],
      pickRedoStack: [],
      options: { ...DEFAULT_OPTIONS },
      activePresetId: null,
      // Don't clear recentlyTransferred on open — the pulse
      // fires AFTER close, so the next open doesn't care.
    })),

  close: () =>
    set(() => ({
      isOpen: false,
      pickModeActive: false,
      pickedIds: new Set<string>(),
      pickHistory: [],
      pickRedoStack: [],
      activePresetId: null,
    })),

  setPickModeActive: (active) => set(() => ({ pickModeActive: active })),
  setActivePresetId: (id) => set(() => ({ activePresetId: id })),
  flashRecentlyTransferred: (ids) =>
    set(() => ({ recentlyTransferred: { ids, startedAt: Date.now() } })),
  clearRecentlyTransferred: () =>
    set(() => ({ recentlyTransferred: null })),

  togglePick: (id) =>
    set((s) => {
      const next = new Set(s.pickedIds);
      const op: 'ADD' | 'REMOVE' = next.has(id) ? 'REMOVE' : 'ADD';
      if (op === 'ADD') next.add(id);
      else next.delete(id);
      return { pickedIds: next, pickHistory: [...s.pickHistory, { op, id }], pickRedoStack: [] };
    }),

  addPick: (id) =>
    set((s) => {
      if (s.pickedIds.has(id)) return s;
      const next = new Set(s.pickedIds);
      next.add(id);
      return { pickedIds: next, pickHistory: [...s.pickHistory, { op: 'ADD', id }], pickRedoStack: [] };
    }),

  removePick: (id) =>
    set((s) => {
      if (!s.pickedIds.has(id)) return s;
      const next = new Set(s.pickedIds);
      next.delete(id);
      return { pickedIds: next, pickHistory: [...s.pickHistory, { op: 'REMOVE', id }], pickRedoStack: [] };
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
      return { pickedIds: next, pickHistory: newHist, pickRedoStack: [] };
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
      return { pickedIds: next, pickHistory: newHist, pickRedoStack: [] };
    }),

  clearPicks: () =>
    set((s) => {
      // Stamp every clearance as a single history block so a
      // future Pick-mode-Undo can restore the whole batch in one shot.
      const newHist = [...s.pickHistory];
      for (const id of s.pickedIds) newHist.push({ op: 'REMOVE', id });
      return { pickedIds: new Set<string>(), pickHistory: newHist, pickRedoStack: [] };
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

  undoPick: () =>
    set((s) => {
      // Pop the latest history entry; invert it; push to redo stack.
      // Skips entries that no longer reflect the current set (e.g. an
      // ADD whose feature was subsequently removed by another path).
      const hist = [...s.pickHistory];
      const redo = [...s.pickRedoStack];
      const next = new Set(s.pickedIds);
      while (hist.length > 0) {
        const last = hist.pop()!;
        const stillRelevant =
          (last.op === 'ADD' && next.has(last.id)) ||
          (last.op === 'REMOVE' && !next.has(last.id));
        if (!stillRelevant) continue;
        if (last.op === 'ADD') next.delete(last.id);
        else next.add(last.id);
        redo.push(last);
        return { pickedIds: next, pickHistory: hist, pickRedoStack: redo };
      }
      return s;
    }),

  redoPick: () =>
    set((s) => {
      // Pop from redo, re-apply the operation, push back to history.
      if (s.pickRedoStack.length === 0) return s;
      const redo = [...s.pickRedoStack];
      const entry = redo.pop()!;
      const next = new Set(s.pickedIds);
      if (entry.op === 'ADD') {
        if (next.has(entry.id)) return s; // stale redo, drop it
        next.add(entry.id);
      } else {
        if (!next.has(entry.id)) return s;
        next.delete(entry.id);
      }
      return {
        pickedIds: next,
        pickHistory: [...s.pickHistory, entry],
        pickRedoStack: redo,
      };
    }),

  setOptions: (patch) =>
    set((s) => ({ options: { ...s.options, ...patch } })),
}));
