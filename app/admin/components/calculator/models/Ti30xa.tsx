// app/admin/components/calculator/models/Ti30xa.tsx
//
// TI-30Xa emulator — reuses the TI-36X Pro algebraic engine with a
// device-accurate keypad layout for the simpler single-line TI-30Xa.
//
// The 30Xa has a single-line LCD (no MathPrint), one 2nd shift modifier,
// and the standard FS/PS-exam-relevant function set. Engine semantics
// (tokenize → shunting-yard → RPN eval) are identical to the MultiView
// and Pro, so the same engine module works. Distinct model_key keeps
// saved state isolated per device.

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Keypad } from '../Keypad';
import { Display } from '../Display';
import { HistoryStrip } from '../HistoryStrip';
import { useCalculator } from '../CalculatorProvider';
import { useCalculatorKeyEvents } from '../useCalculatorKeyEvents';
import { TI_30XA_KEYPAD, TI_30XA_GRID } from '@/lib/calculators/models/ti-30xa/keypad-data';
import { dispatch, hydrate, initialState, serialize, type Ti36xState } from '@/lib/calculators/models/ti-36x-pro/engine';
import type { KeyDef } from '@/lib/calculators/shared';

const MODEL_KEY = 'ti-30xa' as const;

export function Ti30xa() {
  const { saveState, loadState } = useCalculator();
  const [state, setState] = useState<Ti36xState>(initialState);
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
  if (state.shiftActive) statusBadges.push('2nd');

  return (
    <div className="calc-model calc-model--ti-30xa">
      <HistoryStrip rows={state.history.slice().reverse().map(h => ({ entry: h.entry, result: h.result }))} />
      <Display
        entry={state.entry}
        result={state.result}
        statusBadges={statusBadges}
        onCopyResult={copyResult}
      />
      <Keypad
        keys={TI_30XA_KEYPAD}
        rows={TI_30XA_GRID.rows}
        cols={TI_30XA_GRID.cols}
        onKey={onKey}
        shiftActive={state.shiftActive}
      />
    </div>
  );
}
