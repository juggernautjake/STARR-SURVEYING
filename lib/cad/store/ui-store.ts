// lib/cad/store/ui-store.ts — UI panel visibility state
import { create } from 'zustand';

export type AISidebarTab =
  | 'queue'
  | 'assistant'
  | 'explanations'
  | 'versions'
  | 'checklist';

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

  toggleLayerPanel: () => void;
  togglePropertyPanel: () => void;
  setCommandBarFocused: (focused: boolean) => void;
  toggleAISidebar: () => void;
  openAISidebar: (tab?: AISidebarTab) => void;
  closeAISidebar: () => void;
  setAISidebarTab: (tab: AISidebarTab) => void;
  setHoveredFeatureId: (featureId: string | null) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  showLayerPanel: true,
  showPropertyPanel: true,
  showCommandBar: true,
  showStatusBar: true,
  commandBarFocused: false,
  showAISidebar: false,
  aiSidebarTab: 'queue',
  hoveredFeatureId: null,

  toggleLayerPanel: () => set((s) => ({ showLayerPanel: !s.showLayerPanel })),
  togglePropertyPanel: () => set((s) => ({ showPropertyPanel: !s.showPropertyPanel })),
  setCommandBarFocused: (focused) => set({ commandBarFocused: focused }),
  toggleAISidebar: () => set((s) => ({ showAISidebar: !s.showAISidebar })),
  openAISidebar: (tab) =>
    set((s) => ({ showAISidebar: true, aiSidebarTab: tab ?? s.aiSidebarTab })),
  closeAISidebar: () => set({ showAISidebar: false }),
  setAISidebarTab: (tab) => set({ aiSidebarTab: tab }),
  setHoveredFeatureId: (featureId) => set({ hoveredFeatureId: featureId }),
}));
