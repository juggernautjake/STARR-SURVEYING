// app/admin/components/calculator/models/Ti30xsMultiView.tsx
//
// TI-30XS MultiView reskin. C-21 of EXAM_CALCULATORS.md.
//
// The TI-30XS MultiView is the simpler sibling of the TI-36X Pro — same
// MathPrint display family, same algebraic input, fewer specialty
// functions (no matrix/vector menus, narrower stat support). For the
// emulator's purposes, the keypads are 95% identical and the engine
// is the same. We reuse the TI-36X Pro keypad + engine; only the
// `model_key='ti-30xs-multiview'` differs so state is per-device.
//
// Plan called for a "TI-30X IIS" layout as a separate sibling — for v1
// that's deferred (the IIS uses a fixed-function set that's a strict
// subset of the MultiView; a user practicing for the IIS can use this
// emulator without functional loss).

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Keypad } from '../Keypad';
import { Display } from '../Display';
import { HistoryStrip } from '../HistoryStrip';
import { useCalculator } from '../CalculatorProvider';
import { useCalculatorKeyEvents } from '../useCalculatorKeyEvents';
import { TI_30XS_MULTIVIEW_KEYPAD, TI_30XS_MULTIVIEW_GRID } from '@/lib/calculators/models/ti-30xs-multiview/keypad-data';
import { dispatch, hydrate, initialState, serialize, type Ti36xState } from '@/lib/calculators/models/ti-36x-pro/engine';
import type { KeyDef } from '@/lib/calculators/shared';

const MODEL_KEY = 'ti-30xs-multiview' as const;

export function Ti30xsMultiView() {
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
    <div className="calc-model calc-model--ti-36x-pro">
      <HistoryStrip rows={state.history.slice().reverse().map(h => ({ entry: h.entry, result: h.result }))} />
      <Display
        entry={state.entry}
        result={state.result}
        statusBadges={statusBadges}
        onCopyResult={copyResult}
      />
      <Keypad
        keys={TI_30XS_MULTIVIEW_KEYPAD}
        rows={TI_30XS_MULTIVIEW_GRID.rows}
        cols={TI_30XS_MULTIVIEW_GRID.cols}
        onKey={onKey}
        shiftActive={state.shiftActive}
      />
    </div>
  );
}
