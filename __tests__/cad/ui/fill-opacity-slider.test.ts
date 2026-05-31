// __tests__/cad/ui/fill-opacity-slider.test.ts
//
// cad-fill-stacking Slice 5 — locks the universal Opacity slider in
// the fill-pattern params card. The render path's `patternAlpha`
// already derives from `feature.style.fillOpacity` (cad-fill-stacking
// Slice 1, verified in textured-fill-render.test.ts); this spec locks
// that the UI surfaces the knob with the same slider + paired numeric
// input affordance the other rows use, and that it commits via
// updateFeature.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'PropertyPanel.tsx'),
  'utf8',
);

describe('PropertyPanel — universal Opacity slider', () => {
  it('renders an opacity range slider inside the fill-pattern params card', () => {
    expect(SRC).toMatch(/data-testid="property-panel-fill-pattern-opacity"/);
  });

  it('renders the paired opacity number input', () => {
    expect(SRC).toMatch(/data-testid="property-panel-fill-pattern-opacity-input"/);
  });

  it('the slider covers 0–1 in 0.05 steps', () => {
    expect(SRC).toMatch(
      /data-testid="property-panel-fill-pattern-opacity"[\s\S]*?min=\{0\}[\s\S]*?max=\{1\}[\s\S]*?step=\{0\.05\}/,
    );
  });

  it('commits the change via drawingStore.updateFeature with the spread style', () => {
    expect(SRC).toMatch(
      /fillOpacity: clamp\(parseFloat\(e\.target\.value\), 0, 1, 1\)/,
    );
  });

  it('falls back to opacity 1 when feature.style.fillOpacity is missing', () => {
    expect(SRC).toMatch(
      /Number\.isFinite\(feature\.style\.fillOpacity\)\s*\?\s*\(feature\.style\.fillOpacity as number\)\s*:\s*1;/,
    );
  });
});
