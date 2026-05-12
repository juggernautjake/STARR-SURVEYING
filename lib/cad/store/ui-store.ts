// lib/cad/store/ui-store.ts — UI panel visibility state
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { TransferOptions } from './transfer-store';
import type { LinearUnit } from '../units/parse-length';
import type { AreaUnit } from '../units/parse-area';

export type AISidebarTab =
  | 'queue'
  | 'assistant'
  | 'explanations'
  | 'versions'
  | 'checklist';

/**
 * Phase 8 §11.7 Slice 13 — saved transfer configuration.
 * Captures every option the surveyor would otherwise re-type
 * each time they run a recurring transfer (e.g. "Working →
 * Print copy"). Source set is intentionally NOT captured
 * (it's per-job); presets store the routing + options only.
 */
export interface TransferPreset {
  id: string;
  name: string;
  /** Snapshot of TransferOptions at save time. Stored as a
   *  plain object so it survives localStorage round-trip. */
  options: TransferOptions;
  /** ISO timestamp of last invocation. Drives dropdown sort. */
  lastUsedAt: string | null;
  /** How many times Confirm fired with this preset loaded.
   *  Lets the dropdown surface "recently popular" presets. */
  useCount: number;
  /** When true, this preset auto-loads on dialog open. At
   *  most one preset can be flagged default at a time;
   *  setDefaultTransferPreset() enforces. */
  isDefault: boolean;
  /** True for the five firm-shipped defaults so the dropdown
   *  can mark them visually. Surveyor can still edit / delete /
   *  override them — bundled is just metadata, not a lock. */
  isBundled?: boolean;
}

/**
 * Phase 8 §11.7 Slice 14 — bundled transfer presets that
 * ship with the firm's default configuration. Auto-seeded
 * into `transferPresets` on first run (when the persisted
 * array is empty). Each captures the SEMANTICS of a
 * recurring transfer the firm runs; surveyor picks the
 * specific destination layer at use-time since layer ids
 * are per-document.
 *
 * Editable + deletable like any saved preset — bundled is
 * metadata, not a lock.
 */
const BUNDLED_TRANSFER_PRESETS: ReadonlyArray<Omit<TransferPreset, 'id' | 'lastUsedAt' | 'useCount'>> = [
  {
    name: 'Monuments → Final plat',
    options: {
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
    },
    isDefault: false,
    isBundled: true,
  },
  {
    name: 'Boundary → Print copy',
    options: {
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
      lockSourceAfterCopy: true,
      linkDuplicatesToSource: false,
      codeMap: {},
    },
    isDefault: false,
    isBundled: true,
  },
  {
    name: 'Topo → Field reference',
    options: {
      operation: 'DUPLICATE',
      targetLayerId: null,
      additionalTargetLayerIds: [],
      targetTraverseId: null,
      keepOriginals: true,
      renumberStart: null,
      stripUnknownCodes: false,
      bringAlongLinkedGeometry: false,
      offsetDistanceFt: 0,
      offsetBearingDeg: 0,
      applyOffset: false,
      lockSourceAfterCopy: false,
      linkDuplicatesToSource: false,
      codeMap: {},
    },
    isDefault: false,
    isBundled: true,
  },
  {
    name: 'Setbacks → Setback overlay',
    options: {
      operation: 'DUPLICATE',
      targetLayerId: null,
      additionalTargetLayerIds: [],
      targetTraverseId: null,
      keepOriginals: true,
      renumberStart: null,
      stripUnknownCodes: false,
      bringAlongLinkedGeometry: true,
      // Sensible setback default — surveyor edits in dialog.
      offsetDistanceFt: 5,
      offsetBearingDeg: 0,
      applyOffset: false,
      lockSourceAfterCopy: false,
      linkDuplicatesToSource: false,
      codeMap: {},
    },
    isDefault: false,
    isBundled: true,
  },
  {
    name: 'Working set → Archive',
    options: {
      operation: 'MOVE',
      targetLayerId: null,
      additionalTargetLayerIds: [],
      targetTraverseId: null,
      keepOriginals: false,
      renumberStart: null,
      stripUnknownCodes: false,
      bringAlongLinkedGeometry: false,
      offsetDistanceFt: 0,
      offsetBearingDeg: 0,
      applyOffset: false,
      lockSourceAfterCopy: false,
      linkDuplicatesToSource: false,
      codeMap: {},
    },
    isDefault: false,
    isBundled: true,
  },
];

