'use client';
// app/admin/cad/components/CurveCalculatorBody.tsx
//
// cad-calculator-suite Slice 6 — Curve calculator BODY (no modal
// chrome). Lives inside the new ResizableModal-based
// CalculatorModal so it gets the same picker + corner-resize + per-
// calculator persistence as the Generic calculator.
//
// State lives entirely in useCalculatorStore under the `'curve'`
// slot, so closing + reopening the calculator restores every
// input + the last-computed result the surveyor was working with.
//
// The legacy `CurveCalculator.tsx` (ModalFrame + onPlace canvas
// placement) stays for the standalone Tools → Curve Calculator…
// MenuBar entry — they share the same compute kernel, just
// different chrome.

import { useCallback } from 'react';
import { useCalculatorStore } from '@/lib/cad/store';
import { computeCurve, crossValidateCurve } from '@/lib/cad/geometry/curve';
import type { CurveInput } from '@/lib/cad/geometry/curve';
import type { CurveParameters } from '@/lib/cad/types';

type CurveMethod =
  | 'R_DELTA'        // Radius + Δ
  | 'R_L'            // Radius + Arc Length
  | 'R_C'            // Radius + Chord
  | 'THREE_POINT'    // 3 points
  | 'PC_TANGENT'     // 2-point + tangent
  | 'FULL_DATA'      // Full data block (cross-validate)
  | 'TWO_TANGENTS';  // 2 tangents + R

const METHOD_LABELS: Record<CurveMethod, string> = {
  R_DELTA: 'R + Δ',
  R_L: 'R + L',
  R_C: 'R + C',
  THREE_POINT: '3-Point',
  PC_TANGENT: 'PC + Tangent + R',
  FULL_DATA: 'Full Data (Cross-Validate)',
  TWO_TANGENTS: '2 Tangents + R',
};

/** State blob persisted in the calculator-store under `'curve'`.
 *  Every field is a serializable primitive / nested record so the
 *  persist middleware round-trips it cleanly. */
export interface CurveCalcState {
  method: CurveMethod;
  R: string;
  delta: string;
  L: string;
  C: string;
  T: string;
  E: string;
  M: string;
  direction: 'RIGHT' | 'LEFT';
  tangentIn: string;
  tangentOut: string;
  result: CurveParameters | null;
  error: string | null;
  validationMsg: string | null;
}

export const INITIAL_CURVE_STATE: CurveCalcState = {
  method: 'R_DELTA',
  R: '', delta: '', L: '', C: '', T: '', E: '', M: '',
  direction: 'RIGHT',
  tangentIn: '', tangentOut: '',
  result: null,
  error: null,
  validationMsg: null,
};

function readState(): CurveCalcState {
  const raw = useCalculatorStore.getState().getCalculatorState<Partial<CurveCalcState>>('curve');
  if (!raw) return INITIAL_CURVE_STATE;
  return { ...INITIAL_CURVE_STATE, ...raw };
}

