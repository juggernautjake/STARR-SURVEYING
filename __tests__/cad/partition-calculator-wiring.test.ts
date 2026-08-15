// C29 — the partition calculator's wiring.
//
// The solver is covered in `partition.test.ts`. This is the surface: reachable, reading the live
// selection, writing the cut line back as geometry, and — the part that makes the whole calculation
// worth trusting — labelling that line with the area it ACHIEVED rather than the one that was asked
// for.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { calculatorById, groupedCalculators } from '@/lib/cad/calculators/registry';

const src = readFileSync(
  join(process.cwd(), 'app/admin/cad/components/PartitionCalculator.tsx'), 'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('reachable', () => {
  it('is registered, draws, and reads the selection', () => {
    const e = calculatorById('partition')!;
    expect(e.mode).toBe('INLINE');
    expect(e.usesSelection).toBe(true);
    expect(e.writesGeometry).toBe(true);
    expect(e.group).toBe('AREA');
  });

  it('fills the AREA group, which was declared and empty', () => {
    // The empty-category shape C21 fixed for symbols: a heading the picker draws with nothing
    // under it reads as "this drawing has none" rather than "this product has none".
    const area = groupedCalculators().find((g) => g.group === 'AREA');
    expect(area).toBeDefined();
    expect(area!.entries.map((e) => e.id)).toEqual(['partition']);
  });

  it('the modal can render it, and the store accepts its id', () => {
    const modal = readFileSync(
      join(process.cwd(), 'app/admin/cad/components/CalculatorModal.tsx'), 'utf8',
    );
    expect(modal).toMatch(/activeId === 'partition' && <PartitionCalculator \/>/);
    const store = readFileSync(join(process.cwd(), 'lib/cad/store/calculator-store.ts'), 'utf8');
    expect(store).toMatch(/'partition'/);
  });
});

describe('input', () => {
  it('reads the live selection on both signals', () => {
    expect(src).toMatch(/useSelectionStore\(\(s\) => s\.selectedIds\)/);
    expect(src).toMatch(/useDrawingStore\(\(s\) => s\.document\.features\)/);
  });

  it('accepts a closed polyline as a parcel, not only a POLYGON', () => {
    // Plenty of imported linework never gets typed as POLYGON, and refusing it would make the
    // calculator useless on exactly the drawings that arrive from somewhere else.
    expect(src).toMatch(/g\.type === 'POLYGON'/);
    expect(src).toMatch(/g\.type === 'POLYLINE'/);
    expect(src).toMatch(/Math\.hypot\(a\.x - b\.x, a\.y - b\.y\) < 1e-6/);
  });

  it('drops the duplicated closing vertex', () => {
    // A ring whose first and last vertex coincide would contribute a zero-length edge to the
    // shoelace and to every clip.
    expect(src).toMatch(/g\.vertices\.slice\(0, -1\)/);
  });

  it('takes acres or square feet', () => {
    // "One acre off the north end" is how the request arrives; making the surveyor convert to
    // 43,560 first is the transcription error this is meant to remove.
    expect(src).toMatch(/SQFT_PER_ACRE = 43560/);
    expect(src).toMatch(/unit === 'ACRES' \? n \* SQFT_PER_ACRE : n/);
  });
});

describe('it reports the miss', () => {
  it('shows the achieved area AND the difference', () => {
    // A partition that reports the target back is useless for the one thing it exists for.
    expect(src).toMatch(/result\.achievedArea\.toFixed/);
    expect(src).toMatch(/result\.error\.toFixed/);
  });

  it('and the remainder, which is the other half of the deed', () => {
    expect(src).toMatch(/totalSqft - result\.achievedArea/);
  });

  it('stamps the ACHIEVED area on the placed line, not the requested one', () => {
    // A cut line labelled with the number that was asked for is precisely the failure this
    // calculation exists to avoid.
    expect(src).toMatch(/calcAreaSqft: Math\.round\(result\.achievedArea \* 1000\)/);
    expect(src).not.toMatch(/calcAreaSqft:[^\n]*target/);
  });
});

describe('output', () => {
  it('places the cut as a LINE on the active layer, undoably', () => {
    // A partition whose answer is a number still leaves the surveyor to draw the line, and drawing
    // it by eye loses exactly the precision the calculation just produced.
    expect(src).toMatch(/type: 'LINE'/);
    expect(src).toMatch(/activeLayerId/);
    expect(src).toMatch(/pushUndo\(makeAddFeatureEntry\(feature\)\)/);
  });

  it('names what is missing rather than dimming the button silently', () => {
    // The C16 rule, and here there are three different reasons it can be blocked.
    expect(src).toMatch(/data-testid="partition-blocked"/);
    expect(src).toMatch(/Select a closed parcel/);
    expect(src).toMatch(/Select a point for the cut to pass through/);
    expect(src).toMatch(/smaller than the parcel/);
  });

  it('says which side is kept', () => {
    // "The kept piece is to its left" — without it, a surveyor gets the complement of what they
    // wanted and every number still looks right.
    expect(src).toMatch(/the kept piece is to its left/i);
  });
});
