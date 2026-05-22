// app/admin/components/calculator/models/CasioFx991.tsx
//
// Casio fx-991ES PLUS visual shell. C-11 of EXAM_CALCULATORS.md.
//
// Renders the keypad + two-line natural-display container in the
// device's color palette (silver case, dark blue header bar, dark
// blue function tone with yellow SHIFT / red ALPHA labels). Engine
// wiring lands in C-13; this slice is layout-only and displays a
// static demo string.

'use client';

import { Keypad } from '../Keypad';
import { NaturalDisplay } from '../NaturalDisplay';
import { CASIO_FX991_KEYPAD, CASIO_FX991_GRID } from '@/lib/calculators/models/casio-fx-991/keypad-data';

export function CasioFx991() {
  // Demo expression so the C-12 layout review can see all three
  // natural-display patterns at once. Replaced with the live entry
  // buffer once C-13's engine wires up.
  const demoExpression = 'sqrt(3^2+4^2)+frac{1}{2}';

  return (
    <div className="calc-model calc-model--casio-fx991">
      <NaturalDisplay
        expression={demoExpression}
        result="5.5"
        statusBadges={['DEG', 'NORM']}
      />
      <Keypad
        keys={CASIO_FX991_KEYPAD}
        rows={CASIO_FX991_GRID.rows}
        cols={CASIO_FX991_GRID.cols}
      />
    </div>
  );
}
