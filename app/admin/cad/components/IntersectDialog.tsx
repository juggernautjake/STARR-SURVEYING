'use client';
// app/admin/cad/components/IntersectDialog.tsx
//
// Phase 8 §11.6 INTERSECT tool — surveyor picks two features
// and the dialog drops a POINT at their (possibly extended)
// intersection.
//
// Slice 1 — modal shell + LINE × LINE math.
// Slice 2 — Extend A / Extend B toggles + dashed-extension
//   live ghost + per-source within/extended-N-ft badging.
// Slice 3 — Method picker (Line × Line / Line × Circle / Line
//   × Arc) with `lineCircleIntersections` and
//   `lineArcIntersections` math; multi-candidate list (0 / 1 /
//   2 candidates) with click-to-select; Source B accepts
//   CIRCLE or ARC features when the matching method is
//   selected; circle ghost preview when picking a CIRCLE.

import { useEffect, useRef, useState } from 'react';
import { X, Crosshair, MousePointerClick } from 'lucide-react';
import {
  useDrawingStore,
  useUndoStore,
  makeAddFeatureEntry,
  makeBatchEntry,
} from '@/lib/cad/store';
import { generateId } from '@/lib/cad/types';
import type {
  Feature,
  Point2D,
  ArcGeometry,
  CircleGeometry,
} from '@/lib/cad/types';
import {
  lineLineIntersection,
  lineCircleIntersections,
  lineArcIntersections,
  circleCircleIntersections,
  arcArcIntersections,
  arcCircleIntersections,
  rayLineIntersection,
  rayCircleIntersections,
  rayArcIntersections,
} from '@/lib/cad/geometry/intersection';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useFocusTrap } from '../hooks/useFocusTrap';
import UnitInput from './UnitInput';

interface Props {
  onClose: () => void;
}

type IntersectMethod =
  | 'LINE_LINE'
  | 'LINE_CIRCLE'
  | 'LINE_ARC'
  | 'CIRCLE_CIRCLE'
  | 'ARC_ARC'
  | 'ARC_CIRCLE'
  | 'RAY_LINE'
  | 'RAY_CIRCLE'
  | 'RAY_ARC';

interface PickedLine {
  kind: 'LINE';
  featureId: string;
  start: Point2D;
  end: Point2D;
  /** When the picked feature was a POLYLINE / POLYGON, the
   *  segment index resolved by nearest-segment from the click
   *  point. Provenance only; the math uses `start` / `end`. */
  segmentIndex?: number;
}
interface PickedCircle {
  kind: 'CIRCLE';
  featureId: string;
  circle: CircleGeometry;
}
interface PickedArc {
  kind: 'ARC';
  featureId: string;
  arc: ArcGeometry;
}
/**
 * §11.6.3 — a virtual half-line defined by an origin point
 * and a survey azimuth (decimal degrees, 0 = N, CW). Not
 * tied to a feature; surveyor types the bearing and picks
 * (or snaps to) the origin on the canvas.
 */
interface PickedRay {
  kind: 'RAY';
  /** Synthetic id — the dialog doesn't have a feature id but
   *  upstream code treats every PickedSource as identifiable. */
  featureId: string;
  origin: Point2D;
  bearingDeg: number;
}
type PickedSource = PickedLine | PickedCircle | PickedArc | PickedRay;

const METHOD_LABELS: Record<IntersectMethod, string> = {
  LINE_LINE: 'Line × Line',
  LINE_CIRCLE: 'Line × Circle',
  LINE_ARC: 'Line × Arc',
  CIRCLE_CIRCLE: 'Circle × Circle',
  ARC_ARC: 'Arc × Arc',
  ARC_CIRCLE: 'Arc × Circle',
  RAY_LINE: 'Ray × Line',
  RAY_CIRCLE: 'Ray × Circle',
  RAY_ARC: 'Ray × Arc',
};

function sourceAKinds(method: IntersectMethod): PickedSource['kind'][] {
  if (method.startsWith('LINE_')) return ['LINE'];
  if (method.startsWith('CIRCLE_')) return ['CIRCLE'];
  if (method.startsWith('ARC_')) return ['ARC'];
  return ['RAY'];
}
function sourceBKinds(method: IntersectMethod): PickedSource['kind'][] {
  if (method === 'LINE_LINE') return ['LINE'];
  if (method === 'LINE_CIRCLE') return ['CIRCLE'];
  if (method === 'LINE_ARC') return ['ARC'];
  if (method === 'CIRCLE_CIRCLE') return ['CIRCLE'];
  if (method === 'ARC_ARC') return ['ARC'];
  if (method === 'ARC_CIRCLE') return ['CIRCLE'];
  if (method === 'RAY_LINE') return ['LINE'];
  if (method === 'RAY_CIRCLE') return ['CIRCLE'];
  return ['ARC']; // RAY_ARC
}

