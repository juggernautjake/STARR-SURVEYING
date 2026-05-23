// __tests__/cad/ai/sketch-reconcile.test.ts
// Parser tests for the sketch-reconciliation Vision response. The
// network call itself is integration-tested via Playwright.

import { describe, it, expect } from 'vitest';
import { parseSketchResult } from '@/lib/cad/ai/sketch-reconcile';

describe('parseSketchResult', () => {
  it('parses a well-formed response', () => {
    const r = parseSketchResult(JSON.stringify({
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }],
      edgeLabels: [{ fromIndex: 0, toIndex: 1, label: '10.00' }],
      narrative: 'Rectangular building, 10x8.',
      confidence: 0.92,
    }));
    expect(r.vertices).toHaveLength(4);
    expect(r.vertices[2]).toEqual({ x: 10, y: 8 });
    expect(r.edgeLabels).toHaveLength(1);
    expect(r.confidence).toBe(0.92);
  });

  it('strips Markdown fences if the model leaks them', () => {
    const raw = '```json\n' + JSON.stringify({
      vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
      edgeLabels: [],
      narrative: '',
      confidence: 0.6,
    }) + '\n```';
    const r = parseSketchResult(raw);
    expect(r.vertices).toHaveLength(3);
  });

  it('clamps confidence to [0, 1]', () => {
    const r = parseSketchResult(JSON.stringify({
      vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
      edgeLabels: [],
      narrative: '',
      confidence: 1.5,
    }));
    expect(r.confidence).toBe(1);
  });

  it('rejects non-JSON', () => {
    expect(() => parseSketchResult('hello world')).toThrow(/not valid JSON/);
  });

  it('rejects vertices < 3', () => {
    expect(() =>
      parseSketchResult(JSON.stringify({ vertices: [{ x: 0, y: 0 }], edgeLabels: [], narrative: '', confidence: 0.5 })),
    ).toThrow(/length ≥ 3/);
  });

  it('rejects malformed vertex objects', () => {
    expect(() =>
      parseSketchResult(JSON.stringify({ vertices: [{ x: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], edgeLabels: [], narrative: '', confidence: 0.5 })),
    ).toThrow(/numeric x and y/);
  });
});
