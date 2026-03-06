'use client';
// app/admin/cad/components/OrientationDialog.tsx
//
// Survey Orientation Adjustment dialog.
//
// PRIMARY WORKFLOW — "Pick a Line"  (Method LP, default)
//   1. The dialog scans the drawing and shows every line segment as a
//      selectable list item, sorted longest-first.
//   2. The user clicks a line they recognise (e.g. a boundary they know the
//      deed bearing for).
//   3. A panel of smart suggested bearings appears — snap-to-angle candidates
//      (round to nearest 1°, 5°, 15°, 30°, 45°, cardinal directions, parallel /
//      perpendicular to other lines in the drawing) that the surveyor can choose
//      with a single click.  Phase 6 will prepend AI-parsed deed calls to this
//      list with confidence scores from OCR/NLP deed analysis.
//   4. The surveyor can also type any bearing manually.
//   5. As soon as a bearing is chosen the correction angle is shown live.
//   6. "Apply Orientation" rotates every feature in the drawing (undoable).
//
// ADVANCED METHODS (collapsible section)
//   Method A — Enter measured vs. true azimuth directly
//   Method B — Enter two point coordinates + deed bearing
//   Method C — AI deed import (Phase 6 scaffold)

import { useState, useMemo } from 'react';
import {
  X, RotateCcw, RotateCw, Compass, Info, ChevronDown, ChevronUp,
  Search, CheckCircle2,
} from 'lucide-react';
import { useDrawingStore, useUndoStore, makeBatchEntry } from '@/lib/cad/store';
import {
  computeOrientationCorrection,
  computeCentroid,
  applyOrientationRotation,
  extractReferenceLines,
  generateBearingCandidates,
} from '@/lib/cad/geometry/orient';
import type { ReferenceLine, BearingCandidate } from '@/lib/cad/geometry/orient';
import { parseBearing, formatBearing, inverseBearingDistance } from '@/lib/cad/geometry/bearing';
import type { Feature, UndoOperation } from '@/lib/cad/types';
import Tooltip from './Tooltip';

interface Props {
  onClose: () => void;
}

type Method = 'LINE_PICK' | 'MANUAL' | 'TWO_POINT' | 'DEED';

// ── Helpers ──────────────────────────────────────────────────────────────────

function normAz(a: number): number {
  return ((a % 360) + 360) % 360;
}

function corrLabel(deg: number): string {
  return `${deg >= 0 ? '+' : ''}${deg.toFixed(4)}\u00b0 ${deg >= 0 ? 'CCW' : 'CW'}`;
}

/** Returns `singular` when count is 1, otherwise `singular + 's'` (or explicit `plural`). */
function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

// ── Micro-components ─────────────────────────────────────────────────────────

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 bg-blue-900/30 border border-blue-700/40 rounded p-2 text-[10px] text-blue-300 leading-relaxed">
      <Info size={12} className="shrink-0 mt-0.5 text-blue-400" />
      <span>{children}</span>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] font-bold uppercase tracking-widest text-gray-500 pb-0.5 border-b border-gray-700 mb-2">
      {children}
    </div>
  );
}

function BearingInput({
  label, value, onChange, tooltip,
}: {
  label: string; value: string; onChange: (v: string) => void; tooltip: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <Tooltip label={label} description={tooltip} side="right" delay={400}>
        <span className="text-[10px] text-gray-400 font-medium underline decoration-dotted cursor-help">{label}</span>
      </Tooltip>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={"e.g. N 45\u00b030'15\u0022 E  or  45.5042"}
        className="w-full bg-gray-700 text-white text-xs rounded px-2 py-1.5 outline-none border border-gray-600 focus:border-blue-500 font-mono"
      />
    </label>
  );
}

function NumInput({
  label, value, onChange, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-gray-400 font-medium">{label}</span>
      <input
        type="number"
        step={0.001}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-700 text-white text-xs rounded px-2 py-1.5 outline-none border border-gray-600 focus:border-blue-500 font-mono"
      />
    </label>
  );
}

function ConfBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const col = value >= 0.7 ? 'bg-green-500' : value >= 0.5 ? 'bg-yellow-500' : 'bg-gray-500';
  return (
    <div className="flex items-center gap-1">
      <div className="w-10 h-1 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${col} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] text-gray-500">{pct}%</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main dialog
// ─────────────────────────────────────────────────────────────────────────────
export default function OrientationDialog({ onClose }: Props) {
  const drawingStore = useDrawingStore();
  const undoStore = useUndoStore();

  // ── State ─────────────────────────────────────────────────────────────────
  const [method, setMethod] = useState<Method>('LINE_PICK');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPivot, setShowPivot] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // LINE_PICK
  const [lineFilter, setLineFilter]         = useState('');
  const [selectedLine, setSelectedLine]     = useState<ReferenceLine | null>(null);
  const [selectedCand, setSelectedCand]     = useState<BearingCandidate | null>(null);
  const [manualBearingLP, setManualBearingLP] = useState('');

  // Method A
  const [measBearing, setMeasBearing] = useState('');
  const [trueBearing, setTrueBearing] = useState('');

  // Method B
  const [pt1N, setPt1N] = useState('');
  const [pt1E, setPt1E] = useState('');
  const [pt2N, setPt2N] = useState('');
  const [pt2E, setPt2E] = useState('');
  const [tpBearing, setTpBearing] = useState('');

  // Pivot
  const [customPivot, setCustomPivot] = useState(false);
  const [pivotN, setPivotN] = useState('');
  const [pivotE, setPivotE] = useState('');

  // ── Derived ───────────────────────────────────────────────────────────────
  const allFeatures = drawingStore.getAllFeatures();

  // Use document.modified as the memoisation key so extractReferenceLines
  // re-runs whenever any feature geometry changes, not just when the feature
  // count changes (length alone misses geometry-only edits on the same set).
  const allLines = useMemo(
    () => extractReferenceLines(allFeatures),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drawingStore.document.modified],
  );

  const filteredLines = useMemo(() => {
    const q = lineFilter.trim().toLowerCase();
    if (!q) return allLines;
    return allLines.filter(
      (l) =>
        l.label.toLowerCase().includes(q) ||
        formatBearing(l.azimuth).toLowerCase().includes(q) ||
        l.length.toFixed(1).includes(q),
    );
  }, [allLines, lineFilter]);

  const candidates = useMemo(() => {
    if (!selectedLine) return [];
    return generateBearingCandidates(
      selectedLine.azimuth,
      allLines.filter((l) => l.id !== selectedLine.id),
    );
  }, [selectedLine, allLines]);

  const lpCorrection = useMemo<number | null>(() => {
    if (!selectedLine) return null;
    if (selectedCand !== null) return selectedCand.correctionDeg;
    const p = parseBearing(manualBearingLP);
    if (p !== null) return computeOrientationCorrection(selectedLine.azimuth, p);
    return null;
  }, [selectedLine, selectedCand, manualBearingLP]);

  const canApply = useMemo(() => {
    if (method === 'LINE_PICK') {
      if (!selectedLine) return false;
      return selectedCand !== null || parseBearing(manualBearingLP) !== null;
    }
    if (method === 'MANUAL') return parseBearing(measBearing) !== null && parseBearing(trueBearing) !== null;
    if (method === 'TWO_POINT') {
      return [pt1N, pt1E, pt2N, pt2E].map(parseFloat).every((v) => !isNaN(v))
        && parseBearing(tpBearing) !== null;
    }
    return false;
  }, [method, selectedLine, selectedCand, manualBearingLP, measBearing, trueBearing, pt1N, pt1E, pt2N, pt2E, tpBearing]);

  // ── Pivot helper ──────────────────────────────────────────────────────────
  function getPivot(features: Feature[]) {
    if (customPivot) {
      const n = parseFloat(pivotN), e = parseFloat(pivotE);
      if (isNaN(n) || isNaN(e)) throw new Error('Custom pivot coordinates are invalid.');
      return { x: e, y: n };
    }
    return computeCentroid(features);
  }

  // ── Apply ─────────────────────────────────────────────────────────────────
  // Plain function (not useCallback) — this is a modal dialog that opens/closes
  // infrequently, so memoisation brings no benefit and would risk stale closures
  // over the many form-state dependencies.
  function handleApply() {
    setError(null);
    try {
      const features = allFeatures;
      if (features.length === 0) throw new Error('No features in the drawing to orient.');

      let correctionDeg: number;

      if (method === 'LINE_PICK') {
        if (!selectedLine) throw new Error('Select a reference line first.');
        const trueAz = selectedCand !== null ? selectedCand.azimuth : parseBearing(manualBearingLP);
        if (trueAz === null) throw new Error('Enter a bearing or choose a suggestion.');
        correctionDeg = computeOrientationCorrection(selectedLine.azimuth, trueAz);
      } else if (method === 'MANUAL') {
        const m = parseBearing(measBearing), t = parseBearing(trueBearing);
        if (m === null) throw new Error('Cannot parse Measured Bearing.');
        if (t === null) throw new Error('Cannot parse True/Deed Bearing.');
        correctionDeg = computeOrientationCorrection(m, t);
      } else if (method === 'TWO_POINT') {
        const n1 = parseFloat(pt1N), e1 = parseFloat(pt1E);
        const n2 = parseFloat(pt2N), e2 = parseFloat(pt2E);
        if ([n1, e1, n2, e2].some(isNaN)) throw new Error('Point coordinates must be valid numbers.');
        const { azimuth: meas } = inverseBearingDistance({ x: e1, y: n1 }, { x: e2, y: n2 });
        const t = parseBearing(tpBearing);
        if (t === null) throw new Error('Cannot parse Deed Bearing.');
        correctionDeg = computeOrientationCorrection(meas, t);
      } else {
        throw new Error('AI deed orientation is not yet implemented (Phase 6).');
      }

      const pivot = getPivot(features);
      const rotated = applyOrientationRotation(features, correctionDeg, pivot);

      const ops: UndoOperation[] = rotated.map((rf, i) => ({
        type: 'MODIFY_FEATURE' as const,
        data: { id: rf.id, before: { geometry: features[i].geometry }, after: { geometry: rf.geometry } },
      }));

      for (const f of rotated) drawingStore.updateFeatureGeometry(f.id, f.geometry);

      undoStore.pushUndo(makeBatchEntry(`Orient survey (${corrLabel(correctionDeg)})`, ops));
      // Defer zoom-to-extents by one animation frame so the canvas has time to
      // re-render the rotated geometry before the viewport bounds are computed.
      setTimeout(() => window.dispatchEvent(new CustomEvent('cad:zoomExtents')), 100);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-[fadeIn_150ms_ease-out]"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl w-[600px] max-h-[92vh] flex flex-col text-sm text-gray-200 animate-[scaleIn_200ms_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <Compass size={16} className="text-blue-400" />
            <h2 className="font-semibold text-white">Survey Orientation Adjustment</h2>
          </div>
          <button className="text-gray-400 hover:text-white transition-colors" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4 text-xs">

          <InfoBox>
            Corrects the rotational error from a total-station survey shot without a proper
            backsight. Pick a line from your drawing, tell it what the bearing should be,
            and the entire survey adjusts to match&nbsp;&mdash; fully undoable.
          </InfoBox>

          {/* ── STEP 1: Select a line ─────────────────────────────────────── */}
          <div>
            <SectionHeader>Step 1 &mdash; Select a Reference Line</SectionHeader>
            <InfoBox>
              Click any line segment you recognise. Longer / more significant lines appear
              first. Use the search box to filter by bearing or length.
            </InfoBox>

            {allLines.length === 0 ? (
              <div className="mt-3 text-[11px] text-gray-500 text-center py-6 bg-gray-700/30 rounded border border-gray-600">
                No line geometry found. Import survey data or draw some lines first.
              </div>
            ) : (
              <>
                {/* Search */}
                <div className="relative mt-2">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    value={lineFilter}
                    onChange={(e) => setLineFilter(e.target.value)}
                    placeholder="Filter by label, bearing, or length\u2026"
                    className="w-full bg-gray-700 text-gray-200 text-[11px] rounded pl-7 pr-2 py-1.5 border border-gray-600 outline-none focus:border-blue-500"
                  />
                </div>

                {/* List */}
                <div className="mt-1.5 border border-gray-600 rounded overflow-y-auto" style={{ maxHeight: 190 }}>
                  {filteredLines.length === 0 && (
                    <div className="text-[11px] text-gray-500 text-center py-4">No matches</div>
                  )}
                  {filteredLines.map((line) => {
                    const isSel = selectedLine?.id === line.id;
                    return (
                      <button
                        key={line.id}
                        onClick={() => {
                          setSelectedLine(line);
                          setSelectedCand(null);
                          setManualBearingLP('');
                          setError(null);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-left border-b border-gray-700 last:border-0 transition-colors text-[11px] ${
                          isSel ? 'bg-blue-700/40 text-white' : 'hover:bg-gray-700 text-gray-300'
                        }`}
                      >
                        <div className={`w-3 h-3 rounded-full border-2 shrink-0 ${
                          isSel ? 'bg-blue-400 border-blue-400' : 'border-gray-500'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-white">{line.label}</span>
                          <span className="ml-1.5 text-gray-500">{line.length.toFixed(2)} ft</span>
                        </div>
                        <span className="font-mono text-[10px] text-cyan-400 shrink-0">{formatBearing(line.azimuth)}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="text-[9px] text-gray-600 mt-1">
                  {allLines.length} {pluralize(allLines.length, 'line segment')} found in drawing
                </div>
              </>
            )}
          </div>

          {/* ── STEP 2: Assign bearing ───────────────────────────────────── */}
          {selectedLine && (
            <div>
              <SectionHeader>Step 2 &mdash; What Should This Line&apos;s Bearing Be?</SectionHeader>

              <div className="mb-2 text-[10px] text-gray-400 bg-gray-700/40 rounded px-2 py-1.5 font-mono">
                Currently measured:&nbsp;
                <span className="text-cyan-300">{formatBearing(selectedLine.azimuth)}</span>
                <span className="ml-2 text-gray-600">({selectedLine.azimuth.toFixed(4)}\u00b0)</span>
              </div>

              {/* Candidate list */}
              <div className="mb-2">
                <div className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">
                  Suggested Bearings
                  <span className="ml-1 text-gray-600 normal-case font-normal">
                    &mdash; Phase 6 will add AI deed-matched calls here
                  </span>
                </div>
                <div className="space-y-1">
                  {candidates.slice(0, 9).map((c) => {
                    const isChosen = selectedCand?.azimuth === c.azimuth;
                    const smallCorr = Math.abs(c.correctionDeg) < 5;
                    return (
                      <button
                        key={`${c.azimuth.toFixed(4)}-${c.source}`}
                        onClick={() => {
                          setSelectedCand(isChosen ? null : c);
                          setManualBearingLP('');
                        }}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded border text-[10px] transition-colors text-left ${
                          isChosen
                            ? 'bg-green-700/40 border-green-600 text-white'
                            : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white'
                        }`}
                      >
                        {/* Selection indicator */}
                        <div className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                          isChosen ? 'bg-green-400 border-green-400' : 'border-gray-500'
                        }`}>
                          {isChosen && <CheckCircle2 size={9} className="text-white" />}
                        </div>
                        {/* Bearing */}
                        <span className="font-mono font-semibold text-[11px] w-28 shrink-0">{c.label}</span>
                        {/* Reason */}
                        <span className="flex-1 text-gray-400 truncate text-[10px]">{c.reason}</span>
                        {/* Delta */}
                        <span className={`font-mono shrink-0 text-[10px] ${smallCorr ? 'text-green-400' : 'text-yellow-400'}`}>
                          \u0394 {corrLabel(c.correctionDeg)}
                        </span>
                        {/* Confidence */}
                        <ConfBar value={c.confidence} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Manual override */}
              <div className="border-t border-gray-700 pt-2">
                <BearingInput
                  label="Or type any bearing manually"
                  value={manualBearingLP}
                  onChange={(v) => { setManualBearingLP(v); setSelectedCand(null); }}
                  tooltip={"N 45\u00b030'15\u0022 E \u00b7 S 12-30-00 W \u00b7 92.5 (azimuth decimal)"}
                />
              </div>

              {/* Live preview */}
              {lpCorrection !== null && (
                <div className="mt-2 bg-green-900/20 border border-green-700/40 rounded px-3 py-2 text-[11px] text-green-300 flex items-center gap-2">
                  {lpCorrection >= 0
                    ? <RotateCcw size={12} className="shrink-0" />
                    : <RotateCw  size={12} className="shrink-0" />}
                  <span>
                    Correction: <strong className="font-mono">{corrLabel(lpCorrection)}</strong>
                    &nbsp;applied to all {allFeatures.length} {pluralize(allFeatures.length, 'feature')}.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── ADVANCED ────────────────────────────────────────────────── */}
          <div className="border-t border-gray-700 pt-3">
            <button
              className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-gray-300 transition-colors w-full"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              <span className="font-semibold">Advanced Methods</span>
              <span className="text-gray-600 ml-1">
                &mdash; Manual bearing entry, coordinate input, or AI deed import
              </span>
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-3">
                {/* Tabs */}
                <div className="flex gap-1.5">
                  {([
                    ['MANUAL',    'A \u2014 Bearing Offset',  'Measured vs. deed bearing'],
                    ['TWO_POINT', 'B \u2014 Two-Point Line',  'Coords + deed bearing'],
                    ['DEED',      'C \u2014 AI Deed Import',  'Phase 6 \u2014 coming soon'],
                  ] as [Method, string, string][]).map(([m, lbl, sub]) => (
                    <button
                      key={m}
                      onClick={() => { setMethod(m === method ? 'LINE_PICK' : m); setError(null); }}
                      className={`flex-1 px-2 py-2 text-left rounded border transition-colors ${
                        method === m
                          ? 'bg-blue-700 border-blue-500 text-white'
                          : 'border-gray-600 text-gray-400 hover:bg-gray-700 hover:text-white'
                      }`}
                      style={{ background: method === m ? undefined : '#1f2937' }}
                    >
                      <div className="text-[11px] font-semibold">{lbl}</div>
                      <div className="text-[9px] text-gray-400 mt-0.5">{sub}</div>
                    </button>
                  ))}
                </div>

                {/* Method A */}
                {method === 'MANUAL' && (
                  <div className="space-y-3">
                    <InfoBox>Enter the bearing as shot vs. the correct deed bearing for the same line.</InfoBox>
                    <div className="grid grid-cols-2 gap-3">
                      <BearingInput label="Measured Bearing" value={measBearing} onChange={setMeasBearing} tooltip="Bearing as it appears in the imported dataset." />
                      <BearingInput label="True / Deed Bearing" value={trueBearing} onChange={setTrueBearing} tooltip="Correct bearing from deed or record plat." />
                    </div>
                    {(() => {
                      const m = parseBearing(measBearing), t = parseBearing(trueBearing);
                      if (m !== null && t !== null) {
                        const c = computeOrientationCorrection(m, t);
                        return (
                          <div className="text-[10px] text-green-400 font-mono bg-green-900/20 border border-green-700/40 rounded px-2 py-1.5">
                            Correction: {corrLabel(c)} &mdash; {normAz(m).toFixed(4)}\u00b0 \u2192 {normAz(t).toFixed(4)}\u00b0
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}

                {/* Method B */}
                {method === 'TWO_POINT' && (
                  <div className="space-y-3">
                    <InfoBox>Enter the Northing/Easting of two points and the deed bearing for the line they form.</InfoBox>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Point 1</div>
                        <NumInput label="Northing (ft)" value={pt1N} onChange={setPt1N} placeholder="12500.000" />
                        <NumInput label="Easting (ft)"  value={pt1E} onChange={setPt1E} placeholder="4800.000" />
                      </div>
                      <div className="space-y-2">
                        <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Point 2</div>
                        <NumInput label="Northing (ft)" value={pt2N} onChange={setPt2N} placeholder="12600.000" />
                        <NumInput label="Easting (ft)"  value={pt2E} onChange={setPt2E} placeholder="4900.000" />
                      </div>
                    </div>
                    <BearingInput label="Deed Bearing (Point 1 \u2192 Point 2)" value={tpBearing} onChange={setTpBearing} tooltip="Correct bearing from deed or record plat." />
                    {pt1N && pt1E && pt2N && pt2E && (() => {
                      const n1 = parseFloat(pt1N), e1 = parseFloat(pt1E);
                      const n2 = parseFloat(pt2N), e2 = parseFloat(pt2E);
                      if ([n1, e1, n2, e2].some(isNaN)) return null;
                      const { azimuth } = inverseBearingDistance({ x: e1, y: n1 }, { x: e2, y: n2 });
                      return (
                        <div className="text-[10px] text-gray-400 font-mono bg-gray-700/50 rounded px-2 py-1">
                          Measured azimuth: {formatBearing(azimuth)}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Method C */}
                {method === 'DEED' && (
                  <div className="bg-yellow-900/20 border border-yellow-700/40 rounded p-3 text-[11px] text-yellow-300 space-y-2">
                    <div className="font-semibold">AI Deed / Plat Import &mdash; Phase 6</div>
                    <p className="text-yellow-400/80 leading-relaxed">
                      Upload a deed PDF, plat image, or paste a legal description. The AI engine will:
                    </p>
                    <ul className="list-disc list-inside text-[10px] text-yellow-400/70 space-y-1">
                      <li>Extract bearing calls via OCR and NLP</li>
                      <li>Match record calls to field-shot lines using distance + bearing proximity</li>
                      <li>Compute a best-fit correction with per-call confidence scores</li>
                      <li>Populate the &ldquo;Suggested Bearings&rdquo; list in Step 2 above with deed-matched options</li>
                      <li>Flag mismatches for the surveyor to review before applying</li>
                    </ul>
                    <p className="text-yellow-400/60 text-[9px] mt-1">
                      For now, use Step 1/2 with snap suggestions, or Methods A / B.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Pivot */}
          <div className="border-t border-gray-700 pt-2">
            <button
              className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
              onClick={() => setShowPivot(!showPivot)}
            >
              {showPivot ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              Pivot Point <span className="text-gray-600 ml-1">(default: centroid)</span>
            </button>
            {showPivot && (
              <div className="mt-2 space-y-2">
                <label className="flex items-center gap-2 text-[11px] text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={customPivot}
                    onChange={(e) => setCustomPivot(e.target.checked)}
                    className="w-3.5 h-3.5 accent-blue-500"
                  />
                  Use custom pivot point
                </label>
                {customPivot && (
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Pivot Northing (ft)" value={pivotN} onChange={setPivotN} placeholder="12550.000" />
                    <NumInput label="Pivot Easting (ft)"  value={pivotE} onChange={setPivotE} placeholder="4850.000" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-900/30 border border-red-700/40 rounded px-3 py-2 text-[11px] text-red-300">
              \u26a0 {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700 shrink-0">
          <div className="text-[10px] text-gray-500">
            {allFeatures.length} {pluralize(allFeatures.length, 'feature')}
            {allLines.length > 0 && ` \u00b7 ${allLines.length} ${pluralize(allLines.length, 'line segment')}`}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              disabled={!canApply}
              onClick={handleApply}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-xs font-semibold transition-colors"
            >
              Apply Orientation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