/**
 * Build the bundled preset list with fresh ids + zeroed
 * use-stats. Called on first-run hydration (or when the
 * surveyor explicitly resets to bundled defaults).
 */
function buildBundledPresets(): TransferPreset[] {
  return BUNDLED_TRANSFER_PRESETS.map((p, i) => ({
    ...p,
    id: `bundled-${i}-${Date.now()}`,
    lastUsedAt: null,
    useCount: 0,
  }));
}

/**
 * Phase 8 §11.7 Slice 20 — saved selection block.
 * Names a reusable source set so a surveyor who picks the
 * same fence-corner-detail or building-footprint shape
 * repeatedly can recall it with one click. Tied to a
 * drawing via documentId since feature ids are
 * document-scoped; the load UI hides blocks from other
 * drawings to keep the list relevant.
 */
export interface SelectionBlock {
  id: string;
  name: string;
  /** Document the block belongs to. */
  documentId: string;
  /** Captured feature ids at save time. */
  featureIds: string[];
  /** ISO timestamp the block was created. */
  createdAt: string;
  /** Last time the surveyor loaded this block. */
  lastUsedAt: string | null;
  useCount: number;
}

interface UIStore {
  showLayerPanel: boolean;
  showPropertyPanel: boolean;
  showCommandBar: boolean;
  showStatusBar: boolean;
  commandBarFocused: boolean;

  // Phase 7 §3 — unified AI sidebar (right edge of the
  // editor). One open/close switch + the active tab.
  showAISidebar: boolean;
  aiSidebarTab: AISidebarTab;
  /** §29.3 — feature hovered in the confidence-card list.
   *  CanvasViewport reads this and draws a tier-colored
   *  highlight ring around the matching feature so cards ↔
   *  canvas stay visually correlated. */
  hoveredFeatureId: string | null;
  /** §5 — global tooltip toggles. UI tooltips fire on
   *  buttons / form controls; feature tooltips on the
   *  canvas hover. Both default on; the surveyor can mute
   *  either independently from the upcoming Settings page. */
  uiTooltipsEnabled: boolean;
  featureTooltipsEnabled: boolean;
  /** §10.3 — global hover delay (ms) before any tooltip
   *  appears. Default 600 ms; range 100–3000. Tooltips that
   *  pass an explicit `delay` prop override this. */
  tooltipDelayMs: number;
  /** Phase 8 §11.5.7 — when true (default), the angle parser
   *  treats decimals with 3+ fractional digits as DMS-packed
   *  shortcuts (`45.3000` → `45°30'00"`). Surveyors who only ever
   *  want decimal degrees can disable this so the heuristic stops
   *  rewriting their input. Threaded through `parseAngle` opts at
   *  every consumer site (`CommandBar`, `UnitInput`). */
  dmsPackedShortcutEnabled: boolean;
  /** Phase 8 §11.5.5 — per-field unit lock. Keyed by a stable
   *  `fieldId` ("offset.distance", "fillet.radius", "array.col",
   *  …) so a surveyor who pins an input to inches keeps that
   *  unit across reloads even when the document defaults to
   *  feet. UnitInput reads the entry on mount + writes through
   *  on dropdown change when its `fieldId` prop is set. */
  fieldUnitLocks: Record<string, LinearUnit | AreaUnit>;
  /** §9 — firm-wide branding logo, stored as a base64 data
   *  URL so it round-trips through `localStorage` without a
   *  separate asset pipeline. When present, the title-block
   *  header replaces the firm-name text with this image on
   *  every drawing. Null = no logo (fall back to the firm
   *  name text). */
  firmLogoDataUrl: string | null;
  /** Phase 8 §11.7 Slice 13 — firm-wide saved transfer
   *  configurations. Persisted; surveyor sees them in every
   *  drawing they open. */
  transferPresets: TransferPreset[];
  /** Phase 8 §11.7 Slice 20 — saved selection blocks keyed
   *  by drawing. Persisted; the dialog filters to the
   *  current drawing's blocks on load. */
  selectionBlocks: SelectionBlock[];

