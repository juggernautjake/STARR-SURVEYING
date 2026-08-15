// lib/cad/store/drawing-store.ts — Central store for all drawing data
import { create } from 'zustand';
import type { DrawingDocument, Feature, FeatureGroup, Layer, DrawingSettings, TextLabel, LayerDisplayPreferences, ProjectImage, TitleBlockConfig } from '../types';
// cad-layer-grouping Slice 2 — cycle guard for moveFeatureGroup.
import { wouldCreateCycle } from '../feature-groups';
import { generateId } from '../types';
import { DEFAULT_DRAWING_SETTINGS, DEFAULT_LAYER_DISPLAY_PREFERENCES } from '../constants';
// cad-trv-import-polish Slice 2 — seed every new drawing with
// the default starting layers + their layer groups.
import { getDefaultLayersRecord, getDefaultLayerOrder, DEFAULT_LAYER_GROUPS, isReservedDrawLayer } from '../styles/default-layers';
import { DEFAULT_GLOBAL_STYLE_CONFIG } from '../styles/types';
// cad-domain-audit Slice E — canonical predicates for layer
// visibility / selectability. `getVisibleFeatures` and the new
// `getSelectableFeatures` both delegate so the rules stay in lockstep
// with `style-cascade`'s documented intent ("frozen layers are
// completely excluded from rendering, selection, and snap").
import { canFeatureBeRendered, canFeatureBeEdited } from '../styles/style-cascade';
// cad-domain-audit Slice N — normalise legacy point-name keys into
// the canonical `pointName` when a saved document loads, so callers
// can rely on a single property instead of walking the multi-key
// fallback chain.
import { canonicalizePointName } from '../feature-fields';

// ── CAD_AUDIT Slice S2b — the visible/selectable set is derived ONCE per document version ──
//
// S2 measured the freeze rather than theorising about it: on a 200,000-feature drawing, sitting
// perfectly still with no input, `renderAll` cost **269 ms per frame** — twelve frames a second
// while the app did nothing. The giveaway was `renderImageFeatures` spending 62.9 ms in a drawing
// containing **no images at all**. A pass that draws nothing cannot be slow because of drawing.
//
// It was slow because `getVisibleFeatures()` re-derived the whole set from scratch on every call —
// `Object.values` over 200k features, a predicate each, a fresh 200k array allocated — and FIVE
// passes inside a single `renderAll` each called it independently (CanvasViewport lines 2007, 2630,
// 4484, 4737, 8931). Roughly a million predicate evaluations and five large allocations per frame
// before a single pixel was drawn.
//
// WHY A REFERENCE CHECK IS A SOUND CACHE KEY HERE, and why this is not the stale-cache bug it looks
// like: the predicate reads exactly two things — `document.features` (which carries each feature's
// own `hidden` flag) and `document.layers` (visible / frozen). Every one of this store's 33 update
// paths rebuilds `document` immutably; there is no immer, no `Object.assign`, and no in-place write
// to either map anywhere in the codebase. So a changed set means a changed reference, necessarily.
// This is the same contract React already depends on to re-render at all — the cache is exactly as
// correct as the store, not a new assumption layered on top.
//
// The stale-cache failure mode is nastier than the freeze it fixes (the canvas silently stops
// updating, which looks like success), so `__resetVisibleCache` exists for tests and
// `drawing-store-visible-cache.test.ts` pins the invalidation on every axis: add, delete, hide a
// feature, hide/freeze a layer.
type VisibleCache = {
  featuresRef: DrawingDocument['features'];
  layersRef: DrawingDocument['layers'];
  visible: Feature[] | null;
  /** C3 — the ids of `visible`, as a Set.
   *
   *  `renderFeatures` needs `has(id)` and was building this from scratch every frame:
   *  `new Set(visibleFeatures.map(f => f.id))`. C2 measured it at **16.2ms p50 on a 200k drawing —
   *  78% of the whole render pass** — because it allocates a 200k string array and a 200k hash set
   *  per frame, no matter what the camera did.
   *
   *  It derives from exactly the same two references the rest of this cache is keyed on, so it
   *  invalidates on exactly the same conditions and adds no new staleness assumption. Lazy, like
   *  the buckets below: a caller that never asks never pays. */
  visibleIds: Set<string> | null;
  /** C4 — `"<featureId>:<labelId>"` for every text label on every visible feature.
   *
   *  `renderLabels` builds this to decide which Pixi.Text objects to KEEP, and it deliberately uses
   *  the un-culled set so labels are not destroyed and recreated on every pan. Correct, but it
   *  walked all 200k features per frame to do it — the same document-scale-for-a-viewport-question
   *  shape as `visibleIds` (C3), one level down. */
  visibleLabelKeys: Set<string> | null;
  selectable: Feature[] | null;
  /** Lazily built, and only for the geometry types anyone actually asks for. The IMAGE and TEXT
   *  passes each used to filter the full 200k list every frame to find their handful; now they cost
   *  the length of their own bucket. */
  byGeometryType: Map<string, Feature[]> | null;
  byFeatureType: Map<string, Feature[]> | null;
};

let visibleCache: VisibleCache | null = null;

function cacheFor(document: DrawingDocument): VisibleCache {
  if (
    visibleCache
    && visibleCache.featuresRef === document.features
    && visibleCache.layersRef === document.layers
  ) {
    return visibleCache;
  }
  visibleCache = {
    featuresRef: document.features,
    layersRef: document.layers,
    visible: null,
    visibleIds: null,
    visibleLabelKeys: null,
    selectable: null,
    byGeometryType: null,
    byFeatureType: null,
  };
  return visibleCache;
}

/** Test-only. The cache is keyed on object identity, so a fixture that reuses a `features` object
 *  across documents could otherwise read a previous document's answer. */
export function __resetVisibleCache(): void {
  visibleCache = null;
}

/** Collected for the test that proves this fires. Only appended in non-production.
 *
 *  **Capped, and the cap is not decoration.** This started as an unbounded array, which is a memory
 *  leak of exactly the kind S15's ratchet was written to catch — introduced, in the same session, by
 *  the slice that made orphaned features loud. A repeated orphan condition in a long dev session
 *  (a render loop re-adding a feature, a broken import retried) would grow it without limit.
 *
 *  S15's checker could never have found it: that guard counts `addEventListener` against
 *  `removeEventListener` and `createObjectURL` against `revokeObjectURL`. **An array that only ever
 *  grows matches no pair**, which is a fair summary of what a structural checker can and cannot do.
 *  It took reading my own diff to notice. */
