// app/admin/components/calculator/CalculatorFab.tsx
//
// Floating action button for the approved-exam-calculator modal.
// Mounted in the FAB row alongside Fieldbook / Discussion / Messenger
// so it's reachable from every admin page (including learn surfaces).
//
// Uses the same wrap+tooltip+button pattern the other FABs use; the
// shared CSS in AdminLayout.css picks up the matching class prefixes
// once we extend the selectors there.

'use client';

import { useCalculator } from './CalculatorProvider';

export default function CalculatorFab() {
  const { openCalculator } = useCalculator();
  return (
    <div className="calculator-fab-wrap">
      <span className="calculator-fab-tooltip">Calculator</span>
      <button
        type="button"
        className="calculator-fab"
        onClick={() => openCalculator()}
        aria-label="Open exam calculator"
        title="Calculator"
      >
        🧮
      </button>
    </div>
  );
}
