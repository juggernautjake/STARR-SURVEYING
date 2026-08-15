'use client';
// app/admin/cad/components/PartitionCalculator.tsx
//
// C29 — "cut me one acre off the north end".
//
// C27 called this "the classic reason a surveyor opens a calculator at all" and found nothing in
// the product that could do it. Answering it by hand means guessing a line, computing the area, and
// guessing again.
//
// Reads the selected polygon (C28's second clause) and writes the cut line back as real geometry,
// because a partition whose answer is a number on a screen still leaves the surveyor to draw the
// line — and drawing it by eye is the step that loses the precision the calculation just produced.

import { useMemo, useState } from 'react';

import {
  useSelectionStore, useDrawingStore, useUndoStore, getSelectedFeatures, makeAddFeatureEntry,
} from '@/lib/cad/store';
import { partitionByDirection, partitionFromHinge, polygonArea } from '@/lib/cad/geometry/partition';
import { DEFAULT_FEATURE_STYLE } from '@/lib/cad/constants';
import { generateId } from '@/lib/cad/types';
import type { Feature, Point2D } from '@/lib/cad/types';

type Mode = 'DIRECTION' | 'HINGE';
type Unit = 'SQFT' | 'ACRES';

const SQFT_PER_ACRE = 43560;

function ringOf(f: Feature): Point2D[] | null {
  const g = f.geometry;
  if (g.type === 'POLYGON' && g.vertices && g.vertices.length >= 3) return g.vertices;
  // A closed polyline is a parcel too — plenty of imported linework never gets typed as POLYGON.
  if (g.type === 'POLYLINE' && g.vertices && g.vertices.length >= 4) {
    const a = g.vertices[0];
    const b = g.vertices[g.vertices.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-6) return g.vertices.slice(0, -1);
  }
  return null;
}

const field =
  'w-full bg-gray-800 border border-gray-600 text-white text-xs rounded px-2 py-1 outline-none focus:border-blue-500';
const lbl = 'block text-[10px] uppercase tracking-wide text-gray-400 mb-0.5';

