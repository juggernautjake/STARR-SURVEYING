'use client';
// app/admin/cad/components/GradeCalculator.tsx
//
// C29 — slope, grade and vertical curves, the third of the four capabilities C27 found genuinely
// absent when the product was measured against a standard COGO toolkit.
//
// The grade half reads the selection (C28's second clause): two shots with elevations are already
// on the drawing, and asking the surveyor to retype four numbers to learn the grade between them is
// the transcription error this whole run of slices has been removing.
//
// The vertical-curve half cannot read a selection, because a PVI station and two design grades are
// not things the drawing holds — they are what the road is being designed TO. Typed input there is
// the honest answer rather than a gap.

import { useMemo, useState } from 'react';

import { useSelectionStore, useDrawingStore, getSelectedFeatures } from '@/lib/cad/store';
import {
  gradeBetween,
  verticalCurve,
  verticalCurveTable,
} from '@/lib/cad/geometry/grade';
import type { Feature, Point2D } from '@/lib/cad/types';

type Mode = 'GRADE' | 'VERTICAL_CURVE';

/** A point with whatever elevation it carries. Elevation lives in `properties`, and a point without
 *  one is not usable here — reporting a grade against an assumed 0 would be a confident lie. */
function shotOf(f: Feature): { point: Point2D; elev: number; label: string } | null {
  if (f.geometry.type !== 'POINT' || !f.geometry.point) return null;
  const raw = f.properties.elevation ?? f.properties.z;
  const elev = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(elev)) return null;
  const n = f.properties.pointName ?? f.properties.pointNo ?? f.properties.name;
  return {
    point: f.geometry.point,
    elev,
    label: typeof n === 'string' && n.trim() ? n.trim() : `#${f.id.slice(0, 6)}`,
  };
}

const field =
  'w-full bg-gray-800 border border-gray-600 text-white text-xs rounded px-2 py-1 outline-none focus:border-blue-500';
const lbl = 'block text-[10px] uppercase tracking-wide text-gray-400 mb-0.5';
const cell = 'px-1.5 py-0.5 text-[11px]';