const ORPHAN_WARNING_LIMIT = 50;
const orphanWarnings: string[] = [];
/** Test-only accessor + reset for the orphan-layer warnings. */
export function __orphanWarnings(): readonly string[] { return orphanWarnings; }
export function __resetOrphanWarnings(): void { orphanWarnings.length = 0; }

/**
 * CAD_AUDIT Slice S13d — shout when a feature is added to a layer that does not exist.
 *
 * This exact defect cost two separate slices in one session, in two unrelated call sites:
 *
 *   * **S8c** — the research import created features on `RESEARCH_BOUNDARY` before that layer
 *     existed. The dialog said "3 feature(s) will be added", they were added, and the canvas stayed
 *     empty.
 *   * **S13** — a brand-new drawing had `activeLayerId: ''`, so *everything a surveyor drew* landed
 *     on `layerId: ''`. The line's length and bearing were computed correctly and displayed live;
 *     Select All found three lines; nothing was ever drawn.
 *
 * Both are the same shape, and both were invisible for the same reason: `getVisibleFeatures` drops a
 * feature whose layer is missing (`if (!layer) return false`) **silently**, which is correct
 * behaviour for the renderer and a terrible diagnostic for everyone else. The feature exists, is
 * selectable, is saved, and cannot be seen — and the only symptom is an empty canvas, which reads as
 * "the tool did nothing".
 *
 * A warning at the point of insertion converts that into a named error with a stack, at the moment
 * the mistake is made rather than whenever somebody notices. It does **not** reject the write: a
 * store that refused would turn a rendering bug into lost work, and legitimate flows may add a layer
 * moments later. Warn, do not block.
 *
 * Silent in production — this is a developer diagnostic, and a surveyor cannot act on it.
 */
function warnIfLayerMissing(
  document: DrawingDocument,
  features: ReadonlyArray<Feature>,
  origin: string,
): void {
  if (process.env.NODE_ENV === 'production') return;
  // CAD_AUDIT Slice S13m — reserved layers are flagged alongside missing ones.
  //
  // Until now this checked only `!document.layers[id]`, and SURVEY-INFO **exists** — so writing
  // geometry onto the reserved sheet-info layer passed silently. Fourteen UI filters (S13h–S13l)
  // were the *entire* defence, and a fifteenth surface would have bypassed every one of them.
  //
  // That is the wrong shape for a rule. Fourteen sites were found across five rounds, and three
  // separate claims that the last one had been found were all false. A rule enforced only at the
  // edges is a rule that holds until someone adds an edge. Checking it here means a new surface is
  // caught by construction rather than by another sweep.
  const reserved = new Set<string>();
  const missing = new Set<string>();
  for (const f of features) {
    if (!document.layers[f.layerId]) missing.add(f.layerId || '(empty string)');
    else if (isReservedDrawLayer(f.layerId)) reserved.add(f.layerId);
  }
  if (reserved.size > 0) {
    const rmsg =
      `[drawing-store] ${origin}: geometry written to reserved layer(s) — ${[...reserved].join(', ')}. `
      + `That layer holds the title block, seal, scale bar, north arrow, notes and certification, and `
      + `is toggled as a unit; geometry there disappears when the sheet furniture is hidden. Use a `
      + `drawing layer (see drawableLayerIds).`;
    orphanWarnings.push(rmsg);
    if (orphanWarnings.length > ORPHAN_WARNING_LIMIT) orphanWarnings.shift();
    // eslint-disable-next-line no-console
    console.warn(rmsg);
  }
  if (missing.size === 0) return;
  const msg =
    `[drawing-store] ${origin}: ${features.length} feature(s) reference layer(s) that do not exist `
    + `— ${[...missing].join(', ')}. They will be stored and selectable but NEVER RENDERED, because `
    + `getVisibleFeatures drops features whose layer is missing. Create the layer first `
    + `(see researchLayersToCreate) or set a valid active layer.`;
  orphanWarnings.push(msg);
  // Keep the most RECENT, not the first: when this fires repeatedly the latest occurrence is the
  // one being debugged, and the first fifty of an ongoing loop say the same thing.
  if (orphanWarnings.length > ORPHAN_WARNING_LIMIT) orphanWarnings.shift();
  // eslint-disable-next-line no-console
  console.warn(msg);
}

// Start with a completely blank document — no layers, no features.
// The user must create a new drawing or import data to begin working.
function createDefaultDocument(): DrawingDocument {
  // cad-trv-import-polish Slice 2 — seed every new drawing with
  // the PHASE3 default starting layers + layer groups. Without
  // this the user gets an empty layer panel + any TRV import
  // looks like it "removed" the defaults. (The defaults weren't
  // there to start; this fix gives every new drawing the
  // expected starting set the user sees on a fresh project.)
  return {
    id: generateId(),
    name: 'Untitled Drawing',
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    author: '',
    features: {},
    layers: getDefaultLayersRecord(),
    layerOrder: getDefaultLayerOrder(),
    featureGroups: {},
    layerGroups: Object.fromEntries(DEFAULT_LAYER_GROUPS.map((g) => [g.id, g])),
    layerGroupOrder: DEFAULT_LAYER_GROUPS.map((g) => g.id),
    customSymbols: [],
    customLineTypes: [],
    codeStyleOverrides: {},
    globalStyleConfig: { ...DEFAULT_GLOBAL_STYLE_CONFIG },
    projectImages: {},
    settings: { ...DEFAULT_DRAWING_SETTINGS },
  };
}

interface DrawingStore {
  document: DrawingDocument;
  activeLayerId: string;
  isDirty: boolean;

  // Feature actions
  addFeature: (feature: Feature) => void;
  removeFeature: (featureId: string) => void;
  updateFeature: (featureId: string, updates: Partial<Feature>) => void;
  updateFeatureGeometry: (featureId: string, geometry: Feature['geometry']) => void;

