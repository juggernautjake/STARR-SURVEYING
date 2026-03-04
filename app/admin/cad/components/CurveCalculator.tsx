// app/admin/cad/components/CurveCalculator.tsx
'use client';

import React, { useState, useCallback } from 'react';
import { computeCurve, crossValidateCurve } from '@/lib/cad/geometry/curve';
import type { CurveInput } from '@/lib/cad/geometry/curve';
import type { CurveParameters } from '@/lib/cad/types';

type CurveMethod =
  | 'R_DELTA'        // Method 1: R + Δ
  | 'R_L'            // Method 2: R + L
  | 'R_C'            // Method 3: R + C
  | 'THREE_POINT'    // Method 4: 3 points
  | 'PC_TANGENT'     // Method 5: 2-point + tangent
  | 'FULL_DATA'      // Method 6: full data block (cross-validate)
  | 'TWO_TANGENTS';  // Method 7: 2 tangents + R

const METHOD_LABELS: Record<CurveMethod, string> = {
  R_DELTA: 'R + Δ (Radius + Central Angle)',
  R_L: 'R + L (Radius + Arc Length)',
  R_C: 'R + C (Radius + Chord)',
  THREE_POINT: '3-Point (PC, Mid, PT)',
  PC_TANGENT: 'PC + Tangent Bearing + R',
  FULL_DATA: 'Full Data Block (Cross-Validate)',
  TWO_TANGENTS: '2 Tangents + R',
};

interface Props {
  onClose: () => void;
  onPlace?: (curve: CurveParameters) => void;
}

