// lib/hub/hub-store.ts
//
// Zustand store for the hub canvas's editing state. Holds two parallel
// views of the layout:
//
//   - `widgets`         — the saved layout, mirrors what's on the server
//   - `draftWidgets`    — the in-progress edit; only populated when
//                         edit mode is on
//
// The canvas renders `widgets` when `isEditMode === false`, and
// `draftWidgets` while editing. Cancel discards the draft + flips off
// edit mode; Save calls the PUT and on success copies the draft back
// into `widgets`.
//
// Slice 97 of customizable-hub-and-work-mode-2026-05-28.md.

import { create } from 'zustand';

import type {
  CustomThemePayload,
  Density,
  FontScale,
  HubSettings,
  ThemeId,
  WidgetCustomization,
  WidgetInstance,
} from './types';

export type SaveStatus = 'idle' | 'saving' | 'error';

interface HubStore {
  /** Server-authoritative widget list. Updated on initial hydrate +
   *  on successful PUT. */
  widgets: WidgetInstance[];
  /** In-flight edits. Null when the user isn't editing. */
  draftWidgets: WidgetInstance[] | null;
  isEditMode: boolean;
  /** True when the draft differs from the saved widgets. Drives the
   *  Save button's enabled state + the "unsaved changes" guard. */
  isDirty: boolean;
  saveStatus: SaveStatus;
  saveError: string | null;
  /** Optional non-widget settings the canvas knows about so PUT
   *  preserves them. Set during hydrate; mutated by separate stores
   *  (theme picker, density picker) but echoed here so a Save from
   *  edit mode doesn't accidentally blow them away. */
  theme: ThemeId | null;
  /** Resolved palette for `theme === 'custom'`. Null for built-in
   *  themes (the registry resolves the palette by id). */
  customTheme: CustomThemePayload | null;
  density: Density | null;
  fontScale: FontScale | null;
  hubSettings: HubSettings;
  activePersona: string | null;

  /** Replace the saved widgets + non-widget settings. Called once on
   *  hub mount after the GET /hub-layout response lands. Resets draft
   *  + edit state. */
  hydrate: (input: {
    widgets: WidgetInstance[];
    theme?: ThemeId | null;
    customTheme?: CustomThemePayload | null;
    density?: Density | null;
    fontScale?: FontScale | null;
    hubSettings?: HubSettings;
    activePersona?: string | null;
  }) => void;

  /** Flip into edit mode. Initializes `draftWidgets` as a clone of
   *  `widgets`. No-op if already editing. */
  enterEditMode: () => void;

  /** Discard the draft + flip back to view mode. */
  cancelEdit: () => void;

  /** Replace the draft entirely. Used by drag-end / resize-end (Slices
   *  98 + 99) and Add-Widget modal (Slice 100). */
  setDraftWidgets: (widgets: WidgetInstance[]) => void;

  /** Convenience patch helpers. */
  addWidget: (widget: WidgetInstance) => void;
  removeWidget: (id: string) => void;
  patchWidgetCustomization: (id: string, customization: WidgetCustomization) => void;

  /** Save flow. PUTs `draftWidgets` (+ echoed non-widget settings) to
   *  `/api/admin/me/hub-layout`. On success, copies draft → widgets,
   *  flips edit mode off, clears the draft. On failure, sets
   *  `saveStatus = 'error'` + `saveError`. */
  saveDraft: () => Promise<void>;
}

const HUB_LAYOUT_ENDPOINT = '/api/admin/me/hub-layout';

export const useHubStore = create<HubStore>((set, get) => ({
  widgets: [],
  draftWidgets: null,
  isEditMode: false,
  isDirty: false,
  saveStatus: 'idle',
  saveError: null,
  theme: null,
  customTheme: null,
  density: null,
  fontScale: null,
  hubSettings: {},
  activePersona: null,

  hydrate: ({ widgets, theme, customTheme, density, fontScale, hubSettings, activePersona }) => {
    set({
      widgets,
      draftWidgets: null,
      isEditMode: false,
      isDirty: false,
      saveStatus: 'idle',
      saveError: null,
      theme: theme ?? null,
      customTheme: customTheme ?? null,
      density: density ?? null,
      fontScale: fontScale ?? null,
      hubSettings: hubSettings ?? {},
      activePersona: activePersona ?? null,
    });
  },

  enterEditMode: () => {
    const { isEditMode, widgets } = get();
    if (isEditMode) return;
    set({
      isEditMode: true,
      draftWidgets: cloneWidgets(widgets),
      isDirty: false,
      saveStatus: 'idle',
      saveError: null,
    });
  },

  cancelEdit: () => {
    set({
      isEditMode: false,
      draftWidgets: null,
      isDirty: false,
      saveStatus: 'idle',
      saveError: null,
    });
  },

  setDraftWidgets: (widgets) => {
    const { isEditMode } = get();
    if (!isEditMode) return;
    set({ draftWidgets: widgets, isDirty: true });
  },

  addWidget: (widget) => {
    const { draftWidgets, isEditMode } = get();
    if (!isEditMode || !draftWidgets) return;
    set({ draftWidgets: [...draftWidgets, widget], isDirty: true });
  },

  removeWidget: (id) => {
    const { draftWidgets, isEditMode } = get();
    if (!isEditMode || !draftWidgets) return;
    set({
      draftWidgets: draftWidgets.filter((w) => w.id !== id),
      isDirty: true,
    });
  },

  patchWidgetCustomization: (id, customization) => {
    const { draftWidgets, isEditMode } = get();
    if (!isEditMode || !draftWidgets) return;
    set({
      draftWidgets: draftWidgets.map((w) =>
        w.id === id ? { ...w, customization } : w,
      ),
      isDirty: true,
    });
  },

  saveDraft: async () => {
    const { draftWidgets, theme, customTheme, density, fontScale, hubSettings, activePersona, isEditMode } = get();
    if (!isEditMode || !draftWidgets) return;

    set({ saveStatus: 'saving', saveError: null });

    try {
      const body: Record<string, unknown> = { widgets: draftWidgets };
      if (theme !== null) body.theme = theme;
      if (customTheme !== null) body.customTheme = customTheme;
      if (density !== null) body.density = density;
      if (fontScale !== null) body.fontScale = fontScale;
      if (hubSettings && Object.keys(hubSettings).length > 0) body.hubSettings = hubSettings;
      if (activePersona !== null) body.activePersona = activePersona;

      const res = await fetch(HUB_LAYOUT_ENDPOINT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const data = (await res.json()) as { error?: string };
          if (data?.error) message = data.error;
        } catch {
          /* swallow JSON parse — use the HTTP status */
        }
        throw new Error(message);
      }

      set({
        widgets: cloneWidgets(draftWidgets),
        draftWidgets: null,
        isEditMode: false,
        isDirty: false,
        saveStatus: 'idle',
        saveError: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ saveStatus: 'error', saveError: message });
    }
  },
}));

/** Deep-enough clone for the draft buffer. Widgets are POJOs whose
 *  `customization` is a nested POJO; structuredClone is safe. Falls back
 *  to JSON when running in an env without structuredClone (older test
 *  runners). */
function cloneWidgets(widgets: WidgetInstance[]): WidgetInstance[] {
  if (typeof structuredClone === 'function') {
    return structuredClone(widgets);
  }
  return JSON.parse(JSON.stringify(widgets)) as WidgetInstance[];
}
