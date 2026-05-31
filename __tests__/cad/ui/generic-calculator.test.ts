// __tests__/cad/ui/generic-calculator.test.ts
//
// cad-calculator-suite Slice 2 — source-text locks for the
// GenericCalculator React component. Behavior of the underlying
// engine is locked by generic-engine.test.ts; this spec locks the
// wiring + keypad shape so the component contract stays stable.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'GenericCalculator.tsx'),
  'utf8',
);

describe('GenericCalculator — store wiring', () => {
  it('subscribes to the generic state slot via useCalculatorStore', () => {
    expect(SRC).toMatch(/useCalculatorStore\(\(s\) => s\.states\.generic/);
  });

  it('persists writes via setCalculatorState("generic", next)', () => {
    expect(SRC).toMatch(/setCalculatorState\('generic', next\)/);
  });

  it('falls back to INITIAL_GENERIC_STATE on a fresh session', () => {
    expect(SRC).toMatch(/INITIAL_GENERIC_STATE/);
  });
});

describe('GenericCalculator — keypad shape', () => {
  it('renders all 10 digit keys', () => {
    for (const d of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(SRC).toContain(`data-testid={\`generic-calc-key-\${label}\`}`);
      expect(SRC).toMatch(new RegExp(`onClick=\\{\\(\\) => onDigit\\('${d}'\\)\\}`));
    }
  });

  it('renders +, −, ×, ÷ operator keys wired to onOp', () => {
    expect(SRC).toMatch(/onClick=\{\(\) => onOp\('\+'\)\}/);
    expect(SRC).toMatch(/onClick=\{\(\) => onOp\('-'\)\}/);
    expect(SRC).toMatch(/onClick=\{\(\) => onOp\('\*'\)\}/);
    expect(SRC).toMatch(/onClick=\{\(\) => onOp\('\/'\)\}/);
  });

  it('renders =, C, CE, ⌫, ±, . keys', () => {
    expect(SRC).toMatch(/label="="\s+onClick=\{onEquals\}/);
    expect(SRC).toMatch(/label="C"\s+onClick=\{onClear\}/);
    expect(SRC).toMatch(/label="CE"\s+onClick=\{onClearEntry\}/);
    expect(SRC).toMatch(/label="⌫"\s+onClick=\{onBackspace\}/);
    expect(SRC).toMatch(/label="±"\s+onClick=\{onSignFlip\}/);
    expect(SRC).toMatch(/label="\."\s+onClick=\{onDecimal\}/);
  });
});

describe('GenericCalculator — keyboard handling', () => {
  it('attaches a document-level keydown listener on mount', () => {
    expect(SRC).toMatch(/document\.addEventListener\('keydown', onKey\)/);
    expect(SRC).toMatch(/document\.removeEventListener\('keydown', onKey\)/);
  });

  it('Enter / = trigger equals; Escape / C trigger clear; Delete triggers CE', () => {
    expect(SRC).toMatch(/e\.key === 'Enter' \|\| e\.key === '='/);
    expect(SRC).toMatch(/e\.key === 'Escape' \|\| e\.key === 'c' \|\| e\.key === 'C'/);
    expect(SRC).toMatch(/e\.key === 'Delete'/);
  });

  it('skips when the focused element is an input/textarea/contentEditable', () => {
    expect(SRC).toMatch(/target\.tagName === 'INPUT' \|\| target\.tagName === 'TEXTAREA' \|\| target\.isContentEditable/);
  });
});

describe('GenericCalculator — display + tape rendering', () => {
  it('renders the live display via data-testid="generic-calc-display"', () => {
    expect(SRC).toContain('data-testid="generic-calc-display"');
    expect(SRC).toMatch(/\{state\.display\}/);
  });

  it('renders a rolling tape via data-testid="generic-calc-tape"', () => {
    expect(SRC).toContain('data-testid="generic-calc-tape"');
    expect(SRC).toMatch(/state\.tape\.slice\(-6\)/);
  });
});
