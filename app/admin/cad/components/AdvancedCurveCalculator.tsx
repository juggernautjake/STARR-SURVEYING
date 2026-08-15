'use client';
// app/admin/cad/components/AdvancedCurveCalculator.tsx
//
// C29 — the UI `compound-curve.ts` was built ahead of.
//
// C27 found three solvers — compound curve, reverse curve and clothoid spiral — that nothing
// anywhere referenced. The repo already knew: `cad-modules-are-reachable.test.ts` listed the module
// as "built ahead of a UI that can express it". This is that UI.
//
// Compound and reverse curves and spirals are ordinary road-alignment work; the maths was written,
// and until now a surveyor could not get at any of it.
//
// It places geometry, because a curve solver that only prints numbers is a calculator you could
// have brought from home — C27's whole point about what makes a calculation surface useful.

import { useMemo, useState } from 'react';

import { useDrawingStore, useUndoStore, makeBatchEntry } from '@/lib/cad/store';
import {
  computeCompoundCurve,
  computeReverseCurve,
  computeClothoidSpiral,
  spiralPolyline,
} from '@/lib/cad/geometry/compound-curve';
import { curveToFeature } from '@/lib/cad/calculators/place-curve';
import { DEFAULT_FEATURE_STYLE } from '@/lib/cad/constants';
import { generateId } from '@/lib/cad/types';
import type { Feature, UndoOperation } from '@/lib/cad/types';

type Mode = 'COMPOUND' | 'REVERSE' | 'SPIRAL';

const MODES: ReadonlyArray<{ id: Mode; label: string; hint: string }> = [
  { id: 'COMPOUND', label: 'Compound', hint: 'Two curves turning the same way, tangent at the PCC.' },
  { id: 'REVERSE',  label: 'Reverse',  hint: 'Two curves turning opposite ways, tangent at the PRC.' },
  { id: 'SPIRAL',   label: 'Spiral',   hint: 'Clothoid easement from the tangent into a curve.' },
];

