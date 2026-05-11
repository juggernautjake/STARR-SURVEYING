// __tests__/cad/ai/auto-escalation.test.ts
//
// Phase 6 §32 Slice 8 — code-resolution memory + AUTO
// escalation. Runner UI is exercised in the component (a
// single useEffect); here we lock down the store-side contract
// the runner reads from.

import { describe, it, expect, beforeEach } from 'vitest';
import { useAIStore } from '@/lib/cad/store';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import { useUndoStore } from '@/lib/cad/store/undo-store';
import { buildSystemPrompt } from '@/lib/cad/ai/system-prompt';
import {
  mockAddPointProposal,
} from '@/lib/cad/ai/mock-proposer';
import { generateId } from '@/lib/cad/types';
import type { Layer } from '@/lib/cad/types';

function makeLayer(id: string, name: string): Layer {
  return {
    id, name,
    visible: true, locked: false, frozen: false,
    color: '#000000', lineWeight: 0.5, lineTypeId: 'SOLID', opacity: 1,
    groupId: null, sortOrder: 0, isDefault: false, isProtected: false,
    autoAssignCodes: [],
  };
}

function resetStores(): string {
  useDrawingStore.getState().newDocument();
  useUndoStore.getState().clear();
  useAIStore.getState().setMode('COPILOT');
  useAIStore.getState().setSandbox(false);
  useAIStore.getState().setAutoApproveThreshold(0.85);
  useAIStore.getState().clearProposalQueue();
  useAIStore.getState().clearCodeResolutionMemory();
  const id = generateId();
  useDrawingStore.getState().addLayer(makeLayer(id, 'TEST_LAYER'));
  useDrawingStore.getState().setActiveLayer(id);
  return id;
}

describe('codeResolutionMemory', () => {
  beforeEach(() => {
    resetStores();
  });

  it('starts empty', () => {
    expect(useAIStore.getState().codeResolutionMemory).toEqual({});
  });

  it('recordCodeResolution upper-cases the key', () => {
    useAIStore.getState().recordCodeResolution('bc-1', 'layer-x');
    const mem = useAIStore.getState().codeResolutionMemory;
    expect(mem['BC-1']).toBeDefined();
    expect(mem['BC-1'].layerId).toBe('layer-x');
    expect(typeof mem['BC-1'].answeredAt).toBe('number');
  });

  it('records overwrite earlier resolutions for the same code', () => {
    useAIStore.getState().recordCodeResolution('BC-1', 'layer-x');
    useAIStore.getState().recordCodeResolution('BC-1', 'layer-y');
    expect(useAIStore.getState().codeResolutionMemory['BC-1'].layerId).toBe('layer-y');
  });

  it('rejects empty code / layerId silently', () => {
    useAIStore.getState().recordCodeResolution('', 'layer');
    useAIStore.getState().recordCodeResolution('BC-1', '');
    expect(useAIStore.getState().codeResolutionMemory).toEqual({});
  });

  it('forgetCodeResolution removes one entry', () => {
    useAIStore.getState().recordCodeResolution('BC-1', 'layer-x');
    useAIStore.getState().recordCodeResolution('EP-1', 'layer-y');
    useAIStore.getState().forgetCodeResolution('bc-1');
    const mem = useAIStore.getState().codeResolutionMemory;
    expect(mem['BC-1']).toBeUndefined();
    expect(mem['EP-1']).toBeDefined();
  });

  it('clearCodeResolutionMemory drops everything', () => {
    useAIStore.getState().recordCodeResolution('BC-1', 'layer-x');
    useAIStore.getState().recordCodeResolution('EP-1', 'layer-y');
    useAIStore.getState().clearCodeResolutionMemory();
    expect(useAIStore.getState().codeResolutionMemory).toEqual({});
  });
});

describe('buildSystemPrompt — codeResolutions section', () => {
  beforeEach(() => resetStores());

  it('renders "(none)" when no resolutions exist', () => {
    const prompt = buildSystemPrompt({
      layers: [], activeLayerId: 'layer-1', mode: 'COPILOT',
      sandboxDefault: false, autoApproveThreshold: 0.85,
      codeResolutions: {},
    });
    expect(prompt).toContain('Previously-resolved point codes');
    expect(prompt).toMatch(/Previously-resolved point codes [^\n]*:\n  \(none\)/);
  });

  it('lists each recorded resolution', () => {
    const prompt = buildSystemPrompt({
      layers: [], activeLayerId: 'layer-1', mode: 'COPILOT',
      sandboxDefault: false, autoApproveThreshold: 0.85,
      codeResolutions: {
        'BC-1': { layerId: 'layer-back-of-curb', answeredAt: 0 },
        'EP-1': { layerId: 'layer-edge-of-pavement', answeredAt: 0 },
      },
    });
    expect(prompt).toContain('- BC-1 → layer layer-back-of-curb');
    expect(prompt).toContain('- EP-1 → layer layer-edge-of-pavement');
  });
});

describe('AUTO escalation — proposal acceptance vs threshold', () => {
  beforeEach(() => resetStores());

  it('AUTO + confidence ≥ threshold lets acceptHeadProposal land', () => {
    useAIStore.getState().setMode('AUTO');
    useAIStore.getState().setAutoApproveThreshold(0.8);
    useAIStore.getState().enqueueProposal(mockAddPointProposal({ x: 0, y: 0 }, { confidence: 0.95 }));
    const result = useAIStore.getState().acceptHeadProposal();
    expect(result?.ok).toBe(true);
    expect(useAIStore.getState().proposalQueue).toHaveLength(0);
  });

  it('AUTO + confidence < threshold leaves the head queued (escalation)', () => {
    // The runner's job is to NOT accept when below threshold.
    // Here we assert the contract the runner depends on:
    // proposals stay queued until something explicitly accepts.
    useAIStore.getState().setMode('AUTO');
    useAIStore.getState().setAutoApproveThreshold(0.9);
    useAIStore.getState().enqueueProposal(mockAddPointProposal({ x: 0, y: 0 }, { confidence: 0.6 }));
    // No auto-accept happens here; queue length stays 1.
    expect(useAIStore.getState().proposalQueue).toHaveLength(1);
  });

  it('threshold can be clamped to [0, 1]', () => {
    useAIStore.getState().setAutoApproveThreshold(-0.5);
    expect(useAIStore.getState().autoApproveThreshold).toBe(0);
    useAIStore.getState().setAutoApproveThreshold(1.5);
    expect(useAIStore.getState().autoApproveThreshold).toBe(1);
  });

  it('threshold = 1.0 makes AUTO behave like COPILOT (never auto-approves)', () => {
    useAIStore.getState().setAutoApproveThreshold(1.0);
    useAIStore.getState().setMode('AUTO');
    useAIStore.getState().enqueueProposal(mockAddPointProposal({ x: 0, y: 0 }, { confidence: 0.999 }));
    // The runner reads `confidence < threshold` so 0.999 < 1.0
    // means escalation — confirms the threshold == 1.0 edge.
    const { autoApproveThreshold, proposalQueue } = useAIStore.getState();
    expect(proposalQueue[0].confidence < autoApproveThreshold).toBe(true);
  });
});
