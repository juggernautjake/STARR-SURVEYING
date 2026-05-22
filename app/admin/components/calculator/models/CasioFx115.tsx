// app/admin/components/calculator/models/CasioFx115.tsx
//
// Casio fx-115ES PLUS reskin. C-19 of EXAM_CALCULATORS.md.
//
// The fx-115ES PLUS and fx-991ES PLUS are virtually identical (same
// engine generation, same key sets — a couple of cosmetic placement
// differences not worth a separate layout in our emulator). We reuse
// the fx-991 keypad + engine; the only thing this component contributes
// is a distinct `model_key` so the save state is isolated per device
// (a user practicing for one model shouldn't see their state in the
// other).

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Keypad } from '../Keypad';
import { NaturalDisplay } from '../NaturalDisplay';
import { useCalculator } from '../CalculatorProvider';
import { useCalculatorKeyEvents } from '../useCalculatorKeyEvents';
import { CASIO_FX115_KEYPAD, CASIO_FX115_GRID } from '@/lib/calculators/models/casio-fx-115/keypad-data';
import { dispatch, hydrate, initialState, serialize, type CasioFx991State } from '@/lib/calculators/models/casio-fx-991/engine';
import type { KeyDef } from '@/lib/calculators/shared';

const MODEL_KEY = 'casio-fx-115' as const;

export function CasioFx115() {
  const { saveState, loadState } = useCalculator();
  const [state, setState] = useState<CasioFx991State>(initialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadState(MODEL_KEY);
      if (cancelled) return;
      if (saved) setState(hydrate(saved));
      setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, [loadState]);

  useEffect(() => {
    if (!hydrated) return;
    saveState(MODEL_KEY, serialize(state));
  }, [state, hydrated, saveState]);

  const onKey = useCallback((key: KeyDef) => {
    setState(prev => dispatch(prev, { type: 'press', keyId: key.id }));
  }, []);

  useCalculatorKeyEvents(useCallback((keyId: string) => {
    setState(prev => dispatch(prev, { type: 'press', keyId }));
  }, []));

  const copyResult = useCallback(() => {
    if (!state.result) return;
    void navigator.clipboard?.writeText(state.result);
  }, [state.result]);

  const statusBadges: string[] = [state.angleMode, state.displayMode];
  if (state.shiftActive) statusBadges.push('SHIFT');
  if (state.alphaActive) statusBadges.push('ALPHA');

  return (
    <div className="calc-model calc-model--casio-fx991">
      <NaturalDisplay
        expression={state.entry}
        result={state.result}
        statusBadges={statusBadges}
        onCopyResult={copyResult}
      />
      <Keypad
        keys={CASIO_FX115_KEYPAD}
        rows={CASIO_FX115_GRID.rows}
        cols={CASIO_FX115_GRID.cols}
        onKey={onKey}
        shiftActive={state.shiftActive}
      />
    </div>
  );
}
