// lib/cad/store/ui-store.ts — UI panel visibility state
import { create } from 'zustand';

interface UIStore {
  showLayerPanel: boolean;
  showCommandBar: boolean;
  showStatusBar: boolean;
  commandBarFocused: boolean;

  toggleLayerPanel: () => void;
  setCommandBarFocused: (focused: boolean) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  showLayerPanel: true,
  showCommandBar: true,
  showStatusBar: true,
  commandBarFocused: false,

  toggleLayerPanel: () => set((s) => ({ showLayerPanel: !s.showLayerPanel })),
  setCommandBarFocused: (focused) => set({ commandBarFocused: focused }),
}));
