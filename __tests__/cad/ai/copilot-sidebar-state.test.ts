// __tests__/cad/ai/copilot-sidebar-state.test.ts
//
// Phase 6 §32 Slice 7 — sidebar visibility + transcript + the
// pendingPrompt seeding contract. UI is exercised via the store
// shape (the component is a thin shell on top).

import { describe, it, expect, beforeEach } from 'vitest';
import { useAIStore } from '@/lib/cad/store';

function resetStore() {
  useAIStore.getState().setMode('COPILOT');
  useAIStore.getState().clearCopilotChat();
  useAIStore.getState().clearProposalQueue();
}

describe('sidebar visibility', () => {
  beforeEach(() => resetStore());

  it('cycleMode auto-opens on COPILOT/COMMAND and closes on MANUAL', () => {
    useAIStore.setState({ isCopilotSidebarOpen: false });
    useAIStore.getState().setMode('AUTO');
    expect(useAIStore.getState().isCopilotSidebarOpen).toBe(true);
    useAIStore.getState().setMode('COPILOT');
    expect(useAIStore.getState().isCopilotSidebarOpen).toBe(true);
    useAIStore.getState().setMode('COMMAND');
    expect(useAIStore.getState().isCopilotSidebarOpen).toBe(true);
    useAIStore.getState().setMode('MANUAL');
    expect(useAIStore.getState().isCopilotSidebarOpen).toBe(false);
  });

  it('setMode with the same mode is a no-op', () => {
    useAIStore.getState().setMode('COPILOT');
    useAIStore.setState({ isCopilotSidebarOpen: false }); // surveyor manually closed
    useAIStore.getState().setMode('COPILOT');
    // No side effect — surveyor's manual close stays in place.
    expect(useAIStore.getState().isCopilotSidebarOpen).toBe(false);
  });

  it('toggleCopilotSidebar flips visibility independent of mode', () => {
    useAIStore.setState({ isCopilotSidebarOpen: false });
    useAIStore.getState().toggleCopilotSidebar();
    expect(useAIStore.getState().isCopilotSidebarOpen).toBe(true);
    useAIStore.getState().toggleCopilotSidebar();
    expect(useAIStore.getState().isCopilotSidebarOpen).toBe(false);
  });
});

describe('transcript', () => {
  beforeEach(() => resetStore());

  it('starts empty + appendCopilotMessage pushes a turn', () => {
    expect(useAIStore.getState().copilotChat).toHaveLength(0);
    useAIStore.getState().appendCopilotMessage({
      id: 'm1', role: 'USER', content: 'hello', ts: new Date().toISOString(),
    });
    expect(useAIStore.getState().copilotChat).toHaveLength(1);
    expect(useAIStore.getState().copilotChat[0].content).toBe('hello');
  });

  it('clearCopilotChat empties the transcript', () => {
    useAIStore.getState().appendCopilotMessage({
      id: 'a', role: 'USER', content: 'one', ts: new Date().toISOString(),
    });
    useAIStore.getState().clearCopilotChat();
    expect(useAIStore.getState().copilotChat).toHaveLength(0);
  });
});

describe('openCopilotWithPrompt', () => {
  beforeEach(() => resetStore());

  it('opens the sidebar and seeds pendingPrompt', () => {
    useAIStore.setState({ isCopilotSidebarOpen: false, pendingPrompt: null });
    useAIStore.getState().openCopilotWithPrompt('Tell me about feature X.');
    const state = useAIStore.getState();
    expect(state.isCopilotSidebarOpen).toBe(true);
    expect(state.pendingPrompt).toBe('Tell me about feature X.');
  });

  it('overwrites a stale pendingPrompt', () => {
    useAIStore.getState().openCopilotWithPrompt('first');
    useAIStore.getState().openCopilotWithPrompt('second');
    expect(useAIStore.getState().pendingPrompt).toBe('second');
  });
});
