// __tests__/cad/ui/fill-background-opacity.test.ts
//
// cad-trv-fidelity Slice 6b — a fill has a BACKGROUND colour + opacity
// separate from the texture colour + opacity, so "black hatch lines on
// semi-transparent grey" is a first-class option (sliders + value
// inputs). Locks the style field, the render separation, and the UI.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', '..', p), 'utf8');

describe('fill background opacity — data + render', () => {
  it('FeatureStyle declares fillBackgroundOpacity', () => {
    expect(read('lib/cad/types.ts')).toMatch(/fillBackgroundOpacity\?:\s*number/);
  });
  it('the base (background) fill uses fillBackgroundOpacity, falling back to fillOpacity', () => {
    const SRC = read('app/admin/cad/components/CanvasViewport.tsx');
    // Both base-fill sites (polygon + circle/ellipse) prefer the
    // background opacity over the texture opacity.
    const matches = SRC.match(/feature\.style\.fillBackgroundOpacity \?\? feature\.style\.fillOpacity \?\? alpha/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

describe('fill background opacity — PropertyPanel UI', () => {
  const SRC = read('app/admin/cad/components/PropertyPanel.tsx');
  it('renders a background colour picker', () => {
    expect(SRC).toMatch(/data-testid="property-panel-fill-background-color"/);
    expect(SRC).toMatch(/fillColor: e\.target\.value/);
  });
  it('renders a background-opacity slider AND a paired value input', () => {
    expect(SRC).toMatch(/data-testid="property-panel-fill-background-opacity"/);
    expect(SRC).toMatch(/data-testid="property-panel-fill-background-opacity-input"/);
    expect(SRC).toMatch(/fillBackgroundOpacity: clamp\(/);
  });
  it('keeps the separate TEXTURE opacity control (fillOpacity)', () => {
    expect(SRC).toMatch(/data-testid="property-panel-fill-pattern-opacity"/);
  });
});
