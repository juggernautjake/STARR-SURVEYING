// __tests__/cad/ai/proposal-queue.test.ts
//
// Phase 6 §32.13 Slice 5 — COPILOT proposal queue lifecycle.
// Drives useAIStore.enqueueProposal / acceptHeadProposal /
// skipHeadProposal / clearProposalQueue directly (no AI in the
// loop yet) using the mock-proposer factories.

import { describe, it, expect, beforeEach } from 'vitest';
import { useAIStore } from '@/lib/cad/store/ai-store';
import {
  mockAddPointProposal,
  mockDrawLineProposal,
  mockDrawPolylineProposal,
} from '@/lib/cad/ai/mock-proposer';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import { useUndoStore } from '@/lib/cad/store/undo-store';
import { readProvenance } from '@/lib/cad/ai/provenance';
import { isDraftLayer } from '@/lib/cad/ai/sandbox';
import { generateId } from '@/lib/cad/types';
import type { Layer } from '@/lib/cad/types';

function makeLayer(id: string, name: string): Layer {
  return {
    id, name,
    visible: true, locked: false, frozen: false,
    color: '#446699', lineWeight: 0.5, lineTypeId: 'SOLID', opacity: 1,
    groupId: null, sortOrder: 0, isDefault: false, isProtected: false,
    autoAssignCodes: [],
  };
}

function resetStores(): string {
  useDrawingStore.getState().newDocument();
  useUndoStore.getState().clear();
  useAIStore.getState().clearProposalQueue();
  useAIStore.getState().setMode('COPILOT');
  useAIStore.getState().setSandbox(false);
  const id = generateId();
  useDrawingStore.getState().addLayer(makeLayer(id, 'TEST_LAYER'));
  useDrawingStore.getState().setActiveLayer(id);
  return id;
}

describe('proposal queue — enqueue / dequeue', () => {
  beforeEach(() => {
    resetStores();
  });

  it('starts empty and accepts enqueues', () => {
    expect(useAIStore.getState().proposalQueue).toHaveLength(0);
    useAIStore.getState().enqueueProposal(mockAddPointProposal({ x: 1, y: 2 }));
    expect(useAIStore.getState().proposalQueue).toHaveLength(1);
  });

  it('preserves FIFO order across multiple enqueues', () => {
    const a = mockAddPointProposal({ x: 0, y: 0 }, { description: 'one' });
    const b = mockAddPointProposal({ x: 1, y: 1 }, { description: 'two' });
    const c = mockAddPointProposal({ x: 2, y: 2 }, { description: 'three' });
    useAIStore.getState().enqueueProposal(a);
    useAIStore.getState().enqueueProposal(b);
    useAIStore.getState().enqueueProposal(c);
    expect(useAIStore.getState().proposalQueue.map((p) => p.id)).toEqual([a.id, b.id, c.id]);
  });

  it('clearProposalQueue empties the queue', () => {
    useAIStore.getState().enqueueProposal(mockAddPointProposal({ x: 1, y: 2 }));
    useAIStore.getState().enqueueProposal(mockDrawLineProposal({ from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }));
    useAIStore.getState().clearProposalQueue();
    expect(useAIStore.getState().proposalQueue).toHaveLength(0);
  });
});