  toggleLayerPanel: () => void;
  togglePropertyPanel: () => void;
  setCommandBarFocused: (focused: boolean) => void;
  toggleAISidebar: () => void;
  openAISidebar: (tab?: AISidebarTab) => void;
  closeAISidebar: () => void;
  setAISidebarTab: (tab: AISidebarTab) => void;
  setHoveredFeatureId: (featureId: string | null) => void;
  setUITooltipsEnabled: (enabled: boolean) => void;
  setFeatureTooltipsEnabled: (enabled: boolean) => void;
  setTooltipDelayMs: (ms: number) => void;
  setDmsPackedShortcutEnabled: (enabled: boolean) => void;
  setFieldUnitLock: (fieldId: string, unit: LinearUnit | AreaUnit | null) => void;
  setFirmLogoDataUrl: (dataUrl: string | null) => void;
  /** Add a new transfer preset. id auto-generated. Replaces
   *  existing preset with the same name (so re-saving keeps
   *  the dropdown tidy). */
  addTransferPreset: (name: string, options: TransferOptions, makeDefault?: boolean) => string;
  /** Remove a preset by id. */
  removeTransferPreset: (id: string) => void;
  /** Flip the default flag on one preset (and clear it on the
   *  rest). Pass null to unset the default. */
  setDefaultTransferPreset: (id: string | null) => void;
  /** Bump lastUsedAt + useCount on the preset that just fired
   *  Confirm. */
  recordTransferPresetUse: (id: string) => void;
  /** Add a named selection block scoped to one drawing. */
  addSelectionBlock: (name: string, documentId: string, featureIds: string[]) => string;
  /** Remove a block by id. */
  removeSelectionBlock: (id: string) => void;
  /** Bump lastUsedAt + useCount when a block is loaded. */
  recordSelectionBlockUse: (id: string) => void;
}

/**
 * The UI store keeps two kinds of state:
 *
 *   - **Session-scoped** (panel visibility, AI sidebar tab,
 *     hovered feature id, command-bar focus). These are
 *     fluid and shouldn't survive a reload — opening a fresh
 *     drawing should always present the default workspace.
 *
 *   - **Persistent preferences** (the two tooltip toggles).
 *     A surveyor who turns off feature hover-tooltips
 *     expects them to stay off after a refresh.
 *
 * Phase 8 §11 → split via `persist` middleware with a
 * `partialize` allow-list that only writes the persistent
 * keys to localStorage. Session-scoped state is reset to
 * defaults on every reload exactly like before.
 */
