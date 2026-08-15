'use client';
// app/admin/cad/components/StakeoutCalculator.tsx
//
// C29 — station–offset and radial stakeout, two of the four capabilities C27 found genuinely
// absent when the product was measured against a standard COGO toolkit.
//
// It is also the first surface built to C28's second clause. C27 measured **one of thirteen**
// calculation surfaces reading the current selection; every other one makes the surveyor retype
// values that are already in the drawing, which is slow and is the most likely source of a
// transcription error in a deliverable.
//
// Stakeout is the case where that matters most: the inputs are *the points on screen*. Typing
// twenty northings and eastings to stake twenty points would be a worse workflow than the paper
// one it replaces.

import { useMemo, useState } from 'react';

import { useSelectionStore, useDrawingStore, getSelectedFeatures } from '@/lib/cad/store';
import {
  stationOffset,
  radialStakeout,
  alignmentLength,
  type StakeoutShot,
} from '@/lib/cad/geometry/stakeout';
import { formatBearing } from '@/lib/cad/geometry/bearing';
import type { Feature, Point2D } from '@/lib/cad/types';

type Mode = 'STATION_OFFSET' | 'RADIAL';

/** A feature's single representative point, when it has one. */
function featurePoint(f: Feature): Point2D | null {
  if (f.geometry.type === 'POINT' && f.geometry.point) return f.geometry.point;
  return null;
}

/** Vertices of a feature that can act as an alignment. */
function alignmentOf(f: Feature): Point2D[] | null {
  const g = f.geometry;
  if (g.type === 'LINE' && g.start && g.end) return [g.start, g.end];
  if ((g.type === 'POLYLINE' || g.type === 'POLYGON') && g.vertices && g.vertices.length >= 2) {
    return g.vertices;
  }
  return null;
}

/** A point's number or name, falling back to a short id — a stakeout list of `f8a92c…` is not one
 *  a crew can call over the radio. */
function labelOf(f: Feature): string {
  const p = f.properties;
  const n = p.pointName ?? p.pointNo ?? p.name ?? p.description;
  return typeof n === 'string' && n.trim() ? n.trim() : `#${f.id.slice(0, 6)}`;
}

const cell = 'px-1.5 py-0.5 text-[11px]';