export default function CurveCalculator({ onClose, onPlace }: Props) {
  const [method, setMethod] = useState<CurveMethod>('R_DELTA');
  const [result, setResult] = useState<CurveParameters | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);

  // Input fields
  const [R, setR] = useState('');
  const [delta, setDelta] = useState('');
  const [L, setL] = useState('');
  const [C, setC] = useState('');
  const [T, setT] = useState('');
  const [E, setE] = useState('');
  const [M, setM] = useState('');
  const [direction, setDirection] = useState<'RIGHT' | 'LEFT'>('RIGHT');
  const [tangentIn, setTangentIn] = useState('');
  const [tangentOut, setTangentOut] = useState('');

  const compute = useCallback(() => {
    setError(null);
    setValidationMsg(null);
    setResult(null);

    try {
      const input: CurveInput = { direction };

      if (R) input.R = parseFloat(R);
      if (delta) input.delta = parseFloat(delta);
      if (L) input.L = parseFloat(L);
      if (C) input.C = parseFloat(C);
      if (T) input.T = parseFloat(T);
      if (E) input.E = parseFloat(E);
      if (M) input.M = parseFloat(M);
      if (tangentIn) input.tangentInBearing = parseFloat(tangentIn);
      if (tangentOut) input.tangentOutBearing = parseFloat(tangentOut);

      const computed = computeCurve(input);
      if (!computed) {
        setError('Insufficient input — provide at least R and one other parameter.');
        return;
      }

      setResult(computed);

      // Cross-validate if we have extra data (Method 6)
      if (method === 'FULL_DATA') {
        const validation = crossValidateCurve(input, computed);
        if (validation.isValid) {
          setValidationMsg('✅ All values consistent');
        } else {
          const failed = validation.checks.filter(c => !c.passed);
          setValidationMsg(`⚠️ ${failed.length} inconsistent: ${failed.map(c => c.parameter).join(', ')}`);
        }
      }
    } catch (e) {
      setError('Calculation error: ' + (e instanceof Error ? e.message : String(e)));
    }
  }, [R, delta, L, C, T, E, M, direction, tangentIn, tangentOut, method]);

  const handleCopy = () => {
    if (!result) return;
    const text = [
      `R = ${result.R.toFixed(4)}`,
      `Δ = ${(result.delta * 180 / Math.PI).toFixed(6)}°`,
      `L = ${result.L.toFixed(4)}`,
      `C = ${result.C.toFixed(4)}`,
      `T = ${result.T.toFixed(4)}`,
      `E = ${result.E.toFixed(4)}`,
      `M = ${result.M.toFixed(4)}`,
      `D = ${result.D.toFixed(4)}°`,
      `PC: (${result.pc.x.toFixed(4)}, ${result.pc.y.toFixed(4)})`,
      `PT: (${result.pt.x.toFixed(4)}, ${result.pt.y.toFixed(4)})`,
      `PI: (${result.pi.x.toFixed(4)}, ${result.pi.y.toFixed(4)})`,
      `RP: (${result.rp.x.toFixed(4)}, ${result.rp.y.toFixed(4)})`,
    ].join('\n');
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-[700px] max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Curve Calculator</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl leading-none">&times;</button>
        </div>

        <div className="p-4 space-y-4">
          {/* Method selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Method</label>
            <select
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              value={method}
              onChange={(e) => setMethod(e.target.value as CurveMethod)}
            >
              {(Object.keys(METHOD_LABELS) as CurveMethod[]).map((m) => (
                <option key={m} value={m}>{METHOD_LABELS[m]}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Left: Inputs */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Input</h3>

              {/* Common: R */}
              {method !== 'THREE_POINT' && (
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Radius (R) — feet</label>
                  <input type="number" className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                    value={R} onChange={e => setR(e.target.value)} placeholder="e.g. 500" />
                </div>
              )}

              {/* Delta */}
              {(method === 'R_DELTA' || method === 'FULL_DATA') && (
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Central Angle (Δ) — decimal degrees</label>
                  <input type="number" className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                    value={delta} onChange={e => setDelta(e.target.value)} placeholder="e.g. 30" />
                </div>
              )}

              {/* Arc Length */}
              {(method === 'R_L' || method === 'FULL_DATA') && (
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Arc Length (L) — feet</label>
                  <input type="number" className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                    value={L} onChange={e => setL(e.target.value)} placeholder="e.g. 261.80" />
                </div>
              )}

              {/* Chord */}
              {(method === 'R_C' || method === 'FULL_DATA') && (
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Chord (C) — feet</label>
                  <input type="number" className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                    value={C} onChange={e => setC(e.target.value)} placeholder="e.g. 258.82" />
                </div>
              )}

              {/* Tangent In */}
              {(method === 'PC_TANGENT' || method === 'TWO_TANGENTS') && (
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Tangent-In Bearing — decimal azimuth°</label>
                  <input type="number" className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                    value={tangentIn} onChange={e => setTangentIn(e.target.value)} placeholder="e.g. 45.5" />
                </div>
              )}

              {/* Tangent Out */}
              {method === 'TWO_TANGENTS' && (
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Tangent-Out Bearing — decimal azimuth°</label>
                  <input type="number" className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                    value={tangentOut} onChange={e => setTangentOut(e.target.value)} placeholder="e.g. 75.5" />
                </div>
              )}

              {/* T, E, M for full data */}
              {method === 'FULL_DATA' && (
                <>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Tangent (T) — feet (optional)</label>
                    <input type="number" className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                      value={T} onChange={e => setT(e.target.value)} placeholder="optional" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">External (E) — feet (optional)</label>
                    <input type="number" className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                      value={E} onChange={e => setE(e.target.value)} placeholder="optional" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Mid-Ordinate (M) — feet (optional)</label>
                    <input type="number" className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                      value={M} onChange={e => setM(e.target.value)} placeholder="optional" />
                  </div>
                </>
              )}

              {/* Direction */}
              {method !== 'THREE_POINT' && (
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Direction</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1 text-sm cursor-pointer">
                      <input type="radio" name="dir" value="RIGHT" checked={direction === 'RIGHT'}
                        onChange={() => setDirection('RIGHT')} />
                      Right
                    </label>
                    <label className="flex items-center gap-1 text-sm cursor-pointer">
                      <input type="radio" name="dir" value="LEFT" checked={direction === 'LEFT'}
                        onChange={() => setDirection('LEFT')} />
                      Left
                    </label>
                  </div>
                </div>
              )}

              <button
                onClick={compute}
                className="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700"
              >
                Calculate
              </button>
            </div>

            {/* Right: Results */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Results</h3>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">{error}</div>
              )}

              {validationMsg && (
                <div className={`rounded p-2 text-xs ${validationMsg.startsWith('✅') ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-yellow-50 border border-yellow-200 text-yellow-700'}`}>
                  {validationMsg}
                </div>
              )}

              {result && (
                <div className="bg-gray-50 border border-gray-200 rounded p-3 space-y-1 text-xs font-mono">
                  <div className="grid grid-cols-2 gap-x-2">
                    <span className="text-gray-500">R:</span><span>{result.R.toFixed(2)}&apos;</span>
                    <span className="text-gray-500">Δ:</span><span>{(result.delta * 180 / Math.PI).toFixed(6)}°</span>
                    <span className="text-gray-500">L:</span><span>{result.L.toFixed(2)}&apos;</span>
                    <span className="text-gray-500">C:</span><span>{result.C.toFixed(2)}&apos;</span>
                    <span className="text-gray-500">T:</span><span>{result.T.toFixed(2)}&apos;</span>
                    <span className="text-gray-500">E:</span><span>{result.E.toFixed(2)}&apos;</span>
                    <span className="text-gray-500">M:</span><span>{result.M.toFixed(2)}&apos;</span>
                    <span className="text-gray-500">D:</span><span>{result.D.toFixed(4)}°</span>
                  </div>
                </div>
              )}

              {result && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-600 mb-1">Key Points</h4>
                  <div className="bg-gray-50 border border-gray-200 rounded p-2 text-xs font-mono space-y-0.5">
                    <div>PC: ({result.pc.x.toFixed(2)}, {result.pc.y.toFixed(2)})</div>
                    <div>PT: ({result.pt.x.toFixed(2)}, {result.pt.y.toFixed(2)})</div>
                    <div>PI: ({result.pi.x.toFixed(2)}, {result.pi.y.toFixed(2)})</div>
                    <div>RP: ({result.rp.x.toFixed(2)}, {result.rp.y.toFixed(2)})</div>
                    <div>MPC: ({result.mpc.x.toFixed(2)}, {result.mpc.y.toFixed(2)})</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t">
          {result && onPlace && (
            <button
              onClick={() => { onPlace(result); onClose(); }}
              className="bg-green-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-green-700"
            >
              Place on Drawing
            </button>
          )}
          {result && (
            <button
              onClick={handleCopy}
              className="bg-gray-100 text-gray-700 rounded px-4 py-2 text-sm font-medium hover:bg-gray-200"
            >
              Copy to Clipboard
            </button>
          )}
          <button
            onClick={onClose}
            className="bg-gray-100 text-gray-700 rounded px-4 py-2 text-sm font-medium hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
