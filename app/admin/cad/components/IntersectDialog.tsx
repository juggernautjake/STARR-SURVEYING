'use client';
// app/admin/cad/components/IntersectDialog.tsx
//
// Phase 8 §11.6 Slice 1 — INTERSECT tool dialog shell with
// LINE × LINE math wired through the existing
// `lineLineIntersection` helper. Surveyor picks two LINE
// features on the canvas, the dialog shows candidate
// intersection points (0 or 1 for two lines), and Confirm
// drops a POINT at the chosen candidate.
//
// Slice 2 — extension toggle (Extend A / Extend B), live
// dashed extension preview rendered on the canvas, and
// per-source within/extended-N-ft badging in the candidate
// row. When extension is OFF for a source and the candidate
// falls outside its extent, Confirm is gated (matches the
// §11.6.4 spec: "off-extent candidates are discarded").

import { useEffect, useRef, useState } from 'react';
import { X, Crosshair, MousePointerClick } from 'lucide-react';
import {
  useDrawingStore,
  useUndoStore,
  makeAddFeatureEntry,
} from '@/lib/cad/store';
import { generateId } from '@/lib/cad/types';
import type { Feature, Point2D } from '@/lib/cad/types';
import { lineLineIntersection } from '@/lib/cad/geometry/intersection';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface Props {
  onClose: () => void;
}

interface PickedLine {
  featureId: string;
  start: Point2D;
  end: Point2D;
}

