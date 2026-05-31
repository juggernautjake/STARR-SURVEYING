'use client';
// app/admin/cad/components/CalculatorPicker.tsx
//
// cad-calculator-suite Slice 4 — small dropdown that switches the
// active calculator. Lives in the ResizableModal's header-actions
// slot. Reads + writes `useCalculatorStore.activeCalculatorId` so
// the choice persists across modal open/close + page reloads (per
// Slice 1).

import { useCalculatorStore, type CalculatorId } from '@/lib/cad/store';

interface RegisteredCalculator {
  id: CalculatorId;
  label: string;
}

/** Registered calculators surfaced in the picker. Adding a new
 *  calculator = a new entry here + the matching component in the
 *  CalculatorModal switch. */
export const REGISTERED_CALCULATORS: ReadonlyArray<RegisteredCalculator> = [
  { id: 'generic', label: 'Generic' },
  { id: 'curve',   label: 'Curve' },
];

export default function CalculatorPicker() {
  const activeId = useCalculatorStore((s) => s.activeCalculatorId);
  const setActiveCalculator = useCalculatorStore((s) => s.setActiveCalculator);
  return (
    <select
      data-testid="calculator-picker"
      value={activeId}
      onChange={(e) => setActiveCalculator(e.target.value as CalculatorId)}
      className="text-xs bg-gray-800 border border-gray-700 text-gray-100 rounded px-2 py-1 focus:outline-none focus:border-blue-500"
    >
      {REGISTERED_CALCULATORS.map((c) => (
        <option key={c.id} value={c.id}>{c.label}</option>
      ))}
    </select>
  );
}
