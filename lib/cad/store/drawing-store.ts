// lib/cad/store/drawing-store.ts — Central store for all drawing data
import { create } from 'zustand';
import type { DrawingDocument, Feature, FeatureGroup, Layer, DrawingSettings, TextLabel, LayerDisplayPreferences, ProjectImage, TitleBlockConfig } from '../types';
// cad-layer-grouping Slice 2 — cycle guard for moveFeatureGroup.
import { wouldCreateCycle } from '../feature-groups';
import { generateId } from '../types';
import { DEFAULT_DRAWING_SETTINGS, DEFAULT_LAYER_DISPLAY_PREFERENCES } from '../constants';
// cad-trv-import-polish Slice 2 — seed every new drawing with
// the default starting layers + their layer groups.
import { getDefaultLayersRecord, getDefaultLayerOrder, DEFAULT_LAYER_GROUPS } from '../styles/default-layers';
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
      const targetLayerId =
        layerId === state.activeLayerId ? layerOrder[0] : state.activeLayerId;
      const safeTarget = layerOrder.includes(targetLayerId) ? targetLayerId : layerOrder[0];
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
    set({ document: normalized, activeLayerId: doc.layerOrder[0] ?? '', isDirty: false });
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
    return Object.values(document.features).filter((f) => {
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
  },

  getSelectableFeatures: () => {
    const { document } = get();
    return Object.values(document.features).filter((f) => {
      if (f.hidden === true) return false;
      const layer = document.layers[f.layerId];
      if (!layer) return false;
      return canFeatureBeEdited(layer);
    });
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
