'use client';
// app/admin/cad/components/GenericCalculator.tsx
//
// cad-calculator-suite Slice 2 — Windows-style generic calculator.
// Thin React shell over the pure state machine in
// lib/cad/calculators/generic-engine.ts. Reads + writes its
// working state through useCalculatorStore (Slice 1) under the
// `'generic'` slot so closing + reopening the modal restores the
// tape + display.
//
// Keyboard shortcuts (when the calculator has focus or its root
// captures the keydown via the modal):
//   0-9, .          → digits / decimal
//   + - * /         → operators
//   Enter, =        → equals
//   Backspace       → drop last digit
//   Escape, C       → clear all
//   Delete          → clear entry only
//   ±, F9           → flip sign

import { useEffect, useCallback } from 'react';
import { useCalculatorStore } from '@/lib/cad/store';
import {
  INITIAL_GENERIC_STATE,
  inputBackspace,
  inputClear,
  inputClearEntry,
  inputDecimal,
  inputDigit,
  inputEquals,
  inputOp,
  inputSignFlip,
  type GenericCalcOp,
  type GenericCalcState,
} from '@/lib/cad/calculators/generic-engine';

/** Read the persisted generic state, normalizing nulls + missing
 *  shape (e.g. a fresh session has nothing yet). */
function readState(): GenericCalcState {
  const raw = useCalculatorStore.getState().getCalculatorState<GenericCalcState>('generic');
  if (!raw) return INITIAL_GENERIC_STATE;
  // Defensive: shape might be incomplete if the user upgraded
  // across an engine change. Fill missing fields from the
  // INITIAL_GENERIC_STATE template.
  return {
    display: typeof raw.display === 'string' ? raw.display : INITIAL_GENERIC_STATE.display,
    pending: typeof raw.pending === 'number' || raw.pending === null ? raw.pending : null,
    op: raw.op ?? null,
    justEvaluated: !!raw.justEvaluated,
    awaitingOperand: !!raw.awaitingOperand,
    tape: Array.isArray(raw.tape) ? raw.tape : [],
  };
}

/** A single calculator button. */
function CalcButton({
  label,
  onClick,
  variant = 'digit',
  span = 1,
}: {
  label: string;
  onClick: () => void;
  variant?: 'digit' | 'op' | 'equals' | 'danger';
  span?: 1 | 2;
}) {
  const base = 'rounded text-base font-medium select-none transition-colors active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-blue-500';
  const variantClass =
    variant === 'digit'  ? 'bg-gray-700 text-gray-100 hover:bg-gray-600' :
    variant === 'op'     ? 'bg-gray-600 text-gray-100 hover:bg-gray-500' :
    variant === 'equals' ? 'bg-blue-600 text-white hover:bg-blue-500' :
    /* danger */            'bg-red-700/80 text-white hover:bg-red-600';
  const spanClass = span === 2 ? 'col-span-2' : '';
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`generic-calc-key-${label}`}
      className={`${base} ${variantClass} ${spanClass} py-2 px-1`}
    >
      {label}
    </button>
  );
}

