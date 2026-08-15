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
  // C28 moved the list out of this file and into `lib/cad/calculators/registry.ts`, because the
  // picker offered 2 of the 13 calculation surfaces C27 measured. `REGISTERED_CALCULATORS` is still
  // exported (derived from the registry's INLINE entries) so existing callers keep working; these
  // three assertions follow the list to its new home rather than pinning it to the old shape.
  // `calculator-registry.test.ts` covers the registry itself.
  it('still exports REGISTERED_CALCULATORS, derived from the registry', () => {
    expect(PICKER_SRC).toMatch(/export const REGISTERED_CALCULATORS/);
    expect(PICKER_SRC).toMatch(/CALCULATOR_REGISTRY\.filter\(\(c\) => c\.mode === 'INLINE'\)/);
  });

  it('reads activeCalculatorId from the store + writes via setActiveCalculator', () => {
    expect(PICKER_SRC).toMatch(/useCalculatorStore\(\(s\) => s\.activeCalculatorId\)/);
    expect(PICKER_SRC).toMatch(/setActiveCalculator\(id as CalculatorId\)/);
  });

  it('renders a select whose options come from the registry', () => {
    expect(PICKER_SRC).toContain('data-testid="calculator-picker"');
    expect(PICKER_SRC).toMatch(/groupedCalculators\(\)\.map/);
    expect(PICKER_SRC).toMatch(/<option/);
  });
});

describe('CalculatorModal', () => {
  it('composes ResizableModal + CalculatorPicker in the header + the active calculator body', () => {
    expect(MODAL_SRC).toMatch(/import ResizableModal from '\.\/ResizableModal';/);
    expect(MODAL_SRC).toMatch(/import CalculatorPicker from '\.\/CalculatorPicker';/);
    expect(MODAL_SRC).toMatch(/import GenericCalculator from '\.\/GenericCalculator';/);
    // C28 — the picker now takes `onLaunchDialog` so the hub closes when it launches a dialog
    // entry, instead of sitting on top of the thing it just opened.
    expect(MODAL_SRC).toMatch(/headerActions=\{<CalculatorPicker onLaunchDialog=\{onClose\} \/>\}/);
  });

  it('reads activeCalculatorId from the store to decide which body to render', () => {
    expect(MODAL_SRC).toMatch(/const activeId = useCalculatorStore\(\(s\) => s\.activeCalculatorId\);/);
  });

  it('renders GenericCalculator when active', () => {
    expect(MODAL_SRC).toMatch(/\{activeId === 'generic' && <GenericCalculator \/>\}/);
  });

  it('renders CurveCalculatorBody when activeId === "curve" (Slice 6 migration)', () => {
    expect(MODAL_SRC).toMatch(/import CurveCalculatorBody from '\.\/CurveCalculatorBody';/);
    expect(MODAL_SRC).toMatch(/\{activeId === 'curve' && <CurveCalculatorBody \/>\}/);
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

  it('adds a menu entry that fires onOpenCalculator', () => {
    // C28 renamed it: "Calculator…" reads like a pocket calculator, which is exactly why nobody
    // looked there for Calc Point. Same action, same shortcut, a name that says what it holds.
    expect(MENUBAR_SRC).toMatch(/label: 'Calculations…  \(all calculators\)',[\s\S]{0,200}?action: \(\) => \{ onOpenCalculator\?\.\(\); setOpenMenu\(null\); \}/);
  });

  it('keeps the legacy "Curve Calculator…" entry untouched (no breakage)', () => {
    expect(MENUBAR_SRC).toMatch(/label: 'Curve Calculator…'/);
  });
});
