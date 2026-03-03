// lib/cad/store/drawing-store.ts — Central store for all drawing data
import { create } from 'zustand';
import type { DrawingDocument, Feature, Layer, DrawingSettings } from '../types';
import { generateId } from '../types';
import { DEFAULT_DRAWING_SETTINGS } from '../constants';
import { getDefaultLayersRecord, getDefaultLayerOrder, DEFAULT_LAYER_GROUPS } from '../styles/default-layers';
import { DEFAULT_GLOBAL_STYLE_CONFIG } from '../styles/types';

function createDefaultDocument(): DrawingDocument {
  const layers = getDefaultLayersRecord();
  const layerOrder = getDefaultLayerOrder();

  const layerGroups: Record<string, import('../styles/types').LayerGroup> = {};
  for (const group of DEFAULT_LAYER_GROUPS) {
    layerGroups[group.id] = group;
  }

  return {
    id: generateId(),
    name: 'Untitled Drawing',
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    author: '',
    features: {},
    layers,
    layerOrder,
    layerGroups,
    layerGroupOrder: DEFAULT_LAYER_GROUPS.map(g => g.id),
    customSymbols: [],
    customLineTypes: [],
    codeStyleOverrides: {},
    globalStyleConfig: { ...DEFAULT_GLOBAL_STYLE_CONFIG },
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
  markClean: () => void;

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
  activeLayerId: defaultDoc.layerOrder[0],
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
    set({ document: doc, activeLayerId: doc.layerOrder[0], isDirty: false });
  },

  loadDocument: (doc) =>
    set({ document: doc, activeLayerId: doc.layerOrder[0] ?? '', isDirty: false }),

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

  markClean: () => set({ isDirty: false }),

  getFeature: (id) => get().document.features[id],

  getLayer: (id) => get().document.layers[id],

  getFeaturesOnLayer: (layerId) =>
    Object.values(get().document.features).filter((f) => f.layerId === layerId),

  getVisibleFeatures: () => {
    const { document } = get();
    return Object.values(document.features).filter(
      (f) => document.layers[f.layerId]?.visible !== false,
    );
  },

  getAllFeatures: () => Object.values(get().document.features),

  getActiveLayerStyle: () => {
    const { document, activeLayerId } = get();
    const layer = document.layers[activeLayerId];
    if (layer) {
      return { color: layer.color, lineWeight: layer.lineWeight, opacity: layer.opacity };
    }
    return { color: '#000000', lineWeight: 0.25, opacity: 1 };
  },
}));
