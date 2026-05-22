// app/admin/components/calculator/models/CasioFx991.tsx
//
// Casio fx-991ES PLUS emulator — visual shell (C-11) + natural display
// (C-12) + algebraic engine (C-13).

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Keypad } from '../Keypad';
import { NaturalDisplay } from '../NaturalDisplay';
import { useCalculator } from '../CalculatorProvider';
import { useCalculatorKeyEvents } from '../useCalculatorKeyEvents';
import { CASIO_FX991_KEYPAD, CASIO_FX991_GRID } from '@/lib/calculators/models/casio-fx-991/keypad-data';
import { dispatch, hydrate, initialState, serialize, type CasioFx991State } from '@/lib/calculators/models/casio-fx-991/engine';
import type { KeyDef } from '@/lib/calculators/shared';

const MODEL_KEY = 'casio-fx-991' as const;

export function CasioFx991() {
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
  if (state.mode !== 'COMP') statusBadges.push(state.mode);
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
        keys={CASIO_FX991_KEYPAD}
        rows={CASIO_FX991_GRID.rows}
        cols={CASIO_FX991_GRID.cols}
        onKey={onKey}
        shiftActive={state.shiftActive}
      />
    </div>
  );
}
