// __tests__/cad/ui/color-swatch-input.test.ts
//
// cad-ux-cleanup-pass Slice 4 — every color picker site in the CAD
// surface uses the shared `<ColorSwatchInput>` wrapper instead of a
// bare `<input type="color">`. The wrapper paints its label background
// from the current value so the swatch IS the chosen color (fixing the
// user-reported "dot in a box" rendering on Chromium / Firefox).
//
// Source-locked: the component is a pure React/DOM piece that the
// codebase tests by reading the source.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const componentsDir = path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components');
const read = (file: string) => fs.readFileSync(path.join(componentsDir, file), 'utf8');

describe('ColorSwatchInput — shared swatch wrapper', () => {
  const SRC = read('ColorSwatchInput.tsx');

  it('paints the label background from the current value', () => {
    expect(SRC).toMatch(/style=\{style\}/);
    expect(SRC).toMatch(/backgroundColor: swatch/);
  });

  it('overlays a transparent native picker that still opens on click', () => {
    expect(SRC).toMatch(/type="color"/);
    expect(SRC).toMatch(/absolute inset-0 w-full h-full opacity-0 cursor-pointer/);
  });

  it('falls back to #000000 when the value is empty', () => {
    expect(SRC).toMatch(/const swatch = value \|\| '#000000'/);
  });

  it('supports onFocus + onBlur pass-through so style-edit sites can hook in', () => {
    expect(SRC).toMatch(/onFocus=\{onFocus\}/);
    expect(SRC).toMatch(/onBlur=\{onBlur\}/);
  });
});

describe('every CAD color picker site uses ColorSwatchInput', () => {
  const SITES = [
    'NewLayerDialog.tsx',
    'PropertyPanel.tsx',
    'LayerPreferencesPanel.tsx',
    'SettingsDialog.tsx',
    'LineTypeEditor.tsx',
    'CodeStylePanel.tsx',
    'FeaturePropertiesDialog.tsx',
    'ToolOptionsBar.tsx',
    'CanvasViewport.tsx',
  ];
  for (const file of SITES) {
    it(`${file} imports ColorSwatchInput`, () => {
      expect(read(file)).toMatch(/import ColorSwatchInput from '\.\/ColorSwatchInput'/);
    });
    it(`${file} has no bare <input type="color"> stragglers`, () => {
      // Comments / strings referencing the old element are allowed; the
      // JSX-attribute form is not.
      const jsxAttr = /<input[\s\S]*?type="color"/;
      expect(read(file).match(jsxAttr)).toBeNull();
    });
  }
});
