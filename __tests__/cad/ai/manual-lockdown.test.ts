// __tests__/cad/ai/manual-lockdown.test.ts
//
// Phase 6 §32 Slice 13 — MANUAL mode lockdown. Each test
// drives the store-side contract that the UI gates read off.
// We stub `window` manually rather than pulling in jsdom so
// the suite stays Node-only (matches the rest of __tests__/cad).

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { useAIStore } from '@/lib/cad/store';
import { dispatchDefaultAction } from '@/app/admin/cad/hooks/useHotkeys';
import { DEFAULT_ACTIONS } from '@/lib/cad/hotkeys/registry';
import { mockAddPointProposal } from '@/lib/cad/ai/mock-proposer';

function findAction(id: string) {
  const a = DEFAULT_ACTIONS.find((x) => x.id === id);
  if (!a) throw new Error('Missing registry entry for ' + id);
  return a;
}

// Lightweight window stub — the dispatcher fires
// window.dispatchEvent(new CustomEvent(...)) for toasts and
// focus signals; we capture them via the spy below.
beforeAll(() => {
  const dispatched: Event[] = [];
  const windowStub = {
    dispatchEvent: (e: Event) => {
      dispatched.push(e);
      return true;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    confirm: () => true,
  } as unknown as Window;
  (globalThis as unknown as { window: Window }).window = windowStub;
  (globalThis as unknown as { __dispatchedEvents: Event[] }).__dispatchedEvents = dispatched;
});

function dispatched(): Event[] {
  return (globalThis as unknown as { __dispatchedEvents: Event[] }).__dispatchedEvents;
}

beforeEach(() => {
  dispatched().length = 0;
  useAIStore.setState({
    proposalQueue: [],
    aiBatches: [],
    copilotChat: [],
    referenceDocs: [],
    lastProposeNarrative: null,
    isProposing: false,
  });
  useAIStore.getState().setMode('COPILOT');
});

describe('MANUAL hotkey lockdown', () => {
  it('ai.cycleMode still fires in MANUAL — it\'s how the surveyor turns AI back on', () => {
    useAIStore.getState().setMode('MANUAL');
    expect(useAIStore.getState().mode).toBe('MANUAL');
    dispatchDefaultAction(findAction('ai.cycleMode'));
    // cycleMode cycled MANUAL → AUTO
    expect(useAIStore.getState().mode).toBe('AUTO');
  });

  it('non-cycleMode ai.* actions toast + return early in MANUAL', () => {
    useAIStore.getState().setMode('MANUAL');
    const before = useAIStore.getState();
    // ai.parseCodes would normally seed pendingPrompt; in MANUAL
    // it should NOT mutate the store.
    dispatchDefaultAction(findAction('ai.parseCodes'));
    const after = useAIStore.getState();
    expect(after.pendingPrompt).toBe(before.pendingPrompt);
    expect(after.isCopilotSidebarOpen).toBe(before.isCopilotSidebarOpen);
  });

  it('ai.chat is a no-op in MANUAL (no sidebar open, no focus event)', () => {
    useAIStore.getState().setMode('MANUAL');
    // Pre-condition: sidebar is closed because setMode(MANUAL)
    // auto-closes it.
    expect(useAIStore.getState().isCopilotSidebarOpen).toBe(false);
    dispatchDefaultAction(findAction('ai.chat'));
    const focusEvents = dispatched().filter((e) => e.type === 'cad:focusAICopilot');
    expect(focusEvents).toHaveLength(0);
    // Sidebar still closed.
    expect(useAIStore.getState().isCopilotSidebarOpen).toBe(false);
  });

  it('ai.undoBatch is a no-op in MANUAL', () => {
    useAIStore.getState().setMode('MANUAL');
    dispatchDefaultAction(findAction('ai.undoBatch'));
    const lockdownToast = dispatched().find(
      (e) =>
        e.type === 'cad:commandOutput' &&
        ((e as CustomEvent).detail as { text?: string }).text?.includes('MANUAL'),
    );
    expect(lockdownToast).toBeDefined();
  });

  it('setMode(MANUAL) closes the sidebar; cycling back opens it', () => {
    useAIStore.getState().setMode('COPILOT');
    expect(useAIStore.getState().isCopilotSidebarOpen).toBe(true);
    useAIStore.getState().setMode('MANUAL');
    expect(useAIStore.getState().isCopilotSidebarOpen).toBe(false);
    useAIStore.getState().setMode('COPILOT');
    expect(useAIStore.getState().isCopilotSidebarOpen).toBe(true);
  });

  it('MANUAL leaves queued proposals untouched (so cycling back resumes them)', () => {
    useAIStore.getState().enqueueProposal(mockAddPointProposal({ x: 0, y: 0 }));
    expect(useAIStore.getState().proposalQueue).toHaveLength(1);
    useAIStore.getState().setMode('MANUAL');
    expect(useAIStore.getState().proposalQueue).toHaveLength(1);
    useAIStore.getState().setMode('COPILOT');
    expect(useAIStore.getState().proposalQueue).toHaveLength(1);
  });
});
