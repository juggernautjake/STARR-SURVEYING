// __tests__/cad/ui/dashed-hatch-fill.test.ts
//
// cad-fill-stacking Slice 4 — locks the DASHED_LINES picker entry,
// the contextual dashLen / gapLen sliders, the paired numeric inputs,
// and the cfg wiring in CanvasViewport. Source-text assertions
// because PropertyPanel + CanvasViewport are too large to mount in
// jsdom; pixel behavior is already covered by the pure-module specs
// in fill-patterns.test.ts.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const PROPERTY_PANEL_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'PropertyPanel.tsx'),
  'utf8',
);

const CANVAS_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'CanvasViewport.tsx'),
  'utf8',
);

describe('PropertyPanel — DASHED_LINES picker entry', () => {
  it('appears in the Hatches optgroup', () => {
    expect(PROPERTY_PANEL_SRC).toMatch(
      /'Hatches'[\s\S]*?value: 'DASHED_LINES', label: 'Dashed lines'/,
    );
  });
});

describe('PropertyPanel — DASHED_LINES contextual sliders', () => {
  it('renders the dash-len range slider only when currentPattern === DASHED_LINES', () => {
    expect(PROPERTY_PANEL_SRC).toMatch(
      /currentPattern === 'DASHED_LINES'[\s\S]*?data-testid="property-panel-fill-pattern-dash-len"/,
    );
  });

  it('renders the paired dash-len number input', () => {
    expect(PROPERTY_PANEL_SRC).toMatch(/data-testid="property-panel-fill-pattern-dash-len-input"/);
  });

  it('renders the gap-len range slider', () => {
    expect(PROPERTY_PANEL_SRC).toMatch(/data-testid="property-panel-fill-pattern-gap-len"/);
  });

  it('renders the paired gap-len number input', () => {
    expect(PROPERTY_PANEL_SRC).toMatch(/data-testid="property-panel-fill-pattern-gap-len-input"/);
  });
});

describe('CanvasViewport — cfg threads the dashLen / gapLen overrides', () => {
  it('dashLen pulls from feature.style.patternDashLen', () => {
    expect(CANVAS_SRC).toMatch(/dashLen: feature\.style\.patternDashLen,/);
  });

  it('gapLen pulls from feature.style.patternGapLen', () => {
    expect(CANVAS_SRC).toMatch(/gapLen: feature\.style\.patternGapLen,/);
  });
});
