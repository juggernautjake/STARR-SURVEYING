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
} from '@/lib/cad/geometry/intersection';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface Props {
  onClose: () => void;
}

type IntersectMethod =
  | 'LINE_LINE'
  | 'LINE_CIRCLE'
  | 'LINE_ARC'
  | 'CIRCLE_CIRCLE'
  | 'ARC_ARC'
  | 'ARC_CIRCLE';

interface PickedLine {
  kind: 'LINE';
  featureId: string;
  start: Point2D;
  end: Point2D;
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
type PickedSource = PickedLine | PickedCircle | PickedArc;

const METHOD_LABELS: Record<IntersectMethod, string> = {
  LINE_LINE: 'Line × Line',
  LINE_CIRCLE: 'Line × Circle',
  LINE_ARC: 'Line × Arc',
  CIRCLE_CIRCLE: 'Circle × Circle',
  ARC_ARC: 'Arc × Arc',
  ARC_CIRCLE: 'Arc × Circle',
};

function sourceAKinds(method: IntersectMethod): PickedSource['kind'][] {
  if (method.startsWith('LINE_')) return ['LINE'];
  if (method.startsWith('CIRCLE_')) return ['CIRCLE'];
  return ['ARC'];
}
function sourceBKinds(method: IntersectMethod): PickedSource['kind'][] {
  if (method === 'LINE_LINE') return ['LINE'];
  if (method === 'LINE_CIRCLE') return ['CIRCLE'];
  if (method === 'LINE_ARC') return ['ARC'];
  if (method === 'CIRCLE_CIRCLE') return ['CIRCLE'];
  if (method === 'ARC_ARC') return ['ARC'];
  return ['CIRCLE']; // ARC_CIRCLE
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
  // recompute.
  useEffect(() => {
    if (selectedIndex >= candidates.length && candidates.length > 0) {
      setSelectedIndex(0);
    }
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
      const detail = (e as CustomEvent<{ featureId: string }>).detail;
      const f = drawingStore.getFeature(detail.featureId);
      if (!f) return;
      const kinds = pickingSlot === 'A' ? sourceAKinds(method) : sourceBKinds(method);
      const matched = tryBuildSource(f, kinds);
      if (!matched) {
        announce(`INTERSECT — Source ${pickingSlot} must be a ${kinds.join(' or ')}.`);
        return;
      }
      const other = pickingSlot === 'A' ? sourceB : sourceA;
      if (other && other.featureId === matched.featureId) {
        announce(`INTERSECT — pick a different feature for Source ${pickingSlot}.`);
        return;
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

  function commit() {
    if (!selected || !sourceA || !sourceB) return;
    const pt: Feature = {
      id: generateId(),
      type: 'POINT',
      geometry: { type: 'POINT', point: selected },
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
        intersectCandidateIndex: selectedIndex,
        intersectCandidateCount: candidates.length,
      },
    };
    drawingStore.addFeature(pt);
    undoStore.pushUndo(makeAddFeatureEntry(pt));
    announce(`Intersection point dropped${withinBoth ? '' : ' (extended)'}.`);
    onClose();
  }

  function clearAll() {
    setSourceA(null);
    setSourceB(null);
    setPickingSlot(null);
    setExtendA(false);
    setExtendB(false);
    setSelectedIndex(0);
  }

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
            Up to 2 candidates for circle / arc methods; click the one you want before dropping.
          </p>

          {/* Source A picker */}
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
                <ul className="space-y-0.5">
                  {candidates.map((c, i) => (
                    <CandidateRow
                      key={i}
                      index={i}
                      candidate={c}
                      isSelected={i === selectedIndex}
                      onSelect={() => setSelectedIndex(i)}
                      sourceA={sourceA}
                      sourceB={sourceB}
                      extendA={extendA}
                      extendB={extendB}
                    />
                  ))}
                </ul>
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
            >
              Drop POINT
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

function CandidateRow(props: {
  index: number;
  candidate: Point2D;
  isSelected: boolean;
  sourceA: PickedSource;
  sourceB: PickedSource;
  extendA: boolean;
  extendB: boolean;
  onSelect: () => void;
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

function tryBuildSource(f: Feature, kinds: PickedSource['kind'][]): PickedSource | null {
  if (kinds.includes('LINE') && f.geometry.type === 'LINE' && f.geometry.start && f.geometry.end) {
    return { kind: 'LINE', featureId: f.id, start: f.geometry.start, end: f.geometry.end };
  }
  if (kinds.includes('CIRCLE') && f.geometry.type === 'CIRCLE' && f.geometry.circle) {
    return { kind: 'CIRCLE', featureId: f.id, circle: f.geometry.circle };
  }
  if (kinds.includes('ARC') && f.geometry.type === 'ARC' && f.geometry.arc) {
    return { kind: 'ARC', featureId: f.id, arc: f.geometry.arc };
  }
  return null;
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
  | null {
  if (!p) return null;
  if (p.kind === 'LINE') {
    return { kind: 'LINE', featureId: p.featureId, start: p.start, end: p.end };
  }
  if (p.kind === 'CIRCLE') {
    return { kind: 'CIRCLE', featureId: p.featureId, circle: p.circle };
  }
  return { kind: 'ARC', featureId: p.featureId, arc: p.arc };
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
  return 'The arc never crosses the circle within its sweep.';
}

function renderPickedSummary(p: PickedSource): string {
  if (p.kind === 'LINE') {
    return `(${p.start.x.toFixed(2)}, ${p.start.y.toFixed(2)}) → (${p.end.x.toFixed(2)}, ${p.end.y.toFixed(2)})`;
  }
  if (p.kind === 'CIRCLE') {
    return `center (${p.circle.center.x.toFixed(2)}, ${p.circle.center.y.toFixed(2)})  r=${p.circle.radius.toFixed(2)}`;
  }
  const a = p.arc;
  const deg = (rad: number) => ((rad * 180) / Math.PI).toFixed(1);
  return `center (${a.center.x.toFixed(2)}, ${a.center.y.toFixed(2)})  r=${a.radius.toFixed(2)}  ${deg(a.startAngle)}°→${deg(a.endAngle)}°`;
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