describe('proposal queue — acceptHeadProposal', () => {
  beforeEach(() => {
    resetStores();
  });

  it('returns null when the queue is empty', () => {
    expect(useAIStore.getState().acceptHeadProposal()).toBeNull();
  });

  it('executes the head proposal and dequeues it', () => {
    useAIStore.getState().enqueueProposal(mockAddPointProposal({ x: 7, y: 11 }));
    const result = useAIStore.getState().acceptHeadProposal();
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(true);
    if (!result!.ok) return;
    expect(useAIStore.getState().proposalQueue).toHaveLength(0);
    // Feature lives in the drawing store.
    const features = Object.values(useDrawingStore.getState().document.features);
    expect(features).toHaveLength(1);
    expect(features[0].geometry.type).toBe('POINT');
  });

  it('stamps provenance on the resulting feature', () => {
    const proposal = mockAddPointProposal({ x: 0, y: 0 }, { confidence: 0.92 });
    useAIStore.getState().enqueueProposal(proposal);
    useAIStore.getState().acceptHeadProposal();
    const features = Object.values(useDrawingStore.getState().document.features);
    const prov = readProvenance(features[0].properties);
    expect(prov?.aiOrigin).toBe('COPILOT_addPoint');
    expect(prov?.aiConfidence).toBe(0.92);
  });

  it('routes to a DRAFT__ layer when caller passes sandbox=true', () => {
    const targetId = useDrawingStore.getState().activeLayerId;
    useAIStore.getState().enqueueProposal(mockAddPointProposal({ x: 0, y: 0 }));
    useAIStore.getState().acceptHeadProposal(true);
    const features = Object.values(useDrawingStore.getState().document.features);
    const layer = useDrawingStore.getState().document.layers[features[0].layerId];
    expect(isDraftLayer(layer)).toBe(true);
    expect(features[0].layerId).not.toBe(targetId);
  });

  it('respects sandboxDefault on the proposal when caller does not override', () => {
    useAIStore.getState().setSandbox(false);
    useAIStore.getState().enqueueProposal(
      mockAddPointProposal({ x: 0, y: 0 }, { sandboxDefault: true }),
    );
    useAIStore.getState().acceptHeadProposal();
    const features = Object.values(useDrawingStore.getState().document.features);
    const layer = useDrawingStore.getState().document.layers[features[0].layerId];
    expect(isDraftLayer(layer)).toBe(true);
  });

  it('falls back to store-wide sandbox when proposal has no default and caller passes no override', () => {
    useAIStore.getState().setSandbox(true);
    useAIStore.getState().enqueueProposal(mockAddPointProposal({ x: 0, y: 0 }));
    useAIStore.getState().acceptHeadProposal();
    const features = Object.values(useDrawingStore.getState().document.features);
    const layer = useDrawingStore.getState().document.layers[features[0].layerId];
    expect(isDraftLayer(layer)).toBe(true);
  });

  it('caller sandbox override beats proposal sandboxDefault', () => {
    useAIStore.getState().enqueueProposal(
      mockAddPointProposal({ x: 0, y: 0 }, { sandboxDefault: true }),
    );
    useAIStore.getState().acceptHeadProposal(false);
    const features = Object.values(useDrawingStore.getState().document.features);
    const layer = useDrawingStore.getState().document.layers[features[0].layerId];
    expect(isDraftLayer(layer)).toBe(false);
  });

  it('surfaces the kernel reason on a failed accept (and still dequeues)', () => {
    // Polyline with only 1 vertex → kernel rejects.
    useAIStore.getState().enqueueProposal(
      mockDrawPolylineProposal({ points: [{ x: 0, y: 0 }] } as unknown as never),
    );
    const result = useAIStore.getState().acceptHeadProposal();
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    expect(useAIStore.getState().proposalQueue).toHaveLength(0);
  });
});

describe('proposal queue — skipHeadProposal', () => {
  beforeEach(() => {
    resetStores();
  });

  it('returns null when the queue is empty', () => {
    expect(useAIStore.getState().skipHeadProposal()).toBeNull();
  });

  it('dequeues without executing', () => {
    const proposal = mockAddPointProposal({ x: 0, y: 0 });
    useAIStore.getState().enqueueProposal(proposal);
    const id = useAIStore.getState().skipHeadProposal();
    expect(id).toBe(proposal.id);
    expect(useAIStore.getState().proposalQueue).toHaveLength(0);
    // No feature landed.
    expect(Object.keys(useDrawingStore.getState().document.features)).toHaveLength(0);
  });

  it('progresses to the next proposal when one was queued', () => {
    const a = mockAddPointProposal({ x: 0, y: 0 }, { description: 'a' });
    const b = mockAddPointProposal({ x: 1, y: 1 }, { description: 'b' });
    useAIStore.getState().enqueueProposal(a);
    useAIStore.getState().enqueueProposal(b);
    useAIStore.getState().skipHeadProposal();
    expect(useAIStore.getState().proposalQueue[0]?.id).toBe(b.id);
  });
});
