// __tests__/cad/ui/scale-factor-bounds.test.ts
//
// cad-ux-cleanup-pass Slice 13 — the QuickScaleInput hard-clamped the
// scale factor at min=0.01 / step=0.1, so plat-style downscales like
// 1:1000 were silently impossible to type and the OFFSET tool's
// Scale-mode input fought the surveyor with a too-coarse step. Widen
// both inputs to the 1e-4 … 1e4 range and free-type via step="any";
// share a single `isValidScaleFactor` predicate so the bounds stay
// in sync.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'ToolOptionsBar.tsx'),
  'utf8',
);

describe('scale-factor bounds — shared constants', () => {
  it('SCALE_FACTOR_MIN / MAX are 0.0001 / 10000', () => {
    expect(SRC).toMatch(/const SCALE_FACTOR_MIN = 0\.0001;/);
    expect(SRC).toMatch(/const SCALE_FACTOR_MAX = 10000;/);
  });

  it('isValidScaleFactor rejects non-finite + out-of-range values', () => {
    expect(SRC).toMatch(
      /function isValidScaleFactor\(v: number\): boolean \{\s*\n\s*return Number\.isFinite\(v\) && v >= SCALE_FACTOR_MIN && v <= SCALE_FACTOR_MAX;\s*\n\s*\}/,
    );
  });
});

describe('QuickScaleInput — Scale tool input widened', () => {
  it('the native input lets the user type any value within [min, max]', () => {
    expect(SRC).toMatch(
      /<input\s+type="number"\s+min=\{SCALE_FACTOR_MIN\}\s+max=\{SCALE_FACTOR_MAX\}\s+step="any"/,
    );
  });

  it('commit() runs the shared predicate before scaling', () => {
    expect(SRC).toMatch(
      /function commit\(\) \{\s*\n\s*const v = parseFloat\(factor\);\s*\n\s*if \(isValidScaleFactor\(v\)\) apply\(v\);\s*\n\s*\}/,
    );
  });
});

describe('OFFSET tool — Scale-mode factor input widened', () => {
  it('shares the same bounds + predicate as QuickScaleInput', () => {
    expect(SRC).toMatch(
      /<input\s+type="number"\s+min=\{SCALE_FACTOR_MIN\}\s+max=\{SCALE_FACTOR_MAX\}\s+step="any"[\s\S]*?value=\{ts\.offsetScaleFactor\}/,
    );
    expect(SRC).toMatch(
      /if \(isValidScaleFactor\(v\)\) toolStore\.setOffsetScaleFactor\(v\)/,
    );
  });
});
