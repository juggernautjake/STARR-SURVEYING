// __tests__/cad/feature-row-label.test.ts
//
// cad-trv-fidelity Slice 3 — the Layer panel shows real element names:
// points as "Point <name> · <code>", text as `Text "<snippet>"`.

import { describe, it, expect } from 'vitest';
import { featureRowLabel } from '@/lib/cad/feature-row-label';
import type { Feature } from '@/lib/cad/types';

function feat(partial: Partial<Feature>): Feature {
  return {
    id: 'f', type: 'POINT', layerId: 'L',
    geometry: { type: 'POINT', point: { x: 0, y: 0 } },
    style: {} as Feature['style'], properties: {},
    ...partial,
  } as Feature;
}

describe('featureRowLabel', () => {
  it('POINT shows the point name + code', () => {
    expect(featureRowLabel(feat({ type: 'POINT', properties: { pointName: '309', code: '20fnd' } })))
      .toBe('Point 309 · 20fnd');
  });

  it('POINT with only a name omits the code', () => {
    expect(featureRowLabel(feat({ type: 'POINT', properties: { pointName: '309' } })))
      .toBe('Point 309');
  });

  it('POINT does not repeat the code when it equals the name', () => {
    expect(featureRowLabel(feat({ type: 'POINT', properties: { pointName: '20fnd', code: '20fnd' } })))
      .toBe('Point 20fnd');
  });

  it('TEXT shows a quoted snippet of its content', () => {
    expect(featureRowLabel(feat({
      type: 'TEXT',
      geometry: { type: 'TEXT', point: { x: 0, y: 0 }, textContent: 'asphalt parking' },
    }))).toBe('Text "asphalt parking"');
  });

  it('TEXT truncates long content with an ellipsis', () => {
    const long = 'church building w/ brick exterior and comp shingle roof';
    const label = featureRowLabel(feat({
      type: 'TEXT',
      geometry: { type: 'TEXT', point: { x: 0, y: 0 }, textContent: long },
    }));
    expect(label.startsWith('Text "church building w/ b')).toBe(true);
    expect(label.endsWith('…"')).toBe(true);
  });

  it('TEXT collapses multi-line content to one line', () => {
    expect(featureRowLabel(feat({
      type: 'TEXT',
      geometry: { type: 'TEXT', point: { x: 0, y: 0 }, textContent: 'a/c\nunit' },
    }))).toBe('Text "a/c unit"');
  });

  it('other types keep the TYPE – name form', () => {
    expect(featureRowLabel(feat({ type: 'POLYLINE', properties: { name: 'Boundary' } })))
      .toBe('POLYLINE – Boundary');
    expect(featureRowLabel(feat({ type: 'POLYGON', properties: {} })))
      .toBe('POLYGON');
  });
});
