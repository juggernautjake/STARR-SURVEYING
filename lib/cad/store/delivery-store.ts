'use client';
// lib/cad/store/delivery-store.ts
//
// Phase 7 §5 — delivery-state store. Currently a thin holder
// for the active `SurveyDescription`; future slices fold the
// review-workflow record + completed-export receipts into the
// same store so a single hook lights up the whole delivery
// surface (description panel, completeness checker, RPLS
// review mode).

import { create } from 'zustand';

import type { SurveyDescription } from '../delivery/description-generator';

interface DeliveryStore {
  /** Active survey description. Null until the user opens the
   *  generator panel and clicks Generate (or it's hydrated from
   *  document persistence in a follow-up slice). */
  description: SurveyDescription | null;
  setDescription: (description: SurveyDescription | null) => void;
  /** Patch a subset of the description in place. Used by the
   *  panel's Edit mode to land per-field changes without
   *  rebuilding the whole record. */
  patchDescription: (patch: Partial<SurveyDescription>) => void;
  reset: () => void;
}

export const useDeliveryStore = create<DeliveryStore>((set) => ({
  description: null,
  setDescription: (description) => set({ description }),
  patchDescription: (patch) =>
    set((state) =>
      state.description
        ? { description: { ...state.description, ...patch } }
        : state
    ),
  reset: () => set({ description: null }),
}));
