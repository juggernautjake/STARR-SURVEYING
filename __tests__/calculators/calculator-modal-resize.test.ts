// __tests__/calculators/calculator-modal-resize.test.ts
//
// cad-trv-fidelity Slice 14b — the calculator modal is expandable and
// every calculator scales proportionally via a transform-scaled body
// wrapper. Source-locked (the behavior is pointer-capture + transform
// math that's impractical to drive in jsdom).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'app', 'admin', 'components', 'calculator', 'CalculatorModal.tsx'),
  'utf8',
);

describe('CalculatorModal — expandable + proportional scaling', () => {
  it('tracks a scale factor with min/max bounds', () => {
    expect(SRC).toMatch(/const \[scale, setScale\] = useState/);
    expect(SRC).toMatch(/MIN_SCALE = 1/);
    expect(SRC).toMatch(/MAX_SCALE = 3/);
  });
  it('renders a resize handle that drives the scale', () => {
    expect(SRC).toMatch(/data-testid="calc-modal-resize"/);
    expect(SRC).toMatch(/onResizeDown|onResizeMove|onResizeUp/);
  });
  it('scales the body content via a transform-scaled wrapper at base size', () => {
    expect(SRC).toMatch(/calc-modal__scaler/);
    expect(SRC).toMatch(/transform: `scale\(\$\{scale\}\)`/);
    // The scaler is sized at the model's BASE width/height (proportions
    // preserved by the transform).
    expect(SRC).toMatch(/style=\{\{ width, height, transform: `scale/);
  });
  it('sizes the frame + body to the scaled dimensions', () => {
    expect(SRC).toMatch(/const scaledWidth = Math\.round\(width \* scale\)/);
    expect(SRC).toMatch(/const scaledHeight = Math\.round\(height \* scale\)/);
  });
  it('persists the scale across opens', () => {
    expect(SRC).toMatch(/writeScale\(storageKey/);
    expect(SRC).toMatch(/setScale\(readScale\(storageKey\)\)/);
  });
});
