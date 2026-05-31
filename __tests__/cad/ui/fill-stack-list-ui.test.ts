// __tests__/cad/ui/fill-stack-list-ui.test.ts
//
// cad-fill-stacking Slice 6c — locks the multi-layer infill list UI
// in PropertyPanel. Source-text assertions because the panel is too
// large to mount under jsdom; pure-helper behavior is locked by
// fill-stack.test.ts and pixel behavior by fill-patterns.test.ts.
//
// What's locked here:
//
//  1. PropertyPanel imports the stack helpers (resolveFillStack +
//     legacyStyleToFillLayer + normalizeFillLayer).
//  2. The single-pattern picker + params card are gated on
//     `!hasExplicitStack` so they hide once the user starts stacking.
//  3. The layer-list section is gated on `hasExplicitStack` and
//     renders the per-layer eye/pattern-select/color/delete row
//     plus the "+ Add layer" button.
//  4. The "+ Add layer (stack another pattern)" CTA in single-
//     pattern mode is gated on `currentPattern !== 'NONE' &&
//     currentPattern !== 'SOLID'` and wires to `addLayer`.
//  5. deleteLayer auto un-stacks when the stack reduces to 1 layer
//     (copies layer 0's fields into legacy slots + clears
//     fillStack) so the params card returns.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'PropertyPanel.tsx'),
  'utf8',
);

describe('PropertyPanel — stack helper imports', () => {
  it('imports the resolve + project + normalize helpers from fill-stack', () => {
    expect(SRC).toMatch(/from '@\/lib\/cad\/styles\/fill-stack'/);
    expect(SRC).toMatch(/resolveFillStack/);
    expect(SRC).toMatch(/legacyStyleToFillLayer/);
    expect(SRC).toMatch(/normalizeFillLayer/);
  });
});

describe('PropertyPanel — picker + params card hide when fillStack is explicit', () => {
  it('computes hasExplicitStack from feature.style.fillStack', () => {
    expect(SRC).toMatch(/const hasExplicitStack = Array\.isArray\(feature\.style\.fillStack\);/);
  });

  it('gates the legacy picker + params card on !hasExplicitStack', () => {
    expect(SRC).toMatch(/\{!hasExplicitStack && \(<>/);
  });
});

describe('PropertyPanel — layer-list section', () => {
  it('renders the layer-list container only when hasExplicitStack', () => {
    expect(SRC).toMatch(
      /\{hasExplicitStack && \(\s*<div[\s\S]*?data-testid="property-panel-fill-stack"/,
    );
  });

  it('renders one row per resolved layer with per-row testids', () => {
    expect(SRC).toMatch(/data-testid=\{`property-panel-fill-stack-row-\$\{idx\}`\}/);
  });

  it('renders an eye toggle per layer wired to setLayerVisibility', () => {
    expect(SRC).toMatch(/data-testid=\{`property-panel-fill-stack-eye-\$\{idx\}`\}/);
    expect(SRC).toMatch(/onClick=\{\(\) => setLayerVisibility\(idx, !layer\.visible\)\}/);
  });

  it('renders a pattern dropdown per layer wired to setLayerPattern', () => {
    expect(SRC).toMatch(/data-testid=\{`property-panel-fill-stack-pattern-\$\{idx\}`\}/);
    expect(SRC).toMatch(/onChange=\{\(e\) => setLayerPattern\(idx, e\.target\.value as FillPattern\)\}/);
  });

  it('renders a color input per layer wired to setLayerColor', () => {
    expect(SRC).toMatch(/data-testid=\{`property-panel-fill-stack-color-\$\{idx\}`\}/);
    expect(SRC).toMatch(/onChange=\{\(e\) => setLayerColor\(idx, e\.target\.value\)\}/);
  });

  it('renders a delete button per layer wired to deleteLayer', () => {
    expect(SRC).toMatch(/data-testid=\{`property-panel-fill-stack-delete-\$\{idx\}`\}/);
    expect(SRC).toMatch(/onClick=\{\(\) => deleteLayer\(idx\)\}/);
  });

  it('renders the "+ Add layer" button at the bottom of the list wired to addLayer', () => {
    expect(SRC).toMatch(
      /data-testid="property-panel-fill-stack-add"[\s\S]*?onClick=\{addLayer\}/,
    );
  });
});

describe('PropertyPanel — "+ Add layer (stack another pattern)" CTA in single-pattern mode', () => {
  it('renders the start-stack CTA when there is already a non-NONE pattern', () => {
    expect(SRC).toMatch(
      /currentPattern !== 'NONE' && currentPattern !== 'SOLID' && \(\s*<button[\s\S]*?data-testid="property-panel-fill-stack-start"[\s\S]*?onClick=\{addLayer\}/,
    );
  });
});

describe('PropertyPanel — deleteLayer auto un-stacks at length === 1', () => {
  it('copies the sole remaining layer back into legacy fields and clears fillStack', () => {
    expect(SRC).toMatch(/if \(next\.length === 1\)/);
    expect(SRC).toMatch(/fillStack: undefined,\s*fillPattern: sole\.pattern,\s*patternColor: sole\.color,/);
  });
});

describe('PropertyPanel — addLayer migrates legacy → fillStack on first add', () => {
  it('projects the legacy fields via legacyStyleToFillLayer when there is no explicit stack', () => {
    expect(SRC).toMatch(
      /const addLayer = \(\) => \{[\s\S]*?legacyStyleToFillLayer\(feature\.style\)/,
    );
  });

  it('appends a NONE-placeholder layer after the projected layer', () => {
    expect(SRC).toMatch(/normalizeFillLayer\(\{ pattern: 'NONE', color: '#000000' \}\)/);
  });
});
