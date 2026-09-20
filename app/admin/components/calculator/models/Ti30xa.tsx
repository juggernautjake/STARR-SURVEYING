// app/admin/components/calculator/models/Ti30xa.tsx
//
// TI-30Xa emulator.
//
// ── IT USED TO BORROW THE 36X PRO ENGINE, AND THAT WAS WRONG (2026-09-20) ────────────────────
//
// The previous version of this file said the engine semantics were "identical to the MultiView and
// Pro, so the same engine module works". They are not identical; they are opposite.
//
// The 36X Pro is a MathPrint machine — pressing SIN appends `sin(` to an expression you build up
// and then evaluate with `=`. The TI-30Xa is IMMEDIATE EXECUTION: you type 45, press SIN, and
// 0.7071 replaces the display at once.
//
// So this emulator was training `SIN 45` on the one calculator the owner sits the exam with, and
// the real device would have answered a different question without saying so. It now runs
// `lib/calculators/models/ti-30xa/engine.ts`, which is written for this machine and tested against
// its actual behaviour.
//
// The keypad layout is unchanged — it was rebuilt from a device photograph and was already right.

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Keypad } from '../Keypad';
import { Display } from '../Display';
import { useCalculator } from '../CalculatorProvider';
import { useCalculatorKeyEvents } from '../useCalculatorKeyEvents';
import { TI_30XA_KEYPAD, TI_30XA_GRID } from '@/lib/calculators/models/ti-30xa/keypad-data';
import {
  press, hydrate, initialState, serialize,
  storeTo, recallFrom, sumInto, exchangeWith,
  type Ti30xaState,
} from '@/lib/calculators/models/ti-30xa/engine';
import type { KeyDef } from '@/lib/calculators/shared';

const MODEL_KEY = 'ti-30xa' as const;

/** STO and RCL take a digit afterwards, exactly as on the device. */
type Awaiting = null | 'sto' | 'rcl' | 'sum' | 'exc';

export function Ti30xa() {
  const { saveState, loadState } = useCalculator();
  const [state, setState] = useState<Ti30xaState>(initialState);
  const [awaiting, setAwaiting] = useState<Awaiting>(null);
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

  const handle = useCallback((keyId: string) => {
    setState((prev) => {
      // A memory key is armed and then takes a digit — STO 1, RCL 2, 2nd SUM 3. Handled here
      // rather than in the engine because it is a two-key gesture, and the engine deals in single
      // presses so that it stays testable as a pure function of one key at a time.
      if (awaiting && /^n[0-2]$/.test(keyId)) {
        const slot = Number(keyId.slice(1)) as 0 | 1 | 2;
        const next = awaiting === 'sto' ? storeTo(prev, slot)
          : awaiting === 'rcl' ? recallFrom(prev, slot)
          : awaiting === 'sum' ? sumInto(prev, slot)
          : exchangeWith(prev, slot);
        setAwaiting(null);
        return next;
      }
      if (awaiting) setAwaiting(null);

      if (keyId === 'sto') { setAwaiting(prev.shift ? 'exc' : 'sto'); return { ...prev, shift: false }; }
      if (keyId === 'rcl') { setAwaiting(prev.shift ? 'sum' : 'rcl'); return { ...prev, shift: false }; }

      return press(prev, keyId);
    });
  }, [awaiting]);

  const onKey = useCallback((key: KeyDef) => handle(key.id), [handle]);
  useCalculatorKeyEvents(handle);

  const copyResult = useCallback(() => {
    void navigator.clipboard?.writeText(state.display);
  }, [state.display]);

  // The real device shows the angle mode and the 2nd indicator, and nothing else. Showing more
  // would be a difference from the hardware in the direction of being more helpful, which is the
  // wrong direction when the point is to practise on the thing you will actually sit the exam with.
  const statusBadges: string[] = [state.mode];
  if (state.shift) statusBadges.push('2nd');
  if (awaiting) statusBadges.push(awaiting.toUpperCase());
  if (state.data.length > 0) statusBadges.push(`n=${state.data.length}`);

  return (
    <div className="calc-model calc-model--ti-30xa">
      {/* No history strip. The 30Xa is a single-line calculator with no expression history, and
          giving it one here would be the same category of error as the engine swap this replaced:
          a convenience the real device does not have, practised until it is relied on. */}
      <Display
        entry=""
        result={state.display}
        statusBadges={statusBadges}
        onCopyResult={copyResult}
      />
      <Keypad
        keys={TI_30XA_KEYPAD}
        rows={TI_30XA_GRID.rows}
        cols={TI_30XA_GRID.cols}
        onKey={onKey}
        shiftActive={state.shift}
      />
    </div>
  );
}
