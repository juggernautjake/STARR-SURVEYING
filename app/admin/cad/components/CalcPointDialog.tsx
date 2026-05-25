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
import { buildSolverPointProposal } from '@/lib/cad/ai/solver-proposal';
import { selectedPoints } from '@/lib/cad/ai/selection-points';

type Method = 'FOURTH_CORNER' | 'BEARING_DISTANCE' | 'TWO_BEARINGS' | 'PARALLEL';

interface Props { onClose: () => void }

export default function CalcPointDialog({ onClose }: Props): React.ReactElement {
  const [method, setMethod] = useState<Method>('FOURTH_CORNER');
  const [bearingA, setBearingA] = useState('');
  const [bearingB, setBearingB] = useState('');
  const [distance, setDistance] = useState('');
  const [perpDistance, setPerpDistance] = useState('');
  const [alongDistance, setAlongDistance] = useState('');
  const [side, setSide] = useState<'LEFT' | 'RIGHT'>('RIGHT');
  const [code, setCode] = useState('CALC');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Point2D | null>(null);

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
    FOURTH_CORNER: 3,
    BEARING_DISTANCE: 1,
    TWO_BEARINGS: 2,
    PARALLEL: 3, // origin + refStart + refEnd
  };
  const have = points.length;
  const need = requiredPoints[method];
  const enough = have >= need;

  function compute(): void {
    setError(null);
    setResult(null);
    let r: SolverResult | null = null;
    try {
      if (method === 'FOURTH_CORNER') {
        if (have < 3) return setError('Select three POINT features first (Adjacent, Opposite, Adjacent).');
        const [p1, p2, p3] = points;
        r = calcFourthParallelogramCorner(p1.point, p2.point, p3.point);
      } else if (method === 'BEARING_DISTANCE') {
        if (have < 1) return setError('Select one origin POINT first.');
        const dist = parseFloat(distance);
        const bear = parseFloat(bearingA);
        if (!Number.isFinite(dist) || dist <= 0) return setError('Enter a positive distance.');
        if (!Number.isFinite(bear)) return setError('Enter a numeric bearing (azimuth in degrees, 0=N).');
        r = calcPointFromBearingDistance(points[0].point, bear, dist);
      } else if (method === 'TWO_BEARINGS') {
        if (have < 2) return setError('Select two origin POINTs (originA, originB).');
        const bA = parseFloat(bearingA);
        const bB = parseFloat(bearingB);
        if (!Number.isFinite(bA) || !Number.isFinite(bB)) return setError('Enter both bearings as numeric azimuths.');
        r = calcPointFromTwoBearings(points[0].point, bA, points[1].point, bB);
      } else if (method === 'PARALLEL') {
        if (have < 3) return setError('Select three POINTs: origin, refStart, refEnd.');
        const pd = parseFloat(perpDistance);
        if (!Number.isFinite(pd)) return setError('Enter a perpendicular distance.');
        const ad = alongDistance.trim() === '' ? 0 : parseFloat(alongDistance);
        if (!Number.isFinite(ad)) return setError('Along-distance must be numeric or blank.');
        r = calcPointParallelToLine(points[0].point, points[1].point, points[2].point, pd, side, ad);
      }
    } catch (e) {
      return setError(e instanceof Error ? e.message : 'Solver threw an unexpected error.');
    }
    if (!r) return setError('Method not implemented.');
    if (!r.ok) return setError(r.reason);
    setResult(r.point);
  }

  function suggest(): void {
    if (!result) return;
    const label =
      method === 'FOURTH_CORNER' ? 'Calc 4th corner'
      : method === 'BEARING_DISTANCE' ? 'Calc from bearing+distance'
      : method === 'TWO_BEARINGS' ? 'Calc from two bearings'
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
              onChange={(e) => { setMethod(e.target.value as Method); setResult(null); setError(null); }}
              className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800"
              data-testid="calc-point-method"
            >
              <option value="FOURTH_CORNER">4th corner of parallelogram (3 selected points)</option>
              <option value="BEARING_DISTANCE">Bearing + distance from a point (1 selected)</option>
              <option value="TWO_BEARINGS">Intersect of two bearings (2 selected)</option>
              <option value="PARALLEL">Parallel offset from a line (3 selected: origin, refStart, refEnd)</option>
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
          {method === 'BEARING_DISTANCE' && (
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="text-gray-600 dark:text-gray-300">Bearing (azimuth °, 0=N)</span>
                <input value={bearingA} onChange={(e) => setBearingA(e.target.value)} className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800" inputMode="decimal" data-testid="calc-point-bearing" />
              </label>
              <label>
                <span className="text-gray-600 dark:text-gray-300">Distance</span>
                <input value={distance} onChange={(e) => setDistance(e.target.value)} className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800" inputMode="decimal" data-testid="calc-point-distance" />
              </label>
            </div>
          )}

          {method === 'TWO_BEARINGS' && (
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="text-gray-600 dark:text-gray-300">Bearing A (°)</span>
                <input value={bearingA} onChange={(e) => setBearingA(e.target.value)} className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800" inputMode="decimal" />
              </label>
              <label>
                <span className="text-gray-600 dark:text-gray-300">Bearing B (°)</span>
                <input value={bearingB} onChange={(e) => setBearingB(e.target.value)} className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800" inputMode="decimal" />
              </label>
            </div>
          )}

          {method === 'PARALLEL' && (
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="text-gray-600 dark:text-gray-300">Perp distance</span>
                <input value={perpDistance} onChange={(e) => setPerpDistance(e.target.value)} className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800" inputMode="decimal" />
              </label>
              <label>
                <span className="text-gray-600 dark:text-gray-300">Along distance (optional)</span>
                <input value={alongDistance} onChange={(e) => setAlongDistance(e.target.value)} className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800" inputMode="decimal" />
              </label>
              <label className="col-span-2">
                <span className="text-gray-600 dark:text-gray-300">Side (relative to refStart→refEnd direction)</span>
                <select value={side} onChange={(e) => setSide(e.target.value as 'LEFT' | 'RIGHT')} className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800">
                  <option value="RIGHT">Right</option>
                  <option value="LEFT">Left</option>
                </select>
              </label>
            </div>
          )}

          <label className="block">
            <span className="text-gray-600 dark:text-gray-300">Code (optional, defaults to CALC)</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800" />
          </label>

          {error && (
            <div className="rounded border border-red-500 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-200 px-2 py-1" role="alert">
              {error}
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
