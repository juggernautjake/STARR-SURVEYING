// __tests__/hub/use-hub-actions.test.ts
//
// Slice 200 of hub-editor-performance-and-ux-2026-05-29.md. Locks
// the no-subscription contract for the actions helper + asserts the
// returned action closures are stable (so consumer effects that
// depend on them never re-fire spuriously).

import { describe, it, expect, beforeEach } from 'vitest';
import { useHubStore } from '@/lib/hub/hub-store';
import { useHubActions } from '@/lib/hub/use-hub-actions';

beforeEach(() => {
  // Reset the store to a known-clean state for each test. Calling
  // getState().cancelEdit() drops any in-flight draft + flips
  // editing off; subsequent calls re-initialize from scratch.
  const state = useHubStore.getState();
  state.cancelEdit();
});

describe('useHubActions — action closure stability', () => {
  it('returns the same action references across successive calls', () => {
    const a = useHubActions();
    const b = useHubActions();
    expect(a.enterEditMode).toBe(b.enterEditMode);
    expect(a.cancelEdit).toBe(b.cancelEdit);
    expect(a.setDraftWidgets).toBe(b.setDraftWidgets);
    expect(a.saveDraft).toBe(b.saveDraft);
    expect(a.patchWidgetCustomization).toBe(b.patchWidgetCustomization);
    expect(a.addWidget).toBe(b.addWidget);
    expect(a.removeWidget).toBe(b.removeWidget);
    expect(a.hydrate).toBe(b.hydrate);
  });

  it('action references survive a state mutation', () => {
    const before = useHubActions();
    useHubStore.getState().enterEditMode();
    const after = useHubActions();
    expect(after.cancelEdit).toBe(before.cancelEdit);
    expect(after.saveDraft).toBe(before.saveDraft);
    expect(after.setDraftWidgets).toBe(before.setDraftWidgets);
  });
});

describe('useHubActions — no subscription', () => {
  it('calling useHubActions does NOT register a subscription on the store', () => {
    let listenerFireCount = 0;
    const unsubscribe = useHubStore.subscribe(() => {
      listenerFireCount += 1;
    });
    // Establish baseline.
    useHubStore.getState().enterEditMode();
    const baselineFires = listenerFireCount;
    // Call useHubActions outside React — should be a pure read.
    useHubActions();
    useHubActions();
    useHubActions();
    // No new fires because useHubActions does NOT subscribe.
    expect(listenerFireCount).toBe(baselineFires);
    unsubscribe();
  });
});

describe('useHubActions — returned actions still work', () => {
  it('enterEditMode flips the store into edit mode', () => {
    const actions = useHubActions();
    expect(useHubStore.getState().isEditMode).toBe(false);
    actions.enterEditMode();
    expect(useHubStore.getState().isEditMode).toBe(true);
  });

  it('cancelEdit reverts edit mode + drops the draft', () => {
    const actions = useHubActions();
    actions.enterEditMode();
    expect(useHubStore.getState().isEditMode).toBe(true);
    actions.cancelEdit();
    expect(useHubStore.getState().isEditMode).toBe(false);
    expect(useHubStore.getState().draftWidgets).toBeNull();
  });

  it('setDraftWidgets writes through to the store', () => {
    const actions = useHubActions();
    actions.enterEditMode();
    const widgets = [{ id: 'a', type: 'my-jobs', x: 0, y: 0, w: 4, h: 3 }];
    actions.setDraftWidgets(widgets);
    expect(useHubStore.getState().draftWidgets).toEqual(widgets);
  });
});

describe('picky data selector contract', () => {
  it('subscribing to widgets is independent of subscribing to isEditMode', () => {
    let widgetsListenerFires = 0;
    let editModeListenerFires = 0;
    // Two cached snapshots that mirror what `useHubStore((s) => s.X)`
    // does internally — recompute on each store change, only fire
    // when the slice ref differs.
    let widgetsRef = useHubStore.getState().widgets;
    let editModeRef = useHubStore.getState().isEditMode;
    const unsub = useHubStore.subscribe((state) => {
      if (state.widgets !== widgetsRef) {
        widgetsListenerFires += 1;
        widgetsRef = state.widgets;
      }
      if (state.isEditMode !== editModeRef) {
        editModeListenerFires += 1;
        editModeRef = state.isEditMode;
      }
    });
    // Flipping edit mode mutates isEditMode + initializes draftWidgets
    // but does NOT touch the saved `widgets` array.
    useHubStore.getState().enterEditMode();
    expect(editModeListenerFires).toBe(1);
    expect(widgetsListenerFires).toBe(0);
    unsub();
  });
});
