// C29 — the stakeout calculator, and C28's second clause starting to close.
//
// The maths is covered in `stakeout.test.ts`. This is the wiring: that the surface is reachable,
// renders, and — the part that makes it worth building — reads the LIVE selection rather than
// asking for coordinates that are already on screen.
//
// C27 measured one of thirteen calculation surfaces doing that. Stakeout is the case where it
// matters most: typing twenty northings and eastings to stake twenty points is a worse workflow
// than the paper one it replaces.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { calculatorById, CALCULATOR_REGISTRY } from '@/lib/cad/calculators/registry';

const src = readFileSync(
  join(process.cwd(), 'app/admin/cad/components/StakeoutCalculator.tsx'), 'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('reachable', () => {
  it('is registered as an inline calculator that uses the selection', () => {
    const entry = calculatorById('stakeout')!;
    expect(entry.mode).toBe('INLINE');
    expect(entry.usesSelection).toBe(true);
    expect(entry.group).toBe('POINTS');
  });

  it('the modal can render it', () => {
    // An entry the picker offers and the modal cannot render is a blank panel.
    const modal = readFileSync(
      join(process.cwd(), 'app/admin/cad/components/CalculatorModal.tsx'), 'utf8',
    );
    expect(modal).toMatch(/activeId === 'stakeout' && <StakeoutCalculator \/>/);
  });

  it('its id is a CalculatorId the store accepts', () => {
    const store = readFileSync(join(process.cwd(), 'lib/cad/store/calculator-store.ts'), 'utf8');
    expect(store).toMatch(/'stakeout'/);
  });
});

describe('it reads the LIVE selection', () => {
  it('subscribes to the selection rather than snapshotting it', () => {
    // `getSelectedFeatures()` alone would freeze whatever was selected when the modal opened, and
    // the surveyor would change the selection on the canvas and watch nothing happen — the silent
    // no-op C16 spent a slice removing.
    expect(src).toMatch(/useSelectionStore\(\(s\) => s\.selectedIds\)/);
    expect(src).toMatch(/getSelectedFeatures\(\)/);
  });

  it('re-solves when a selected feature is EDITED, not only re-selected', () => {
    // Moving a staked point must change its distance. The store rebuilds `document.features`
    // immutably on every write, so that reference is the signal.
    expect(src).toMatch(/useDrawingStore\(\(s\) => s\.document\.features\)/);
    expect(src).toMatch(/\[selectedIds, featuresRef\]/);
  });
});

describe('it says what it needs, in the surveyor’s terms', () => {
  it('names the shortfall instead of showing an empty table', () => {
    // An empty table makes them wonder whether the calculation failed or their selection was
    // wrong. The C16 rule.
    expect(src).toMatch(/data-testid="stakeout-blocked"/);
    expect(src).toMatch(/Currently \$\{alignments\.length\}/);
    expect(src).toMatch(/Currently \$\{points\.length\}/);
  });

  it('states the radial selection ORDER rather than inferring it silently', () => {
    // First is setup, second is backsight, rest are targets. A surveyor who does not know that
    // gets a plausible list of wrong numbers.
    expect(src).toMatch(/the first is the setup, the second the backsight/i);
  });

  it('labels points by their number, not by an internal id', () => {
    // A stakeout list of `f8a92c…` is not one a crew can call over the radio.
    expect(src).toMatch(/p\.pointName \?\? p\.pointNo \?\? p\.name \?\? p\.description/);
  });
});

describe('the readout matches how the number is used', () => {
  it('shows the offset as a magnitude beside its side', () => {
    // "12.000 LEFT" is how it is called out; the signed value stays in the model where the maths
    // needs it.
    expect(src).toMatch(/Math\.abs\(r\.so!\.offset\)/);
    expect(src).toMatch(/\{r\.so!\.side\}/);
  });

  it('shows angle right, which is what gets dialled in', () => {
    expect(src).toMatch(/s\.angleRight\.toFixed/);
    expect(src).toMatch(/formatBearing\(s\.azimuth\)/);
  });

  it('accepts a line, polyline or polygon as the alignment', () => {
    // A boundary traverse is a POLYGON, and stationing along one is ordinary work.
    expect(src).toMatch(/'POLYLINE' \|\| g\.type === 'POLYGON'/);
    expect(src).toMatch(/g\.type === 'LINE'/);
  });
});

describe('the selection-as-input gap is measured, not assumed closed', () => {
  it('more than one surface now reads it, and the flag records which', () => {
    const withSelection = CALCULATOR_REGISTRY.filter((c) => c.usesSelection).map((c) => c.id);
    expect(withSelection).toEqual(expect.arrayContaining(['calc-point', 'stakeout']));
  });

  it('and most still do not — C27 measured 1 of 13', () => {
    // Deliberately asserted. The registry exists partly so this number is visible rather than
    // remembered, and a slice that quietly claimed the gap was closed would pass every other test
    // in this file.
    const without = CALCULATOR_REGISTRY.filter((c) => !c.usesSelection);
    expect(without.length).toBeGreaterThan(withSelectionCount());
  });
});

function withSelectionCount(): number {
  return CALCULATOR_REGISTRY.filter((c) => c.usesSelection).length;
}
