// __tests__/cad/ai/auto-intake.test.ts
//
// Phase 6 §32 Slice 11 — AUTO intake prompt builder + snapshot
// helper. Pure functions; no store / DOM needed.

import { describe, it, expect } from 'vitest';
import {
  buildAutoIntakePrompt,
  snapshotFromFeatures,
} from '@/lib/cad/ai/auto-intake';

const BASE_CONTEXT = {
  layers: [
    { id: 'l1', name: 'BACK_OF_CURB', color: '#000' },
    { id: 'l2', name: 'EDGE_OF_PAVEMENT', color: '#000' },
  ],
  activeLayerId: 'l1',
  mode: 'AUTO' as const,
  sandboxDefault: true,
  autoApproveThreshold: 0.85,
};

describe('snapshotFromFeatures', () => {
  it('returns zeros for an empty document', () => {
    const snap = snapshotFromFeatures([]);
    expect(snap.pointCount).toBe(0);
    expect(snap.totalFeatures).toBe(0);
    expect(snap.sampleCodes).toEqual([]);
  });

  it('counts POINTs separately from total features', () => {
    const snap = snapshotFromFeatures([
      { geometry: { type: 'POINT' }, properties: { code: 'BC-1' } },
      { geometry: { type: 'POINT' }, properties: { code: 'BC-2' } },
      { geometry: { type: 'LINE' }, properties: {} },
      { geometry: { type: 'POLYLINE' }, properties: {} },
    ]);
    expect(snap.pointCount).toBe(2);
    expect(snap.totalFeatures).toBe(4);
  });

  it('upper-cases codes + dedupes, preserving insertion order', () => {
    const snap = snapshotFromFeatures([
      { geometry: { type: 'POINT' }, properties: { code: 'bc-1' } },
      { geometry: { type: 'POINT' }, properties: { code: 'BC-1' } },
      { geometry: { type: 'POINT' }, properties: { code: 'ep-1' } },
    ]);
    expect(snap.sampleCodes).toEqual(['BC-1', 'EP-1']);
  });

  it('ignores features whose code property is not a string', () => {
    const snap = snapshotFromFeatures([
      { geometry: { type: 'POINT' }, properties: { code: 7 as unknown as string } },
      { geometry: { type: 'POINT' }, properties: {} },
      { geometry: { type: 'POINT' }, properties: { code: '' } },
    ]);
    expect(snap.pointCount).toBe(3);
    expect(snap.sampleCodes).toEqual([]);
  });
});

describe('buildAutoIntakePrompt', () => {
  it('includes the snapshot fields and the layer count', () => {
    const prompt = buildAutoIntakePrompt(
      { pointCount: 12, totalFeatures: 14, sampleCodes: ['BC-1', 'EP-1'] },
      BASE_CONTEXT,
    );
    expect(prompt).toContain('POINTs in document: 12');
    expect(prompt).toContain('Total features: 14');
    expect(prompt).toContain('Existing layers: 2');
    expect(prompt).toContain('codes: BC-1, EP-1');
    expect(prompt).toContain('Reference documents uploaded: 0 (running blind');
    expect(prompt).toContain('threshold');
  });

  it('flags reference docs when present', () => {
    const prompt = buildAutoIntakePrompt(
      { pointCount: 1, totalFeatures: 1, sampleCodes: [] },
      {
        ...BASE_CONTEXT,
        referenceDocs: [{ name: 'lot17.pdf', kind: 'DEED' }],
      },
    );
    expect(prompt).toContain('Reference documents uploaded: 1');
    expect(prompt).not.toContain('running blind');
  });

  it('reports an empty codes catalogue gracefully', () => {
    const prompt = buildAutoIntakePrompt(
      { pointCount: 0, totalFeatures: 0, sampleCodes: [] },
      BASE_CONTEXT,
    );
    expect(prompt).toContain('(no point codes detected)');
  });

  it('truncates the code sample to 12 entries with a "+N more" tail', () => {
    const manyCodes = Array.from({ length: 20 }, (_, i) => `BC-${i + 1}`);
    const prompt = buildAutoIntakePrompt(
      { pointCount: 20, totalFeatures: 20, sampleCodes: manyCodes },
      BASE_CONTEXT,
    );
    expect(prompt).toContain('BC-1, BC-2, BC-3, BC-4, BC-5, BC-6, BC-7, BC-8, BC-9, BC-10, BC-11, BC-12, …(+8 more)');
  });

  it('echoes the active auto-approve threshold in the plan', () => {
    const prompt = buildAutoIntakePrompt(
      { pointCount: 0, totalFeatures: 0, sampleCodes: [] },
      { ...BASE_CONTEXT, autoApproveThreshold: 0.7 },
    );
    expect(prompt).toContain('(0.7)');
  });

  it('reports saved code resolutions count', () => {
    const prompt = buildAutoIntakePrompt(
      { pointCount: 0, totalFeatures: 0, sampleCodes: [] },
      {
        ...BASE_CONTEXT,
        codeResolutions: {
          'BC-1': { layerId: 'l1', answeredAt: 0 },
          'EP-1': { layerId: 'l2', answeredAt: 0 },
        },
      },
    );
    expect(prompt).toContain('Saved code resolutions: 2');
  });
});
