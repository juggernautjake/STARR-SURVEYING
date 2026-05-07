// lib/cad/store/ui-store.ts — UI panel visibility state
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

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
  /** §5 — global tooltip toggles. UI tooltips fire on
   *  buttons / form controls; feature tooltips on the
   *  canvas hover. Both default on; the surveyor can mute
   *  either independently from the upcoming Settings page. */
  uiTooltipsEnabled: boolean;
  featureTooltipsEnabled: boolean;

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
    }),
    {
      name: 'starr-cad-ui',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Allow-list — only the surveyor-visible toggles persist.
      partialize: (s) => ({
        uiTooltipsEnabled: s.uiTooltipsEnabled,
        featureTooltipsEnabled: s.featureTooltipsEnabled,
      }),
    }
  )
);
