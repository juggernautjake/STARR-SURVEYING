'use client';
// app/admin/cad/components/CalcPointDialog.tsx
//
// CAD_POINTS_AND_AI slice D — "Calc Point" dialogue. Opens via the
// `cad:openCalcPointDialog` event. The surveyor picks a method
// (4th corner / bearing+distance / two bearings / parallel offset),
// the dialogue draws point-pickers from the current selection plus
// numeric inputs for bearings/distances, then computes the result
// via the geometry-solver module. The result is enqueued through
// the CopilotCard as an addPoint proposal, which paints a dashed
// ghost. The surveyor reviews + Accept (commit) or Skip (clear) —
// no point lands in the drawing until Accept.
//
// Use case the user described:
// "I shot a point on this corner, but couldn't get a shot on the
//  next corner that was hidden, so I got a shot further down the
//  wall and another shot on the next visible corner. The total
//  distance from the next visible corner to the corner I need is
//  12.35 ft and the wall is parallel to the two corners I did
//  shoot."  →  Method: PARALLEL.

import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Calculator } from 'lucide-react';
import ModalFrame from '@/app/admin/components/ui/ModalFrame';
import { useAIStore, useDrawingStore, useSelectionStore, getSelectedFeatures } from '@/lib/cad/store';
import type { Feature, Point2D } from '@/lib/cad/types';
import {
  calcFourthParallelogramCorner,
  calcPointFromBearingDistance,
  calcPointFromTwoBearings,
  calcPointParallelToLine,
  type SolverResult,
} from '@/lib/cad/geometry/solver';
import { computeCogoSolutions } from '@/lib/cad/geometry/cogo';
import { parseBearing } from '@/lib/cad/geometry/bearing';
import { buildSolverPointProposal } from '@/lib/cad/ai/solver-proposal';
import { selectedPoints } from '@/lib/cad/ai/selection-points';

type Method =
  | 'DIST_DIST'
  | 'BRG_DIST'
  | 'TWO_BEARINGS'
  | 'FOURTH_CORNER'
  | 'BEARING_DISTANCE'
  | 'PARALLEL';

interface Props { onClose: () => void }

