// lib/cad/store/selection-store.ts — Selection state
import { create } from 'zustand';
import type { SelectionMode } from '../types';
import { useDrawingStore } from './drawing-store';

interface SelectionStore {
  selectedIds: Set<string>;
  hoveredId: string | null;
  /** Which title-block overlay element the cursor is currently over (null = none). */
  hoveredTBElem: string | null;
  /** Which title-block overlay element was last clicked/selected (null = none). */
  selectedTBElem: string | null;

  select: (featureId: string, mode: SelectionMode) => void;
  selectMultiple: (featureIds: string[], mode: SelectionMode) => void;
  deselectAll: () => void;
  setHovered: (featureId: string | null) => void;
  setHoveredTBElem: (elem: string | null) => void;
  setSelectedTBElem: (elem: string | null) => void;

  isSelected: (featureId: string) => boolean;
  selectionCount: () => number;
  getSelectedIds: () => string[];
}

export const useSelectionStore = create<SelectionStore>((set, get) => ({
  selectedIds: new Set<string>(),
  hoveredId: null,
  hoveredTBElem: null,
  selectedTBElem: null,

  select: (featureId, mode) =>
    set((state) => {
      const ids = new Set(state.selectedIds);
      switch (mode) {
        case 'REPLACE':
          ids.clear();
          ids.add(featureId);
          break;
        case 'ADD':
          ids.add(featureId);
          break;
        case 'REMOVE':
          ids.delete(featureId);
          break;
        case 'TOGGLE':
          if (ids.has(featureId)) ids.delete(featureId);
          else ids.add(featureId);
          break;
      }
      return { selectedIds: ids };
    }),

  selectMultiple: (featureIds, mode) =>
    set((state) => {
      const ids = new Set(state.selectedIds);
      switch (mode) {
        case 'REPLACE':
          ids.clear();
          for (const id of featureIds) ids.add(id);
          break;
        case 'ADD':
          for (const id of featureIds) ids.add(id);
          break;
        case 'REMOVE':
          for (const id of featureIds) ids.delete(id);
          break;
        case 'TOGGLE':
          for (const id of featureIds) {
            if (ids.has(id)) ids.delete(id);
            else ids.add(id);
          }
          break;
      }
      return { selectedIds: ids };
    }),

  deselectAll: () => set({ selectedIds: new Set(), selectedTBElem: null }),

  setHovered: (featureId) => set({ hoveredId: featureId }),
  setHoveredTBElem: (elem) => set({ hoveredTBElem: elem }),
  setSelectedTBElem: (elem) => set({ selectedTBElem: elem }),

  isSelected: (featureId) => get().selectedIds.has(featureId),

  selectionCount: () => get().selectedIds.size,

  getSelectedIds: () => Array.from(get().selectedIds),
}));

/** Get selected Feature objects from the drawing store */
export function getSelectedFeatures() {
  const { selectedIds } = useSelectionStore.getState();
  const { getFeature } = useDrawingStore.getState();
  const features = [];
  for (const id of selectedIds) {
    const f = getFeature(id);
    if (f) features.push(f);
  }
  return features;
}
