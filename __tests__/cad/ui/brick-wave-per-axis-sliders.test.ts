// __tests__/cad/ui/brick-wave-per-axis-sliders.test.ts
//
// cad-fill-stacking Slice 3 — locks the per-axis sliders for BRICK
// (width + height) and WAVE (amplitude + period). Source-text
// assertions because PropertyPanel + CanvasViewport are too large to
// mount under jsdom; pixel behavior is already covered by the pure-
// module tests in fill-patterns.test.ts.

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

describe('CanvasViewport — cfg threads the new brick/wave overrides', () => {
  it('brickWidth pulls from feature.style.brickWidth', () => {
    expect(CANVAS_SRC).toMatch(/brickWidth: feature\.style\.brickWidth,/);
  });
  it('brickHeight pulls from feature.style.brickHeight', () => {
    expect(CANVAS_SRC).toMatch(/brickHeight: feature\.style\.brickHeight,/);
  });
  it('waveAmplitude pulls from feature.style.waveAmplitude', () => {
    expect(CANVAS_SRC).toMatch(/waveAmplitude: feature\.style\.waveAmplitude,/);
  });
  it('wavePeriod pulls from feature.style.wavePeriod', () => {
    expect(CANVAS_SRC).toMatch(/wavePeriod: feature\.style\.wavePeriod,/);
  });
});

describe('PropertyPanel — BRICK shows Width + Height sliders + numeric inputs', () => {
  it('renders the brick-width range slider only when currentPattern === BRICK', () => {
    expect(PROPERTY_PANEL_SRC).toMatch(
      /currentPattern === 'BRICK'[\s\S]*?data-testid="property-panel-fill-pattern-brick-width"/,
    );
  });
  it('renders the paired brick-width number input', () => {
    expect(PROPERTY_PANEL_SRC).toMatch(/data-testid="property-panel-fill-pattern-brick-width-input"/);
  });
  it('renders the brick-height range slider', () => {
    expect(PROPERTY_PANEL_SRC).toMatch(/data-testid="property-panel-fill-pattern-brick-height"/);
  });
  it('renders the paired brick-height number input', () => {
    expect(PROPERTY_PANEL_SRC).toMatch(/data-testid="property-panel-fill-pattern-brick-height-input"/);
  });
});

describe('PropertyPanel — WAVE shows Amplitude + Period sliders + numeric inputs', () => {
  it('renders the wave-amplitude range slider only when currentPattern === WAVE', () => {
    expect(PROPERTY_PANEL_SRC).toMatch(
      /currentPattern === 'WAVE'[\s\S]*?data-testid="property-panel-fill-pattern-wave-amplitude"/,
    );
  });
  it('renders the paired wave-amplitude number input', () => {
    expect(PROPERTY_PANEL_SRC).toMatch(/data-testid="property-panel-fill-pattern-wave-amplitude-input"/);
  });
  it('renders the wave-period range slider', () => {
    expect(PROPERTY_PANEL_SRC).toMatch(/data-testid="property-panel-fill-pattern-wave-period"/);
  });
  it('renders the paired wave-period number input', () => {
    expect(PROPERTY_PANEL_SRC).toMatch(/data-testid="property-panel-fill-pattern-wave-period-input"/);
  });
});
