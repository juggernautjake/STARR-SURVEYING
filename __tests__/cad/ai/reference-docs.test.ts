// __tests__/cad/ai/reference-docs.test.ts
//
// Phase 6 §32 Slice 9 — reference-doc manifest + dampening
// factor + system-prompt threading.

import { describe, it, expect, beforeEach } from 'vitest';
import { useAIStore, REFERENCE_DOC_DAMPENING } from '@/lib/cad/store';
import { buildSystemPrompt } from '@/lib/cad/ai/system-prompt';

function resetStore() {
  useAIStore.setState({ referenceDocs: [], copilotChat: [], proposalQueue: [] });
}

describe('referenceDocs — CRUD', () => {
  beforeEach(resetStore);

  it('starts empty', () => {
    expect(useAIStore.getState().referenceDocs).toEqual([]);
  });

  it('addReferenceDoc trims + ignores empty names', () => {
    useAIStore.getState().addReferenceDoc({ name: '   ', kind: 'DEED' });
    expect(useAIStore.getState().referenceDocs).toHaveLength(0);
    useAIStore.getState().addReferenceDoc({ name: '  My Deed  ', kind: 'DEED' });
    const docs = useAIStore.getState().referenceDocs;
    expect(docs).toHaveLength(1);
    expect(docs[0].name).toBe('My Deed');
    expect(docs[0].kind).toBe('DEED');
    expect(typeof docs[0].id).toBe('string');
    expect(typeof docs[0].addedAt).toBe('string');
  });

  it('removeReferenceDoc filters by id', () => {
    useAIStore.getState().addReferenceDoc({ name: 'A', kind: 'DEED' });
    useAIStore.getState().addReferenceDoc({ name: 'B', kind: 'PLAT' });
    const [first] = useAIStore.getState().referenceDocs;
    useAIStore.getState().removeReferenceDoc(first.id);
    expect(useAIStore.getState().referenceDocs).toHaveLength(1);
    expect(useAIStore.getState().referenceDocs[0].name).toBe('B');
  });

  it('clearReferenceDocs empties the list', () => {
    useAIStore.getState().addReferenceDoc({ name: 'A', kind: 'DEED' });
    useAIStore.getState().addReferenceDoc({ name: 'B', kind: 'PLAT' });
    useAIStore.getState().clearReferenceDocs();
    expect(useAIStore.getState().referenceDocs).toHaveLength(0);
  });
});

describe('buildSystemPrompt — reference-doc rendering', () => {
  it('warns "running blind" when no docs are present', () => {
    const prompt = buildSystemPrompt({
      layers: [], activeLayerId: 'l1', mode: 'COPILOT',
      sandboxDefault: false, autoApproveThreshold: 0.85,
      referenceDocs: [],
    });
    expect(prompt).toContain('NONE uploaded');
    expect(prompt).toContain(`×${REFERENCE_DOC_DAMPENING}`);
  });

  it('lists uploaded docs with kind + name', () => {
    const prompt = buildSystemPrompt({
      layers: [], activeLayerId: 'l1', mode: 'COPILOT',
      sandboxDefault: false, autoApproveThreshold: 0.85,
      referenceDocs: [
        { name: 'lot-17-deed.pdf', kind: 'DEED' },
        { name: 'subdivision-plat.pdf', kind: 'PLAT' },
      ],
    });
    expect(prompt).toContain('Reference documents uploaded');
    expect(prompt).toContain('DEED: lot-17-deed.pdf');
    expect(prompt).toContain('PLAT: subdivision-plat.pdf');
    expect(prompt).not.toContain('NONE uploaded');
  });

  it('defaults to no-docs branch when referenceDocs is omitted', () => {
    const prompt = buildSystemPrompt({
      layers: [], activeLayerId: 'l1', mode: 'COPILOT',
      sandboxDefault: false, autoApproveThreshold: 0.85,
    });
    expect(prompt).toContain('NONE uploaded');
  });
});

describe('REFERENCE_DOC_DAMPENING constant', () => {
  it('matches the spec value', () => {
    expect(REFERENCE_DOC_DAMPENING).toBe(0.85);
  });
});
