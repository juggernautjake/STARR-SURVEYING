// __tests__/cad/ai/provenance.test.ts
//
// Phase 6 §32.7 — provenance stamp helpers + tool-registry
// integration.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  stampProvenance,
  readProvenance,
  hasProvenance,
  type AIProvenance,
} from '@/lib/cad/ai/provenance';
import {
  addPoint,
  drawLineBetween,
  drawPolylineThrough,
} from '@/lib/cad/ai/tool-registry';
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

function resetStores(): string {
  useDrawingStore.getState().newDocument();
  useUndoStore.getState().clear();
  const id = generateId();
  useDrawingStore.getState().addLayer(makeLayer(id, 'TEST_LAYER'));
  useDrawingStore.getState().setActiveLayer(id);
  return id;
}

const PROV: AIProvenance = {
  aiOrigin: 'COMMAND_addPoint',
  aiConfidence: 0.87,
  aiPromptHash: 'sha256-abcdef',
  aiSourcePoints: ['pt-1', 'pt-2', 'pt-3'],
  aiBatchId: 'batch-001',
};

describe('stampProvenance + readProvenance round-trip', () => {
  it('round-trips every field through Record<string,primitive>', () => {
    const stamped = stampProvenance({ existing: 'keep me' }, PROV);
    expect(stamped.existing).toBe('keep me');
    expect(stamped.aiOrigin).toBe(PROV.aiOrigin);
    expect(stamped.aiConfidence).toBe(PROV.aiConfidence);
    expect(stamped.aiPromptHash).toBe(PROV.aiPromptHash);
    expect(stamped.aiBatchId).toBe(PROV.aiBatchId);
    // aiSourcePoints is JSON-encoded.
    expect(typeof stamped.aiSourcePoints).toBe('string');

    const read = readProvenance(stamped);
    expect(read).not.toBeNull();
    expect(read).toEqual(PROV);
  });

  it('treats an empty source list as an empty array', () => {
    const stamped = stampProvenance({}, { ...PROV, aiSourcePoints: [] });
    const read = readProvenance(stamped);
    expect(read?.aiSourcePoints).toEqual([]);
  });

  it('readProvenance returns null when aiOrigin is missing', () => {
    expect(readProvenance({})).toBeNull();
    expect(readProvenance({ aiOrigin: '' })).toBeNull();
    expect(readProvenance(null)).toBeNull();
  });

  it('readProvenance survives corrupt aiSourcePoints JSON', () => {
    const corrupted = {
      aiOrigin: 'X',
      aiConfidence: 0.5,
      aiPromptHash: 'h',
      aiSourcePoints: '{not json',
      aiBatchId: 'b',
    };
    const read = readProvenance(corrupted);
    expect(read).not.toBeNull();
    expect(read?.aiSourcePoints).toEqual([]);
  });

  it('readProvenance discards non-string entries in aiSourcePoints', () => {
    const partial = {
      aiOrigin: 'X',
      aiConfidence: 0.5,
      aiPromptHash: 'h',
      aiSourcePoints: JSON.stringify(['pt-1', 7, null, 'pt-2']),
      aiBatchId: 'b',
    };
    expect(readProvenance(partial)?.aiSourcePoints).toEqual(['pt-1', 'pt-2']);
  });

  it('hasProvenance is true only when aiOrigin is non-empty', () => {
    expect(hasProvenance(undefined)).toBe(false);
    expect(hasProvenance(null)).toBe(false);
    expect(hasProvenance({})).toBe(false);
    expect(hasProvenance({ aiOrigin: '' })).toBe(false);
    expect(hasProvenance({ aiOrigin: 'COMMAND_addPoint' })).toBe(true);
  });
});

describe('tool-registry — provenance stamping', () => {
  beforeEach(() => {
    resetStores();
  });

  it('addPoint stamps all five provenance fields when provided', () => {
    const r = addPoint.execute({ x: 5, y: 7, provenance: PROV });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const round = readProvenance(r.result.properties);
    expect(round).toEqual(PROV);
  });

  it('addPoint omits stamps when provenance is not supplied', () => {
    const r = addPoint.execute({ x: 5, y: 7 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.properties.aiOrigin).toBeUndefined();
    expect(readProvenance(r.result.properties)).toBeNull();
  });

  it('drawLineBetween stamps provenance', () => {
    const r = drawLineBetween.execute({
      from: { x: 0, y: 0 }, to: { x: 1, y: 1 },
      provenance: { ...PROV, aiOrigin: 'COMMAND_drawLineBetween' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.properties.aiOrigin).toBe('COMMAND_drawLineBetween');
  });

  it('drawPolylineThrough stamps provenance', () => {
    const r = drawPolylineThrough.execute({
      points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
      provenance: { ...PROV, aiOrigin: 'FEATURE_ASSEMBLY' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const round = readProvenance(r.result.properties);
    expect(round?.aiOrigin).toBe('FEATURE_ASSEMBLY');
    expect(round?.aiSourcePoints).toEqual(['pt-1', 'pt-2', 'pt-3']);
  });

  it('user-supplied properties survive alongside provenance', () => {
    const r = addPoint.execute({
      x: 0, y: 0,
      code: 'BC-1',
      properties: { traverseId: 'tv-7' },
      provenance: PROV,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.properties.code).toBe('BC-1');
    expect(r.result.properties.traverseId).toBe('tv-7');
    expect(r.result.properties.aiOrigin).toBe(PROV.aiOrigin);
  });
});
