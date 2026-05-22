// app/admin/components/calculator/models/Hp35s.tsx
//
// HP 35s emulator. C-15 (shell) + C-16 (RPN engine).
//
// The HP 35s's signature display is a 2-row dot-matrix LCD: Y on top,
// X on the bottom. We reuse the shared <Display> with entry=Y, result=X
// and surface a small "T  Z" line in the status badge area for stack
// awareness.

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Keypad } from '../Keypad';
import { Display } from '../Display';
import { useCalculator } from '../CalculatorProvider';
import { HP_35S_KEYPAD, HP_35S_GRID } from '@/lib/calculators/models/hp-35s/keypad-data';
import {
  dispatch, hydrate, initialState, serialize, type Hp35sState,
} from '@/lib/calculators/models/hp-35s/engine';
import type { KeyDef } from '@/lib/calculators/shared';

const MODEL_KEY = 'hp-35s' as const;

function fmtForRow(value: number): string {
  if (Math.abs(value) < 1e-12) return '0';
  if (Math.abs(value) >= 1e10 || (Math.abs(value) < 1e-3 && value !== 0)) return value.toExponential(4);
  return Number(value.toPrecision(10)).toString();
}

export function Hp35s() {
  const { saveState, loadState } = useCalculator();
  const [state, setState] = useState<Hp35sState>(initialState);
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

  const copyResult = useCallback(() => {
    if (!state.result) return;
    void navigator.clipboard?.writeText(state.result);
  }, [state.result]);

  const yLabel = state.entry ? `y: ${fmtForRow(state.stack.x)}` : `y: ${fmtForRow(state.stack.y)}`;
  const xLabel = state.entry ? state.entry : state.result;

  const statusBadges: string[] = [state.angleMode, 'RPN'];
  if (state.shiftActive === 'f') statusBadges.push('◀f');
  if (state.shiftActive === 'g') statusBadges.push('▶g');
  statusBadges.push(`T:${fmtForRow(state.stack.t)} Z:${fmtForRow(state.stack.z)}`);

  return (
    <div className="calc-model calc-model--hp-35s">
      <Display
        entry={yLabel}
        result={xLabel}
        statusBadges={statusBadges}
        onCopyResult={copyResult}
      />
      <Keypad
        keys={HP_35S_KEYPAD}
        rows={HP_35S_GRID.rows}
        cols={HP_35S_GRID.cols}
        onKey={onKey}
      />
    </div>
  );
}
