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
    // cad-fills polish 2026-05-30 — split into a `rawPattern` read +
    // a normalized `currentPattern` (so legacy gravel variants surface
    // as DOT_GRAVEL in the dropdown). Same contract: NONE fallback.
    expect(SRC).toMatch(/const rawPattern: FillPattern = feature\.style\.fillPattern \?\? 'NONE';/);
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
    // cad-fills polish 2026-05-30 — swatches are now <option> elements
    // inside a <select>, but each still carries the same per-pattern
    // data-testid so the contract is unchanged.
    expect(SRC).toContain('data-testid={`property-panel-fill-pattern-swatch-${opt.value}`}');
  });

  for (const v of variants) {
    it(`patternOptions array declares value: '${v}'`, () => {
      expect(SRC).toContain(`value: '${v}'`);
    });
  }
});

describe('Slice 237 — pattern selection commits via updateFeature', () => {
  it('updates the feature with the chosen FillPattern preserved through the spread', () => {
    // cad-fills polish 2026-05-30 — the dropdown's onChange writes
    // `next` (the cast e.target.value) instead of the per-button
    // `opt.value`, but it still goes through the same updateFeature
    // call with the same style spread + isOverride flag.
    expect(SRC).toMatch(/drawingStore\.updateFeature\(feature\.id, \{\s*style: \{ \.\.\.DEFAULT_FEATURE_STYLE, \.\.\.feature\.style, fillPattern: next, isOverride: true \},\s*\}\);/);
  });
});

describe('cad-fills polish 2026-05-30 — dropdown layout', () => {
  it('renders a <select> with the property-panel-fill-pattern-select test id', () => {
    expect(SRC).toContain('data-testid="property-panel-fill-pattern-select"');
    expect(SRC).toMatch(/<select[\s\S]*?data-testid="property-panel-fill-pattern-select"/);
  });

  it('groups options into Stipple / Hatches / Pattern via <optgroup>', () => {
    // The group labels are JSX-bound via {group.label}; assert on the
    // source-side patternGroups declaration instead.
    expect(SRC).toContain("label: 'Stipple'");
    expect(SRC).toContain("label: 'Hatches'");
    expect(SRC).toContain("label: 'Pattern'");
    expect(SRC).toMatch(/<optgroup\b[\s\S]*?label=\{group\.label\}/);
  });

  it('normalizes legacy gravel variants (FINE/COARSE/SAND) → DOT_GRAVEL in the picker', () => {
    expect(SRC).toMatch(/rawPattern === 'DOT_GRAVEL_FINE'[\s\S]*?'DOT_GRAVEL_COARSE'[\s\S]*?'DOT_SAND'[\s\S]*?\?\s*'DOT_GRAVEL'/);
  });
});

describe('Slice 237 — default is None so existing drawings stay unchanged', () => {
  it('the options array starts with the NONE entry', () => {
    expect(SRC).toMatch(/\{ value: 'NONE', label: 'No fill' \}/);
  });
});