export default function GenericCalculator() {
  // Subscribe to the state slot so React re-renders on store
  // changes. `useCalculatorStore` is a subscribe-on-mount hook.
  const state = useCalculatorStore((s) => s.states.generic as GenericCalcState | undefined) ?? INITIAL_GENERIC_STATE;
  const setCalculatorState = useCalculatorStore((s) => s.setCalculatorState);

  const dispatch = useCallback(
    (next: GenericCalcState) => setCalculatorState('generic', next),
    [setCalculatorState],
  );

  // Apply: run the engine action on the latest state, write back.
  const apply = useCallback(
    (action: (s: GenericCalcState) => GenericCalcState) => {
      dispatch(action(readState()));
    },
    [dispatch],
  );

  const onDigit = useCallback((d: string) => apply((s) => inputDigit(s, d)), [apply]);
  const onOp = useCallback((op: GenericCalcOp) => apply((s) => inputOp(s, op)), [apply]);
  const onDecimal = useCallback(() => apply(inputDecimal), [apply]);
  const onEquals = useCallback(() => apply(inputEquals), [apply]);
  const onClear = useCallback(() => apply(inputClear), [apply]);
  const onClearEntry = useCallback(() => apply(inputClearEntry), [apply]);
  const onSignFlip = useCallback(() => apply(inputSignFlip), [apply]);
  const onBackspace = useCallback(() => apply(inputBackspace), [apply]);

  // Keyboard handling — register a document-level keydown listener
  // so the calculator catches typing even when no button has focus.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Skip if the user is typing in an input/textarea elsewhere
      // on the page (e.g. command bar).
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); onDigit(e.key); return; }
      if (e.key === '.') { e.preventDefault(); onDecimal(); return; }
      if (e.key === '+') { e.preventDefault(); onOp('+'); return; }
      if (e.key === '-') { e.preventDefault(); onOp('-'); return; }
      if (e.key === '*') { e.preventDefault(); onOp('*'); return; }
      if (e.key === '/') { e.preventDefault(); onOp('/'); return; }
      if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); onEquals(); return; }
      if (e.key === 'Backspace') { e.preventDefault(); onBackspace(); return; }
      if (e.key === 'Escape' || e.key === 'c' || e.key === 'C') { e.preventDefault(); onClear(); return; }
      if (e.key === 'Delete') { e.preventDefault(); onClearEntry(); return; }
      if (e.key === 'F9') { e.preventDefault(); onSignFlip(); return; }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDigit, onDecimal, onOp, onEquals, onBackspace, onClear, onClearEntry, onSignFlip]);

  // Render the tape (last 6 entries) above the display so the
  // surveyor can see the chain at a glance.
  const recentTape = state.tape.slice(-6);

  return (
    <div
      data-testid="generic-calculator"
      className="flex flex-col h-full w-full bg-gray-900 text-gray-100 p-2 gap-2"
    >
      {/* Tape */}
      <div
        data-testid="generic-calc-tape"
        className="flex-1 min-h-[3rem] overflow-y-auto text-right text-xs text-gray-400 font-mono leading-snug px-2 py-1 bg-gray-950 rounded"
      >
        {recentTape.length === 0 ? (
          <span className="text-gray-700 italic">tape is empty</span>
        ) : (
          recentTape.map((entry, i) => (
            <div key={`tape-${i}`}>{entry}</div>
          ))
        )}
      </div>
      {/* Display */}
      <div
        data-testid="generic-calc-display"
        className="text-right text-3xl font-mono tabular-nums bg-gray-800 rounded px-3 py-2 truncate"
      >
        {state.display}
      </div>
      {/* Keypad — 5 rows × 4 cols. */}
      <div className="grid grid-cols-4 gap-1 flex-shrink-0">
        <CalcButton label="C"  onClick={onClear}      variant="danger" />
        <CalcButton label="CE" onClick={onClearEntry} variant="danger" />
        <CalcButton label="⌫"  onClick={onBackspace}  variant="op" />
        <CalcButton label="÷"  onClick={() => onOp('/')} variant="op" />

        <CalcButton label="7" onClick={() => onDigit('7')} />
        <CalcButton label="8" onClick={() => onDigit('8')} />
        <CalcButton label="9" onClick={() => onDigit('9')} />
        <CalcButton label="×" onClick={() => onOp('*')} variant="op" />

        <CalcButton label="4" onClick={() => onDigit('4')} />
        <CalcButton label="5" onClick={() => onDigit('5')} />
        <CalcButton label="6" onClick={() => onDigit('6')} />
        <CalcButton label="−" onClick={() => onOp('-')} variant="op" />

        <CalcButton label="1" onClick={() => onDigit('1')} />
        <CalcButton label="2" onClick={() => onDigit('2')} />
        <CalcButton label="3" onClick={() => onDigit('3')} />
        <CalcButton label="+" onClick={() => onOp('+')} variant="op" />

        <CalcButton label="±" onClick={onSignFlip} />
        <CalcButton label="0" onClick={() => onDigit('0')} />
        <CalcButton label="." onClick={onDecimal} />
        <CalcButton label="=" onClick={onEquals} variant="equals" />
      </div>
    </div>
  );
}
