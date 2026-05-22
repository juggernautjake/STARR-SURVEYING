// app/admin/components/calculator/models/Ti36xPro.tsx
//
// TI-36X Pro visual shell. C-6 of EXAM_CALCULATORS.md.
//
// Renders the keypad + multi-line MathPrint display in their device-
// accurate colors. No engine wiring yet — that lands in C-7. The
// display shows a static demo string so the layout review can read
// realistic content during V-2.

'use client';

import { Keypad } from '../Keypad';
import { Display } from '../Display';
import { TI_36X_PRO_KEYPAD, TI_36X_PRO_GRID } from '@/lib/calculators/models/ti-36x-pro/keypad-data';

export function Ti36xPro() {
  return (
    <div className="calc-model calc-model--ti-36x-pro">
      <Display
        entry=" "
        result="0"
        statusBadges={['DEG', 'NORM']}
      />
      <Keypad
        keys={TI_36X_PRO_KEYPAD}
        rows={TI_36X_PRO_GRID.rows}
        cols={TI_36X_PRO_GRID.cols}
      />
    </div>
  );
}