export default function PartitionCalculator() {
  const [mode, setMode] = useState<Mode>('DIRECTION');
  const [unit, setUnit] = useState<Unit>('ACRES');
  const [target, setTarget] = useState('1');
  const [bearing, setBearing] = useState('90');
  const [placed, setPlaced] = useState<string | null>(null);

  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const featuresRef = useDrawingStore((s) => s.document.features);
  const selection = useMemo(
    () => getSelectedFeatures(),
    // Invalidation signals, not values read inside — see StakeoutCalculator for the full note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, featuresRef],
  );

  const parcels = selection.map((f) => ({ f, ring: ringOf(f) })).filter((x) => x.ring);
  const points = selection
    .map((f) => (f.geometry.type === 'POINT' ? f.geometry.point : null))
    .filter((p): p is Point2D => !!p);

  const parcel = parcels[0] ?? null;
  const totalSqft = parcel ? polygonArea(parcel.ring!) : 0;

  const result = useMemo(() => {
    if (!parcel) return null;
    const n = Number(target);
    if (!Number.isFinite(n) || n <= 0) return null;
    const sqft = unit === 'ACRES' ? n * SQFT_PER_ACRE : n;
    if (mode === 'HINGE') {
      if (points.length === 0) return null;
      return partitionFromHinge(parcel.ring!, points[0], sqft);
    }
    const b = Number(bearing);
    if (!Number.isFinite(b)) return null;
    return partitionByDirection(parcel.ring!, sqft, b);
  }, [parcel, target, unit, mode, bearing, points]);

  function place() {
    if (!result) return;
    const layerId = useDrawingStore.getState().activeLayerId;
    const feature: Feature = {
      id: generateId(),
      type: 'LINE',
      geometry: { type: 'LINE', start: result.cutLine[0], end: result.cutLine[1] },
      layerId,
      style: { ...DEFAULT_FEATURE_STYLE },
      properties: {
        calcSource: 'PARTITION',
        // The ACHIEVED area, not the requested one. A cut line labelled with the number that was
        // asked for is the failure mode this whole calculation exists to avoid.
        calcAreaSqft: Math.round(result.achievedArea * 1000) / 1000,
        calcAreaAcres: Math.round((result.achievedArea / SQFT_PER_ACRE) * 100000) / 100000,
        calcMode: mode,
      },
    };
    useDrawingStore.getState().addFeature(feature);
    useUndoStore.getState().pushUndo(makeAddFeatureEntry(feature));
    setPlaced('Cut line placed on the active layer.');
  }

  return (
    <div className="p-3 space-y-2.5 text-gray-200" data-testid="partition-calculator">
      <div className="flex gap-1">
        <button
          className={`flex-1 h-7 rounded text-[11px] border transition-colors ${mode === 'DIRECTION' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-300 hover:text-white'}`}
          onClick={() => { setMode('DIRECTION'); setPlaced(null); }}
        >
          By bearing
        </button>
        <button
          className={`flex-1 h-7 rounded text-[11px] border transition-colors ${mode === 'HINGE' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-300 hover:text-white'}`}
          onClick={() => { setMode('HINGE'); setPlaced(null); }}
        >
          Hinged at a point
        </button>
      </div>

      <p className="text-[10px] text-gray-500 leading-snug">
        {mode === 'DIRECTION'
          ? 'Select the parcel. The cut runs on the bearing you give; the kept piece is to its left.'
          : 'Select the parcel and one point. The cut passes through that point — pick a monument a crew can find.'}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className={lbl}>Area to cut off</span>
          <input className={field} value={target} inputMode="decimal"
            onChange={(e) => { setTarget(e.target.value); setPlaced(null); }} />
        </label>
        <label className="block">
          <span className={lbl}>Units</span>
          <select className={field} value={unit} onChange={(e) => { setUnit(e.target.value as Unit); setPlaced(null); }}>
            <option value="ACRES">acres</option>
            <option value="SQFT">sq ft</option>
          </select>
        </label>
        {mode === 'DIRECTION' && (
          <label className="block col-span-2">
            <span className={lbl}>Cut bearing (° azimuth)</span>
            <input className={field} value={bearing} inputMode="decimal"
              onChange={(e) => { setBearing(e.target.value); setPlaced(null); }} />
          </label>
        )}
      </div>

      {parcel && (
        <p className="text-[10px] text-gray-400">
          Parcel: {totalSqft.toFixed(2)} sq ft · {(totalSqft / SQFT_PER_ACRE).toFixed(4)} acres
        </p>
      )}

      {result ? (
        <div className="rounded border border-gray-700 bg-gray-900/70 p-2 space-y-1" data-testid="partition-result">
          <Row k="Area achieved" v={`${result.achievedArea.toFixed(3)} sq ft · ${(result.achievedArea / SQFT_PER_ACRE).toFixed(5)} ac`} />
          {/* The miss, always shown. A partition that reports the target back is useless for the
              one thing it exists for. */}
          <Row k="Difference" v={`${result.error >= 0 ? '+' : ''}${result.error.toFixed(6)} sq ft`} />
          <Row k="Remainder" v={`${(totalSqft - result.achievedArea).toFixed(3)} sq ft`} />
        </div>
      ) : (
        <p className="text-[11px] text-amber-300" data-testid="partition-blocked">
          {!parcel
            ? 'Select a closed parcel — a polygon, or a polyline that closes on itself.'
            : mode === 'HINGE' && points.length === 0
              ? 'Select a point for the cut to pass through.'
              : `Enter an area greater than zero and smaller than the parcel (${(totalSqft / SQFT_PER_ACRE).toFixed(4)} ac).`}
        </p>
      )}

      <button
        className="w-full h-8 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-medium transition-colors"
        onClick={place}
        disabled={!result}
        data-testid="partition-place"
        title={result ? 'Draw the cut line on the active layer' : 'Solve it first'}
      >
        Place cut line
      </button>
      {placed && <p className="text-[11px] text-green-300">{placed}</p>}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[11px]">
      <span className="text-gray-500 shrink-0">{k}</span>
      <span className="font-mono text-gray-200 truncate">{v}</span>
    </div>
  );
}