  /** cad-desktop-tauri-and-perf Slice P3 — dirty-region tessellation.
   *  `dirtyFeatureIds` is a shared mutable Set the renderer reads
   *  (via `getState()`) at the top of every render frame to decide
   *  which Pixi Graphics to rebuild. Every feature mutation API
   *  inserts the touched id; the renderer calls `clearDirty(id)`
   *  per id it processed (or `clearAllDirty()` after a full pass).
   *  The Set is referentially stable across mutations — it's never
   *  exposed in a React selector, so callers don't re-render on
   *  changes. */
  dirtyFeatureIds: Set<string>;
  markFeatureDirty: (id: string | ReadonlyArray<string>) => void;
  clearFeatureDirty: (id: string | ReadonlyArray<string>) => void;
  clearAllFeatureDirty: () => void;
  markAllFeaturesDirty: () => void;

  // Layer actions
  addLayer: (layer: Layer) => void;
  removeLayer: (layerId: string) => void;
  updateLayer: (layerId: string, updates: Partial<Layer>) => void;
  setActiveLayer: (layerId: string) => void;
  reorderLayers: (layerOrder: string[]) => void;

  // Batch actions
  addFeatures: (features: Feature[]) => void;
  removeFeatures: (featureIds: string[]) => void;

  // Document actions
  newDocument: () => void;
  loadDocument: (doc: DrawingDocument) => void;
  updateDocumentName: (name: string) => void;
  updateDocumentAuthor: (author: string) => void;
  updateSettings: (settings: Partial<DrawingSettings>) => void;
  updateGlobalStyleConfig: (config: Partial<import('../styles/types').GlobalStyleConfig>) => void;
  markClean: () => void;

  // Custom line type actions
  addCustomLineType: (lineType: import('../styles/types').LineTypeDefinition) => void;
  updateCustomLineType: (id: string, updates: Partial<import('../styles/types').LineTypeDefinition>) => void;
  removeCustomLineType: (id: string) => void;

  // Layer display preferences
  updateLayerDisplayPreferences: (layerId: string, prefs: Partial<LayerDisplayPreferences>) => void;

  // Text label actions
  updateTextLabel: (featureId: string, labelId: string, updates: Partial<TextLabel>) => void;
  setFeatureTextLabels: (featureId: string, labels: TextLabel[]) => void;

  // Hidden element actions
  hideFeature: (featureId: string) => void;
  unhideFeature: (featureId: string) => void;
  getHiddenFeatures: () => Feature[];

  // Project image actions
  addProjectImage: (image: ProjectImage) => void;
  removeProjectImage: (imageId: string) => void;
  getProjectImage: (imageId: string) => ProjectImage | undefined;
  getAllProjectImages: () => ProjectImage[];

  // Title block
  updateTitleBlock: (updates: Partial<TitleBlockConfig>) => void;

  // Feature group actions
  /**
   * Group the given feature IDs into a named group.
   * All features must be on the same layer; returns null if they are not.
   * Returns null if any feature is already a member of another group — the
   * caller must remove the feature from its current group first.
   *
   * cad-layer-grouping Slice 4 — optional `parentGroupId` nests the
   * new group under an existing FeatureGroup (groups within groups).
   * Defaults to layer-root.
   */
  groupFeatures: (featureIds: string[], name?: string, parentGroupId?: string | null) => FeatureGroup | null;
  /** cad-trv-fidelity Slice 2 — add pre-built feature groups (e.g. one
   *  per imported TRV traverse) to the document in one shot. The member
   *  features are expected to already carry the matching
   *  `featureGroupId`. */
  addFeatureGroups: (groups: FeatureGroup[]) => void;
  /** Remove a feature group (features remain but are ungrouped). */
  ungroupFeatures: (groupId: string) => void;
  /**
   * Remove a single feature from its current group.
   * If the removal leaves fewer than 2 members the entire group is dissolved.
   */
  removeFeatureFromGroup: (featureId: string) => void;
  /** Rename a feature group. */
  renameFeatureGroup: (groupId: string, name: string) => void;
  /** cad-layer-grouping Slice 2 — reparent a group under another
   *  group (or move it to layer-root with `newParentId === null`).
   *  Rejects (no-op) when the move would create a cycle (self-parent
   *  or moving a group under one of its own descendants). Returns
   *  true on success, false when rejected. */
  moveFeatureGroup: (groupId: string, newParentId: string | null) => boolean;
  /** Get a feature group by id. */
  getFeatureGroup: (groupId: string) => FeatureGroup | undefined;
  /** Get all feature groups for a layer. */
  getLayerGroups: (layerId: string) => FeatureGroup[];

  // Queries
  getFeature: (id: string) => Feature | undefined;
  getLayer: (id: string) => Layer | undefined;
  getFeaturesOnLayer: (layerId: string) => Feature[];
  getVisibleFeatures: () => Feature[];
  /** C3 — the ids of `getVisibleFeatures()`, cached on the same document references.
   *
   *  For a caller that needs membership rather than the list. `renderFeatures` was building this
   *  per frame and it measured 78% of the whole render pass on a 200k drawing (C2). */
  getVisibleFeatureIds: () => Set<string>;
  /** C4 — `"<featureId>:<labelId>"` for every text label on every visible feature, cached on the
   *  same document references. `renderLabels` uses it to decide which Pixi.Text objects survive the
   *  frame, and was walking the whole drawing to rebuild it each time. */
  getVisibleLabelKeys: () => Set<string>;
  /** CAD_AUDIT S2b — visible features bucketed by `geometry.type` (e.g. 'IMAGE'), so a pass that
   *  handles one geometry kind does not walk the whole drawing to find it. */
  getVisibleFeaturesByGeometryType: (type: string) => Feature[];
  /** CAD_AUDIT S2b — visible features bucketed by the feature-level `type` (e.g. 'TEXT'). */
  getVisibleFeaturesByType: (type: string) => Feature[];
  /** cad-domain-audit Slice E — features that are SELECTABLE: their
   *  layer is visible AND not locked AND not frozen, AND the feature
   *  itself isn't hidden. Use this for snap targets / hit-testing /
   *  selection candidates; `getVisibleFeatures` is the render set
   *  (no `locked` check), and `getAllFeatures` is everything. */
  getSelectableFeatures: () => Feature[];
  getAllFeatures: () => Feature[];

  // Active layer style helper
  getActiveLayerStyle: () => { color: string; lineWeight: number; opacity: number };
  /** cad-domain-audit Slice D — single-source-of-truth resolver for
   *  the active Layer. Returns `null` when `activeLayerId` is empty
   *  or points at a layer that's no longer in the document, so
   *  callers can branch on it without re-implementing the lookup. */
  getActiveLayer: () => Layer | null;
}

