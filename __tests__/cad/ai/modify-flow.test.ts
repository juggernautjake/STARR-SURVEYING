// __tests__/cad/ai/modify-flow.test.ts
//
// Phase 6 §32 Slice 14 — Modify polish. Slice 5 stubbed the
// CopilotCard's Modify button; Slice 14 makes it skip the
// current proposal and seed the sidebar with a "Revise this"
// prompt. The component is a thin shell over the store
// (skip + openCopilotWithPrompt) so we test the contract those
// two actions deliver.

import { describe, it, expect, beforeEach } from 'vitest';
import { useAIStore } from '@/lib/cad/store';
import { mockAddPointProposal } from '@/lib/cad/ai/mock-proposer';

beforeEach(() => {
  useAIStore.setState({
    proposalQueue: [],
    aiBatches: [],
    copilotChat: [],
    pendingPrompt: null,
    isCopilotSidebarOpen: false,
  });
  useAIStore.getState().setMode('COPILOT');
});

describe('Modify flow', () => {
  it('skip + openCopilotWithPrompt removes the proposal AND seeds the sidebar', () => {
    const p = mockAddPointProposal({ x: 5, y: 7 }, { description: 'drop BC-1' });
    useAIStore.getState().enqueueProposal(p);
    expect(useAIStore.getState().proposalQueue).toHaveLength(1);

    // Mirror what CopilotCard.handleModify does in Slice 14.
    useAIStore.getState().skipHeadProposal();
    useAIStore.getState().openCopilotWithPrompt(
      `Revise the last proposal — ${p.toolName}: "${p.description}". I need it changed because: `,
    );

    const s = useAIStore.getState();
    expect(s.proposalQueue).toHaveLength(0);
    expect(s.isCopilotSidebarOpen).toBe(true);
    expect(s.pendingPrompt).toContain('Revise the last proposal');
    expect(s.pendingPrompt).toContain('drop BC-1');
  });

  it('handles back-to-back Modify on a queue of multiple proposals', () => {
    const a = mockAddPointProposal({ x: 0, y: 0 }, { description: 'A' });
    const b = mockAddPointProposal({ x: 1, y: 1 }, { description: 'B' });
    useAIStore.getState().enqueueProposal(a);
    useAIStore.getState().enqueueProposal(b);

    // First Modify
    useAIStore.getState().skipHeadProposal();
    useAIStore.getState().openCopilotWithPrompt('Revise A: …');
    expect(useAIStore.getState().proposalQueue.map((p) => p.id)).toEqual([b.id]);
    expect(useAIStore.getState().pendingPrompt).toBe('Revise A: …');

    // Second Modify
    useAIStore.getState().skipHeadProposal();
    useAIStore.getState().openCopilotWithPrompt('Revise B: …');
    expect(useAIStore.getState().proposalQueue).toHaveLength(0);
    expect(useAIStore.getState().pendingPrompt).toBe('Revise B: …');
  });
});