export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      showLayerPanel: true,
      showPropertyPanel: true,
      showCommandBar: true,
      showStatusBar: true,
      commandBarFocused: false,
      showAISidebar: false,
      aiSidebarTab: 'queue',
      hoveredFeatureId: null,
      uiTooltipsEnabled: true,
      featureTooltipsEnabled: true,
      tooltipDelayMs: 600,
      dmsPackedShortcutEnabled: true,
      fieldUnitLocks: {},
      firmLogoDataUrl: null,
      // Seed bundled presets on initial state construction.
      // The persist middleware's onRehydrate will preserve
      // the surveyor's saved presets when state hydrates;
      // see the `onRehydrateStorage` hook below for the
      // re-seed when localStorage is empty / cleared.
      transferPresets: buildBundledPresets(),
      selectionBlocks: [],

      toggleLayerPanel: () => set((s) => ({ showLayerPanel: !s.showLayerPanel })),
      togglePropertyPanel: () => set((s) => ({ showPropertyPanel: !s.showPropertyPanel })),
      setCommandBarFocused: (focused) => set({ commandBarFocused: focused }),
      toggleAISidebar: () => set((s) => ({ showAISidebar: !s.showAISidebar })),
      openAISidebar: (tab) =>
        set((s) => ({ showAISidebar: true, aiSidebarTab: tab ?? s.aiSidebarTab })),
      closeAISidebar: () => set({ showAISidebar: false }),
      setAISidebarTab: (tab) => set({ aiSidebarTab: tab }),
      setHoveredFeatureId: (featureId) => set({ hoveredFeatureId: featureId }),
      setUITooltipsEnabled: (enabled) => set({ uiTooltipsEnabled: enabled }),
      setFeatureTooltipsEnabled: (enabled) => set({ featureTooltipsEnabled: enabled }),
      setTooltipDelayMs: (ms) => set({
        tooltipDelayMs: Number.isFinite(ms) ? Math.max(100, Math.min(3000, Math.round(ms))) : 600,
      }),
      setDmsPackedShortcutEnabled: (enabled) => set({ dmsPackedShortcutEnabled: !!enabled }),
      setFieldUnitLock: (fieldId, unit) =>
        set((s) => {
          if (!fieldId) return s;
          const next = { ...s.fieldUnitLocks };
          if (unit == null) {
            delete next[fieldId];
          } else {
            next[fieldId] = unit;
          }
          return { fieldUnitLocks: next };
        }),
      setFirmLogoDataUrl: (dataUrl) => set({
        // Cap the persisted blob at ~1 MB so a giant logo
        // doesn't blow out localStorage (5 MB quota in most
        // browsers). Caller is expected to downscale before
        // calling — this is just a backstop.
        firmLogoDataUrl:
          dataUrl == null
            ? null
            : dataUrl.length > 1_500_000
              ? null
              : dataUrl,
      }),

      addTransferPreset: (name, options, makeDefault) => {
        const trimmed = name.trim();
        if (!trimmed) return '';
        const id = `tp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const fresh: TransferPreset = {
          id,
          name: trimmed,
          // Deep-clone the options snapshot so subsequent
          // dialog edits don't mutate the saved preset.
          options: JSON.parse(JSON.stringify(options)) as TransferOptions,
          lastUsedAt: null,
          useCount: 0,
          isDefault: !!makeDefault,
        };
        set((s) => {
          // Replace any existing preset that shares the same
          // name (case-insensitive) so re-saving stays tidy.
          const others = s.transferPresets.filter(
            (p) => p.name.toLowerCase() !== trimmed.toLowerCase(),
          );
          // If this one is being flagged default, clear the
          // default on every sibling.
          const cleaned = makeDefault
            ? others.map((p) => ({ ...p, isDefault: false }))
            : others;
          return { transferPresets: [...cleaned, fresh] };
        });
        return id;
      },

      removeTransferPreset: (id) => set((s) => ({
        transferPresets: s.transferPresets.filter((p) => p.id !== id),
      })),

      setDefaultTransferPreset: (id) => set((s) => ({
        transferPresets: s.transferPresets.map((p) => ({
          ...p,
          isDefault: p.id === id,
        })),
      })),

      recordTransferPresetUse: (id) => set((s) => ({
        transferPresets: s.transferPresets.map((p) =>
          p.id === id
            ? { ...p, lastUsedAt: new Date().toISOString(), useCount: p.useCount + 1 }
            : p,
        ),
      })),

      addSelectionBlock: (name, documentId, featureIds) => {
        const trimmed = name.trim();
        if (!trimmed || featureIds.length === 0) return '';
        const id = `sb-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const block: SelectionBlock = {
          id,
          name: trimmed,
          documentId,
          // Deep-clone the id list so subsequent picks don't
          // mutate the saved block.
          featureIds: [...featureIds],
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
          useCount: 0,
        };
        set((s) => {
          // Replace any existing block with the same name +
          // document so re-saving stays tidy.
          const others = s.selectionBlocks.filter(
            (b) => !(b.documentId === documentId && b.name.toLowerCase() === trimmed.toLowerCase()),
          );
          return { selectionBlocks: [...others, block] };
        });
        return id;
      },

      removeSelectionBlock: (id) => set((s) => ({
        selectionBlocks: s.selectionBlocks.filter((b) => b.id !== id),
      })),

      recordSelectionBlockUse: (id) => set((s) => ({
        selectionBlocks: s.selectionBlocks.map((b) =>
          b.id === id
            ? { ...b, lastUsedAt: new Date().toISOString(), useCount: b.useCount + 1 }
            : b,
        ),
      })),
    }),
    {
      name: 'starr-cad-ui',
      version: 7,
      storage: createJSONStorage(() => localStorage),
      // Allow-list — only the surveyor-visible toggles persist.
      partialize: (s) => ({
        uiTooltipsEnabled: s.uiTooltipsEnabled,
        featureTooltipsEnabled: s.featureTooltipsEnabled,
        tooltipDelayMs: s.tooltipDelayMs,
        dmsPackedShortcutEnabled: s.dmsPackedShortcutEnabled,
        fieldUnitLocks: s.fieldUnitLocks,
        firmLogoDataUrl: s.firmLogoDataUrl,
        transferPresets: s.transferPresets,
        selectionBlocks: s.selectionBlocks,
      }),
      onRehydrateStorage: () => (state) => {
        // First-run path: when localStorage hydrates an
        // empty transferPresets array (either no persist
        // record OR the surveyor cleared everything), seed
        // the bundled defaults. Once a surveyor has any
        // saved preset (bundled or custom) we leave them
        // alone so the dropdown stays under their control.
        if (state && (!state.transferPresets || state.transferPresets.length === 0)) {
          state.transferPresets = buildBundledPresets();
        }
      },
    }
  )
);