export default function GradeCalculator() {
  const [mode, setMode] = useState<Mode>('GRADE');
  const [pviSta, setPviSta] = useState('1000');
  const [pviElev, setPviElev] = useState('250');
  const [gIn, setGIn] = useState('3');
  const [gOut, setGOut] = useState('-2');
  const [len, setLen] = useState('400');
  const [tableInterval, setTableInterval] = useState('50');

  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const featuresRef = useDrawingStore((s) => s.document.features);
  const shots = useMemo(
    () => getSelectedFeatures().map(shotOf).filter((s): s is NonNullable<typeof s> => !!s),
    // Invalidation signals, not values read inside — see StakeoutCalculator for the full note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, featuresRef],
  );

  const grade = useMemo(() => {
    if (shots.length < 2) return null;
    const g = gradeBetween(shots[0].point, shots[1].point, shots[0].elev, shots[1].elev);
    return g ? { g, from: shots[0], to: shots[1] } : null;
  }, [shots]);

  const curve = useMemo(() => {
    const s = Number(pviSta), e = Number(pviElev), a = Number(gIn), b = Number(gOut), l = Number(len);
    if (![s, e, a, b, l].every(Number.isFinite)) return null;
    const c = verticalCurve(s, e, a, b, l);
    if (!c) return null;
    const iv = Number(tableInterval);
    return { c, rows: verticalCurveTable(c, Number.isFinite(iv) && iv > 0 ? iv : 50) };
  }, [pviSta, pviElev, gIn, gOut, len, tableInterval]);

  return (
    <div className="p-3 space-y-2.5 text-gray-200" data-testid="grade-calculator">
      <div className="flex gap-1">
        <button
          className={`flex-1 h-7 rounded text-[11px] border transition-colors ${mode === 'GRADE' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-300 hover:text-white'}`}
          onClick={() => setMode('GRADE')}
        >
          Grade &amp; slope
        </button>
        <button
          className={`flex-1 h-7 rounded text-[11px] border transition-colors ${mode === 'VERTICAL_CURVE' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-300 hover:text-white'}`}
          onClick={() => setMode('VERTICAL_CURVE')}
        >
          Vertical curve
        </button>
      </div>

      {mode === 'GRADE' ? (
        <>
          <p className="text-[10px] text-gray-500 leading-snug">
            Select two points that carry elevations. Reads the live selection.
          </p>
          {grade ? (
            <div className="rounded border border-gray-700 bg-gray-900/70 p-2 space-y-1" data-testid="grade-result">
              <Row k="From → to" v={`${grade.from.label} → ${grade.to.label}`} />
              <Row k="Run (horizontal)" v={`${grade.g.run.toFixed(3)} ft`} />
              <Row k="Rise" v={`${grade.g.rise >= 0 ? '+' : ''}${grade.g.rise.toFixed(3)} ft`} />
              {/* Percent first, because that is the unit every other number here is in. */}
              <Row k="Grade" v={`${grade.g.gradePercent >= 0 ? '+' : ''}${grade.g.gradePercent.toFixed(4)} %`} />
              <Row k="Ratio" v={grade.g.ratio === null ? 'level' : `1 in ${grade.g.ratio.toFixed(3)}`} />
              <Row k="Vertical angle" v={`${grade.g.verticalAngleDeg.toFixed(4)}°`} />
              {/* Slope distance is what a tape measures; run is what a plan shows. Confusing them
                  is a real field error on steep ground, so both are shown. */}
              <Row k="Slope distance" v={`${grade.g.slopeDistance.toFixed(3)} ft`} />
            </div>
          ) : (
            <p className="text-[11px] text-amber-300" data-testid="grade-blocked">
              {/* Names which of the two possible shortfalls it is — the C16 rule. A point with no
                  elevation is the common one, and it is invisible from the selection count. */}
              Select two points with elevations. Currently {shots.length} usable
              {shots.length === 1 ? ' point' : ' points'}.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-[10px] text-gray-500 leading-snug">
            Equal-tangent parabola. A PVI and two design grades are not things the drawing holds, so
            these are typed.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className={lbl}>PVI station</span>
              <input className={field} value={pviSta} onChange={(e) => setPviSta(e.target.value)} inputMode="decimal" /></label>
            <label className="block"><span className={lbl}>PVI elevation</span>
              <input className={field} value={pviElev} onChange={(e) => setPviElev(e.target.value)} inputMode="decimal" /></label>
            <label className="block"><span className={lbl}>Grade in (%)</span>
              <input className={field} value={gIn} onChange={(e) => setGIn(e.target.value)} inputMode="decimal" /></label>
            <label className="block"><span className={lbl}>Grade out (%)</span>
              <input className={field} value={gOut} onChange={(e) => setGOut(e.target.value)} inputMode="decimal" /></label>
            <label className="block"><span className={lbl}>Curve length</span>
              <input className={field} value={len} onChange={(e) => setLen(e.target.value)} inputMode="decimal" /></label>
            <label className="block"><span className={lbl}>Table interval</span>
              <input className={field} value={tableInterval} onChange={(e) => setTableInterval(e.target.value)} inputMode="decimal" /></label>
          </div>

          {curve ? (
            <>
              <div className="rounded border border-gray-700 bg-gray-900/70 p-2 space-y-1" data-testid="vcurve-result">
                <Row k="Shape" v={curve.c.shape === 'NONE' ? 'no grade change' : curve.c.shape.toLowerCase()} />
                <Row k="A (algebraic diff.)" v={`${curve.c.a >= 0 ? '+' : ''}${curve.c.a.toFixed(4)} %`} />
                <Row k="K" v={curve.c.k === null ? '—' : curve.c.k.toFixed(3)} />
                <Row k="BVC" v={`${curve.c.bvcStation.toFixed(3)} @ ${curve.c.bvcElevation.toFixed(3)}`} />
                <Row k="EVC" v={`${curve.c.evcStation.toFixed(3)} @ ${curve.c.evcElevation.toFixed(3)}`} />
                <Row
                  k={curve.c.shape === 'SAG' ? 'Low point' : 'High point'}
                  v={curve.c.turningStation === null
                    // Said in words rather than a dash: two grades of the same sign never turn
                    // over, and an empty cell reads like the calculation failed.
                    ? 'none — the grades do not reverse'
                    : `${curve.c.turningStation.toFixed(3)} @ ${curve.c.turningElevation!.toFixed(3)}`}
                />
              </div>
              <div className="max-h-48 overflow-y-auto rounded border border-gray-700">
                <table className="w-full">
                  <thead className="sticky top-0 bg-gray-800 text-gray-400">
                    <tr><th className={`${cell} text-left`}>Station</th><th className={`${cell} text-right`}>Elevation</th><th className={`${cell} text-left`}>Note</th></tr>
                  </thead>
                  <tbody>
                    {curve.rows.map((r) => (
                      <tr key={r.station} className="border-t border-gray-700">
                        <td className={`${cell} font-mono`}>{r.station.toFixed(2)}</td>
                        <td className={`${cell} text-right font-mono`}>{r.elevation.toFixed(3)}</td>
                        <td className={`${cell} text-gray-400`}>{r.note ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-[11px] text-amber-300" data-testid="vcurve-blocked">
              Enter a PVI, two grades and a curve length greater than zero.
            </p>
          )}
        </>
      )}
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