export default function IntersectDialog({ onClose }: Props) {
  useEscapeToClose(onClose);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  const drawingStore = useDrawingStore();
  const undoStore = useUndoStore();

  const [method, setMethod] = useState<IntersectMethod>('LINE_LINE');
  const [sourceA, setSourceA] = useState<PickedSource | null>(null);
  const [sourceB, setSourceB] = useState<PickedSource | null>(null);
  const [pickingSlot, setPickingSlot] = useState<'A' | 'B' | null>(null);
  // §11.6.4 — independent extension toggles. Extension only
  // applies to LINE sources; toggles render only when the
  // matching source is a LINE.
  const [extendA, setExtendA] = useState(false);
  const [extendB, setExtendB] = useState(false);
  // Index of the currently-highlighted candidate in the list.
  // Used both for the drop and for the canvas crosshair.
  const [selectedIndex, setSelectedIndex] = useState(0);
  // §11.6.5 / §11.6.7 — surveyor can [keep] multiple
  // candidates from the list; Confirm drops every kept POINT
  // in a single batch undo entry. When nothing is kept the
  // Confirm button falls back to dropping just the selection.
  const [keptIndices, setKeptIndices] = useState<Set<number>>(new Set());

  // Clear stale sources when the method changes — if the
  // current pick's kind no longer fits the slot, drop it.
  useEffect(() => {
    setSourceA((prev) => (prev && sourceAKinds(method).includes(prev.kind) ? prev : null));
    setSourceB((prev) => (prev && sourceBKinds(method).includes(prev.kind) ? prev : null));
    setExtendA(false);
    setExtendB(false);
    setSelectedIndex(0);
  }, [method]);

  // ── Candidate computation ──
  const candidates: Point2D[] = computeCandidates(method, sourceA, sourceB);
  const selected = candidates[selectedIndex] ?? null;

  // Per-source "within" semantics:
  //   - LINE: projection test (within segment extents).
  //   - CIRCLE: always true (candidate lies on the circle).
  //   - ARC: always true once it survives the angular-span
  //     filter inside the helper.
  const projA = selected && sourceA?.kind === 'LINE' ? projectOntoLine(selected, sourceA) : null;
  const projB = selected && sourceB?.kind === 'LINE' ? projectOntoLine(selected, sourceB) : null;
  const withinA = sourceA?.kind === 'LINE' ? !!projA?.within : true;
  const withinB = sourceB?.kind === 'LINE' ? !!projB?.within : true;
  const withinBoth = withinA && withinB;
  const consentA = withinA || extendA || sourceA?.kind !== 'LINE';
  const consentB = withinB || extendB || sourceB?.kind !== 'LINE';

  // Reset selectedIndex if it falls out of range after a
  // recompute. Also prune kept indices that no longer point
  // at a real candidate (e.g. after a method switch).
  useEffect(() => {
    if (selectedIndex >= candidates.length && candidates.length > 0) {
      setSelectedIndex(0);
    }
    setKeptIndices((prev) => {
      let changed = false;
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i < candidates.length) next.add(i);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [candidates.length, selectedIndex]);

  // Push live preview state to the canvas (dashed extensions,
  // circle ghost, candidate crosshair).
  useEffect(() => {
    const detail = {
      sourceA: serialisePicked(sourceA),
      sourceB: serialisePicked(sourceB),
      extendA,
      extendB,
      candidate: selected,
      candidates,
      selectedIndex,
      withinA,
      withinB,
    };
    window.dispatchEvent(new CustomEvent('cad:intersectPreview', { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent('cad:intersectPreview', { detail: null }));
    };
  }, [sourceA, sourceB, extendA, extendB, selected, candidates, selectedIndex, withinA, withinB]);

  // Listen for canvas-click events that fill the active slot.
  useEffect(() => {
    if (!pickingSlot) return undefined;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ featureId: string; point?: Point2D }>).detail;
      const kinds = pickingSlot === 'A' ? sourceAKinds(method) : sourceBKinds(method);

      // RAY origin pick — the surveyor is dropping a point in
      // world coords, not picking a feature. Reuse whatever
      // ray exists in the slot (so its bearing is preserved)
      // or seed a new one with bearing 0°.
      if (kinds.includes('RAY')) {
        if (!detail.point) {
          announce('INTERSECT — click on the canvas to place the ray origin.');
          return;
        }
        const existing = pickingSlot === 'A' ? sourceA : sourceB;
        const bearingDeg = existing?.kind === 'RAY' ? existing.bearingDeg : 0;
        const next: PickedRay = {
          kind: 'RAY',
          featureId: existing?.kind === 'RAY' ? existing.featureId : `ray:${generateId()}`,
          origin: detail.point,
          bearingDeg,
        };
        if (pickingSlot === 'A') setSourceA(next);
        else setSourceB(next);
        setSelectedIndex(0);
        setPickingSlot(null);
        return;
      }

      const f = drawingStore.getFeature(detail.featureId);
      if (!f) return;
      const matched = tryBuildSource(f, kinds, detail.point ?? null);
      if (!matched) {
        const hint = kinds.includes('LINE')
          ? `${kinds.join(' or ')} (POLYLINE / POLYGON segments allowed)`
          : kinds.join(' or ');
        announce(`INTERSECT — Source ${pickingSlot} must be a ${hint}.`);
        return;
      }
      // Same-feature guard. For POLYLINE/POLYGON the surveyor
      // may legitimately want two different segments of the
      // same feature; allow that as long as the segment
      // indices differ.
      const other = pickingSlot === 'A' ? sourceB : sourceA;
      if (other && other.featureId === matched.featureId) {
        const matchedSeg = matched.kind === 'LINE' ? matched.segmentIndex : undefined;
        const otherSeg = other.kind === 'LINE' ? other.segmentIndex : undefined;
        if (matchedSeg === undefined || otherSeg === undefined || matchedSeg === otherSeg) {
          announce(`INTERSECT — pick a different feature (or segment) for Source ${pickingSlot}.`);
          return;
        }
      }
      if (pickingSlot === 'A') setSourceA(matched);
      else setSourceB(matched);
      setSelectedIndex(0);
      setPickingSlot(null);
    };
    window.addEventListener('cad:intersectPicked', handler);
    window.dispatchEvent(new CustomEvent('cad:intersectPicking', { detail: { active: true } }));
    return () => {
      window.removeEventListener('cad:intersectPicked', handler);
      window.dispatchEvent(new CustomEvent('cad:intersectPicking', { detail: { active: false } }));
    };
  }, [pickingSlot, sourceA, sourceB, method, drawingStore]);

  /** Build a single POINT feature for `candidates[i]`. */
  function buildPoint(i: number): Feature | null {
    const pt = candidates[i];
    if (!pt || !sourceA || !sourceB) return null;
    return {
      id: generateId(),
      type: 'POINT',
      geometry: { type: 'POINT', point: pt },
      layerId: drawingStore.activeLayerId,
      style: {
        color: null, lineWeight: null, opacity: 1,
        lineTypeId: null, symbolId: null, symbolSize: null,
        symbolRotation: 0, labelVisible: null, labelFormat: null,
        labelOffset: { x: 0, y: 0 }, isOverride: false,
      },
      properties: {
        intersectSourceAId: sourceA.featureId,
        intersectSourceBId: sourceB.featureId,
        intersectMethod: method,
        intersectWithinBoth: withinBoth,
        intersectExtendedA: !withinA,
        intersectExtendedB: !withinB,
        intersectCandidateIndex: i,
        intersectCandidateCount: candidates.length,
        ...(sourceA.kind === 'LINE' && sourceA.segmentIndex !== undefined
          ? { intersectSourceASegmentIndex: sourceA.segmentIndex } : {}),
        ...(sourceB.kind === 'LINE' && sourceB.segmentIndex !== undefined
          ? { intersectSourceBSegmentIndex: sourceB.segmentIndex } : {}),
      },
    };
  }

  /** Drop one candidate immediately as its own undo entry. */
  function dropOne(i: number) {
    const pt = buildPoint(i);
    if (!pt) return;
    drawingStore.addFeature(pt);
    undoStore.pushUndo(makeAddFeatureEntry(pt));
    announce(`Intersection point dropped${pt.properties.intersectWithinBoth ? '' : ' (extended)'}.`);
    onClose();
  }

  /**
   * Confirm: when the surveyor has [keep]-marked one or more
   * candidates, drop every kept POINT in a single batch undo
   * entry so a future undo undoes the whole multi-drop in one
   * step. Otherwise fall back to dropping just `selectedIndex`.
   */
  function commit() {
    if (keptIndices.size === 0) {
      dropOne(selectedIndex);
      return;
    }
    const points: Feature[] = [];
    keptIndices.forEach((i) => {
      const pt = buildPoint(i);
      if (pt) points.push(pt);
    });
    if (points.length === 0) return;
    points.forEach((pt) => drawingStore.addFeature(pt));
    undoStore.pushUndo(
      makeBatchEntry(
        `Drop ${points.length} intersection point${points.length === 1 ? '' : 's'}`,
        points.map((pt) => ({ type: 'ADD_FEATURE' as const, data: pt })),
      ),
    );
    announce(`Dropped ${points.length} intersection point${points.length === 1 ? '' : 's'}.`);
    onClose();
  }

  function clearAll() {
    setSourceA(null);
    setSourceB(null);
    setPickingSlot(null);
    setExtendA(false);
    setExtendB(false);
    setSelectedIndex(0);
    setKeptIndices(new Set());
  }

  function toggleKeep(i: number) {
    setKeptIndices((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  // §11.6.5 — keyboard cycling. ↓/↑ walk the candidate list,
  // Space toggles `keep` on the selected row, Enter confirms.
  // We swallow these when an editable field has focus so the
  // bearing UnitInput keeps Enter-to-commit semantics.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }
      if (e.key === 'ArrowDown' && candidates.length > 1) {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % candidates.length);
      } else if (e.key === 'ArrowUp' && candidates.length > 1) {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + candidates.length) % candidates.length);
      } else if (e.key === ' ' && candidates.length > 0) {
        e.preventDefault();
        toggleKeep(selectedIndex);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates.length, selectedIndex, keptIndices, sourceA, sourceB, method, withinBoth, withinA, withinB]);

  const canConfirm =
    sourceA != null && sourceB != null && selected != null && consentA && consentB;
  const aKindsLabel = sourceAKinds(method).join(' / ');
  const bKindsLabel = sourceBKinds(method).join(' / ');

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:justify-center pointer-events-none"
    >
      <div
        className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl w-[440px] m-4 text-sm text-gray-200 overflow-hidden pointer-events-auto animate-[scaleIn_180ms_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-600 bg-gray-750">
          <div className="flex items-center gap-2">
            <Crosshair size={16} className="text-blue-400" />
            <h2 className="font-semibold text-white">Intersect</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          {/* Method picker */}
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-gray-400 w-12">Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as IntersectMethod)}
              className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[12px] text-gray-200 focus:outline-none focus:border-blue-500"
            >
              {(Object.keys(METHOD_LABELS) as IntersectMethod[]).map((m) => (
                <option key={m} value={m}>{METHOD_LABELS[m]}</option>
              ))}
            </select>
          </div>

          <p className="text-[11px] text-gray-400 leading-relaxed">
            Pick the two sources for <strong>{METHOD_LABELS[method]}</strong> — the dialog finds every point where they cross.
            Up to 2 candidates for circle / arc methods; click the one you want before dropping. LINE sources also accept any
            segment of a POLYLINE / POLYGON — click the segment directly.
          </p>

          {/* Source A */}
          {sourceAKinds(method).includes('RAY') ? (
            <RaySourceRow
              label="Source A (RAY)"
              picked={sourceA?.kind === 'RAY' ? sourceA : null}
              isPicking={pickingSlot === 'A'}
              onPickOrigin={() => setPickingSlot(pickingSlot === 'A' ? null : 'A')}
              onClear={() => setSourceA(null)}
              onBearingChange={(deg) => {
                setSourceA((prev) => {
                  if (prev?.kind === 'RAY') return { ...prev, bearingDeg: deg };
                  return {
                    kind: 'RAY',
                    featureId: `ray:${generateId()}`,
                    origin: { x: 0, y: 0 },
                    bearingDeg: deg,
                  };
                });
              }}
            />
          ) : (
            <SourcePickerRow
              label={`Source A (${aKindsLabel})`}
              picked={sourceA}
              isPicking={pickingSlot === 'A'}
              extend={extendA}
              allowExtend={sourceA?.kind === 'LINE'}
              onPick={() => setPickingSlot(pickingSlot === 'A' ? null : 'A')}
              onClear={() => setSourceA(null)}
              onToggleExtend={() => setExtendA((v) => !v)}
            />
          )}
          {/* Source B picker */}
          <SourcePickerRow
            label={`Source B (${bKindsLabel})`}
            picked={sourceB}
            isPicking={pickingSlot === 'B'}
            extend={extendB}
            allowExtend={sourceB?.kind === 'LINE'}
            onPick={() => setPickingSlot(pickingSlot === 'B' ? null : 'B')}
            onClear={() => setSourceB(null)}
            onToggleExtend={() => setExtendB((v) => !v)}
          />

          {/* Candidate readout */}
          <div className="bg-gray-900 border border-gray-700 rounded p-2 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              Candidates ({candidates.length})
            </div>
            {sourceA && sourceB ? (
              candidates.length > 0 ? (
                <>
                  {candidates.length > 1 && (
                    <p className="text-[10px] text-gray-500 italic">
                      ↓/↑ cycle · space [keep] · enter drops {keptIndices.size > 0 ? `${keptIndices.size} kept` : 'selected'}
                    </p>
                  )}
                  <ul className="space-y-0.5">
                    {candidates.map((c, i) => (
                      <CandidateRow
                        key={i}
                        index={i}
                        candidate={c}
                        isSelected={i === selectedIndex}
                        isKept={keptIndices.has(i)}
                        onSelect={() => setSelectedIndex(i)}
                        onToggleKeep={() => toggleKeep(i)}
                        onAsPoint={() => dropOne(i)}
                        sourceA={sourceA}
                        sourceB={sourceB}
                        extendA={extendA}
                        extendB={extendB}
                      />
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-[11px] text-gray-500 italic">
                  {emptyExplainer(method, sourceA, sourceB, extendA)}
                </p>
              )
            ) : (
              <p className="text-[11px] text-gray-500 italic">
                Pick both sources above to see candidates.
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
              title={
                keptIndices.size > 0
                  ? `Drop the ${keptIndices.size} kept candidates as a single batch.`
                  : 'Drop the currently-highlighted candidate.'
              }
            >
              {keptIndices.size > 1
                ? `Drop ${keptIndices.size} POINTs`
                : 'Drop POINT'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function SourcePickerRow(props: {
  label: string;
  picked: PickedSource | null;
  isPicking: boolean;
  extend: boolean;
  allowExtend: boolean;
  onPick: () => void;
  onClear: () => void;
  onToggleExtend: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2">
        <span className="text-[11px] text-gray-400">{props.label}</span>
        <div className="flex items-center gap-1.5">
          {props.allowExtend && (
            <label
              className="flex items-center gap-1 px-1.5 py-1 text-[11px] rounded border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500 cursor-pointer select-none"
              title="Treat this source as an infinite line — find the virtual intersection past either endpoint."
            >
              <input
                type="checkbox"
                checked={props.extend}
                onChange={props.onToggleExtend}
                className="accent-amber-500 w-3 h-3"
              />
              Extend
            </label>
          )}
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
            {props.isPicking ? 'Click feature…' : props.picked ? 'Re-pick' : 'Pick from canvas'}
          </button>
        </div>
      </div>
      <div className="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-[11px] font-mono">
        {props.picked ? (
          <div className="flex items-center justify-between">
            <span className="text-gray-300 truncate">
              <span className="text-gray-500">#{props.picked.featureId.slice(0, 6)}</span>{' '}
              {renderPickedSummary(props.picked)}
            </span>
            <button onClick={props.onClear} className="text-gray-500 hover:text-red-400 ml-2" title="Clear">
              <X size={11} />
            </button>
          </div>
        ) : (
          <span className="text-gray-500 italic">— nothing picked —</span>
        )}
      </div>
    </div>
  );
}

function RaySourceRow(props: {
  label: string;
  picked: PickedRay | null;
  isPicking: boolean;
  onPickOrigin: () => void;
  onClear: () => void;
  onBearingChange: (deg: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2">
        <span className="text-[11px] text-gray-400">{props.label}</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={props.onPickOrigin}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded border transition-colors ${
              props.isPicking
                ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_0_2px_rgba(59,130,246,0.3)]'
                : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white'
            }`}
            title="Click on the canvas to set the ray's origin point (snaps to nearby vertices / endpoints)."
          >
            <MousePointerClick size={12} />
            {props.isPicking ? 'Click origin on canvas…' : props.picked ? 'Re-pick origin' : 'Pick origin'}
          </button>
        </div>
      </div>
      <div className="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-[11px] font-mono space-y-1">
        {props.picked ? (
          <div className="flex items-center justify-between">
            <span className="text-gray-300 truncate">
              origin ({props.picked.origin.x.toFixed(2)}, {props.picked.origin.y.toFixed(2)})
            </span>
            <button onClick={props.onClear} className="text-gray-500 hover:text-red-400 ml-2" title="Clear">
              <X size={11} />
            </button>
          </div>
        ) : (
          <span className="text-gray-500 italic">— no origin picked —</span>
        )}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400 shrink-0">Bearing</span>
          <UnitInput
            kind="angle"
            compact
            angleMode="AZIMUTH"
            value={props.picked?.bearingDeg ?? 0}
            onChange={props.onBearingChange}
            inputClassName="flex-1 h-6 bg-gray-800 text-white text-[11px] rounded px-1.5 outline-none font-mono border border-gray-700 focus:border-blue-500"
            focusBorderClass="focus:border-blue-500"
            description='Ray bearing — accepts decimal degrees (45.5), DMS (45°30&apos;15"), hyphen-DMS (45-30-15), or quadrant bearing (N 45-30 E).'
          />
        </div>
      </div>
    </div>
  );
}

function CandidateRow(props: {
  index: number;
  candidate: Point2D;
  isSelected: boolean;
  isKept: boolean;
  sourceA: PickedSource;
  sourceB: PickedSource;
  extendA: boolean;
  extendB: boolean;
  onSelect: () => void;
  onToggleKeep: () => void;
  onAsPoint: () => void;
}) {
  const projA = props.sourceA.kind === 'LINE' ? projectOntoLine(props.candidate, props.sourceA) : null;
  const projB = props.sourceB.kind === 'LINE' ? projectOntoLine(props.candidate, props.sourceB) : null;
  const withinA = props.sourceA.kind === 'LINE' ? !!projA?.within : true;
  const withinB = props.sourceB.kind === 'LINE' ? !!projB?.within : true;
  const withinBoth = withinA && withinB;
  return (
    <li
      onClick={props.onSelect}
      className={`flex flex-wrap items-center gap-1 px-1.5 py-1 rounded cursor-pointer text-[11px] font-mono ${
        props.isSelected
          ? 'bg-blue-900/40 ring-1 ring-blue-500/60 text-gray-100'
          : 'hover:bg-gray-800 text-gray-300'
      }`}
    >
      <span className={props.isSelected ? 'text-blue-300' : 'text-blue-500'}>{props.isSelected ? '●' : '○'}</span>
      <span>{props.index + 1}.</span>
      <span>({props.candidate.x.toFixed(3)}, {props.candidate.y.toFixed(3)})</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); props.onToggleKeep(); }}
        className={`ml-auto px-1.5 py-[1px] rounded text-[10px] border transition-colors ${
          props.isKept
            ? 'bg-green-700/60 border-green-500 text-green-100'
            : 'bg-gray-800 border-gray-600 text-gray-400 hover:text-gray-100 hover:border-gray-400'
        }`}
        title={props.isKept ? 'Remove from the batch drop set.' : 'Add to the batch drop set (Confirm drops every kept candidate).'}
      >
        {props.isKept ? '✓ keep' : 'keep'}
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); props.onAsPoint(); }}
        className="px-1.5 py-[1px] rounded text-[10px] border border-blue-700 bg-blue-900/40 text-blue-200 hover:bg-blue-900/70"
        title="Drop just this candidate as a POINT and close the dialog."
      >
        as POINT
      </button>
      {withinBoth ? (
        <span className="px-1.5 py-[1px] rounded bg-green-900/60 text-green-300 text-[10px]">within both</span>
      ) : (
        <>
          {!withinA && projA && (
            <span
              className={`px-1.5 py-[1px] rounded text-[10px] ${
                props.extendA ? 'bg-amber-900/60 text-amber-300' : 'bg-red-900/60 text-red-300'
              }`}
              title={
                props.extendA
                  ? 'Source A is being virtually extended.'
                  : 'Toggle Extend A to allow this candidate.'
              }
            >
              extended A {projA.distancePastFt.toFixed(2)} ft
            </span>
          )}
          {!withinB && projB && (
            <span
              className={`px-1.5 py-[1px] rounded text-[10px] ${
                props.extendB ? 'bg-amber-900/60 text-amber-300' : 'bg-red-900/60 text-red-300'
              }`}
              title={
                props.extendB
                  ? 'Source B is being virtually extended.'
                  : 'Toggle Extend B to allow this candidate.'
              }
            >
              extended B {projB.distancePastFt.toFixed(2)} ft
            </span>
          )}
        </>
      )}
    </li>
  );
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function announce(text: string) {
  window.dispatchEvent(new CustomEvent('cad:commandOutput', { detail: { text } }));
}

function tryBuildSource(
  f: Feature,
  kinds: PickedSource['kind'][],
  clickPoint: Point2D | null,
): PickedSource | null {
  if (kinds.includes('LINE') && f.geometry.type === 'LINE' && f.geometry.start && f.geometry.end) {
    return { kind: 'LINE', featureId: f.id, start: f.geometry.start, end: f.geometry.end };
  }
  // §11.6.9 Slice 5 — POLYLINE / POLYGON pick resolves to the
  // segment nearest the click point. Both geometries store
  // their vertex chain in `geometry.vertices`; for POLYGONs we
  // also wrap to the closing edge.
  if (
    kinds.includes('LINE') &&
    (f.geometry.type === 'POLYLINE' || f.geometry.type === 'POLYGON') &&
    f.geometry.vertices &&
    f.geometry.vertices.length >= 2 &&
    clickPoint
  ) {
    const seg = nearestSegment(f.geometry.vertices, f.geometry.type === 'POLYGON', clickPoint);
    if (seg) {
      return {
        kind: 'LINE',
        featureId: f.id,
        start: seg.start,
        end: seg.end,
        segmentIndex: seg.index,
      };
    }
  }
  if (kinds.includes('CIRCLE') && f.geometry.type === 'CIRCLE' && f.geometry.circle) {
    return { kind: 'CIRCLE', featureId: f.id, circle: f.geometry.circle };
  }
  if (kinds.includes('ARC') && f.geometry.type === 'ARC' && f.geometry.arc) {
    return { kind: 'ARC', featureId: f.id, arc: f.geometry.arc };
  }
  return null;
}

/**
 * Find the segment of a vertex chain that the click point sits
 * closest to. Distance is measured to the projection clamped
 * onto the segment, so the surveyor can click anywhere along
 * a long edge and still resolve it.
 */
function nearestSegment(
  vertices: Point2D[],
  closed: boolean,
  click: Point2D,
): { index: number; start: Point2D; end: Point2D } | null {
  const lastIndex = closed ? vertices.length : vertices.length - 1;
  let bestIdx = -1;
  let bestDistSq = Infinity;
  for (let i = 0; i < lastIndex; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const d = pointToSegmentDistSq(click, a, b);
    if (d < bestDistSq) {
      bestDistSq = d;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return null;
  return {
    index: bestIdx,
    start: vertices[bestIdx],
    end: vertices[(bestIdx + 1) % vertices.length],
  };
}

function pointToSegmentDistSq(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) {
    const ex = p.x - a.x;
    const ey = p.y - a.y;
    return ex * ex + ey * ey;
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  const ex = p.x - cx;
  const ey = p.y - cy;
  return ex * ex + ey * ey;
}

function computeCandidates(
  method: IntersectMethod,
  a: PickedSource | null,
  b: PickedSource | null,
): Point2D[] {
  if (!a || !b) return [];
  if (method === 'LINE_LINE' && a.kind === 'LINE' && b.kind === 'LINE') {
    const p = lineLineIntersection(a.start, a.end, b.start, b.end);
    return p ? [p] : [];
  }
  if (method === 'LINE_CIRCLE' && a.kind === 'LINE' && b.kind === 'CIRCLE') {
    return lineCircleIntersections(a.start, a.end, b.circle.center, b.circle.radius);
  }
  if (method === 'LINE_ARC' && a.kind === 'LINE' && b.kind === 'ARC') {
    return lineArcIntersections(a.start, a.end, b.arc);
  }
  if (method === 'CIRCLE_CIRCLE' && a.kind === 'CIRCLE' && b.kind === 'CIRCLE') {
    return circleCircleIntersections(a.circle.center, a.circle.radius, b.circle.center, b.circle.radius);
  }
  if (method === 'ARC_ARC' && a.kind === 'ARC' && b.kind === 'ARC') {
    return arcArcIntersections(a.arc, b.arc);
  }
  if (method === 'ARC_CIRCLE' && a.kind === 'ARC' && b.kind === 'CIRCLE') {
    return arcCircleIntersections(a.arc, b.circle.center, b.circle.radius);
  }
  if (method === 'RAY_LINE' && a.kind === 'RAY' && b.kind === 'LINE') {
    const p = rayLineIntersection(a.origin, a.bearingDeg, b.start, b.end);
    return p ? [p] : [];
  }
  if (method === 'RAY_CIRCLE' && a.kind === 'RAY' && b.kind === 'CIRCLE') {
    return rayCircleIntersections(a.origin, a.bearingDeg, b.circle.center, b.circle.radius);
  }
  if (method === 'RAY_ARC' && a.kind === 'RAY' && b.kind === 'ARC') {
    return rayArcIntersections(a.origin, a.bearingDeg, b.arc);
  }
  return [];
}

/**
 * Reshape a PickedSource for the cad:intersectPreview event
 * payload. Plain objects without method references so the
 * canvas-side listener can stash them without re-cloning.
 */
function serialisePicked(p: PickedSource | null):
  | { kind: 'LINE'; featureId: string; start: Point2D; end: Point2D }
  | { kind: 'CIRCLE'; featureId: string; circle: { center: Point2D; radius: number } }
  | { kind: 'ARC'; featureId: string; arc: ArcGeometry }
  | { kind: 'RAY'; featureId: string; origin: Point2D; bearingDeg: number }
  | null {
  if (!p) return null;
  if (p.kind === 'LINE') {
    return { kind: 'LINE', featureId: p.featureId, start: p.start, end: p.end };
  }
  if (p.kind === 'CIRCLE') {
    return { kind: 'CIRCLE', featureId: p.featureId, circle: p.circle };
  }
  if (p.kind === 'ARC') {
    return { kind: 'ARC', featureId: p.featureId, arc: p.arc };
  }
  return { kind: 'RAY', featureId: p.featureId, origin: p.origin, bearingDeg: p.bearingDeg };
}

function emptyExplainer(
  method: IntersectMethod,
  sourceA: PickedSource | null,
  sourceB: PickedSource | null,
  extendA: boolean,
): string {
  if (!sourceA || !sourceB) return 'Pick both sources to see candidates.';
  if (method === 'LINE_LINE') return 'These two are parallel — no intersection.';
  if (method === 'LINE_CIRCLE') {
    return extendA
      ? 'The line misses the circle entirely.'
      : 'The line misses the circle — toggle Extend A to try the infinite extension.';
  }
  if (method === 'LINE_ARC') return 'The line never crosses the arc within its sweep.';
  if (method === 'CIRCLE_CIRCLE') return 'The circles are too far apart, nested, or coincident — no intersection.';
  if (method === 'ARC_ARC') return 'The underlying circles miss or both crossings fall outside the arc sweeps.';
  if (method === 'ARC_CIRCLE') return 'The arc never crosses the circle within its sweep.';
  if (method === 'RAY_LINE') return 'The ray either misses the line or the intersection lies behind its origin.';
  if (method === 'RAY_CIRCLE') return 'The ray misses the circle (or hits it only behind its origin).';
  return 'The ray never crosses the arc within its sweep.';
}

function renderPickedSummary(p: PickedSource): string {
  if (p.kind === 'LINE') {
    const segLabel = p.segmentIndex !== undefined ? ` seg ${p.segmentIndex}` : '';
    return `${segLabel} (${p.start.x.toFixed(2)}, ${p.start.y.toFixed(2)}) → (${p.end.x.toFixed(2)}, ${p.end.y.toFixed(2)})`;
  }
  if (p.kind === 'CIRCLE') {
    return `center (${p.circle.center.x.toFixed(2)}, ${p.circle.center.y.toFixed(2)})  r=${p.circle.radius.toFixed(2)}`;
  }
  if (p.kind === 'ARC') {
    const deg = (rad: number) => ((rad * 180) / Math.PI).toFixed(1);
    return `center (${p.arc.center.x.toFixed(2)}, ${p.arc.center.y.toFixed(2)})  r=${p.arc.radius.toFixed(2)}  ${deg(p.arc.startAngle)}°→${deg(p.arc.endAngle)}°`;
  }
  return `origin (${p.origin.x.toFixed(2)}, ${p.origin.y.toFixed(2)})  az ${p.bearingDeg.toFixed(2)}°`;
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
  let distancePastFt = 0;
  if (t < 0) distancePastFt = -t * length;
  else if (t > 1) distancePastFt = (t - 1) * length;
  return { t, within, distancePastFt };
}
