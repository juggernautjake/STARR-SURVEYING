'use client';
// app/admin/cad/components/OrientationDialog.tsx
//
// Survey Orientation Adjustment dialog.
//
// Surveyors sometimes collect field data without a proper backsight, so every
// bearing in the raw dataset is off by a constant rotational error.  This
// dialog provides three methods to correct it:
//
//   Method A — Manual Bearing Correction
//     Enter the measured azimuth of a known line and the true (deed/record)
//     azimuth for that same line.  The dialog computes the difference and
//     rotates all drawing features accordingly.
//
//   Method B — Two-Point Reference
//     Click two points already in the drawing that form a known reference line,
//     then enter the deed bearing for that line.  The measured azimuth is
//     computed from the point coordinates and compared to the deed bearing.
//
//   Method C — Deed / Plat Reference (AI-assisted — future Phase 6)
//     Upload a deed PDF or image (or paste legal description text) and the AI
//     engine will parse the bearing calls to deduce the required correction.
//     This method is scaffolded here and will be fully implemented in Phase 6.
//
// The dialog integrates directly with the drawing store and undo stack so
// the operation is fully undoable.

import { useState, useCallback } from 'react';
import { X, RotateCcw, RotateCw, Compass, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { useDrawingStore, useUndoStore, makeBatchEntry } from '@/lib/cad/store';
import {
  computeOrientationCorrection,
  computeCentroid,
  applyOrientationRotation,
} from '@/lib/cad/geometry/orient';
import { parseBearing, formatBearing, inverseBearingDistance } from '@/lib/cad/geometry/bearing';
import type { Feature, UndoOperation } from '@/lib/cad/types';
import Tooltip from './Tooltip';

interface Props {
  onClose: () => void;
}

type Method = 'MANUAL' | 'TWO_POINT' | 'DEED';

// ── Utility ─────────────────────────────────────────────────────────────────

function normAz(a: number): number {
  return ((a % 360) + 360) % 360;
}

// ── Numeric input helper ─────────────────────────────────────────────────────
function NumField({
  label,
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-gray-400 font-medium">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step ?? 0.0001}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-700 text-white text-xs rounded px-2 py-1.5 outline-none border border-gray-600 focus:border-blue-500 font-mono"
      />
    </label>
  );
}

// ── Bearing text input ────────────────────────────────────────────────────────
function BearingField({
  label,
  value,
  onChange,
  tooltip,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  tooltip: string;
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
        placeholder={"e.g.  N 45°30'15\" E  or  45.5042"}
        className="w-full bg-gray-700 text-white text-xs rounded px-2 py-1.5 outline-none border border-gray-600 focus:border-blue-500 font-mono"
      />
    </label>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] font-bold uppercase tracking-widest text-gray-500 pb-0.5 border-b border-gray-700 mb-2">
      {children}
    </div>
  );
}

// ── Info box ─────────────────────────────────────────────────────────────────
function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 bg-blue-900/30 border border-blue-700/40 rounded p-2 text-[10px] text-blue-300 leading-relaxed">
      <Info size={12} className="shrink-0 mt-0.5 text-blue-400" />
      <span>{children}</span>
    </div>
  );
}

