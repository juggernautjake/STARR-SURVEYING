// app/admin/components/calculator/models/Hp35s.tsx
//
// HP 35s visual shell. C-15 of EXAM_CALCULATORS.md.
//
// Shows the device's signature 2-line stack display (T/Z/Y on top
// scrollable, X on bottom — for v1 we render Y and X side-by-side).
// Engine wiring lands in C-16. This slice is layout-only and shows
// placeholder stack values for the design review.

'use client';

import { Keypad } from '../Keypad';
import { Display } from '../Display';
import { HP_35S_KEYPAD, HP_35S_GRID } from '@/lib/calculators/models/hp-35s/keypad-data';

export function Hp35s() {
  return (
    <div className="calc-model calc-model--hp-35s">
      <Display
        entry="y: 0"
        result="x: 0"
        statusBadges={['DEG', 'RPN', 'ALL']}
      />
      <Keypad
        keys={HP_35S_KEYPAD}
        rows={HP_35S_GRID.rows}
        cols={HP_35S_GRID.cols}
      />
    </div>
  );
}
