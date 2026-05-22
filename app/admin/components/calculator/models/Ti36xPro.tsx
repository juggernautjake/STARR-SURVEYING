// app/admin/components/calculator/models/Ti36xPro.tsx
//
// TI-36X Pro emulator — visual shell (C-6) + engine wiring (C-7).
//
// State machine in lib/calculators/models/ti-36x-pro/engine.ts is the
// source of truth; this component is a thin React wrapper that
// dispatches key presses, hydrates from the server on mount, and pushes
// changes to the provider's debounced save.

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Keypad } from '../Keypad';
import { Display } from '../Display';
import { HistoryStrip } from '../HistoryStrip';
import { useCalculator } from '../CalculatorProvider';
import { useCalculatorKeyEvents } from '../useCalculatorKeyEvents';
import { TI_36X_PRO_KEYPAD, TI_36X_PRO_GRID } from '@/lib/calculators/models/ti-36x-pro/keypad-data';
import { dispatch, hydrate, initialState, serialize, type Ti36xState } from '@/lib/calculators/models/ti-36x-pro/engine';
import type { KeyDef } from '@/lib/calculators/shared';

const MODEL_KEY = 'ti-36x-pro' as const;

export function Ti36xPro() {
  const { saveState, loadState } = useCalculator();
  const [state, setState] = useState<Ti36xState>(initialState);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate once on mount. Until hydrated=true, we don't push back so
  // the initial empty state can't clobber a saved row mid-load.
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

  // Push changes to the provider's debounced saver. We serialize first so
  // transient flags (2nd modifier armed, pending STO/RCL prompt) don't
  // persist across sessions — opening the calculator should never leave
  // the user mid-key-sequence.
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
  if (state.pendingMemOp === 'sto') statusBadges.push('STO ?');
  if (state.pendingMemOp === 'rcl') statusBadges.push('RCL ?');

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
        keys={TI_36X_PRO_KEYPAD}
        rows={TI_36X_PRO_GRID.rows}
        cols={TI_36X_PRO_GRID.cols}
        onKey={onKey}
        shiftActive={state.shiftActive}
      />
    </div>
  );
}
