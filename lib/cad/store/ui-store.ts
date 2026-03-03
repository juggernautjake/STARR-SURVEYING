// lib/cad/store/ui-store.ts — UI panel visibility state
import { create } from 'zustand';

interface UIStore {
  showLayerPanel: boolean;
  showPropertyPanel: boolean;
  showCommandBar: boolean;
  showStatusBar: boolean;
  commandBarFocused: boolean;

  toggleLayerPanel: () => void;
  togglePropertyPanel: () => void;
  setCommandBarFocused: (focused: boolean) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  showLayerPanel: true,
  showPropertyPanel: true,
  showCommandBar: true,
  showStatusBar: true,
  commandBarFocused: false,

  toggleLayerPanel: () => set((s) => ({ showLayerPanel: !s.showLayerPanel })),
  togglePropertyPanel: () => set((s) => ({ showPropertyPanel: !s.showPropertyPanel })),
  setCommandBarFocused: (focused) => set({ commandBarFocused: focused }),
}));
