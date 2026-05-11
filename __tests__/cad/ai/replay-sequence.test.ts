// __tests__/cad/ai/replay-sequence.test.ts
//
// Phase 6 §32 Slice 12 — replay timeline auto-record + replay
// action. Stubs global.fetch so the proposer doesn't try to
// hit a real Anthropic endpoint in CI.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAIStore } from '@/lib/cad/store';
import { useDrawingStore } from '@/lib/cad/store/drawing-store';
import { useUndoStore } from '@/lib/cad/store/undo-store';
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

function resetStores() {
  useDrawingStore.getState().newDocument();
  useUndoStore.getState().clear();
  useAIStore.setState({
    proposalQueue: [],
    aiBatches: [],
    copilotChat: [],
    referenceDocs: [],
    lastProposeNarrative: null,
    isProposing: false,
  });
  useAIStore.getState().setMode('COPILOT');
  useAIStore.getState().setSandbox(false);
  const id = generateId();
  useDrawingStore.getState().addLayer(makeLayer(id, 'TEST_LAYER'));
  useDrawingStore.getState().setActiveLayer(id);
}

function stubFetchOk(body: { proposals?: unknown[]; narrative?: string } = {}) {
  return vi.fn(async () =>
    new Response(JSON.stringify({ proposals: body.proposals ?? [], narrative: body.narrative ?? '' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

function stubFetchError(status = 500, msg = 'boom') {
  return vi.fn(async () =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

const originalFetch = globalThis.fetch;

describe('aiBatches — CRUD', () => {
  beforeEach(resetStores);

  it('starts empty', () => {
    expect(useAIStore.getState().aiBatches).toEqual([]);
  });

  it('removeAIBatch filters by id', () => {
    useAIStore.setState({
      aiBatches: [
        { id: 'a', createdAt: 1, prompt: 'A', proposalCount: 1 },
        { id: 'b', createdAt: 2, prompt: 'B', proposalCount: 2 },
      ],
    });
    useAIStore.getState().removeAIBatch('a');
    expect(useAIStore.getState().aiBatches.map((b) => b.id)).toEqual(['b']);
  });

  it('clearAIBatches empties the log', () => {
    useAIStore.setState({
      aiBatches: [{ id: 'a', createdAt: 1, prompt: 'A', proposalCount: 1 }],
    });
    useAIStore.getState().clearAIBatches();
    expect(useAIStore.getState().aiBatches).toEqual([]);
  });
});

describe('proposeFromPrompt — auto-recording', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('appends one batch log entry on a successful turn', async () => {
    globalThis.fetch = stubFetchOk({ proposals: [], narrative: 'looks good' }) as unknown as typeof fetch;
    await useAIStore.getState().proposeFromPrompt('Draw the back of curb');
    const batches = useAIStore.getState().aiBatches;
    expect(batches).toHaveLength(1);
    expect(batches[0].prompt).toBe('Draw the back of curb');
    expect(batches[0].proposalCount).toBe(0);
    expect(typeof batches[0].createdAt).toBe('number');
    expect(typeof batches[0].id).toBe('string');
  });

  it('does NOT record on a failed turn', async () => {
    globalThis.fetch = stubFetchError(503, 'AI offline') as unknown as typeof fetch;
    await useAIStore.getState().proposeFromPrompt('Draw the back of curb');
    expect(useAIStore.getState().aiBatches).toHaveLength(0);
  });

  it('keeps log ordering matching the call order', async () => {
    globalThis.fetch = stubFetchOk({}) as unknown as typeof fetch;
    await useAIStore.getState().proposeFromPrompt('one');
    await useAIStore.getState().proposeFromPrompt('two');
    await useAIStore.getState().proposeFromPrompt('three');
    const prompts = useAIStore.getState().aiBatches.map((b) => b.prompt);
    expect(prompts).toEqual(['one', 'two', 'three']);
  });
});

describe('replayAISequence', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns zero results when the log is empty', async () => {
    const result = await useAIStore.getState().replayAISequence();
    expect(result).toEqual({ replayed: 0, failed: 0, aborted: false });
  });

  it('re-fires every recorded prompt in order', async () => {
    const fetchStub = stubFetchOk({});
    globalThis.fetch = fetchStub as unknown as typeof fetch;

    useAIStore.setState({
      aiBatches: [
        { id: 'a', createdAt: 1, prompt: 'Draw lot 17', proposalCount: 0 },
        { id: 'b', createdAt: 2, prompt: 'Fill missing corners', proposalCount: 0 },
        { id: 'c', createdAt: 3, prompt: 'Apply final styles', proposalCount: 0 },
      ],
    });

    const result = await useAIStore.getState().replayAISequence();
    expect(result.replayed).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.aborted).toBe(false);

    // 3 original calls + 3 replay calls — replays auto-record
    // into aiBatches as well, so total fetch calls = 3.
    expect(fetchStub).toHaveBeenCalledTimes(3);
    const calls = fetchStub.mock.calls as unknown as Array<[unknown, RequestInit]>;
    const bodies = calls.map((c) => JSON.parse(c[1].body as string).prompt);
    expect(bodies).toEqual(['Draw lot 17', 'Fill missing corners', 'Apply final styles']);
  });

  it('counts failures separately from successes', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount++;
      if (callCount === 2) {
        return new Response(JSON.stringify({ error: 'transient' }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ proposals: [], narrative: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    useAIStore.setState({
      aiBatches: [
        { id: 'a', createdAt: 1, prompt: 'A', proposalCount: 0 },
        { id: 'b', createdAt: 2, prompt: 'B', proposalCount: 0 },
        { id: 'c', createdAt: 3, prompt: 'C', proposalCount: 0 },
      ],
    });
    const result = await useAIStore.getState().replayAISequence();
    expect(result.replayed).toBe(2);
    expect(result.failed).toBe(1);
  });

  it('honours an aborted signal between turns', async () => {
    globalThis.fetch = stubFetchOk({}) as unknown as typeof fetch;
    useAIStore.setState({
      aiBatches: [
        { id: 'a', createdAt: 1, prompt: 'A', proposalCount: 0 },
        { id: 'b', createdAt: 2, prompt: 'B', proposalCount: 0 },
      ],
    });
    const ctrl = new AbortController();
    ctrl.abort(); // pre-aborted — first iteration bails immediately
    const result = await useAIStore.getState().replayAISequence({ signal: ctrl.signal });
    expect(result.aborted).toBe(true);
    expect(result.replayed).toBe(0);
  });
});
