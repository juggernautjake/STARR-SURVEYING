// app/admin/components/calculator/models/GenericCalculator.tsx
//
// cad-trv-fidelity Slice 14 — the default "Generic Calculator": a
// simple Windows-calculator-style arithmetic calc. Self-contained over
// `genericCalcReducer` (no shared scientific engine). Layout is a
// flex column (display + 4-col grid keypad with `1fr` rows/cols) so it
// fills + scales proportionally as the calculator modal is expanded.

'use client';

import { useReducer, useCallback, useEffect } from 'react';
import {
  genericCalcReducer,
  initialGenericState,
  type GenericAction,
} from '@/lib/calculators/generic/engine';

interface KeyDef {
  label: string;
  action: GenericAction;
  /** Visual variant for styling (digit / operator / function / equals). */
  variant: 'digit' | 'op' | 'fn' | 'equals';
  /** Optional grid span (the `=` key spans the full width). */
  span?: number;
}

// 4-column keypad, top-to-bottom. Mirrors the Windows standard layout.
const KEYS: KeyDef[] = [
  { label: '%', action: { type: 'percent' }, variant: 'fn' },
  { label: 'CE', action: { type: 'clearEntry' }, variant: 'fn' },
  { label: 'C', action: { type: 'clearAll' }, variant: 'fn' },
  { label: '⌫', action: { type: 'backspace' }, variant: 'fn' },

  { label: '7', action: { type: 'digit', value: '7' }, variant: 'digit' },
  { label: '8', action: { type: 'digit', value: '8' }, variant: 'digit' },
  { label: '9', action: { type: 'digit', value: '9' }, variant: 'digit' },
  { label: '÷', action: { type: 'op', value: '/' }, variant: 'op' },

  { label: '4', action: { type: 'digit', value: '4' }, variant: 'digit' },
  { label: '5', action: { type: 'digit', value: '5' }, variant: 'digit' },
  { label: '6', action: { type: 'digit', value: '6' }, variant: 'digit' },
  { label: '×', action: { type: 'op', value: '*' }, variant: 'op' },

  { label: '1', action: { type: 'digit', value: '1' }, variant: 'digit' },
  { label: '2', action: { type: 'digit', value: '2' }, variant: 'digit' },
  { label: '3', action: { type: 'digit', value: '3' }, variant: 'digit' },
  { label: '−', action: { type: 'op', value: '-' }, variant: 'op' },

  { label: '±', action: { type: 'negate' }, variant: 'fn' },
  { label: '0', action: { type: 'digit', value: '0' }, variant: 'digit' },
  { label: '.', action: { type: 'dot' }, variant: 'digit' },
  { label: '+', action: { type: 'op', value: '+' }, variant: 'op' },

  { label: '=', action: { type: 'equals' }, variant: 'equals', span: 4 },
];

/** Map a keyboard key to a calculator action (so typing works too). */
function keyToAction(k: string): GenericAction | null {
  if (k >= '0' && k <= '9') return { type: 'digit', value: k };
  switch (k) {
    case '.': return { type: 'dot' };
    case '+': return { type: 'op', value: '+' };
    case '-': return { type: 'op', value: '-' };
    case '*': return { type: 'op', value: '*' };
    case '/': return { type: 'op', value: '/' };
    case '%': return { type: 'percent' };
    case 'Enter': case '=': return { type: 'equals' };
    case 'Backspace': return { type: 'backspace' };
    case 'Escape': return { type: 'clearAll' };
    default: return null;
  }
}

export function GenericCalculator() {
  const [state, dispatch] = useReducer(genericCalcReducer, initialGenericState);

  const onKey = useCallback((e: KeyboardEvent) => {
    const action = keyToAction(e.key);
    if (!action) return;
    e.preventDefault();
    dispatch(action);
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  return (
    <div className="generic-calc" data-testid="generic-calculator">
      <div className="generic-calc__display" data-testid="generic-calc-display" aria-live="polite">
        {state.display}
      </div>
      <div className="generic-calc__keypad">
        {KEYS.map((k) => (
          <button
            key={k.label}
            type="button"
            className={`generic-calc__key generic-calc__key--${k.variant}`}
            style={k.span ? { gridColumn: `span ${k.span}` } : undefined}
            data-testid={`generic-calc-key-${k.label}`}
            onClick={() => dispatch(k.action)}
          >
            {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}
