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
// C29 — compound / reverse / spiral, the three solvers C27 found unreachable.
import AdvancedCurveCalculator from './AdvancedCurveCalculator';
// C29 — station-offset + radial stakeout, and the first surface built to read the live selection.
import StakeoutCalculator from './StakeoutCalculator';
// C29 — cut a parcel to a target area, which C27 called the classic reason to open a calculator.
import PartitionCalculator from './PartitionCalculator';
// C29 — slope, grade and vertical curves.
import GradeCalculator from './GradeCalculator';
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
      // C28 — picking a calculation that lives in its own dialog closes this one, so the hub is
      // not sitting on top of the thing it just opened.
      headerActions={<CalculatorPicker onLaunchDialog={onClose} />}
    >
      {/* Active-calculator switch. Adding a new calculator =
          new picker entry + new branch here. */}
      {activeId === 'generic' && <GenericCalculator />}
      {activeId === 'curve' && <CurveCalculatorBody />}
      {activeId === 'advanced-curve' && <AdvancedCurveCalculator />}
      {activeId === 'stakeout' && <StakeoutCalculator />}
      {activeId === 'partition' && <PartitionCalculator />}
      {activeId === 'grade' && <GradeCalculator />}
    </ResizableModal>
  );
}
