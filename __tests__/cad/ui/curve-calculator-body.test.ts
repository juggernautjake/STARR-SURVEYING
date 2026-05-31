// __tests__/cad/ui/curve-calculator-body.test.ts
//
// cad-calculator-suite Slice 6 — frameless CurveCalculatorBody
// (state persists in useCalculatorStore under 'curve' so close +
// reopen preserves every input). Source-text locks on the wiring;
// the compute kernel (computeCurve / crossValidateCurve) is
// already covered by its own unit tests.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'CurveCalculatorBody.tsx'),
  'utf8',
);

describe('CurveCalculatorBody — store-backed state', () => {
  it('declares CurveCalcState shape covering every input + result + error + validationMsg', () => {
    expect(SRC).toMatch(/export interface CurveCalcState \{/);
    for (const field of ['method', 'R', 'delta', 'L', 'C', 'T', 'E', 'M', 'direction', 'tangentIn', 'tangentOut', 'result', 'error', 'validationMsg']) {
      expect(SRC).toMatch(new RegExp(`\\b${field}\\b`));
    }
  });

  it('subscribes to the curve slot in useCalculatorStore + falls back to INITIAL_CURVE_STATE', () => {
    expect(SRC).toMatch(/useCalculatorStore\(\(s\) => \(s\.states\.curve/);
    expect(SRC).toMatch(/\?\?\s*INITIAL_CURVE_STATE/);
  });

  it('writes every patch via setCalculatorState("curve", ...)', () => {
    expect(SRC).toMatch(/setCalculatorState\('curve', \{ \.\.\.readState\(\), \.\.\.p \}\)/);
  });
});

describe('CurveCalculatorBody — compute wiring', () => {
  it('delegates to the existing computeCurve + crossValidateCurve helpers', () => {
    expect(SRC).toMatch(/import \{ computeCurve, crossValidateCurve \} from '@\/lib\/cad\/geometry\/curve';/);
    expect(SRC).toMatch(/const computed = computeCurve\(input\)/);
    expect(SRC).toMatch(/const v = crossValidateCurve\(input, computed\)/);
  });

  it('writes the result into store state via patch', () => {
    expect(SRC).toMatch(/patch\(\{ result: computed,/);
  });
});

describe('CurveCalculatorBody — UI structure', () => {
  it('renders with data-testid="curve-calculator-body" wrapping the content', () => {
    expect(SRC).toContain('data-testid="curve-calculator-body"');
  });

  it('renders a method dropdown wired to patch({ method })', () => {
    expect(SRC).toContain('data-testid="curve-calc-method"');
    expect(SRC).toMatch(/onChange=\{\(e\) => patch\(\{ method: e\.target\.value as CurveMethod \}\)\}/);
  });

  it('renders a Calculate button wired to compute()', () => {
    expect(SRC).toMatch(/data-testid="curve-calc-compute"[\s\S]*?onClick=\{compute\}/);
  });

  it('renders a result block + a Copy-to-clipboard button when result is set', () => {
    expect(SRC).toContain('data-testid="curve-calc-result"');
    expect(SRC).toMatch(/navigator\.clipboard\?\.writeText\(text\)/);
  });

  it('renders an error block when state.error is set', () => {
    expect(SRC).toContain('data-testid="curve-calc-error"');
  });
});
