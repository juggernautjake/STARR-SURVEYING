// __tests__/cad/ui/calculator-modal.test.ts
//
// cad-calculator-suite Slice 4 — picker + modal composition +
// MenuBar wiring. Source-text locks because the modal needs a
// populated zustand store + the ResizableModal's pointer-event
// scaffolding to mount under jsdom — overkill for a contract that
// lives in a few dozen lines of JSX.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const PICKER_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'CalculatorPicker.tsx'),
  'utf8',
);
const MODAL_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'CalculatorModal.tsx'),
  'utf8',
);
const LAYOUT_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'CADLayout.tsx'),
  'utf8',
);
const MENUBAR_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'MenuBar.tsx'),
  'utf8',
);

describe('CalculatorPicker', () => {
  it('exports REGISTERED_CALCULATORS with generic + curve entries', () => {
    expect(PICKER_SRC).toMatch(/export const REGISTERED_CALCULATORS/);
    expect(PICKER_SRC).toMatch(/id: 'generic'/);
    expect(PICKER_SRC).toMatch(/id: 'curve'/);
  });

  it('reads activeCalculatorId from the store + writes via setActiveCalculator', () => {
    expect(PICKER_SRC).toMatch(/useCalculatorStore\(\(s\) => s\.activeCalculatorId\)/);
    expect(PICKER_SRC).toMatch(/setActiveCalculator\(e\.target\.value as CalculatorId\)/);
  });

  it('renders a select with the per-calculator <option> entries', () => {
    expect(PICKER_SRC).toContain('data-testid="calculator-picker"');
    expect(PICKER_SRC).toMatch(/REGISTERED_CALCULATORS\.map\(\(c\) => \(\s*<option/);
  });
});

describe('CalculatorModal', () => {
  it('composes ResizableModal + CalculatorPicker in the header + the active calculator body', () => {
    expect(MODAL_SRC).toMatch(/import ResizableModal from '\.\/ResizableModal';/);
    expect(MODAL_SRC).toMatch(/import CalculatorPicker from '\.\/CalculatorPicker';/);
    expect(MODAL_SRC).toMatch(/import GenericCalculator from '\.\/GenericCalculator';/);
    expect(MODAL_SRC).toMatch(/headerActions=\{<CalculatorPicker \/>\}/);
  });

  it('reads activeCalculatorId from the store to decide which body to render', () => {
    expect(MODAL_SRC).toMatch(/const activeId = useCalculatorStore\(\(s\) => s\.activeCalculatorId\);/);
  });

  it('renders GenericCalculator when active', () => {
    expect(MODAL_SRC).toMatch(/\{activeId === 'generic' && <GenericCalculator \/>\}/);
  });

  it('renders a placeholder for the curve calculator (Slice 6 migration queued)', () => {
    expect(MODAL_SRC).toContain('data-testid="calculator-modal-curve-placeholder"');
    expect(MODAL_SRC).toMatch(/Slice 6/);
  });

  it('passes a sensible naturalSize to ResizableModal (360 × 460 baseline)', () => {
    expect(MODAL_SRC).toMatch(/const NATURAL_SIZE = \{ width: 360, height: 460 \};/);
  });
});

describe('CADLayout — mounts CalculatorModal', () => {
  it('imports CalculatorModal', () => {
    expect(LAYOUT_SRC).toMatch(/import CalculatorModal from '\.\/components\/CalculatorModal';/);
  });

  it('tracks open state via a new showCalculatorModal useState', () => {
    expect(LAYOUT_SRC).toMatch(/const \[showCalculatorModal, setShowCalculatorModal\] = useState\(false\);/);
  });

  it('passes onOpenCalculator to MenuBar', () => {
    expect(LAYOUT_SRC).toMatch(/onOpenCalculator=\{\(\) => setShowCalculatorModal\(true\)\}/);
  });

  it('renders <CalculatorModal open=... onClose=... />', () => {
    expect(LAYOUT_SRC).toMatch(/<CalculatorModal open=\{showCalculatorModal\} onClose=\{\(\) => setShowCalculatorModal\(false\)\} \/>/);
  });
});

describe('MenuBar — Calculator… entry', () => {
  it('declares the new onOpenCalculator prop', () => {
    expect(MENUBAR_SRC).toMatch(/onOpenCalculator\?: \(\) => void/);
  });

  it('adds a "Calculator…" menu entry that fires onOpenCalculator', () => {
    expect(MENUBAR_SRC).toMatch(/label: 'Calculator…',[\s\S]*?action: \(\) => \{ onOpenCalculator\?\.\(\); setOpenMenu\(null\); \}/);
  });

  it('keeps the legacy "Curve Calculator…" entry untouched (no breakage)', () => {
    expect(MENUBAR_SRC).toMatch(/label: 'Curve Calculator…'/);
  });
});