export default function CurveCalculatorBody() {
  // Subscribe so React re-renders on store changes from this or
  // anywhere else (e.g. resetAll firing).
  const state = useCalculatorStore((s) => (s.states.curve as CurveCalcState | undefined)) ?? INITIAL_CURVE_STATE;
  const setCalculatorState = useCalculatorStore((s) => s.setCalculatorState);

  const patch = useCallback(
    (p: Partial<CurveCalcState>) => setCalculatorState('curve', { ...readState(), ...p }),
    [setCalculatorState],
  );

  const compute = useCallback(() => {
    const s = readState();
    try {
      const input: CurveInput = { direction: s.direction };
      if (s.R) input.R = parseFloat(s.R);
      if (s.delta) input.delta = parseFloat(s.delta);
      if (s.L) input.L = parseFloat(s.L);
      if (s.C) input.C = parseFloat(s.C);
      if (s.T) input.T = parseFloat(s.T);
      if (s.E) input.E = parseFloat(s.E);
      if (s.M) input.M = parseFloat(s.M);
      if (s.tangentIn) input.tangentInBearing = parseFloat(s.tangentIn);
      if (s.tangentOut) input.tangentOutBearing = parseFloat(s.tangentOut);
      const computed = computeCurve(input);
      if (!computed) {
        patch({ result: null, error: 'Insufficient input — provide at least R and one other parameter.', validationMsg: null });
        return;
      }
      let validationMsg: string | null = null;
      if (s.method === 'FULL_DATA') {
        const v = crossValidateCurve(input, computed);
        if (v.isValid) validationMsg = '✅ All values consistent';
        else {
          const failed = v.checks.filter((c) => !c.passed);
          validationMsg = `⚠️ ${failed.length} inconsistent: ${failed.map((c) => c.parameter).join(', ')}`;
        }
      }
      patch({ result: computed, error: null, validationMsg });
    } catch (e) {
      patch({ result: null, error: 'Calculation error: ' + (e instanceof Error ? e.message : String(e)), validationMsg: null });
    }
  }, [patch]);

  const handleCopy = () => {
    if (!state.result) return;
    const r = state.result;
    const text = [
      `R = ${r.R.toFixed(4)}`,
      `Δ = ${(r.delta * 180 / Math.PI).toFixed(6)}°`,
      `L = ${r.L.toFixed(4)}`,
      `C = ${r.C.toFixed(4)}`,
      `T = ${r.T.toFixed(4)}`,
      `E = ${r.E.toFixed(4)}`,
      `M = ${r.M.toFixed(4)}`,
      `D = ${r.D.toFixed(4)}°`,
      `PC: (${r.pc.x.toFixed(4)}, ${r.pc.y.toFixed(4)})`,
      `PT: (${r.pt.x.toFixed(4)}, ${r.pt.y.toFixed(4)})`,
      `PI: (${r.pi.x.toFixed(4)}, ${r.pi.y.toFixed(4)})`,
      `RP: (${r.rp.x.toFixed(4)}, ${r.rp.y.toFixed(4)})`,
    ].join('\n');
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  return (
    <div
      data-testid="curve-calculator-body"
      className="flex flex-col h-full w-full overflow-y-auto bg-gray-900 text-gray-100 p-3 text-xs"
    >
      <label className="block mb-2">
        <span className="block text-gray-400 mb-0.5">Method</span>
        <select
          data-testid="curve-calc-method"
          value={state.method}
          onChange={(e) => patch({ method: e.target.value as CurveMethod })}
          className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded px-2 py-1 focus:outline-none focus:border-blue-500"
        >
          {(Object.keys(METHOD_LABELS) as CurveMethod[]).map((m) => (
            <option key={m} value={m}>{METHOD_LABELS[m]}</option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
        {/* Inputs */}
        <div className="space-y-2 overflow-y-auto pr-1">
          <div className="text-gray-500 uppercase tracking-wider">Input</div>
          {state.method !== 'THREE_POINT' && (
            <NumInput label="Radius (R) ft" value={state.R} onChange={(R) => patch({ R })} />
          )}
          {(state.method === 'R_DELTA' || state.method === 'FULL_DATA') && (
            <NumInput label="Δ deg" value={state.delta} onChange={(delta) => patch({ delta })} />
          )}
          {(state.method === 'R_L' || state.method === 'FULL_DATA') && (
            <NumInput label="Arc L ft" value={state.L} onChange={(L) => patch({ L })} />
          )}
          {(state.method === 'R_C' || state.method === 'FULL_DATA') && (
            <NumInput label="Chord C ft" value={state.C} onChange={(C) => patch({ C })} />
          )}
          {(state.method === 'PC_TANGENT' || state.method === 'TWO_TANGENTS') && (
            <NumInput label="Tangent-In °" value={state.tangentIn} onChange={(tangentIn) => patch({ tangentIn })} />
          )}
          {state.method === 'TWO_TANGENTS' && (
            <NumInput label="Tangent-Out °" value={state.tangentOut} onChange={(tangentOut) => patch({ tangentOut })} />
          )}
          {state.method === 'FULL_DATA' && (
            <>
              <NumInput label="T ft" value={state.T} onChange={(T) => patch({ T })} />
              <NumInput label="E ft" value={state.E} onChange={(E) => patch({ E })} />
              <NumInput label="M ft" value={state.M} onChange={(M) => patch({ M })} />
            </>
          )}
          {state.method !== 'THREE_POINT' && (
            <div>
              <span className="block text-gray-400 mb-0.5">Direction</span>
              <div className="flex gap-3">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="dir" value="RIGHT" checked={state.direction === 'RIGHT'}
                    onChange={() => patch({ direction: 'RIGHT' })} /> Right
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="dir" value="LEFT" checked={state.direction === 'LEFT'}
                    onChange={() => patch({ direction: 'LEFT' })} /> Left
                </label>
              </div>
            </div>
          )}
          <button
            type="button"
            data-testid="curve-calc-compute"
            onClick={compute}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded px-2 py-1.5 mt-1"
          >
            Calculate
          </button>
        </div>

        {/* Results */}
        <div className="space-y-2 overflow-y-auto pl-1">
          <div className="text-gray-500 uppercase tracking-wider">Results</div>
          {state.error && (
            <div data-testid="curve-calc-error" className="bg-red-900/40 border border-red-700 rounded p-2 text-red-200">
              {state.error}
            </div>
          )}
          {state.validationMsg && (
            <div className={`rounded p-2 ${state.validationMsg.startsWith('✅') ? 'bg-green-900/40 border border-green-700 text-green-200' : 'bg-yellow-900/40 border border-yellow-700 text-yellow-200'}`}>
              {state.validationMsg}
            </div>
          )}
          {state.result && (
            <div data-testid="curve-calc-result" className="bg-gray-800 border border-gray-700 rounded p-2 font-mono leading-tight">
              <div className="grid grid-cols-2 gap-x-2">
                <span className="text-gray-500">R:</span><span>{state.result.R.toFixed(2)}&apos;</span>
                <span className="text-gray-500">Δ:</span><span>{(state.result.delta * 180 / Math.PI).toFixed(4)}°</span>
                <span className="text-gray-500">L:</span><span>{state.result.L.toFixed(2)}&apos;</span>
                <span className="text-gray-500">C:</span><span>{state.result.C.toFixed(2)}&apos;</span>
                <span className="text-gray-500">T:</span><span>{state.result.T.toFixed(2)}&apos;</span>
                <span className="text-gray-500">E:</span><span>{state.result.E.toFixed(2)}&apos;</span>
                <span className="text-gray-500">M:</span><span>{state.result.M.toFixed(2)}&apos;</span>
                <span className="text-gray-500">D:</span><span>{state.result.D.toFixed(4)}°</span>
              </div>
            </div>
          )}
          {state.result && (
            <button
              type="button"
              onClick={handleCopy}
              className="w-full bg-gray-700 hover:bg-gray-600 rounded px-2 py-1"
            >
              Copy to clipboard
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Small helper for the input rows so the JSX stays compact. */
function NumInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-gray-400 mb-0.5">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded px-2 py-1 focus:outline-none focus:border-blue-500"
      />
    </label>
  );
}
