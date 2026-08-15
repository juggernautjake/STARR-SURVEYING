// C29 — the grade / vertical-curve surface.
//
// The maths is covered in `grade.test.ts`. This is the wiring, and one decision worth pinning: the
// two halves of this calculator take their input from **different places on purpose**.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { calculatorById, groupedCalculators } from '@/lib/cad/calculators/registry';

const src = readFileSync(
  join(process.cwd(), 'app/admin/cad/components/GradeCalculator.tsx'), 'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('reachable', () => {
  it('is registered under its own group', () => {
    const e = calculatorById('grade')!;
    expect(e.mode).toBe('INLINE');
    expect(e.usesSelection).toBe(true);
    expect(e.group).toBe('PROFILE');
  });

  it('PROFILE is a separate group from CURVES', () => {
    // A vertical curve is not a horizontal one. Filing them together would put two different
    // meanings of "curve" under one heading, which is the kind of thing that makes a surveyor open
    // the wrong calculator and get a plausible answer.
    const groups = groupedCalculators().map((g) => g.group);
    expect(groups).toContain('PROFILE');
    expect(groups.indexOf('PROFILE')).not.toBe(groups.indexOf('CURVES'));
  });

  it('the modal renders it and the store accepts its id', () => {
    const modal = readFileSync(
      join(process.cwd(), 'app/admin/cad/components/CalculatorModal.tsx'), 'utf8',
    );
    expect(modal).toMatch(/activeId === 'grade' && <GradeCalculator \/>/);
    const store = readFileSync(join(process.cwd(), 'lib/cad/store/calculator-store.ts'), 'utf8');
    expect(store).toMatch(/'grade'/);
  });
});

describe('the grade half reads the drawing', () => {
  it('takes its two shots from the live selection', () => {
    expect(src).toMatch(/useSelectionStore\(\(s\) => s\.selectedIds\)/);
    expect(src).toMatch(/useDrawingStore\(\(s\) => s\.document\.features\)/);
  });

  it('refuses a point with no elevation instead of assuming zero', () => {
    // The failure that matters here: reporting a grade against an assumed 0 is a confident lie,
    // and a point without an elevation is invisible in a selection count.
    expect(src).toMatch(/if \(!Number\.isFinite\(elev\)\) return null/);
    expect(src).toMatch(/usable/);
  });

  it('accepts elevation stored as a string', () => {
    // Imported point files routinely carry it that way, and refusing them would make the
    // calculator useless on exactly the drawings that came from somewhere else.
    expect(src).toMatch(/typeof raw === 'string' \? Number\(raw\)/);
  });
});

describe('the vertical-curve half types its input, on purpose', () => {
  it('says why', () => {
    // Not a gap in C28's selection-as-input clause. A PVI station and two design grades are not
    // things the drawing holds — they are what the road is being designed TO — and pretending to
    // read them from a selection would be worse than asking.
    expect(src).toMatch(/not things the drawing holds/i);
  });
});

describe('the readout does not mislead', () => {
  it('shows the grade as a percentage first', () => {
    // Percent, ratio and angle are all in the readout, but percent leads because it is the unit
    // every other number in this module is in — 2% and 0.02 both read as "a gentle grade".
    expect(src).toMatch(/gradePercent\.toFixed\(4\)\}\s*%/);
    expect(src).toMatch(/1 in \$\{grade\.g\.ratio\.toFixed/);
  });

  it('shows run AND slope distance', () => {
    // Run is what a plan shows, slope distance is what a tape measures; confusing them is a real
    // field error on steep ground.
    expect(src).toMatch(/Run \(horizontal\)/);
    expect(src).toMatch(/Slope distance/);
  });

  it('says "level" rather than an empty ratio', () => {
    expect(src).toMatch(/ratio === null \? 'level'/);
  });

  it('says in words when a curve has no turning point', () => {
    // Two grades of the same sign never turn over. An empty cell reads like the calculation
    // failed, which is a different problem the surveyor would go looking for.
    expect(src).toMatch(/none — the grades do not reverse/);
  });

  it('labels the turning point by the shape of the curve', () => {
    // "High point" on a sag would be wrong in the one word a reader actually scans for.
    expect(src).toMatch(/shape === 'SAG' \? 'Low point' : 'High point'/);
  });

  it('names the shortfall rather than dimming silently', () => {
    expect(src).toMatch(/data-testid="grade-blocked"/);
    expect(src).toMatch(/data-testid="vcurve-blocked"/);
  });
});