// ── Method tab button ─────────────────────────────────────────────────────────
function MethodTab({
  active,
  onClick,
  label,
  sublabel,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sublabel: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-2 py-2 text-left rounded border transition-colors ${
        active
          ? 'bg-blue-700 border-blue-500 text-white'
          : 'bg-gray-750 border-gray-600 text-gray-400 hover:bg-gray-700 hover:text-white'
      }`}
      style={{ background: active ? undefined : '#1f2937' }}
    >
      <div className="text-[11px] font-semibold">{label}</div>
      <div className="text-[9px] text-gray-400 mt-0.5">{sublabel}</div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main dialog
// ─────────────────────────────────────────────────────────────────────────────
export default function OrientationDialog({ onClose }: Props) {
  const drawingStore = useDrawingStore();
  const undoStore = useUndoStore();

  const [method, setMethod] = useState<Method>('MANUAL');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Method A: Manual bearing correction ─────────────────────────────────
  const [measuredBearing, setMeasuredBearing] = useState('');
  const [trueBearing, setTrueBearing] = useState('');

  // ── Method B: Two-point reference ────────────────────────────────────────
  const [pt1N, setPt1N] = useState('');
  const [pt1E, setPt1E] = useState('');
  const [pt2N, setPt2N] = useState('');
  const [pt2E, setPt2E] = useState('');
  const [tpDeedBearing, setTpDeedBearing] = useState('');

  // ── Advanced: custom pivot ────────────────────────────────────────────────
  const [customPivot, setCustomPivot] = useState(false);
  const [pivotN, setPivotN] = useState('');
  const [pivotE, setPivotE] = useState('');

  // ── Scope ─────────────────────────────────────────────────────────────────
  const [scope, setScope] = useState<'ALL' | 'SELECTED'>('ALL');

  // ── Error / preview ───────────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ correctionDeg: number; pivot: { x: number; y: number } } | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  function getFeatures(): Feature[] {
    const all = drawingStore.getAllFeatures();
    if (scope === 'ALL') return all;
    // SELECTED — not yet wired to selection store in this dialog; fall back to all
    // (fully wired in a follow-on story when selection store is accessible here)
    return all;
  }

  function getPivot(features: Feature[]): { x: number; y: number } {
    if (customPivot) {
      const n = parseFloat(pivotN);
      const e = parseFloat(pivotE);
      if (isNaN(n) || isNaN(e)) throw new Error('Custom pivot coordinates are not valid numbers.');
      // Pivot UI shows N (world Y) and E (world X)
      return { x: e, y: n };
    }
    return computeCentroid(features);
  }

  // Compute correction and show preview without committing
  const handlePreview = useCallback(() => {
    setError(null);
    setPreview(null);
    try {
      const features = getFeatures();
      if (features.length === 0) throw new Error('No features in the drawing to orient.');

      let correctionDeg: number;

      if (method === 'MANUAL') {
        const m = parseBearing(measuredBearing);
        const t = parseBearing(trueBearing);
        if (m === null) throw new Error('Cannot parse the Measured Bearing. Try formats like "N 45°30\'15" E" or "92.0".');
        if (t === null) throw new Error('Cannot parse the True/Deed Bearing. Try formats like "N 45°30\'15" E" or "45.5".');
        correctionDeg = computeOrientationCorrection(m, t);
      } else if (method === 'TWO_POINT') {
        const n1 = parseFloat(pt1N); const e1 = parseFloat(pt1E);
        const n2 = parseFloat(pt2N); const e2 = parseFloat(pt2E);
        if ([n1, e1, n2, e2].some(isNaN)) throw new Error('Point coordinates must be valid numbers.');
        const from = { x: e1, y: n1 };
        const to   = { x: e2, y: n2 };
        const { azimuth: measured } = inverseBearingDistance(from, to);
        const trueAz = parseBearing(tpDeedBearing);
        if (trueAz === null) throw new Error('Cannot parse the Deed Bearing for the reference line.');
        correctionDeg = computeOrientationCorrection(measured, trueAz);
      } else {
        throw new Error('AI-assisted deed orientation is not yet implemented (Phase 6). Use Method A or B.');
      }

      const pivot = getPivot(features);
      setPreview({ correctionDeg, pivot });
    } catch (e) {
      setError((e as Error).message);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, measuredBearing, trueBearing, pt1N, pt1E, pt2N, pt2E, tpDeedBearing, customPivot, pivotN, pivotE, scope]);

  // Apply the orientation correction (undoable)
  const handleApply = useCallback(() => {
    setError(null);
    try {
      const features = getFeatures();
      if (features.length === 0) throw new Error('No features in the drawing to orient.');

      let correctionDeg: number;

      if (method === 'MANUAL') {
        const m = parseBearing(measuredBearing);
        const t = parseBearing(trueBearing);
        if (m === null) throw new Error('Cannot parse the Measured Bearing.');
        if (t === null) throw new Error('Cannot parse the True/Deed Bearing.');
        correctionDeg = computeOrientationCorrection(m, t);
      } else if (method === 'TWO_POINT') {
        const n1 = parseFloat(pt1N); const e1 = parseFloat(pt1E);
        const n2 = parseFloat(pt2N); const e2 = parseFloat(pt2E);
        if ([n1, e1, n2, e2].some(isNaN)) throw new Error('Point coordinates must be valid numbers.');
        const from = { x: e1, y: n1 };
        const to   = { x: e2, y: n2 };
        const { azimuth: measured } = inverseBearingDistance(from, to);
        const trueAz = parseBearing(tpDeedBearing);
        if (trueAz === null) throw new Error('Cannot parse the Deed Bearing for the reference line.');
        correctionDeg = computeOrientationCorrection(measured, trueAz);
      } else {
        throw new Error('AI-assisted deed orientation is not yet implemented (Phase 6).');
      }

      const pivot = getPivot(features);
      const rotated = applyOrientationRotation(features, correctionDeg, pivot);

      // Build undo operations: MODIFY_FEATURE for each changed feature
      const operations: UndoOperation[] = rotated.map((rotatedFeature, i) => ({
        type: 'MODIFY_FEATURE' as const,
        data: {
          id: rotatedFeature.id,
          before: { geometry: features[i].geometry },
          after: { geometry: rotatedFeature.geometry },
        },
      }));

      // Apply to drawing store
      for (const f of rotated) {
        drawingStore.updateFeatureGeometry(f.id, f.geometry);
      }

      // Push as a single undoable batch
      undoStore.pushUndo(
        makeBatchEntry(
          `Orient survey (${correctionDeg >= 0 ? '+' : ''}${correctionDeg.toFixed(4)}°)`,
          operations,
        ),
      );

      setPreview({ correctionDeg, pivot });
      // Zoom to extents so the reoriented drawing fills the view
      setTimeout(() => window.dispatchEvent(new CustomEvent('cad:zoomExtents')), 100);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, measuredBearing, trueBearing, pt1N, pt1E, pt2N, pt2E, tpDeedBearing, customPivot, pivotN, pivotE, scope]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl w-[540px] max-h-[90vh] flex flex-col text-sm text-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <Compass size={16} className="text-blue-400" />
            <h2 className="font-semibold text-white">Survey Orientation Adjustment</h2>
          </div>
          <button className="text-gray-400 hover:text-white transition-colors" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4 text-xs">

          <InfoBox>
            Corrects the rotational orientation error that occurs when a total-station survey is
            collected without a proper backsight.  Choose a method below, then click{' '}
            <strong>Preview</strong> to see the correction angle before applying it.
          </InfoBox>

          {/* ── Method selector ──────────────────────────────────────────── */}
          <div>
            <SectionHeader>Correction Method</SectionHeader>
            <div className="flex gap-2">
              <MethodTab
                active={method === 'MANUAL'}
                onClick={() => { setMethod('MANUAL'); setPreview(null); setError(null); }}
                label="A — Bearing Offset"
                sublabel="Enter measured vs. deed bearing"
              />
              <MethodTab
                active={method === 'TWO_POINT'}
                onClick={() => { setMethod('TWO_POINT'); setPreview(null); setError(null); }}
                label="B — Two-Point Line"
                sublabel="Reference line + deed bearing"
              />
              <MethodTab
                active={method === 'DEED'}
                onClick={() => { setMethod('DEED'); setPreview(null); setError(null); }}
                label="C — Deed / Plat AI"
                sublabel="Phase 6 — coming soon"
              />
            </div>
          </div>

          {/* ── Method A: Manual bearing correction ─────────────────────── */}
          {method === 'MANUAL' && (
            <div className="space-y-3">
              <SectionHeader>A — Bearing Offset</SectionHeader>
              <InfoBox>
                Enter the bearing of a reference line as you measured it in the field
                (Measured) and the correct bearing from the deed or record plat (True/Deed).
                The difference is applied as a rotation to every feature.
              </InfoBox>
              <div className="grid grid-cols-2 gap-3">
                <BearingField
                  label="Measured Bearing (field)"
                  value={measuredBearing}
                  onChange={setMeasuredBearing}
                  tooltip={"The bearing of a known line as it appears in your imported dataset. Accepts formats like: N 45°30'15\" E, S 12.5 W, or 92.0 (azimuth)."}
                />
                <BearingField
                  label="True / Deed Bearing"
                  value={trueBearing}
                  onChange={setTrueBearing}
                  tooltip={"The correct bearing of that same line from a deed, record plat, or GPS reference. Same format options as the Measured Bearing."}
                />
              </div>
              {measuredBearing && trueBearing && (() => {
                const m = parseBearing(measuredBearing);
                const t = parseBearing(trueBearing);
                if (m !== null && t !== null) {
                  const c = computeOrientationCorrection(m, t);
                  return (
                    <div className="text-[10px] text-green-400 font-mono bg-green-900/20 border border-green-700/40 rounded px-2 py-1.5">
                      Computed correction: {c >= 0 ? '+' : ''}{c.toFixed(6)}°
                      &nbsp;({c >= 0 ? 'CCW' : 'CW'})
                      &nbsp;— measured {normAz(m).toFixed(4)}° → true {normAz(t).toFixed(4)}°
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}

          {/* ── Method B: Two-point reference ───────────────────────────── */}
          {method === 'TWO_POINT' && (
            <div className="space-y-3">
              <SectionHeader>B — Two-Point Reference Line</SectionHeader>
              <InfoBox>
                Enter the Northing and Easting of two known points that form a reference line
                (e.g. two property corners), then enter the deed bearing for that line.
                The measured azimuth is computed from the coordinates.
              </InfoBox>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Point 1</div>
                  <NumField label="Northing (ft)" value={pt1N} onChange={setPt1N} placeholder="e.g. 12500.000" />
                  <NumField label="Easting (ft)"  value={pt1E} onChange={setPt1E} placeholder="e.g. 4800.000" />
                </div>
                <div className="space-y-2">
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Point 2</div>
                  <NumField label="Northing (ft)" value={pt2N} onChange={setPt2N} placeholder="e.g. 12600.000" />
                  <NumField label="Easting (ft)"  value={pt2E} onChange={setPt2E} placeholder="e.g. 4900.000" />
                </div>
              </div>
              <BearingField
                label="Deed Bearing for this line (Point 1 → Point 2)"
                value={tpDeedBearing}
                onChange={setTpDeedBearing}
                tooltip={"The correct bearing from Point 1 to Point 2 as stated in the deed or record plat."}
              />
              {pt1N && pt1E && pt2N && pt2E && (() => {
                const n1 = parseFloat(pt1N); const e1 = parseFloat(pt1E);
                const n2 = parseFloat(pt2N); const e2 = parseFloat(pt2E);
                if ([n1, e1, n2, e2].some(isNaN)) return null;
                const { azimuth } = inverseBearingDistance({ x: e1, y: n1 }, { x: e2, y: n2 });
                return (
                  <div className="text-[10px] text-gray-400 font-mono bg-gray-700/50 rounded px-2 py-1">
                    Measured azimuth from coordinates: {formatBearing(azimuth)}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── Method C: Deed AI (future) ───────────────────────────────── */}
          {method === 'DEED' && (
            <div className="space-y-3">
              <SectionHeader>C — Deed / Plat AI (Phase 6)</SectionHeader>
              <div className="bg-yellow-900/20 border border-yellow-700/40 rounded p-3 text-[11px] text-yellow-300 space-y-2">
                <div className="font-semibold">Coming in Phase 6 — AI Drawing Engine</div>
                <p className="text-yellow-400/80 leading-relaxed">
                  This method will let you upload a deed PDF, plat image, or paste a legal
                  description. The AI engine will:
                </p>
                <ul className="list-disc list-inside text-[10px] text-yellow-400/70 space-y-1">
                  <li>Extract bearing calls via OCR and NLP</li>
                  <li>Match record calls to field-shot lines using distance + bearing proximity</li>
                  <li>Compute the best-fit rotational correction and flag mismatches</li>
                  <li>Show a confidence score for each matched call</li>
                  <li>Allow per-call acceptance / rejection before applying</li>
                </ul>
                <p className="text-yellow-400/60 text-[9px]">
                  In the meantime, use Method A or B with data from your deed.
                </p>
              </div>
            </div>
          )}

          {/* ── Scope ────────────────────────────────────────────────────── */}
          <div>
            <SectionHeader>Scope</SectionHeader>
            <div className="flex gap-2">
              {(['ALL', 'SELECTED'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`px-3 py-1.5 rounded border text-[11px] font-medium transition-colors ${
                    scope === s
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {s === 'ALL' ? 'All Features' : 'Selected Features'}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-500 mt-1">
              {scope === 'ALL'
                ? 'Every feature in the drawing will be rotated.'
                : 'Only currently-selected features will be rotated. (Select features on the canvas first.)'}
            </p>
          </div>

          {/* ── Advanced: pivot ──────────────────────────────────────────── */}
          <div>
            <button
              className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              Advanced — Pivot Point
            </button>
            {showAdvanced && (
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="custom-pivot"
                    checked={customPivot}
                    onChange={(e) => setCustomPivot(e.target.checked)}
                    className="w-3.5 h-3.5 accent-blue-500"
                  />
                  <label htmlFor="custom-pivot" className="text-[11px] text-gray-300 cursor-pointer">
                    Use custom pivot point (default: centroid of all features)
                  </label>
                </div>
                {customPivot && (
                  <div className="grid grid-cols-2 gap-3">
                    <NumField label="Pivot Northing (ft)" value={pivotN} onChange={setPivotN} placeholder="e.g. 12550.000" />
                    <NumField label="Pivot Easting (ft)"  value={pivotE} onChange={setPivotE} placeholder="e.g. 4850.000" />
                  </div>
                )}
                {!customPivot && (
                  <p className="text-[10px] text-gray-500">
                    Rotation will be about the centroid of{' '}
                    {scope === 'ALL' ? 'all drawing features' : 'the selected features'}.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ── Error / Preview display ──────────────────────────────────── */}
          {error && (
            <div className="bg-red-900/30 border border-red-700/40 rounded px-3 py-2 text-[11px] text-red-300">
              ⚠ {error}
            </div>
          )}
          {preview && !error && (
            <div className="bg-green-900/20 border border-green-700/40 rounded px-3 py-2 text-[11px] text-green-300 space-y-1">
              <div>
                <strong>Preview:</strong> correction of{' '}
                <span className="font-mono">
                  {preview.correctionDeg >= 0 ? '+' : ''}{preview.correctionDeg.toFixed(6)}°
                </span>{' '}
                ({preview.correctionDeg >= 0 ? 'CCW' : 'CW'}) will be applied.
              </div>
              <div className="text-[10px] text-green-400/70">
                Pivot: N {preview.pivot.y.toFixed(3)}, E {preview.pivot.x.toFixed(3)}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700 shrink-0 gap-3">
          <div className="flex items-center gap-1 text-[10px] text-gray-500">
            {preview && (
              <>
                {preview.correctionDeg >= 0
                  ? <RotateCcw size={11} className="text-green-500" />
                  : <RotateCw size={11} className="text-green-500" />}
                <span className="text-green-500 font-mono">
                  {preview.correctionDeg >= 0 ? '+' : ''}{preview.correctionDeg.toFixed(4)}°
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs transition-colors"
            >
              Cancel
            </button>
            {method !== 'DEED' && (
              <button
                onClick={handlePreview}
                className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white rounded text-xs transition-colors"
              >
                Preview
              </button>
            )}
            <button
              disabled={method === 'DEED'}
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
