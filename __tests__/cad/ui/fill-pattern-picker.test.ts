// __tests__/cad/ui/fill-pattern-picker.test.ts
//
// Slice 237 of cad-label-backgrounds-and-textured-fills-2026-05-30.md.
// Locks the source-level wiring of the closed-shape fill-pattern
// picker in PropertyPanel.tsx: imports the FillPattern type, mounts a
// section gated on computeFeatureArea > 0 (so open shapes stay
// quiet), renders one swatch button per enum value with the current
// pattern highlighted, and commits via drawingStore.updateFeature
// writing the new style.fillPattern. fs.readFileSync regex assertions
// on PropertyPanel.tsx since RTL setup for this component would
// require a full zustand store + selection mock.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'PropertyPanel.tsx'),
  'utf8',
);

describe('Slice 237 — FillPattern type imported', () => {
  it('imports FillPattern alongside Feature from @/lib/cad/types', () => {
    expect(SRC).toMatch(/import type \{ Feature, FillPattern \} from '@\/lib\/cad\/types';/);
  });
});

describe('Slice 237 — Fill pattern section in PropertyPanel', () => {
  it('mounts a section with data-testid="property-panel-fill-pattern"', () => {
    expect(SRC).toContain('data-testid="property-panel-fill-pattern"');
  });

  it('gates the section on computeFeatureArea(feature).squareFeet > 0 (closed shapes only)', () => {
    expect(SRC).toMatch(/\{computeFeatureArea\(feature\)\.squareFeet > 0 && \(\(\) => \{[\s\S]*?data-testid="property-panel-fill-pattern"/);
  });

  it('reads the current pattern from feature.style.fillPattern with NONE fallback', () => {
    expect(SRC).toMatch(/const currentPattern: FillPattern = feature\.style\.fillPattern \?\? 'NONE';/);
  });
});

describe('Slice 237 — pattern options grid covers every enum value', () => {
  // The grid must include each FillPattern variant so the surveyor
  // can reach every texture from the picker. Lock the value set so a
  // future refactor can't silently drop an option.
  const variants = [
    'NONE',
    'DOT_UNIFORM',
    'DOT_GRAVEL',
    'DIAGONAL_RIGHT',
    'DIAGONAL_LEFT',
    'CROSSHATCH',
    'HORIZONTAL_LINES',
    'VERTICAL_LINES',
    'BRICK',
    'WAVE',
  ] as const;

  it('declares a per-swatch data-testid template (interpolated by opt.value)', () => {
    expect(SRC).toContain('data-testid={`property-panel-fill-pattern-swatch-${opt.value}`}');
  });

  for (const v of variants) {
    it(`patternOptions array declares value: '${v}'`, () => {
      expect(SRC).toContain(`value: '${v}'`);
    });
  }
});

describe('Slice 237 — swatch click commits via updateFeature', () => {
  it('updates the feature with style.fillPattern: opt.value preserved through the spread', () => {
    expect(SRC).toMatch(/drawingStore\.updateFeature\(feature\.id, \{\s*style: \{ \.\.\.DEFAULT_FEATURE_STYLE, \.\.\.feature\.style, fillPattern: opt\.value, isOverride: true \},\s*\}\);/);
  });

  it('highlights the active swatch with a blue background class', () => {
    expect(SRC).toMatch(/const isActive = currentPattern === opt\.value;[\s\S]*?isActive\s*\?\s*'bg-blue-600 border-blue-400 text-white'/);
  });
});

describe('Slice 237 — default is None so existing drawings stay unchanged', () => {
  it('the options array starts with the NONE entry labeled "None"', () => {
    expect(SRC).toMatch(/\{ value: 'NONE', label: 'None' \}/);
  });
});
