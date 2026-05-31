'use client';
// app/admin/cad/components/CalculatorModal.tsx
//
// cad-calculator-suite Slice 4 — composes the ResizableModal shell
// (Slice 3) + CalculatorPicker (this slice) + the active
// calculator body. Reads `useCalculatorStore.activeCalculatorId`
// and renders the matching calculator. Each calculator's state
// lives in the store so unmounting/remounting on switch keeps the
// working tape intact.

import ResizableModal from './ResizableModal';
import CalculatorPicker from './CalculatorPicker';
import GenericCalculator from './GenericCalculator';
import { useCalculatorStore } from '@/lib/cad/store';

interface CalculatorModalProps {
  open: boolean;
  onClose: () => void;
}

/** Natural (= min) modal size. Generic + Curve fit comfortably in
 *  this 360×460 baseline; the resize handle lets the surveyor pull
 *  larger for big-screen typing. */
const NATURAL_SIZE = { width: 360, height: 460 };

export default function CalculatorModal({ open, onClose }: CalculatorModalProps) {
  const activeId = useCalculatorStore((s) => s.activeCalculatorId);

  return (
    <ResizableModal
      open={open}
      onClose={onClose}
      naturalSize={NATURAL_SIZE}
      title="Calculator"
      headerActions={<CalculatorPicker />}
    >
      {/* Active-calculator switch. Adding a new calculator =
          new picker entry + new branch here. */}
      {activeId === 'generic' && <GenericCalculator />}
      {activeId === 'curve' && (
        <div
          data-testid="calculator-modal-curve-placeholder"
          className="flex flex-col items-center justify-center h-full p-6 text-center text-xs text-gray-400"
        >
          <p className="mb-2">
            The Curve Calculator is currently reachable via the
            <strong className="text-gray-200"> Tools → Curve Calculator… </strong>
            menu entry.
          </p>
          <p>
            Migration into this suite is queued for cad-calculator-suite
            Slice 6 so the full calculator picker + resizable modal
            experience covers it too.
          </p>
        </div>
      )}
    </ResizableModal>
  );
}
