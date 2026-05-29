// lib/hub/use-hub-actions.ts
//
// Reads zustand action closures off the hub store WITHOUT creating a
// subscription. Actions in zustand are stable across the store's
// lifetime, so subscribing via `useHubStore((s) => s.setX)` is a
// wasted subscription — it costs the snapshot comparator on every
// store update but can never trigger a re-render. This helper
// returns the actions via `getState()` so callers can keep their
// data-subscriptions picky + their action calls free.
//
// Slice 200 of hub-editor-performance-and-ux-2026-05-29.md.

import { useHubStore } from './hub-store';

/** All hub-store actions. Caller is expected to invoke these from
 *  event handlers or effects — not to use them as dependencies for
 *  another hook. */
export interface HubActions {
  hydrate: ReturnType<typeof useHubStore.getState>['hydrate'];
  enterEditMode: ReturnType<typeof useHubStore.getState>['enterEditMode'];
  cancelEdit: ReturnType<typeof useHubStore.getState>['cancelEdit'];
  setDraftWidgets: ReturnType<typeof useHubStore.getState>['setDraftWidgets'];
  addWidget: ReturnType<typeof useHubStore.getState>['addWidget'];
  removeWidget: ReturnType<typeof useHubStore.getState>['removeWidget'];
  patchWidgetCustomization: ReturnType<typeof useHubStore.getState>['patchWidgetCustomization'];
  saveDraft: ReturnType<typeof useHubStore.getState>['saveDraft'];
}

/** Read the hub store's actions. Does NOT subscribe — calling this
 *  in a component does not cause it to re-render when store state
 *  changes. Use for action invocation inside event handlers. */
export function useHubActions(): HubActions {
  const state = useHubStore.getState();
  return {
    hydrate: state.hydrate,
    enterEditMode: state.enterEditMode,
    cancelEdit: state.cancelEdit,
    setDraftWidgets: state.setDraftWidgets,
    addWidget: state.addWidget,
    removeWidget: state.removeWidget,
    patchWidgetCustomization: state.patchWidgetCustomization,
    saveDraft: state.saveDraft,
  };
}