export default function IntersectDialog({ onClose }: Props) {
  useEscapeToClose(onClose);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  const drawingStore = useDrawingStore();
  const undoStore = useUndoStore();

  // Two LINE source slots. Surveyor toggles a "picking" flag
  // for whichever slot is being filled; canvas click intercept
  // (mounted in CanvasViewport on `cad:intersectPicking`)
  // writes the picked feature back via `cad:intersectPicked`.
  const [sourceA, setSourceA] = useState<PickedLine | null>(null);
  const [sourceB, setSourceB] = useState<PickedLine | null>(null);
  const [pickingSlot, setPickingSlot] = useState<'A' | 'B' | null>(null);
  // §11.6.4 — independent extension toggles. When ON for a
  // source the dialog treats it as an infinite line and the
  // canvas paints a dashed preview past both endpoints.
  const [extendA, setExtendA] = useState(false);
  const [extendB, setExtendB] = useState(false);

  // Compute the candidate intersection. lineLineIntersection
  // returns null when the lines are parallel.
  const candidate: Point2D | null = sourceA && sourceB
    ? lineLineIntersection(sourceA.start, sourceA.end, sourceB.start, sourceB.end)
    : null;

  // Per-source projection — t-parameter along each line plus
  // distance-past-nearest-endpoint when t lies outside [0,1].
  const projA = candidate && sourceA ? projectOntoLine(candidate, sourceA) : null;
  const projB = candidate && sourceB ? projectOntoLine(candidate, sourceB) : null;
  const withinA = !!projA?.within;
  const withinB = !!projB?.within;
  const withinBoth = withinA && withinB;
  // Extension consent — when extension is OFF for a source
  // the candidate must lie inside that source's extent.
  const consentA = withinA || extendA;
  const consentB = withinB || extendB;

  // Push the live preview state to the canvas. Slice 2 paints
  // dashed extensions for any source whose extension toggle
  // is ON plus a crosshair at the current candidate. The
  // canvas reads off `cad:intersectPreview` events; we emit
  // on any state change and clear on unmount so the ghost
  // doesn't outlive the dialog.
  useEffect(() => {
    const detail = {
      sourceA: sourceA
        ? { featureId: sourceA.featureId, start: sourceA.start, end: sourceA.end }
        : null,
      sourceB: sourceB
        ? { featureId: sourceB.featureId, start: sourceB.start, end: sourceB.end }
        : null,
      extendA,
      extendB,
      candidate,
      withinA,
      withinB,
    };
    window.dispatchEvent(new CustomEvent('cad:intersectPreview', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('cad:intersectPreview', { detail: null }));
    };
  }, [sourceA, sourceB, extendA, extendB, candidate, withinA, withinB]);

  // Listen for canvas-click events that fill the active slot.
  useEffect(() => {
    if (!pickingSlot) return undefined;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ featureId: string }>).detail;
      const f = drawingStore.getFeature(detail.featureId);
      if (!f || f.geometry.type !== 'LINE' || !f.geometry.start || !f.geometry.end) {
        window.dispatchEvent(new CustomEvent('cad:commandOutput', {
          detail: { text: 'INTERSECT — pick a LINE feature.' },
        }));
        return;
      }
      // Same-feature guard — picking the same line twice is
      // a no-op (Slice 5 will allow polyline-segments to
      // resolve same-feature, but Slice 1 LINE × LINE
      // doesn't).
      const otherSlot = pickingSlot === 'A' ? sourceB : sourceA;
      if (otherSlot && otherSlot.featureId === f.id) {
        window.dispatchEvent(new CustomEvent('cad:commandOutput', {
          detail: { text: 'INTERSECT — pick a different second line.' },
        }));
        return;
      }
      const picked: PickedLine = {
        featureId: f.id,
        start: f.geometry.start,
        end: f.geometry.end,
      };
      if (pickingSlot === 'A') setSourceA(picked);
      else setSourceB(picked);
      setPickingSlot(null);
    };
    window.addEventListener('cad:intersectPicked', handler);
    // Tell the canvas to enter picking mode.
    window.dispatchEvent(new CustomEvent('cad:intersectPicking', { detail: { active: true } }));
    return () => {
      window.removeEventListener('cad:intersectPicked', handler);
      window.dispatchEvent(new CustomEvent('cad:intersectPicking', { detail: { active: false } }));
    };
  }, [pickingSlot, sourceA, sourceB, drawingStore]);

  function commit() {
    if (!candidate || !sourceA || !sourceB) return;
    const pt: Feature = {
      id: generateId(),
      type: 'POINT',
      geometry: { type: 'POINT', point: candidate },
      layerId: drawingStore.activeLayerId,
      style: {
        color: null, lineWeight: null, opacity: 1,
        lineTypeId: null, symbolId: null, symbolSize: null,
        symbolRotation: 0, labelVisible: null, labelFormat: null,
        labelOffset: { x: 0, y: 0 }, isOverride: false,
      },
      properties: {
        // Provenance — surveyor can audit dropped POINTs.
        intersectSourceAId: sourceA.featureId,
        intersectSourceBId: sourceB.featureId,
        intersectMethod: 'LINE_LINE',
        intersectWithinBoth: withinBoth,
        intersectExtendedA: !withinA,
        intersectExtendedB: !withinB,
      },
    };
    drawingStore.addFeature(pt);
    undoStore.pushUndo(makeAddFeatureEntry(pt));
    window.dispatchEvent(new CustomEvent('cad:commandOutput', {
      detail: { text: `Intersection point dropped${withinBoth ? '' : ' (lines extended)'}.` },
    }));
    onClose();
  }

  function clearAll() {
    setSourceA(null);
    setSourceB(null);
    setPickingSlot(null);
    setExtendA(false);
    setExtendB(false);
  }

  const canConfirm =
    sourceA != null && sourceB != null && candidate != null && consentA && consentB;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:justify-center pointer-events-none"
    >
      <div
        className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl w-[420px] m-4 text-sm text-gray-200 overflow-hidden pointer-events-auto animate-[scaleIn_180ms_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-600 bg-gray-750">
          <div className="flex items-center gap-2">
            <Crosshair size={16} className="text-blue-400" />
            <h2 className="font-semibold text-white">Intersect Lines</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          <p className="text-[11px] text-gray-400 leading-relaxed">
            Pick two LINE features and the dialog finds the point where they cross — or where they <em>would</em> cross if extended. Useful for the &quot;missing house corner&quot; workflow when two walls stop short of each other.
          </p>

          {/* Source A picker */}
          <SourcePickerRow
            label="Source A"
            picked={sourceA}
            isPicking={pickingSlot === 'A'}
            extend={extendA}
            onPick={() => setPickingSlot(pickingSlot === 'A' ? null : 'A')}
            onClear={() => setSourceA(null)}
            onToggleExtend={() => setExtendA((v) => !v)}
          />
          {/* Source B picker */}
          <SourcePickerRow
            label="Source B"
            picked={sourceB}
            isPicking={pickingSlot === 'B'}
            extend={extendB}
            onPick={() => setPickingSlot(pickingSlot === 'B' ? null : 'B')}
            onClear={() => setSourceB(null)}
            onToggleExtend={() => setExtendB((v) => !v)}
          />

          {/* Candidate readout */}
          <div className="bg-gray-900 border border-gray-700 rounded p-2 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              Candidates
            </div>
            {sourceA && sourceB ? (
              candidate ? (
                <div className="text-[11px] text-gray-300 font-mono space-y-1">
                  <div>
                    <span className="text-blue-400">①</span>{' '}
                    ({candidate.x.toFixed(3)}, {candidate.y.toFixed(3)})
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {withinBoth ? (
                      <span className="px-1.5 py-[1px] rounded bg-green-900/60 text-green-300 text-[10px]">
                        within both
                      </span>
                    ) : (
                      <>
                        {!withinA && projA && (
                          <span
                            className={`px-1.5 py-[1px] rounded text-[10px] ${
                              extendA
                                ? 'bg-amber-900/60 text-amber-300'
                                : 'bg-red-900/60 text-red-300'
                            }`}
                            title={
                              extendA
                                ? 'Source A is being virtually extended to reach the candidate.'
                                : 'Candidate lies past Source A\'s endpoint — toggle "Extend A" to allow it.'
                            }
                          >
                            extended A {projA.distancePastFt.toFixed(2)} ft{extendA ? '' : ' — toggle Extend A'}
                          </span>
                        )}
                        {!withinB && projB && (
                          <span
                            className={`px-1.5 py-[1px] rounded text-[10px] ${
                              extendB
                                ? 'bg-amber-900/60 text-amber-300'
                                : 'bg-red-900/60 text-red-300'
                            }`}
                            title={
                              extendB
                                ? 'Source B is being virtually extended to reach the candidate.'
                                : 'Candidate lies past Source B\'s endpoint — toggle "Extend B" to allow it.'
                            }
                          >
                            extended B {projB.distancePastFt.toFixed(2)} ft{extendB ? '' : ' — toggle Extend B'}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-gray-500 italic">
                  These two don&apos;t intersect — the lines are parallel.
                </p>
              )
            ) : (
              <p className="text-[11px] text-gray-500 italic">
                Pick two LINE features above to see the intersection.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-600 bg-gray-900/40">
          <button
            onClick={clearAll}
            className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
            title="Clear both source slots"
          >
            Clear
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={commit}
              disabled={!canConfirm}
              className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded transition-colors"
            >
              Drop POINT
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SourcePickerRow(props: {
  label: string;
  picked: PickedLine | null;
  isPicking: boolean;
  extend: boolean;
  onPick: () => void;
  onClear: () => void;
  onToggleExtend: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2">
        <span className="text-[11px] text-gray-400">{props.label}</span>
        <div className="flex items-center gap-1.5">
          <label
            className="flex items-center gap-1 px-1.5 py-1 text-[11px] rounded border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500 cursor-pointer select-none"
            title={`Treat ${props.label} as an infinite line — finds the virtual intersection past either endpoint.`}
          >
            <input
              type="checkbox"
              checked={props.extend}
              onChange={props.onToggleExtend}
              className="accent-amber-500 w-3 h-3"
            />
            Extend
          </label>
          <button
            type="button"
            onClick={props.onPick}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded border transition-colors ${
              props.isPicking
                ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_0_2px_rgba(59,130,246,0.3)]'
                : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white'
            }`}
          >
            <MousePointerClick size={12} />
            {props.isPicking ? 'Click a line on canvas…' : props.picked ? 'Re-pick' : 'Pick from canvas'}
          </button>
        </div>
      </div>
      <div className="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-[11px] font-mono">
        {props.picked ? (
          <div className="flex items-center justify-between">
            <span className="text-gray-300 truncate">
              <span className="text-gray-500">#{props.picked.featureId.slice(0, 6)}</span>{' '}
              ({props.picked.start.x.toFixed(2)}, {props.picked.start.y.toFixed(2)}) →
              {' '}({props.picked.end.x.toFixed(2)}, {props.picked.end.y.toFixed(2)})
            </span>
            <button onClick={props.onClear} className="text-gray-500 hover:text-red-400 ml-2" title="Clear">
              <X size={11} />
            </button>
          </div>
        ) : (
          <span className="text-gray-500 italic">— no line picked —</span>
        )}
      </div>
    </div>
  );
}

/**
 * Project `p` onto the line that contains the segment a→b.
 * Returns:
 *   - `t` — parameter along the line (0 = start, 1 = end).
 *   - `within` — true when `p` lies inside the segment ±ε.
 *   - `distancePastFt` — when not within, the distance past
 *     the nearest endpoint along the line direction (always
 *     ≥ 0). Used for the "extended A 12.3 ft" badge.
 */
function projectOntoLine(p: Point2D, line: PickedLine): {
  t: number;
  within: boolean;
  distancePastFt: number;
} | null {
  const EPS = 1e-6;
  const { start, end } = line;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < EPS) return null;
  const length = Math.sqrt(lenSq);
  const t = ((p.x - start.x) * dx + (p.y - start.y) * dy) / lenSq;
  const within = t >= -EPS && t <= 1 + EPS;
  // distancePastFt: 0 inside the segment; otherwise the
  // overshoot along the line direction in world feet.
  let distancePastFt = 0;
  if (t < 0) distancePastFt = -t * length;
  else if (t > 1) distancePastFt = (t - 1) * length;
  return { t, within, distancePastFt };
}
