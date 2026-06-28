// __tests__/cad/image-property-panel.test.ts
//
// Source-lock: the selection PropertyPanel (right sidebar) must expose numeric
// Width / Height / Rotation / Mirror controls for an IMAGE, so the image can be
// edited even when zoomed in so far that the on-canvas grips + rotate handle are
// off-screen. Opacity lives in the shared Style section above. Rotation edits go
// through setImageRotationAroundCenter so the image stays put.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(
  path.join(repoRoot, 'app/admin/cad/components/PropertyPanel.tsx'),
  'utf8',
);

/** The IMAGE geometry block in the panel. */
function imageBlock(): string {
  const start = SRC.indexOf("geom.type === 'IMAGE' && geom.image");
  expect(start).toBeGreaterThan(-1);
  return SRC.slice(start, start + 4200);
}

describe('PropertyPanel — IMAGE numeric controls', () => {
  it('renders a dedicated IMAGE geometry section', () => {
    expect(SRC).toMatch(/geom\.type === 'IMAGE' && geom\.image/);
  });

  it('has editable Width and Height fields', () => {
    const block = imageBlock();
    expect(block).toMatch(/label=\{`Width \(\$\{unit\}\)`\}/);
    expect(block).toMatch(/label=\{`Height \(\$\{unit\}\)`\}/);
    expect(block).toMatch(/'Edit image width'/);
    expect(block).toMatch(/'Edit image height'/);
  });

  it('has a lock-aspect toggle that scales the other dimension', () => {
    const block = imageBlock();
    expect(block).toMatch(/imageLockAspect/);
    expect(block).toMatch(/im\.height \* \(w \/ im\.width\)/);
    expect(block).toMatch(/im\.width \* \(h \/ im\.height\)/);
  });

  it('has an editable Rotation field that rotates about the center', () => {
    const block = imageBlock();
    expect(block).toMatch(/label="Rotation \(°\)"/);
    expect(block).toMatch(/setImageRotationAroundCenter\(im, \(v \* Math\.PI\) \/ 180\)/);
    expect(block).toMatch(/'Edit image rotation'/);
  });

  it('has Mirror X / Mirror Y toggles', () => {
    const block = imageBlock();
    expect(block).toMatch(/Mirror X/);
    expect(block).toMatch(/Mirror Y/);
    expect(block).toMatch(/mirrorX: e\.target\.checked/);
    expect(block).toMatch(/mirrorY: e\.target\.checked/);
  });

  it('opacity readout is robust when style.opacity is undefined', () => {
    expect(SRC).toMatch(/single\.style\.opacity \?\? 1/);
  });
});
