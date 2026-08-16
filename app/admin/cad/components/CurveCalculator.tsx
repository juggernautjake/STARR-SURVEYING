// app/admin/cad/components/CurveCalculator.tsx
'use client';

import React, { useState, useCallback, useMemo } from 'react';
import ModalFrame from '@/app/admin/components/ui/ModalFrame';
import { computeCurve, crossValidateCurve } from '@/lib/cad/geometry/curve';
import type { CurveInput } from '@/lib/cad/geometry/curve';
import type { CurveParameters } from '@/lib/cad/types';
import { useSelectionStore, useDrawingStore, getSelectedFeatures } from '@/lib/cad/store';
import { selectedPoints } from '@/lib/cad/ai/selection-points';

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

// ── C29's remaining gap, and a broken method underneath it ──────────────────────────────────────
//
// C27 measured 1 of 13 calculation surfaces reading the selection, and C29 carried the rest forward
// as "twelve separate pieces of work". Auditing this one first found something worse than a missing
// convenience: **the 3-point method has never been usable.**
//
// `THREE_POINT` is in the dropdown, `computeCurve` implements it completely (`circleThrough3Points`
// at curve.ts:94), and the form has **no fields for the three points at all** — no state, no
// inputs, and `compute()` never sets `point1`/`point2`/`point3`. Choosing it hides the R and
// Direction fields, leaves nothing behind, and Compute answers *"Insufficient input — provide at
// least R and one other parameter"*, which is advice for a method that does not take R.
//
// The same class of error C29 recorded for "Place on drawing": present in the signature, absent
// from the running product, and invisible to type-reading.
//
// The fix and the carried gap are the same work, which is the argument for doing it here. Three
// points typed as six coordinates is exactly the data a surveyor already has ON the drawing —
// three shots — so the selection is not a shortcut for this method, it is the natural input.
//
// ── ORDER IS PART OF THE INPUT ──────────────────────────────────────────────────────────────────
//
// PC, a point along the arc, PT. `selectedIds` is a Set, and a Set preserves INSERTION order, so
// the order is the order the surveyor clicked. That is meaningful and is stated in the UI, because
// the alternative — sorting by anything — would silently pick a curve through the same three points
// in a different direction and be indistinguishable from the right answer at a glance.

// The POINT extraction is `lib/cad/ai/selection-points.ts`, not a local copy. Its own header
// records why: an inline `.position` typo — the real field is `geometry.point` — shipped past the
// solver unit tests and only appeared at runtime. Writing it again here would be a second chance
// to make the same mistake, and this surface would have been the third caller to do so.

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

  // Both deps are INVALIDATION SIGNALS, not values read inside — the C29c note applies unchanged.
  // Without `selectedIds` the list freezes at whatever was selected when the modal opened; without
  // `featuresRef` dragging one of the three points would not change the curve it solves.
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const featuresRef = useDrawingStore((s) => s.document.features);
  const points = useMemo(
    () => selectedPoints(getSelectedFeatures()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, featuresRef],
  );

  const compute = useCallback(() => {
    setError(null);
    setValidationMsg(null);
    setResult(null);

    try {
      const input: CurveInput = { direction };

      if (method === 'THREE_POINT') {
        // Refused with the count rather than a generic complaint. "Select exactly three points"
        // when two are selected leaves the surveyor checking whether the tool can see the
        // selection at all; naming what it can see answers that in the same sentence.
        if (points.length !== 3) {
          setError(
            points.length === 0
              ? 'Select three points on the drawing — the PC, a point along the arc, and the PT — then Compute.'
              : `Three points are needed and ${points.length} ${points.length === 1 ? 'is' : 'are'} selected. Click the PC, a point along the arc, then the PT.`,
          );
          return;
        }
        input.point1 = points[0].point;
        input.point2 = points[1].point;
        input.point3 = points[2].point;
        // Direction is DERIVED from the three points here, not taken from the radio buttons —
        // which is why those are hidden for this method. A curve through three known positions
        // already has a direction, and letting a stale radio override it would draw the major arc
        // through the same three points: a 300-foot error that still looks like a curve.
      }

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
        setError(
          method === 'THREE_POINT'
            // The engine returns null when the three points are collinear — no circle passes
            // through them. Saying "insufficient input" there would be false: the input is
            // complete and the geometry is impossible, and only one of those is worth re-checking.
            ? 'Those three points lie on a straight line, so no arc passes through them.'
            : 'Insufficient input — provide at least R and one other parameter.',
        );
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
  }, [R, delta, L, C, T, E, M, direction, tangentIn, tangentOut, method, points]);

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
    <ModalFrame
      open
      onClose={onClose}
      title="Curve Calculator"
      bodyClassName="bg-white text-gray-900"
      initialWidth={720}
      initialHeight={620}
      minWidth={460}
      minHeight={360}
    >
      <div>
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

              {/* C29 — the 3-point method reads the live selection.
                  Shown rather than assumed: a calculator that silently consumes whatever happens
                  to be selected is one a surveyor cannot check, and the ROLE of each point (which
                  is the PC and which the PT) changes the answer, so each row is labelled. */}
              {method === 'THREE_POINT' && (
                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    Points — click three on the drawing, in order
                  </label>
                  {points.length === 0 ? (
                    <p className="text-xs text-gray-500 border border-dashed border-gray-300 rounded px-2 py-3">
                      Nothing selected. Click the PC, then a point along the arc, then the PT.
                    </p>
                  ) : (
                    <ol className="text-xs border border-gray-200 rounded divide-y divide-gray-100">
                      {points.slice(0, 3).map((sp, i) => (
                        <li key={sp.id} className="px-2 py-1 flex justify-between gap-2">
                          <span className="text-gray-500">
                            {['PC', 'Along arc', 'PT'][i]}
                            {/* The point's own name, when it has one. A surveyor checking the
                                answer recognises "CP-14", not a pair of coordinates. */}
                            <span className="ml-1 text-gray-400">{sp.name}</span>
                          </span>
                          <span className="font-mono text-gray-800">
                            {sp.point.x.toFixed(2)}, {sp.point.y.toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {points.length > 3 && (
                    // Not silently truncated: taking the first three of five and solving would
                    // answer a question the surveyor did not ask, and look right doing it.
                    <p className="text-xs text-amber-700 mt-1" role="alert">
                      {points.length} points selected — exactly three are needed.
                    </p>
                  )}
                </div>
              )}

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
    </ModalFrame>
  );
}
