// app/admin/components/calculator/models/Hp33s.tsx
//
// HP 33s reskin. C-20 of EXAM_CALCULATORS.md.
//
// The HP 33s shares HP's RPN paradigm and most of the 35s key set, but
// has a single-line display (vs the 35s's 2-row dot-matrix) and is
// missing the COMPLEX key. We reuse the HP 35s keypad + engine; the
// only distinct contribution is `model_key = 'hp-33s'` so saved state
// is per-device. The COMPLEX key isn't in our 35s keypad either (plan
// §1 non-goals) so this reskin matches automatically.

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

const MODEL_KEY = 'hp-33s' as const;

function fmtForRow(value: number): string {
  if (Math.abs(value) < 1e-12) return '0';
  if (Math.abs(value) >= 1e10 || (Math.abs(value) < 1e-3 && value !== 0)) return value.toExponential(4);
  return Number(value.toPrecision(10)).toString();
}

export function Hp33s() {
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

  // 33s has a single-line display — we surface only X (no Y row) to
  // distinguish the visual feel. T/Z still float in the status badges
  // so RPN-aware users can keep track of the stack.
  const xLabel = state.entry ? state.entry : state.result;

  const statusBadges: string[] = [state.angleMode, 'RPN'];
  if (state.shiftActive === 'f') statusBadges.push('◀f');
  if (state.shiftActive === 'g') statusBadges.push('▶g');
  statusBadges.push(`Y:${fmtForRow(state.stack.y)} Z:${fmtForRow(state.stack.z)} T:${fmtForRow(state.stack.t)}`);

  return (
    <div className="calc-model calc-model--hp-35s">
      <Display
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
