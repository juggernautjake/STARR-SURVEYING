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
// cad-calculator-suite Slice 6 — Curve calculator migrated into the
// suite (frameless body; the legacy ModalFrame entry stays for the
// onPlace canvas-placement flow).
import CurveCalculatorBody from './CurveCalculatorBody';
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
      {activeId === 'curve' && <CurveCalculatorBody />}
    </ResizableModal>
  );
}
