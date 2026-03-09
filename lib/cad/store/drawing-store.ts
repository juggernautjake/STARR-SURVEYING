// lib/cad/store/drawing-store.ts — Central store for all drawing data
import { create } from 'zustand';
import type { DrawingDocument, Feature, FeatureGroup, Layer, DrawingSettings, TextLabel, LayerDisplayPreferences, ProjectImage, TitleBlockConfig } from '../types';
import { generateId } from '../types';
import { DEFAULT_DRAWING_SETTINGS, DEFAULT_LAYER_DISPLAY_PREFERENCES } from '../constants';
import { DEFAULT_GLOBAL_STYLE_CONFIG } from '../styles/types';

// Start with a completely blank document — no layers, no features.
// The user must create a new drawing or import data to begin working.
function createDefaultDocument(): DrawingDocument {
  return {
    id: generateId(),
    name: 'Untitled Drawing',
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    author: '',
    features: {},
    layers: {},
    layerOrder: [],
    featureGroups: {},
    layerGroups: {},
    layerGroupOrder: [],
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
   */
  groupFeatures: (featureIds: string[], name?: string) => FeatureGroup | null;
  /** Remove a feature group (features remain but are ungrouped). */
  ungroupFeatures: (groupId: string) => void;
  /**
   * Remove a single feature from its current group.
   * If the removal leaves fewer than 2 members the entire group is dissolved.
   */
  removeFeatureFromGroup: (featureId: string) => void;
  /** Rename a feature group. */
  renameFeatureGroup: (groupId: string, name: string) => void;
  /** Get a feature group by id. */
  getFeatureGroup: (groupId: string) => FeatureGroup | undefined;
  /** Get all feature groups for a layer. */
  getLayerGroups: (layerId: string) => FeatureGroup[];

  // Queries
  getFeature: (id: string) => Feature | undefined;
  getLayer: (id: string) => Layer | undefined;
  getFeaturesOnLayer: (layerId: string) => Feature[];
  getVisibleFeatures: () => Feature[];
  getAllFeatures: () => Feature[];

  // Active layer style helper
  getActiveLayerStyle: () => { color: string; lineWeight: number; opacity: number };
}

const defaultDoc = createDefaultDocument();

export const useDrawingStore = create<DrawingStore>((set, get) => ({
  document: defaultDoc,
  activeLayerId: '',
  isDirty: false,

  addFeature: (feature) =>
    set((state) => ({
      document: {
        ...state.document,
        features: { ...state.document.features, [feature.id]: feature },
        modified: new Date().toISOString(),
      },
      isDirty: true,
    })),

  removeFeature: (featureId) =>
    set((state) => {
      const features = { ...state.document.features };
      delete features[featureId];
      return {
        document: { ...state.document, features, modified: new Date().toISOString() },
        isDirty: true,
      };
    }),

  updateFeature: (featureId, updates) =>
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
    }),

  updateFeatureGeometry: (featureId, geometry) =>
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
    }),

  addLayer: (layer) =>
    set((state) => ({
      document: {
        ...state.document,
        layers: { ...state.document.layers, [layer.id]: layer },
        layerOrder: [...state.document.layerOrder, layer.id],
        modified: new Date().toISOString(),
      },
      isDirty: true,
    })),

  removeLayer: (layerId) =>
    set((state) => {
      const layer = state.document.layers[layerId];
      if (!layer || layer.isDefault) return state;
      const layers = { ...state.document.layers };
      delete layers[layerId];
      const layerOrder = state.document.layerOrder.filter((id) => id !== layerId);
      // Move features on deleted layer to active layer
      const activeLayerId =
        layerId === state.activeLayerId
          ? (layerOrder[0] ?? state.activeLayerId)
          : state.activeLayerId;
      const features = { ...state.document.features };
      for (const [fid, feature] of Object.entries(features)) {
        if (feature.layerId === layerId) {
          features[fid] = { ...feature, layerId: activeLayerId };
        }
      }
      return {
        document: { ...state.document, layers, layerOrder, features, modified: new Date().toISOString() },
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

  setActiveLayer: (layerId) => set({ activeLayerId: layerId }),

  reorderLayers: (layerOrder) =>
    set((state) => ({
      document: { ...state.document, layerOrder, modified: new Date().toISOString() },
      isDirty: true,
    })),

  addFeatures: (features) =>
    set((state) => {
      const newFeatures = { ...state.document.features };
      for (const f of features) newFeatures[f.id] = f;
      return {
        document: { ...state.document, features: newFeatures, modified: new Date().toISOString() },
        isDirty: true,
      };
    }),

  removeFeatures: (featureIds) =>
    set((state) => {
      const features = { ...state.document.features };
      for (const id of featureIds) delete features[id];
      return {
        document: { ...state.document, features, modified: new Date().toISOString() },
        isDirty: true,
      };
    }),

  newDocument: () => {
    const doc = createDefaultDocument();
    set({ document: doc, activeLayerId: '', isDirty: false });
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
    const features = { ...doc.features };
    for (const [fid, feat] of Object.entries(features)) {
      if (feat.featureGroupId && !groupedFeatureIds.has(fid)) {
        features[fid] = { ...feat, featureGroupId: null };
      }
    }
    const normalized: DrawingDocument = { ...doc, featureGroups, features };
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

  setFeatureTextLabels: (featureId, labels) =>
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
    }),

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

  groupFeatures: (featureIds, name) => {
    const state = get();
    const features = featureIds.map((id) => state.document.features[id]).filter(Boolean);
    if (features.length < 2) return null;
    // All features must be on the same layer
    const layerId = features[0].layerId;
    if (features.some((f) => f.layerId !== layerId)) return null;
    // Reject if any feature already belongs to a group — it must be removed first
    if (features.some((f) => f.featureGroupId)) return null;
    const groupId = generateId();
    // Generate a unique group name: prefer the user-supplied name, else use
    // a short UUID fragment so names remain unique even after groups are deleted.
    const defaultName = `Group ${groupId.substring(0, 6).toUpperCase()}`;
    const group: FeatureGroup = {
      id: groupId,
      name: name || defaultName,
      layerId,
      featureIds: featureIds.filter((id) => !!state.document.features[id]),
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
    return Object.values(document.features).filter(
      (f) => document.layers[f.layerId]?.visible !== false && f.hidden !== true,
    );
  },

  getAllFeatures: () => Object.values(get().document.features),

  getActiveLayerStyle: () => {
    const { document, activeLayerId } = get();
    const layer = document.layers[activeLayerId];
    if (layer) {
      return { color: layer.color, lineWeight: layer.lineWeight, opacity: layer.opacity };
    }
    return { color: '#000000', lineWeight: 1, opacity: 1 };
  },
}));
