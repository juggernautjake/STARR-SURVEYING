'use client';
// app/admin/cad/components/CalculatorPicker.tsx
//
// cad-calculator-suite Slice 4 — small dropdown that switches the active calculator. Lives in the
// ResizableModal's header-actions slot. Reads + writes `useCalculatorStore.activeCalculatorId` so
// the choice persists across modal open/close + page reloads (per Slice 1).
//
// C28 — it now lists EVERY calculation the product can do, not the two that happen to render
// inline. C27 measured 13 surfaces behind seven different doors, all working, all discoverable only
// by already knowing where they were — and this picker, the one thing that looks like the answer,
// offered two of them.
//
// Choosing an entry with its own dialog dispatches that dialog's open event and closes the hub.
// The dedicated dialogs are untouched: rehoming twelve working surfaces into one modal would be a
// rewrite that risks all of them to fix a discovery problem. The door was what was missing.

import {
  CALCULATOR_REGISTRY,
  calculatorById,
  groupedCalculators,
} from '@/lib/cad/calculators/registry';
import { useCalculatorStore, type CalculatorId } from '@/lib/cad/store';

/** Kept for the existing tests and any caller that only wants the inline set. */
export const REGISTERED_CALCULATORS: ReadonlyArray<{ id: CalculatorId; label: string }> =
  CALCULATOR_REGISTRY.filter((c) => c.mode === 'INLINE').map((c) => ({
    id: c.id as CalculatorId,
    label: c.label,
  }));

interface Props {
  /** Called when the surveyor picks a calculation that lives in its own dialog, so the hub can
   *  step out of the way instead of sitting on top of the thing it just opened. */
  onLaunchDialog?: () => void;
}

export default function CalculatorPicker({ onLaunchDialog }: Props = {}) {
  const activeId = useCalculatorStore((s) => s.activeCalculatorId);
  const setActiveCalculator = useCalculatorStore((s) => s.setActiveCalculator);

  function pick(id: string) {
    const entry = calculatorById(id);
    if (!entry) return;
    if (entry.mode === 'DIALOG') {
      if (entry.openEvent) window.dispatchEvent(new CustomEvent(entry.openEvent));
      onLaunchDialog?.();
      // Deliberately NOT persisted as the active calculator: it is not what this modal will show
      // next time, and leaving it selected would reopen the hub with a dialog name in the box and
      // nothing under it.
      return;
    }
    setActiveCalculator(id as CalculatorId);
  }

  return (
    <select
      data-testid="calculator-picker"
      value={activeId}
      onChange={(e) => pick(e.target.value)}
      className="text-xs bg-gray-800 border border-gray-700 text-gray-100 rounded px-2 py-1 focus:outline-none focus:border-blue-500"
      aria-label="Calculation"
    >
      {groupedCalculators().map((g) => (
        <optgroup key={g.group} label={g.label}>
          {g.entries.map((c) => (
            <option key={c.id} value={c.id} title={c.summary}>
              {/* The arrow marks "this opens somewhere else", so the one control that both switches
                  a body and launches a dialog is not silently doing two different things. */}
              {c.mode === 'DIALOG' ? `${c.label} ↗` : c.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
