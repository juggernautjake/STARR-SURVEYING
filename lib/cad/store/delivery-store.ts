'use client';
// lib/cad/store/delivery-store.ts
//
// Phase 7 §5 — delivery-state store. Holds the active
// `SurveyDescription` + the cached RPLS seal image. Writes
// through to `useDrawingStore.updateSettings` so the
// description rides on the document (survives reload via the
// existing autosave path); the seal image stays session-local
// because it's per-RPLS, not per-job.

import { create } from 'zustand';

import type { SurveyDescription } from '../delivery/description-generator';
import { useDrawingStore } from './drawing-store';

interface DeliveryStore {
  /** Active survey description. Null until the user opens the
   *  generator panel and clicks Generate (or it's hydrated
   *  from `doc.settings.surveyDescription`). */
  description: SurveyDescription | null;
  setDescription: (description: SurveyDescription | null) => void;
  /** Patch a subset of the description in place. Used by the
   *  panel's Edit mode to land per-field changes without
   *  rebuilding the whole record. */
  patchDescription: (patch: Partial<SurveyDescription>) => void;

  /** §8.3 — RPLS seal image cached for the session. Stored as
   *  a data URL (PNG / JPG / SVG). The next `applySeal` call
   *  reads it from here and embeds in `sealData.sealImage`,
   *  which the PDF exporter then drops onto the seal block.
   *  Per-user persistence lands in a follow-up slice once we
   *  wire user settings. */
  sealImage: string | null;
  setSealImage: (image: string | null) => void;

  /** Hydrate from `doc.settings.surveyDescription` without
   *  writing back. Called by `DeliveryHydrator` whenever the
   *  active document id changes. */
  hydrateFromDocument: (
    description: SurveyDescription | null
  ) => void;

  reset: () => void;
}

export const useDeliveryStore = create<DeliveryStore>((set) => ({
  description: null,
  sealImage: null,

  setDescription: (description) => {
    set({ description });
    useDrawingStore
      .getState()
      .updateSettings({ surveyDescription: description });
  },

  patchDescription: (patch) =>
    set((state) => {
      if (!state.description) return state;
      const next = { ...state.description, ...patch };
      useDrawingStore
        .getState()
        .updateSettings({ surveyDescription: next });
      return { description: next };
    }),

  setSealImage: (image) => set({ sealImage: image }),

  hydrateFromDocument: (description) => set({ description }),

  reset: () => set({ description: null, sealImage: null }),
}));