export default function CalcPointDialog({ onClose }: Props): React.ReactElement {
  const [method, setMethod] = useState<Method>('DIST_DIST');
  const [bearingA, setBearingA] = useState('');
  const [bearingB, setBearingB] = useState('');
  const [distance, setDistance] = useState('');   // distance from point 1
  const [distanceB, setDistanceB] = useState(''); // distance from point 2
  const [swapBrgDist, setSwapBrgDist] = useState(false); // bearing from pt2 instead of pt1
  const [perpDistance, setPerpDistance] = useState('');
  const [alongDistance, setAlongDistance] = useState('');
  const [side, setSide] = useState<'LEFT' | 'RIGHT'>('RIGHT');
  const [code, setCode] = useState('CALC');
  const [error, setError] = useState<string | null>(null);
  // Candidate solution(s). Distance–distance and bearing–distance can yield
  // two; the surveyor picks which via selectedIdx.
  const [candidates, setCandidates] = useState<Point2D[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const result: Point2D | null = candidates[selectedIdx] ?? null;

  // Pull POINT-typed selected features. The dialogue only acts on
  // points; LINE / POLYLINE selections are ignored on purpose so
  // the surveyor doesn't pick an edge expecting a corner.
  const selectedFeatures = useSelectionStoreSelectedFeatures();
  const points = useMemo(
    () => selectedPoints(selectedFeatures),
    [selectedFeatures],
  );

  // Required point counts per method.
  const requiredPoints: Record<Method, number> = {
    DIST_DIST: 2,
    BRG_DIST: 2,
    TWO_BEARINGS: 2,
    FOURTH_CORNER: 3,
    BEARING_DISTANCE: 1,
    PARALLEL: 3, // origin + refStart + refEnd
  };
  const have = points.length;
  const need = requiredPoints[method];
  const enough = have >= need;

  function fail(msg: string): void {
    setCandidates([]);
    setSelectedIdx(0);
    setError(msg);
  }

  function succeed(pts: Point2D[]): void {
    setError(null);
    setSelectedIdx(0);
    setCandidates(pts);
  }

  function compute(): void {
    setError(null);
    setCandidates([]);
    setSelectedIdx(0);
    try {
      // ── Two-reference-point intersections (0, 1, or 2 solutions) ──────────
      if (method === 'DIST_DIST') {
        if (have < 2) return fail('Select two POINTs, then enter the distance from each to the new point.');
        const dA = parseFloat(distance);
        const dB = parseFloat(distanceB);
        if (!Number.isFinite(dA) || dA <= 0 || !Number.isFinite(dB) || dB <= 0) {
          return fail('Enter a positive distance from each point.');
        }
        const sols = computeCogoSolutions({ method: 'DIST_DIST', a: points[0].point, b: points[1].point, distA: dA, distB: dB });
        if (sols.length === 0) return fail('No solution — those distance circles don’t reach each other. Check the distances.');
        return succeed(sols);
      }
      if (method === 'BRG_DIST') {
        if (have < 2) return fail('Select two POINTs: one supplies the bearing, the other the distance.');
        const az = parseBearing(bearingA);
        const dB = parseFloat(distanceB);
        if (az === null) return fail('Enter a valid bearing (e.g. N45°30′E, 45-30-00, or 45.5).');
        if (!Number.isFinite(dB) || dB <= 0) return fail('Enter a positive distance.');
        // swapBrgDist flips which selected point carries the bearing vs distance.
        const brgPt = swapBrgDist ? points[1].point : points[0].point;
        const distPt = swapBrgDist ? points[0].point : points[1].point;
        const sols = computeCogoSolutions({ method: 'BRG_DIST', a: brgPt, b: distPt, azA: az, distB: dB });
        if (sols.length === 0) return fail('No solution — the bearing ray never reaches that distance circle. Check the bearing/distance.');
        return succeed(sols);
      }

      // ── Single-solution solvers (existing) ───────────────────────────────
      let r: SolverResult | null = null;
      if (method === 'TWO_BEARINGS') {
        if (have < 2) return fail('Select two origin POINTs (originA, originB).');
        const bA = parseBearing(bearingA);
        const bB = parseBearing(bearingB);
        if (bA === null || bB === null) return fail('Enter both bearings (e.g. N45°30′E or 45.5).');
        r = calcPointFromTwoBearings(points[0].point, bA, points[1].point, bB);
      } else if (method === 'FOURTH_CORNER') {
        if (have < 3) return fail('Select three POINT features first (Adjacent, Opposite, Adjacent).');
        const [p1, p2, p3] = points;
        r = calcFourthParallelogramCorner(p1.point, p2.point, p3.point);
      } else if (method === 'BEARING_DISTANCE') {
        if (have < 1) return fail('Select one origin POINT first.');
        const dist = parseFloat(distance);
        const bear = parseBearing(bearingA);
        if (!Number.isFinite(dist) || dist <= 0) return fail('Enter a positive distance.');
        if (bear === null) return fail('Enter a valid bearing (e.g. N45°30′E or 45.5).');
        r = calcPointFromBearingDistance(points[0].point, bear, dist);
      } else if (method === 'PARALLEL') {
        if (have < 3) return fail('Select three POINTs: origin, refStart, refEnd.');
        const pd = parseFloat(perpDistance);
        if (!Number.isFinite(pd)) return fail('Enter a perpendicular distance.');
        const ad = alongDistance.trim() === '' ? 0 : parseFloat(alongDistance);
        if (!Number.isFinite(ad)) return fail('Along-distance must be numeric or blank.');
        r = calcPointParallelToLine(points[0].point, points[1].point, points[2].point, pd, side, ad);
      } else {
        // Exhaustiveness guard: every single-solution `Method` is handled above.
        const unhandled: never = method;
        return fail(`Unsupported calc method: ${String(unhandled)}.`);
      }
      if (!r) return fail('No result — check the selected points and inputs, then try again.');
      if (!r.ok) return fail(r.reason);
      return succeed([r.point]);
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Solver threw an unexpected error.');
    }
  }

  function suggest(): void {
    if (!result) return;
    const label =
      method === 'DIST_DIST' ? 'Calc from distance–distance'
      : method === 'BRG_DIST' ? 'Calc from bearing–distance'
      : method === 'TWO_BEARINGS' ? 'Calc from two bearings'
      : method === 'FOURTH_CORNER' ? 'Calc 4th corner'
      : method === 'BEARING_DISTANCE' ? 'Calc from bearing+distance'
      : 'Calc on parallel offset';
    const proposal = buildSolverPointProposal({
      point: result,
      originLabel: label,
      code: code.trim() || undefined,
    });
    useAIStore.getState().enqueueProposal(proposal);
    onClose();
  }

  return (
    <ModalFrame
      open
      onClose={onClose}
      title={<span className="flex items-center gap-2"><Calculator size={14} className="text-blue-500" />Calc Point</span>}
      initialWidth={480}
      initialHeight={520}
      minWidth={360}
      minHeight={300}
    >
      <div className="text-gray-200">
        <div className="p-4 space-y-3 text-xs">
          {/* Method picker */}
          <label className="block">
            <span className="text-gray-600 dark:text-gray-300 font-medium">Method</span>
            <select
              value={method}
              onChange={(e) => { setMethod(e.target.value as Method); setCandidates([]); setSelectedIdx(0); setError(null); }}
              className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              data-testid="calc-point-method"
            >
              <optgroup label="From two selected points">
                <option value="DIST_DIST">Distance–distance (2 selected: dist from each)</option>
                <option value="BRG_DIST">Bearing–distance (2 selected: bearing from one, distance from the other)</option>
                <option value="TWO_BEARINGS">Bearing–bearing (2 selected: a bearing from each)</option>
              </optgroup>
              <optgroup label="Other">
                <option value="FOURTH_CORNER">4th corner of parallelogram (3 selected points)</option>
                <option value="BEARING_DISTANCE">Bearing + distance from a point (1 selected)</option>
                <option value="PARALLEL">Parallel offset from a line (3 selected: origin, refStart, refEnd)</option>
              </optgroup>
            </select>
          </label>

          {/* Selection summary */}
          <div className={`rounded border px-2 py-1 ${enough ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200' : 'border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200'}`}>
            Selected POINTs: <strong>{have}</strong> / need <strong>{need}</strong>
            {points.length > 0 && (
              <ul className="mt-1 list-disc pl-4">
                {points.slice(0, 6).map((p, i) => (
                  <li key={p.id}>
                    <span className="font-mono">{i + 1}. {p.name}</span> ({p.point.x.toFixed(2)}, {p.point.y.toFixed(2)})
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Method-specific inputs */}
          {method === 'DIST_DIST' && (
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="text-gray-600 dark:text-gray-300">Distance from {points[0]?.name ?? 'point 1'}</span>
                <input value={distance} onChange={(e) => setDistance(e.target.value)} className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" inputMode="decimal" data-testid="calc-point-dist-a" />
              </label>
              <label>
                <span className="text-gray-600 dark:text-gray-300">Distance from {points[1]?.name ?? 'point 2'}</span>
                <input value={distanceB} onChange={(e) => setDistanceB(e.target.value)} className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" inputMode="decimal" data-testid="calc-point-dist-b" />
              </label>
            </div>
          )}

          {method === 'BRG_DIST' && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                <input type="checkbox" checked={swapBrgDist} onChange={(e) => setSwapBrgDist(e.target.checked)} />
                Swap which point carries the bearing
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label>
                  <span className="text-gray-600 dark:text-gray-300">Bearing from {(swapBrgDist ? points[1]?.name : points[0]?.name) ?? (swapBrgDist ? 'point 2' : 'point 1')}</span>
                  <input value={bearingA} onChange={(e) => setBearingA(e.target.value)} placeholder="N45°30′E or 45.5" className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" data-testid="calc-point-brgdist-bearing" />
                </label>
                <label>
                  <span className="text-gray-600 dark:text-gray-300">Distance from {(swapBrgDist ? points[0]?.name : points[1]?.name) ?? (swapBrgDist ? 'point 1' : 'point 2')}</span>
                  <input value={distanceB} onChange={(e) => setDistanceB(e.target.value)} className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" inputMode="decimal" data-testid="calc-point-brgdist-distance" />
                </label>
              </div>
            </div>
          )}

          {method === 'BEARING_DISTANCE' && (
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="text-gray-600 dark:text-gray-300">Bearing (azimuth °, 0=N)</span>
                <input value={bearingA} onChange={(e) => setBearingA(e.target.value)} className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" inputMode="decimal" data-testid="calc-point-bearing" />
              </label>
              <label>
                <span className="text-gray-600 dark:text-gray-300">Distance</span>
                <input value={distance} onChange={(e) => setDistance(e.target.value)} className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" inputMode="decimal" data-testid="calc-point-distance" />
              </label>
            </div>
          )}

          {method === 'TWO_BEARINGS' && (
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="text-gray-600 dark:text-gray-300">Bearing A (°)</span>
                <input value={bearingA} onChange={(e) => setBearingA(e.target.value)} className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" inputMode="decimal" />
              </label>
              <label>
                <span className="text-gray-600 dark:text-gray-300">Bearing B (°)</span>
                <input value={bearingB} onChange={(e) => setBearingB(e.target.value)} className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" inputMode="decimal" />
              </label>
            </div>
          )}

          {method === 'PARALLEL' && (
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="text-gray-600 dark:text-gray-300">Perp distance</span>
                <input value={perpDistance} onChange={(e) => setPerpDistance(e.target.value)} className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" inputMode="decimal" />
              </label>
              <label>
                <span className="text-gray-600 dark:text-gray-300">Along distance (optional)</span>
                <input value={alongDistance} onChange={(e) => setAlongDistance(e.target.value)} className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" inputMode="decimal" />
              </label>
              <label className="col-span-2">
                <span className="text-gray-600 dark:text-gray-300">Side (relative to refStart→refEnd direction)</span>
                <select value={side} onChange={(e) => setSide(e.target.value as 'LEFT' | 'RIGHT')} className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                  <option value="RIGHT">Right</option>
                  <option value="LEFT">Left</option>
                </select>
              </label>
            </div>
          )}

          <label className="block">
            <span className="text-gray-600 dark:text-gray-300">Code (optional, defaults to CALC)</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
          </label>

          {error && (
            <div className="rounded border border-red-500 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-200 px-2 py-1" role="alert">
              {error}
            </div>
          )}

          {candidates.length > 1 && (
            <div className="rounded border border-blue-500/60 px-2 py-1.5 space-y-1" data-testid="calc-point-candidates">
              <div className="text-gray-600 dark:text-gray-300">Two solutions — pick the one you want:</div>
              <div className="flex gap-2">
                {candidates.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedIdx(i)}
                    className={`flex-1 px-2 py-1 rounded border font-mono text-left ${i === selectedIdx ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-100' : 'border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                  >
                    #{i + 1} ({c.x.toFixed(2)}, {c.y.toFixed(2)})
                  </button>
                ))}
              </div>
            </div>
          )}

          {result && (
            <div className="rounded border border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-100 px-2 py-1" data-testid="calc-point-result">
              <strong>Computed:</strong> (<span className="font-mono">{result.x.toFixed(3)}, {result.y.toFixed(3)}</span>)
              <div className="text-[10px] text-blue-600 dark:text-blue-300/80 mt-0.5">
                Click <em>Suggest</em> to render this as a ghost preview. The point is not added to the drawing until you accept it on the AI Proposal card.
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
          <button onClick={onClose} className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button onClick={compute} disabled={!enough} className="px-3 py-1.5 text-xs bg-gray-700 text-white rounded disabled:opacity-40 hover:bg-gray-600" data-testid="calc-point-compute">
              Compute
            </button>
            <button onClick={suggest} disabled={!result} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded disabled:opacity-40 hover:bg-blue-500 flex items-center gap-1" data-testid="calc-point-suggest">
              <Sparkles size={12} /> Suggest as ghost
            </button>
          </div>
        </div>
      </div>
    </ModalFrame>
  );
}

function useSelectionStoreSelectedFeatures(): Feature[] {
  // Subscribe to BOTH stores so the dialog re-renders when the user
  // changes their selection or the drawing while the dialog is open.
  const ids = useSelectionStore((s) => s.selectedIds);
  const docVersion = useDrawingStore((s) => s.document.id);
  return useMemo(() => {
    void ids; void docVersion;
    return getSelectedFeatures();
  }, [ids, docVersion]);
}

export function useOpenCalcPointDialog(setOpen: (open: boolean) => void): void {
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('cad:openCalcPointDialog', handler);
    return () => window.removeEventListener('cad:openCalcPointDialog', handler);
  }, [setOpen]);
}
