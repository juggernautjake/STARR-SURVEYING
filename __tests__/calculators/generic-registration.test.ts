// __tests__/calculators/generic-registration.test.ts
//
// cad-trv-fidelity Slice 14 — the Generic Calculator is registered as
// the DEFAULT model, listed first, and wired into renderModel.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'app', 'admin', 'components', 'calculator', 'CalculatorProvider.tsx'),
  'utf8',
);

describe('Generic Calculator registration', () => {
  it('declares the "generic" model key', () => {
    expect(SRC).toMatch(/\|\s*'generic'/);
  });
  it('is the default model', () => {
    expect(SRC).toMatch(/DEFAULT_MODEL: ModelKey = 'generic'/);
  });
  it('is listed first in CALCULATOR_MODELS with the "Generic Calculator" label', () => {
    const list = SRC.slice(SRC.indexOf('CALCULATOR_MODELS'));
    const genericIdx = list.indexOf("key: 'generic'");
    const firstOther = list.indexOf("key: 'ti-36x-pro'");
    expect(genericIdx).toBeGreaterThan(-1);
    expect(genericIdx).toBeLessThan(firstOther);
    expect(SRC).toMatch(/label: 'Generic Calculator'/);
  });
  it('renderModel returns <GenericCalculator /> for the generic key', () => {
    expect(SRC).toMatch(/if \(model\.key === 'generic'\) return <GenericCalculator \/>;/);
    expect(SRC).toMatch(/import \{ GenericCalculator \} from '\.\/models\/GenericCalculator';/);
  });
});