const defaultDoc = createDefaultDocument();

export const useDrawingStore = create<DrawingStore>((set, get) => ({
  document: defaultDoc,
  // CAD_AUDIT Slice S13 — deliberately EMPTY, and the draw path refuses rather than orphaning.
  //
  // The bug this slice fixed was that drawing with no active layer stamped `layerId: ''`, which
  // `getVisibleFeatures` drops (`if (!layer) return false`). Confirmed in a browser: three lines
  // drawn on a fresh document, canvas empty, and Select All reporting "3 SELECTED — Editing 3 lines
  // together." The features existed, were selectable, and were never rendered.
  //
  // The first fix seeded `layerOrder[0]`, mirroring `newDocument()`. **That was wrong**, and the
  // owner caught it: `layerOrder[0]` is `SURVEY-INFO`, which is reserved for the title block, seal,
  // scale bar, north arrow, notes and certification — a layer whose whole purpose is to be toggled
  // as a unit, and not where survey geometry belongs. Auto-seeding it would have quietly made the
  // reserved layer the default drawing target.
  //
  // So a new drawing starts with NO active layer on purpose: the surveyor picks or creates the layer
  // their geometry belongs on, which is how they know where it went. What must never happen again is
  // the *silent* part — the draw handler now refuses with a message naming the next action, and no
  // feature is created. See `isReservedDrawLayer`.
  activeLayerId: '',
  isDirty: false,

  // cad-desktop-tauri-and-perf Slice P3 — shared mutable Set the
  // renderer queries each frame. Lives outside React's selector
  // surface (no `get()` selector exposes it) so mutation doesn't
  // trigger component re-renders.
  dirtyFeatureIds: new Set<string>(),
  markFeatureDirty: (id) => {
    const set = get().dirtyFeatureIds;
    if (typeof id === 'string') {
      set.add(id);
    } else {
      for (const x of id) set.add(x);
    }
  },
  clearFeatureDirty: (id) => {
    const set = get().dirtyFeatureIds;
    if (typeof id === 'string') {
      set.delete(id);
    } else {
      for (const x of id) set.delete(x);
    }
  },
  clearAllFeatureDirty: () => {
    get().dirtyFeatureIds.clear();
  },
  markAllFeaturesDirty: () => {
    const { document, dirtyFeatureIds } = get();
    for (const id of Object.keys(document.features)) dirtyFeatureIds.add(id);
  },

  addFeature: (feature) => {
    warnIfLayerMissing(get().document, [feature], 'addFeature');
    get().dirtyFeatureIds.add(feature.id);
    set((state) => ({
      document: {
        ...state.document,
        features: { ...state.document.features, [feature.id]: feature },
        modified: new Date().toISOString(),
      },
      isDirty: true,
    }));
  },

  removeFeature: (featureId) => {
    // Slice P3 — the renderer needs to know the id was REMOVED so it
    // can drop its cached Graphics, hence the dirty stamp before
    // mutation rather than after.
    get().dirtyFeatureIds.add(featureId);
    set((state) => {
      const features = { ...state.document.features };
      delete features[featureId];
      return {
        document: { ...state.document, features, modified: new Date().toISOString() },
        isDirty: true,
      };
    });
  },

  updateFeature: (featureId, updates) => {
    get().dirtyFeatureIds.add(featureId);
    set((state) => {
      const existing = state.document.features[featureId];
      if (!existing) return state;
      // CAD_AUDIT Slice S13g — the last way into this bug: MOVING a feature to a layer that does
      // not exist. `updateFeature` accepted any `layerId` unchecked, and the Properties panel's
      // "Move all to layer" writes exactly this field — so a stale id in a dropdown, or any
      // programmatic move, made the geometry vanish with no error.
      //
      // Only checked when `layerId` is actually being written. Running it on every update would
      // re-derive nothing useful on the overwhelming majority of calls, which change style or
      // geometry, and a check that costs something on every mutation is a check someone removes.
      if ('layerId' in updates && updates.layerId !== undefined) {
        warnIfLayerMissing(state.document, [{ ...existing, ...updates } as Feature], 'updateFeature');
      }
      return {
        document: {
          ...state.document,
          features: {
            ...state.document.features,
            [featureId]: { ...existing, ...updates },
          },
          modified: new Date().toISOString(),
        },
        isDirty: true,
      };
    });
  },

  updateFeatureGeometry: (featureId, geometry) => {
    get().dirtyFeatureIds.add(featureId);
    set((state) => {
      const existing = state.document.features[featureId];
      if (!existing) return state;
      return {
        document: {
          ...state.document,
          features: {
            ...state.document.features,
            [featureId]: { ...existing, geometry },
          },
          modified: new Date().toISOString(),
        },
        isDirty: true,
      };
    });
  },

  addLayer: (layer) =>
    set((state) => {
      // Re-activate when the project had no active layer (e.g. right after
      // every layer was deleted) so the user can immediately draw again.
      const hadActive = state.document.layerOrder.includes(state.activeLayerId);
      return {
        document: {
          ...state.document,
          layers: { ...state.document.layers, [layer.id]: layer },
          layerOrder: [...state.document.layerOrder, layer.id],
          modified: new Date().toISOString(),
        },
        activeLayerId: hadActive ? state.activeLayerId : layer.id,
        isDirty: true,
      };
    }),

  removeLayer: (layerId) =>
    set((state) => {
      const layer = state.document.layers[layerId];
      if (!layer) return state;
      const layers = { ...state.document.layers };
      delete layers[layerId];
      const layerOrder = state.document.layerOrder.filter((id) => id !== layerId);
      const features = { ...state.document.features };
      // cad-domain-audit Slice F — clone featureGroups too so the
      // deleted layer's groups can be migrated / dropped instead of
      // pointing at a layer that no longer exists. Previously
      // `removeLayer` only touched `layers` / `features`, so every
      // FeatureGroup whose `layerId` matched the deleted layer turned
      // into a silent orphan (the bug the audit flagged).
      const featureGroups = { ...state.document.featureGroups };

      if (layerOrder.length === 0) {
        // Deleting the LAST layer empties the project — its features (incl.
        // all point data) have nowhere to move, so they are removed too.
        for (const [fid, feature] of Object.entries(features)) {
          if (feature.layerId === layerId) delete features[fid];
        }
        // Drop every group on the deleted layer (no surviving layer
        // to migrate them to).
        for (const [gid, group] of Object.entries(featureGroups)) {
          if (group.layerId === layerId) delete featureGroups[gid];
        }
        return {
          document: { ...state.document, layers, layerOrder, features, featureGroups, modified: new Date().toISOString() },
          activeLayerId: '',
          isDirty: true,
        };
      }

      // Otherwise move the deleted layer's features onto a surviving layer.
      //
      // CAD_AUDIT Slice S13e — never migrate geometry onto the reserved sheet-info layer.
      //
      // The fallback used to be `layerOrder[0]`, and `layerOrder[0]` is **SURVEY-INFO** — the layer
      // holding the title block, seal, scale bar, north arrow, notes and certification, which S13
      // established may not receive drawn geometry. So deleting the layer you were working on moved
      // your boundary onto the title-block layer, where toggling that layer's eye to hide the sheet
      // furniture would take the survey with it.
      //
      // Same defect family as S8c/S13 and just as quiet: the features stay visible immediately
      // afterwards, so nothing looks wrong until someone hides the furniture.
      let firstDrawable = layerOrder.find((id) => !isReservedDrawLayer(id));

      // If NO drawable layer survives, make one rather than using the reserved layer as a dumping
      // ground. This is the ordinary case on a default document, which ships exactly one drawing
      // layer ("Layer 1") beside SURVEY-INFO — so deleting the layer you were working on would
      // otherwise always land the survey on the title-block layer. Losing the geometry is not an
      // option either; a third choice is needed, and creating somewhere legitimate for it to live is
      // the only one that keeps both rules.
      if (!firstDrawable) {
        const replacement: Layer = {
          id: generateId(),
          name: 'Layer 1',
          visible: true, locked: false, frozen: false,
          color: '#000000', lineWeight: 0.5, lineTypeId: 'SOLID', opacity: 1,
          groupId: null, sortOrder: layerOrder.length,
          isDefault: false, isProtected: false, autoAssignCodes: [],
          description: 'Created automatically to hold geometry from a deleted layer.',
        };
        layers[replacement.id] = replacement;
        layerOrder.push(replacement.id);
        firstDrawable = replacement.id;
      }

      const preferred =
        layerId === state.activeLayerId ? firstDrawable : state.activeLayerId;
      const safeTarget = layerOrder.includes(preferred) && !isReservedDrawLayer(preferred)
        ? preferred
        : firstDrawable;
      for (const [fid, feature] of Object.entries(features)) {
        if (feature.layerId === layerId) {
          features[fid] = { ...feature, layerId: safeTarget };
        }
      }
      // Migrate every group on the deleted layer to the same safe
      // target so the grouping intent (members move/scale/rotate
      // together) survives the delete instead of getting silently
      // dropped on the floor.
      for (const [gid, group] of Object.entries(featureGroups)) {
        if (group.layerId === layerId) {
          featureGroups[gid] = { ...group, layerId: safeTarget };
        }
      }
      const activeLayerId = layerOrder.includes(state.activeLayerId)
        ? state.activeLayerId
        : layerOrder[0];
      return {
        document: { ...state.document, layers, layerOrder, features, featureGroups, modified: new Date().toISOString() },
        activeLayerId,
        isDirty: true,
      };
    }),

  updateLayer: (layerId, updates) =>
    set((state) => {
      const existing = state.document.layers[layerId];
      if (!existing) return state;
      return {
        document: {
          ...state.document,
          layers: { ...state.document.layers, [layerId]: { ...existing, ...updates } },
          modified: new Date().toISOString(),
        },
        isDirty: true,
      };
    }),

  // cad-domain-audit Slice C — reject an id that isn't actually a
  // layer in the current document. Previously every caller was free
  // to drop in an empty string or a deleted layer's id and downstream
  // feature creation would silently orphan its features onto a
  // nonexistent layer. The store now no-ops unknown ids (logs a
  // dev-time warning) and falls back to `layerOrder[0]` when the
  // active id has been deleted out from under us.
  setActiveLayer: (layerId) =>
    set((state) => {
      if (state.document.layers[layerId]) {
        return { activeLayerId: layerId };
      }
      const fallback = state.document.layerOrder[0] ?? '';
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn(
          `[drawing-store] setActiveLayer("${layerId}") — no such layer; falling back to "${fallback}".`,
        );
      }
      return { activeLayerId: fallback };
    }),

  reorderLayers: (layerOrder) =>
    set((state) => ({
      document: { ...state.document, layerOrder, modified: new Date().toISOString() },
      isDirty: true,
    })),

  addFeatures: (features) => {
    warnIfLayerMissing(get().document, features, 'addFeatures');
    const dirty = get().dirtyFeatureIds;
    for (const f of features) dirty.add(f.id);
    set((state) => {
      const newFeatures = { ...state.document.features };
      for (const f of features) newFeatures[f.id] = f;
      return {
        document: { ...state.document, features: newFeatures, modified: new Date().toISOString() },
        isDirty: true,
      };
    });
  },

  removeFeatures: (featureIds) => {
    const dirty = get().dirtyFeatureIds;
    for (const id of featureIds) dirty.add(id);
    set((state) => {
      const features = { ...state.document.features };
      for (const id of featureIds) delete features[id];
      return {
        document: { ...state.document, features, modified: new Date().toISOString() },
        isDirty: true,
      };
    });
  },

  newDocument: () => {
    const doc = createDefaultDocument();
    // cad-domain-audit Slice D — newDocument used to leave the active
    // layer as the empty string, so the very first geometry the
    // surveyor placed landed on `layerId: ''` and was orphaned. Seed
    // the first declared layer (mirrors what loadDocument already
    // does); the Slice-C validator guarantees the id is real.
    const activeLayerId = doc.layerOrder[0] ?? '';
    // cad-desktop-tauri-and-perf Slice P3 — wipe the dirty set; the
    // old feature ids no longer exist, and the new doc starts with
    // no pending render work.
    get().dirtyFeatureIds.clear();
    set({ document: doc, activeLayerId, isDirty: false });
  },

  loadDocument: (doc) => {
    // Backwards-compat: older saved documents may not have featureGroups
    const featureGroups = doc.featureGroups ?? {};
    // Build the set of feature IDs that are actually listed in a group's featureIds.
    const groupedFeatureIds = new Set<string>();
    for (const g of Object.values(featureGroups)) {
      for (const fid of g.featureIds) groupedFeatureIds.add(fid);
    }
    // Clear stale featureGroupId references on features that aren't in any group.
    // cad-domain-audit Slice N — and migrate any legacy point-name
    // keys into the canonical `pointName` so the in-memory document
    // is uniform regardless of how it was saved. No-op when the
    // feature already has the canonical key set.
    const features = { ...doc.features };
    for (const [fid, feat] of Object.entries(features)) {
      let next = feat;
      if (next.featureGroupId && !groupedFeatureIds.has(fid)) {
        next = { ...next, featureGroupId: null };
      }
      if (next.type === 'POINT') {
        const migrated = canonicalizePointName(next.properties);
        if (migrated !== next.properties) {
          next = { ...next, properties: migrated ?? {} };
        }
      }
      if (next !== feat) features[fid] = next;
    }
    const normalized: DrawingDocument = { ...doc, featureGroups, features };
    // cad-desktop-tauri-and-perf Slice P3 — the loaded doc has its
    // own brand-new feature ids; clear any stale dirty stamps from
    // the previous doc so the renderer doesn't try to refresh
    // Graphics for ids that no longer exist.
    get().dirtyFeatureIds.clear();

    // CAD_AUDIT Slice S13f — two things, both the same bug class as S8c / S13 / S13e.
    //
    // 1. The active layer was `doc.layerOrder[0]`, and `layerOrder[0]` is **SURVEY-INFO** on every
    //    document shaped like the default one. So opening a saved drawing made the reserved
    //    title-block layer active, and the first thing a surveyor did was get refused by S13's draw
    //    guard — on a drawing they had just opened, with no indication of why. Pick the first
    //    DRAWABLE layer instead; fall back to `layerOrder[0]` only when every surviving layer is
    //    reserved, and to `''` when the document genuinely has none (the guard handles that and
    //    says so).
    const firstDrawable = normalized.layerOrder.find((id) => !isReservedDrawLayer(id));
    const nextActive = firstDrawable ?? normalized.layerOrder[0] ?? '';

    // 2. A saved file can carry features whose layer is not in the file — an older format, a
    //    hand-edited `.starr`, a partial recovery snapshot. Those features load, save again, and are
    //    never drawn, which presents as "some of my drawing is missing" with nothing to point at.
    //    The insertion-time warning cannot see this, because loading is not an insertion.
    warnIfLayerMissing(normalized, Object.values(normalized.features), 'loadDocument');

    set({ document: normalized, activeLayerId: nextActive, isDirty: false });
  },

  updateDocumentName: (name) =>
    set((state) => ({
      document: { ...state.document, name, modified: new Date().toISOString() },
      isDirty: true,
    })),

  updateDocumentAuthor: (author) =>
    set((state) => ({
      document: { ...state.document, author, modified: new Date().toISOString() },
      isDirty: true,
    })),

  addCustomLineType: (lineType) =>
    set((state) => ({
      document: {
        ...state.document,
        customLineTypes: [
          ...state.document.customLineTypes.filter((lt) => lt.id !== lineType.id),
          { ...lineType, category: 'CUSTOM', isBuiltIn: false, isEditable: true },
        ],
        modified: new Date().toISOString(),
      },
      isDirty: true,
    })),

  updateCustomLineType: (id, updates) =>
    set((state) => ({
      document: {
        ...state.document,
        customLineTypes: state.document.customLineTypes.map((lt) =>
          lt.id === id ? { ...lt, ...updates, id, isBuiltIn: false } : lt
        ),
        modified: new Date().toISOString(),
      },
      isDirty: true,
    })),

  removeCustomLineType: (id) =>
    set((state) => ({
      document: {
        ...state.document,
        customLineTypes: state.document.customLineTypes.filter((lt) => lt.id !== id),
        modified: new Date().toISOString(),
      },
      isDirty: true,
    })),

  updateSettings: (settings) =>
    set((state) => ({
      document: {
        ...state.document,
        settings: { ...state.document.settings, ...settings },
        modified: new Date().toISOString(),
      },
      isDirty: true,
    })),

  updateGlobalStyleConfig: (config) =>
    set((state) => ({
      document: {
        ...state.document,
        globalStyleConfig: { ...state.document.globalStyleConfig, ...config },
        modified: new Date().toISOString(),
      },
      isDirty: true,
    })),

  updateLayerDisplayPreferences: (layerId, prefs) =>
    set((state) => {
      const layer = state.document.layers[layerId];
      if (!layer) return state;
      return {
        document: {
          ...state.document,
          layers: {
            ...state.document.layers,
            [layerId]: {
              ...layer,
              displayPreferences: {
                ...DEFAULT_LAYER_DISPLAY_PREFERENCES,
                ...(layer.displayPreferences ?? {}),
                ...prefs,
              } as LayerDisplayPreferences,
            },
          },
          modified: new Date().toISOString(),
        },
        isDirty: true,
      };
    }),

  updateTextLabel: (featureId, labelId, updates) =>
    set((state) => {
      const feature = state.document.features[featureId];
      if (!feature) return state;
      const labels = (feature.textLabels ?? []).map((l) =>
        l.id === labelId ? { ...l, ...updates } : l,
      );
      return {
        document: {
          ...state.document,
          features: {
            ...state.document.features,
            [featureId]: { ...feature, textLabels: labels },
          },
          modified: new Date().toISOString(),
        },
        isDirty: true,
      };
    }),

  setFeatureTextLabels: (featureId, labels) => {
    get().dirtyFeatureIds.add(featureId);
    set((state) => {
      const feature = state.document.features[featureId];
      if (!feature) return state;
      return {
        document: {
          ...state.document,
          features: {
            ...state.document.features,
            [featureId]: { ...feature, textLabels: labels },
          },
          modified: new Date().toISOString(),
        },
        isDirty: true,
      };
    });
  },

  hideFeature: (featureId) =>
    set((state) => {
      const feature = state.document.features[featureId];
      if (!feature) return state;
      return {
        document: {
          ...state.document,
          features: {
            ...state.document.features,
            [featureId]: { ...feature, hidden: true },
          },
          modified: new Date().toISOString(),
        },
        isDirty: true,
      };
    }),

  unhideFeature: (featureId) =>
    set((state) => {
      const feature = state.document.features[featureId];
      if (!feature) return state;
      return {
        document: {
          ...state.document,
          features: {
            ...state.document.features,
            [featureId]: { ...feature, hidden: false },
          },
          modified: new Date().toISOString(),
        },
        isDirty: true,
      };
    }),

  getHiddenFeatures: () =>
    Object.values(get().document.features).filter((f) => f.hidden === true),

  // ── Project image actions ────────────────────────────────────────────────────

  addProjectImage: (image) =>
    set((state) => ({
      document: {
        ...state.document,
        projectImages: { ...(state.document.projectImages ?? {}), [image.id]: image },
        modified: new Date().toISOString(),
      },
      isDirty: true,
    })),

  removeProjectImage: (imageId) =>
    set((state) => {
      const projectImages = { ...(state.document.projectImages ?? {}) };
      delete projectImages[imageId];
      return {
        document: { ...state.document, projectImages, modified: new Date().toISOString() },
        isDirty: true,
      };
    }),

  getProjectImage: (imageId) => (get().document.projectImages ?? {})[imageId],

  getAllProjectImages: () => Object.values(get().document.projectImages ?? {}),

  // ── Title block ──────────────────────────────────────────────────────────────

  updateTitleBlock: (updates) =>
    set((state) => ({
      document: {
        ...state.document,
        settings: {
          ...state.document.settings,
          titleBlock: { ...state.document.settings.titleBlock, ...updates },
        },
        modified: new Date().toISOString(),
      },
      isDirty: true,
    })),

  markClean: () => set({ isDirty: false }),

  // ── Feature group actions ────────────────────────────────────────────────────

  groupFeatures: (featureIds, name, parentGroupId) => {
    const state = get();
    const features = featureIds.map((id) => state.document.features[id]).filter(Boolean);
    if (features.length < 2) return null;
    // All features must be on the same layer
    const layerId = features[0].layerId;
    if (features.some((f) => f.layerId !== layerId)) return null;
    // Reject if any feature already belongs to a group — it must be removed first
    if (features.some((f) => f.featureGroupId)) return null;
    // cad-layer-grouping Slice 4 — if a parentGroupId is supplied,
    // it must reference an existing group on the same layer.
    // Anything else (unknown id, cross-layer) is rejected so the
    // resulting tree never crosses layers.
    const normalizedParent: string | null = parentGroupId ?? null;
    if (normalizedParent !== null) {
      const parent = state.document.featureGroups[normalizedParent];
      if (!parent || parent.layerId !== layerId) return null;
    }
    const groupId = generateId();
    // Generate a unique group name: prefer the user-supplied name, else use
    // a short UUID fragment so names remain unique even after groups are deleted.
    const defaultName = `Group ${groupId.substring(0, 6).toUpperCase()}`;
    const group: FeatureGroup = {
      id: groupId,
      name: name || defaultName,
      layerId,
      featureIds: featureIds.filter((id) => !!state.document.features[id]),
      parentGroupId: normalizedParent,
    };
    const updatedFeatures = { ...state.document.features };
    for (const id of group.featureIds) {
      if (updatedFeatures[id]) {
        updatedFeatures[id] = { ...updatedFeatures[id], featureGroupId: groupId };
      }
    }
    set((s) => ({
      document: {
        ...s.document,
        features: updatedFeatures,
        featureGroups: { ...s.document.featureGroups, [groupId]: group },
        modified: new Date().toISOString(),
      },
      isDirty: true,
    }));
    return group;
  },

  addFeatureGroups: (groups) =>
    set((state) => {
      if (groups.length === 0) return state;
      const featureGroups = { ...state.document.featureGroups };
      for (const g of groups) featureGroups[g.id] = g;
      return {
        document: { ...state.document, featureGroups, modified: new Date().toISOString() },
        isDirty: true,
      };
    }),

  ungroupFeatures: (groupId) =>
    set((state) => {
      const group = state.document.featureGroups[groupId];
      if (!group) return state;
      const updatedFeatures = { ...state.document.features };
      for (const id of group.featureIds) {
        if (updatedFeatures[id]) {
          updatedFeatures[id] = { ...updatedFeatures[id], featureGroupId: null };
        }
      }
      const updatedGroups = { ...state.document.featureGroups };
      delete updatedGroups[groupId];
      return {
        document: {
          ...state.document,
          features: updatedFeatures,
          featureGroups: updatedGroups,
          modified: new Date().toISOString(),
        },
        isDirty: true,
      };
    }),

  removeFeatureFromGroup: (featureId) =>
    set((state) => {
      const feature = state.document.features[featureId];
      if (!feature?.featureGroupId) return state;
      const groupId = feature.featureGroupId;
      const group = state.document.featureGroups[groupId];
      if (!group) {
        // Group reference is stale — just clear the feature's pointer
        return {
          document: {
            ...state.document,
            features: {
              ...state.document.features,
              [featureId]: { ...feature, featureGroupId: null },
            },
            modified: new Date().toISOString(),
          },
          isDirty: true,
        };
      }
      const remainingIds = group.featureIds.filter((id) => id !== featureId);
      const updatedFeatures = {
        ...state.document.features,
        [featureId]: { ...feature, featureGroupId: null },
      };
      const updatedGroups = { ...state.document.featureGroups };
      if (remainingIds.length < 2) {
        // Dissolve the group — too few members to remain a group
        for (const id of remainingIds) {
          if (updatedFeatures[id]) {
            updatedFeatures[id] = { ...updatedFeatures[id], featureGroupId: null };
          }
        }
        delete updatedGroups[groupId];
      } else {
        updatedGroups[groupId] = { ...group, featureIds: remainingIds };
      }
      return {
        document: {
          ...state.document,
          features: updatedFeatures,
          featureGroups: updatedGroups,
          modified: new Date().toISOString(),
        },
        isDirty: true,
      };
    }),

  moveFeatureGroup: (groupId, newParentId) => {
    const state = get();
    const groups = state.document.featureGroups;
    const group = groups[groupId];
    if (!group) return false;
    // newParentId === null is always safe (move to layer-root). Else
    // the target must exist + must NOT be the group itself + must
    // NOT be a descendant of the group.
    if (newParentId !== null) {
      if (!groups[newParentId]) return false;
      if (wouldCreateCycle(groups, groupId, newParentId)) return false;
    }
    set((s) => ({
      document: {
        ...s.document,
        featureGroups: {
          ...s.document.featureGroups,
          [groupId]: { ...group, parentGroupId: newParentId },
        },
        modified: new Date().toISOString(),
      },
      isDirty: true,
    }));
    return true;
  },

  renameFeatureGroup: (groupId, name) =>
    set((state) => {
      const group = state.document.featureGroups[groupId];
      if (!group) return state;
      return {
        document: {
          ...state.document,
          featureGroups: {
            ...state.document.featureGroups,
            [groupId]: { ...group, name },
          },
          modified: new Date().toISOString(),
        },
        isDirty: true,
      };
    }),

  getFeatureGroup: (groupId) => get().document.featureGroups[groupId],

  getLayerGroups: (layerId) =>
    Object.values(get().document.featureGroups).filter((g) => g.layerId === layerId),

  getFeature: (id) => get().document.features[id],

  getLayer: (id) => get().document.layers[id],

  getFeaturesOnLayer: (layerId) =>
    Object.values(get().document.features).filter((f) => f.layerId === layerId),

  getVisibleFeatures: () => {
    const { document } = get();
    const cache = cacheFor(document);
    if (cache.visible) return cache.visible;
    cache.visible = Object.values(document.features).filter((f) => {
      if (f.hidden === true) return false;
      const layer = document.layers[f.layerId];
      if (!layer) return false;
      // cad-domain-audit Slice E — honor `frozen` too. The previous
      // predicate only checked `visible`, so snap / hit-testing /
      // render walks (every consumer of this selector) silently
      // included frozen layers — contradicting the documented intent
      // of `canFeatureBeRendered`.
      return canFeatureBeRendered(layer);
    });
    return cache.visible;
  },

  /** C3 — membership of the visible set, built once per document version rather than per frame.
   *
   *  Deliberately derived from `getVisibleFeatures()` rather than re-filtering `document.features`
   *  independently: two predicates that must agree are two predicates that can disagree, and this
   *  one decides whether a Graphics object is destroyed. Reusing the list makes divergence
   *  impossible rather than merely unlikely. */
  getVisibleFeatureIds: () => {
    const { document } = get();
    const cache = cacheFor(document);
    if (cache.visibleIds) return cache.visibleIds;
    const visible = get().getVisibleFeatures();
    const ids = new Set<string>();
    for (const f of visible) ids.add(f.id);
    cache.visibleIds = ids;
    return ids;
  },

  /** C4 — label-key membership, built once per document version rather than per frame.
   *
   *  Same derivation as `getVisibleFeatureIds`: from `getVisibleFeatures()`, not from an
   *  independent walk of `document.features`. `renderLabels` uses this to decide which labels to
   *  KEEP, so a key missing here destroys a Pixi.Text that should have survived — a divergence
   *  between two predicates would show up as labels flickering on pan. */
  getVisibleLabelKeys: () => {
    const { document } = get();
    const cache = cacheFor(document);
    if (cache.visibleLabelKeys) return cache.visibleLabelKeys;
    const keys = new Set<string>();
    for (const f of get().getVisibleFeatures()) {
      const labels = f.textLabels;
      if (!labels) continue;
      for (const l of labels) keys.add(`${f.id}:${l.id}`);
    }
    cache.visibleLabelKeys = keys;
    return keys;
  },

  /** S2b — the visible features whose GEOMETRY is of one type, without walking the rest.
   *  `renderImageFeatures` was filtering all 200,000 features every frame to find its zero images;
   *  that single pass measured 62.9 ms of a 269 ms frame. */
  getVisibleFeaturesByGeometryType: (type: string) => {
    const { document } = get();
    const cache = cacheFor(document);
    if (!cache.byGeometryType) {
      const buckets = new Map<string, Feature[]>();
      // Built from the memoised visible list so the predicate runs at most once per document
      // version no matter which accessor is reached first.
      for (const f of get().getVisibleFeatures()) {
        const key = f.geometry?.type;
        if (!key) continue;
        const bucket = buckets.get(key);
        if (bucket) bucket.push(f);
        else buckets.set(key, [f]);
      }
      cache.byGeometryType = buckets;
    }
    return cache.byGeometryType.get(type) ?? [];
  },

  /** S2b — same, for the FEATURE-level `type` discriminator that `renderTextFeatures` filters on.
   *  Kept separate from the geometry index because they are genuinely different fields and
   *  conflating them is how a TEXT feature with non-TEXT geometry would quietly disappear. */
  getVisibleFeaturesByType: (type: string) => {
    const { document } = get();
    const cache = cacheFor(document);
    if (!cache.byFeatureType) {
      const buckets = new Map<string, Feature[]>();
      for (const f of get().getVisibleFeatures()) {
        const key = f.type;
        if (!key) continue;
        const bucket = buckets.get(key);
        if (bucket) bucket.push(f);
        else buckets.set(key, [f]);
      }
      cache.byFeatureType = buckets;
    }
    return cache.byFeatureType.get(type) ?? [];
  },

  getSelectableFeatures: () => {
    const { document } = get();
    const cache = cacheFor(document);
    if (cache.selectable) return cache.selectable;
    // Memoised for the same reason as the render set, but the payoff is on a different path: this
    // one backs snap and hit-testing, so before S2b every mousemove over a large drawing re-derived
    // it from scratch.
    cache.selectable = Object.values(document.features).filter((f) => {
      if (f.hidden === true) return false;
      const layer = document.layers[f.layerId];
      if (!layer) return false;
      return canFeatureBeEdited(layer);
    });
    return cache.selectable;
  },

  getAllFeatures: () => Object.values(get().document.features),

  getActiveLayerStyle: () => {
    const layer = get().getActiveLayer();
    if (layer) {
      return { color: layer.color, lineWeight: layer.lineWeight, opacity: layer.opacity };
    }
    return { color: '#000000', lineWeight: 1, opacity: 1 };
  },

  getActiveLayer: () => {
    const { document, activeLayerId } = get();
    if (!activeLayerId) return null;
    return document.layers[activeLayerId] ?? null;
  },
}));