/** Blank and unparseable both mean "not entered yet", which is not the same as zero. */
function num(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const field =
  'w-full bg-gray-800 border border-gray-600 text-white text-xs rounded px-2 py-1 outline-none focus:border-blue-500';
const lbl = 'block text-[10px] uppercase tracking-wide text-gray-400 mb-0.5';

export default function AdvancedCurveCalculator() {
  const [mode, setMode] = useState<Mode>('COMPOUND');
  const [r1, setR1] = useState('300');
  const [d1, setD1] = useState('30');
  const [r2, setR2] = useState('150');
  const [d2, setD2] = useState('40');
  const [len, setLen] = useState('100');
  const [dir, setDir] = useState<'LEFT' | 'RIGHT'>('RIGHT');
  const [pcx, setPcx] = useState('0');
  const [pcy, setPcy] = useState('0');
  const [brg, setBrg] = useState('0');
  const [placed, setPlaced] = useState<string | null>(null);

  const solved = useMemo(() => {
    const R1 = num(r1), R2 = num(r2), D1 = num(d1), D2 = num(d2), L = num(len);
    const x = num(pcx), y = num(pcy), b = num(brg);
    if (x === null || y === null || b === null) return null;
    const start = { x, y };

    try {
      if (mode === 'SPIRAL') {
        // R and L must both be positive: A = √(R·L), and a zero or negative either side makes the
        // spiral parameter imaginary or the whole curve degenerate. Refusing here is better than
        // rendering NaN coordinates the surveyor might place.
        if (R1 === null || L === null || R1 <= 0 || L <= 0) return null;
        return { kind: 'SPIRAL' as const, spiral: computeClothoidSpiral(R1, L, dir, start, b) };
      }
      if (R1 === null || R2 === null || D1 === null || D2 === null) return null;
      if (R1 <= 0 || R2 <= 0 || D1 <= 0 || D2 <= 0) return null;
      if (D1 >= 180 || D2 >= 180) return null;
      return mode === 'COMPOUND'
        ? { kind: 'COMPOUND' as const, cc: computeCompoundCurve(R1, D1, R2, D2, dir, start, b) }
        : { kind: 'REVERSE' as const, rc: computeReverseCurve(R1, D1, R2, D2, dir, start, b) };
    } catch {
      return null;
    }
  }, [mode, r1, r2, d1, d2, len, dir, pcx, pcy, brg]);

  function place() {
    if (!solved) return;
    const layerId = useDrawingStore.getState().activeLayerId;
    const features: Feature[] = [];

    if (solved.kind === 'SPIRAL') {
      const pts = spiralPolyline(num(r1)!, num(len)!, dir, { x: num(pcx)!, y: num(pcy)! }, num(brg)!);
      features.push({
        id: generateId(),
        type: 'POLYLINE',
        geometry: { type: 'POLYLINE', vertices: pts },
        layerId,
        style: { ...DEFAULT_FEATURE_STYLE },
        properties: {
          calcSource: 'SPIRAL_CALCULATOR',
          calcRadius: solved.spiral.radiusEnd,
          calcLength: solved.spiral.length,
          calcSpiralA: Math.round(solved.spiral.A * 1000) / 1000,
          calcDirection: dir,
        },
      });
    } else {
      const pair = solved.kind === 'COMPOUND'
        ? [solved.cc.curve1, solved.cc.curve2]
        : [solved.rc.curve1, solved.rc.curve2];
      for (const c of pair) features.push(curveToFeature(c, layerId));
    }

    // ONE undo entry for the whole placement. Two arcs that arrived together must leave together —
    // undoing half a compound curve leaves geometry that is not a curve and is not nothing, and the
    // surveyor would have to notice and press undo again.
    const store = useDrawingStore.getState();
    for (const f of features) store.addFeature(f);
    useUndoStore.getState().pushUndo(
      makeBatchEntry(
        `Place ${solved.kind.toLowerCase()} curve`,
        features.map((f) => ({ type: 'ADD_FEATURE', data: f }) as UndoOperation),
      ),
    );
    setPlaced(`Placed ${features.length} feature${features.length === 1 ? '' : 's'}.`);
  }

  const modeInfo = MODES.find((m) => m.id === mode)!;

  return (
    <div className="p-3 space-y-2.5 text-gray-200" data-testid="advanced-curve-calculator">
      <div className="flex gap-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`flex-1 h-7 rounded text-[11px] border transition-colors ${
              mode === m.id
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-gray-800 border-gray-600 text-gray-300 hover:text-white'
            }`}
            onClick={() => { setMode(m.id); setPlaced(null); }}
            title={m.hint}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-gray-500 leading-snug">{modeInfo.hint}</p>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className={lbl}>{mode === 'SPIRAL' ? 'Radius (ft)' : 'R1 (ft)'}</span>
          <input className={field} value={r1} onChange={(e) => { setR1(e.target.value); setPlaced(null); }} inputMode="decimal" />
        </label>
        {mode === 'SPIRAL' ? (
          <label className="block">
            <span className={lbl}>Spiral length (ft)</span>
            <input className={field} value={len} onChange={(e) => { setLen(e.target.value); setPlaced(null); }} inputMode="decimal" />
          </label>
        ) : (
          <label className="block">
            <span className={lbl}>Δ1 (°)</span>
            <input className={field} value={d1} onChange={(e) => { setD1(e.target.value); setPlaced(null); }} inputMode="decimal" />
          </label>
        )}
        {mode !== 'SPIRAL' && (
          <>
            <label className="block">
              <span className={lbl}>R2 (ft)</span>
              <input className={field} value={r2} onChange={(e) => { setR2(e.target.value); setPlaced(null); }} inputMode="decimal" />
            </label>
            <label className="block">
              <span className={lbl}>Δ2 (°)</span>
              <input className={field} value={d2} onChange={(e) => { setD2(e.target.value); setPlaced(null); }} inputMode="decimal" />
            </label>
          </>
        )}
        <label className="block">
          <span className={lbl}>{mode === 'SPIRAL' ? 'TS easting' : 'PC easting'}</span>
          <input className={field} value={pcx} onChange={(e) => { setPcx(e.target.value); setPlaced(null); }} inputMode="decimal" />
        </label>
        <label className="block">
          <span className={lbl}>{mode === 'SPIRAL' ? 'TS northing' : 'PC northing'}</span>
          <input className={field} value={pcy} onChange={(e) => { setPcy(e.target.value); setPlaced(null); }} inputMode="decimal" />
        </label>
        <label className="block">
          <span className={lbl}>Tangent in (° az)</span>
          <input className={field} value={brg} onChange={(e) => { setBrg(e.target.value); setPlaced(null); }} inputMode="decimal" />
        </label>
        <label className="block">
          <span className={lbl}>{mode === 'REVERSE' ? 'First turns' : 'Turns'}</span>
          <select className={field} value={dir} onChange={(e) => { setDir(e.target.value as 'LEFT' | 'RIGHT'); setPlaced(null); }}>
            <option value="RIGHT">Right</option>
            <option value="LEFT">Left</option>
          </select>
        </label>
      </div>

      {solved ? (
        <div className="rounded border border-gray-700 bg-gray-900/70 p-2 space-y-1" data-testid="advanced-curve-result">
          {solved.kind === 'SPIRAL' ? (
            <>
              <Row k="Spiral parameter A" v={solved.spiral.A.toFixed(3)} />
              <Row k="Length" v={`${solved.spiral.length.toFixed(3)} ft`} />
              <Row k="Radius at SC" v={`${solved.spiral.radiusEnd.toFixed(3)} ft`} />
              <Row k="SC point" v={`${solved.spiral.sc.x.toFixed(3)}, ${solved.spiral.sc.y.toFixed(3)}`} />
            </>
          ) : (
            (() => {
              const [c1, c2] = solved.kind === 'COMPOUND'
                ? [solved.cc.curve1, solved.cc.curve2]
                : [solved.rc.curve1, solved.rc.curve2];
              const junction = solved.kind === 'COMPOUND' ? solved.cc.pcc : solved.rc.prc;
              return (
                <>
                  <Row k="Curve 1" v={`R ${c1.R.toFixed(2)} · L ${c1.L.toFixed(3)} · T ${c1.T.toFixed(3)} · ${c1.direction}`} />
                  <Row k={solved.kind === 'COMPOUND' ? 'PCC' : 'PRC'} v={`${junction.x.toFixed(3)}, ${junction.y.toFixed(3)}`} />
                  <Row k="Curve 2" v={`R ${c2.R.toFixed(2)} · L ${c2.L.toFixed(3)} · T ${c2.T.toFixed(3)} · ${c2.direction}`} />
                  <Row k="Total length" v={`${(c1.L + c2.L).toFixed(3)} ft`} />
                  <Row k="End point" v={`${c2.pt.x.toFixed(3)}, ${c2.pt.y.toFixed(3)}`} />
                </>
              );
            })()
          )}
        </div>
      ) : (
        <p className="text-[11px] text-amber-300" data-testid="advanced-curve-blocked">
          {/* Named, not a dimmed button with no reason — the C16 rule. */}
          Enter a positive radius{mode === 'SPIRAL' ? ' and spiral length' : ', both deltas under 180°'} and a start point.
        </p>
      )}

      <button
        className="w-full h-8 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-medium transition-colors"
        onClick={place}
        disabled={!solved}
        data-testid="advanced-curve-place"
        title={solved ? 'Draw this on the active layer' : 'Solve it first'}
      >
        Place on drawing
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