export default function StakeoutCalculator() {
  const [mode, setMode] = useState<Mode>('STATION_OFFSET');
  // Subscribing to the id set is what makes this live: change the selection on the canvas and the
  // answer updates, rather than showing whatever was selected when the modal opened.
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const featuresRef = useDrawingStore((s) => s.document.features);

  const selection = useMemo(
    () => getSelectedFeatures(),
    // Both deps are INVALIDATION SIGNALS, not values read inside — `getSelectedFeatures()` reads
    // both stores imperatively, which the lint rule cannot see through, so it calls them
    // unnecessary. They are the opposite: without `selectedIds` the list freezes at whatever was
    // selected when the modal opened, and without `featuresRef` moving a staked point would not
    // change its distance. The store rebuilds `document.features` immutably on every write, so
    // that reference is exactly the signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, featuresRef],
  );

  const alignments = selection.map((f) => ({ f, pts: alignmentOf(f) })).filter((x) => x.pts);
  const points = selection.map((f) => ({ f, p: featurePoint(f) })).filter((x) => x.p);

  const result = useMemo(() => {
    if (mode === 'STATION_OFFSET') {
      const align = alignments[0];
      if (!align || points.length === 0) return null;
      const rows = points
        .map(({ f, p }) => ({ label: labelOf(f), so: stationOffset(align.pts!, p!) }))
        .filter((r) => r.so);
      return { kind: 'STATION_OFFSET' as const, alignment: align, rows };
    }
    // Radial: the first two selected points are the setup and the backsight, the rest are targets.
    // Stated in the UI rather than inferred silently — a surveyor who does not know the order would
    // get a plausible list of wrong numbers.
    if (points.length < 3) return null;
    const [setup, backsight, ...targets] = points;
    return {
      kind: 'RADIAL' as const,
      setup,
      backsight,
      shots: radialStakeout(setup.p!, backsight.p!, targets.map(({ f, p }) => ({ id: labelOf(f), point: p! }))),
    };
  }, [mode, alignments, points]);

  return (
    <div className="p-3 space-y-2.5 text-gray-200" data-testid="stakeout-calculator">
      <div className="flex gap-1">
        <button
          className={`flex-1 h-7 rounded text-[11px] border transition-colors ${mode === 'STATION_OFFSET' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-300 hover:text-white'}`}
          onClick={() => setMode('STATION_OFFSET')}
        >
          Station &amp; offset
        </button>
        <button
          className={`flex-1 h-7 rounded text-[11px] border transition-colors ${mode === 'RADIAL' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-300 hover:text-white'}`}
          onClick={() => setMode('RADIAL')}
        >
          Radial stakeout
        </button>
      </div>

      <p className="text-[10px] text-gray-500 leading-snug">
        {mode === 'STATION_OFFSET'
          ? 'Select a line or polyline as the alignment, plus the points to station. Reads the live selection.'
          : 'Select points: the first is the setup, the second the backsight, the rest are the shots.'}
      </p>

      {!result ? (
        <p className="text-[11px] text-amber-300" data-testid="stakeout-blocked">
          {/* Named, per the C16 rule — a table that is simply empty makes the surveyor wonder
              whether the calculation failed or their selection was wrong. */}
          {mode === 'STATION_OFFSET'
            ? `Select an alignment and at least one point. Currently ${alignments.length} alignment${alignments.length === 1 ? '' : 's'} and ${points.length} point${points.length === 1 ? '' : 's'}.`
            : `Select at least three points — setup, backsight, then targets. Currently ${points.length}.`}
        </p>
      ) : result.kind === 'STATION_OFFSET' ? (
        <>
          <p className="text-[10px] text-gray-400">
            Alignment: {labelOf(result.alignment.f)} · {alignmentLength(result.alignment.pts!).toFixed(3)} ft
          </p>
          <div className="overflow-x-auto rounded border border-gray-700">
            <table className="w-full">
              <thead className="bg-gray-800 text-gray-400">
                <tr><th className={`${cell} text-left`}>Point</th><th className={`${cell} text-right`}>Station</th><th className={`${cell} text-right`}>Offset</th><th className={`${cell} text-left`}>Side</th></tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.label} className="border-t border-gray-700">
                    <td className={cell}>{r.label}</td>
                    <td className={`${cell} text-right font-mono`}>{r.so!.station.toFixed(3)}</td>
                    {/* Absolute value beside the side, because "12.000 LEFT" is how it is called
                        out; the signed number lives in the model where the maths needs it. */}
                    <td className={`${cell} text-right font-mono`}>{Math.abs(r.so!.offset).toFixed(3)}</td>
                    <td className={cell}>{r.so!.side}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <p className="text-[10px] text-gray-400">
            Setup {labelOf(result.setup.f)} · backsight {labelOf(result.backsight.f)}
          </p>
          <div className="overflow-x-auto rounded border border-gray-700">
            <table className="w-full">
              <thead className="bg-gray-800 text-gray-400">
                <tr><th className={`${cell} text-left`}>Point</th><th className={`${cell} text-right`}>Angle right</th><th className={`${cell} text-right`}>Distance</th><th className={`${cell} text-left`}>Bearing</th></tr>
              </thead>
              <tbody>
                {result.shots.map((s: StakeoutShot) => (
                  <tr key={s.id} className="border-t border-gray-700">
                    <td className={cell}>{s.id}</td>
                    <td className={`${cell} text-right font-mono`}>{s.angleRight.toFixed(4)}°</td>
                    <td className={`${cell} text-right font-mono`}>{s.distance.toFixed(3)}</td>
                    <td className={cell}>{formatBearing(s.azimuth)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
