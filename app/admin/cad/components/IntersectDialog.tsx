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
// Slice 2+ will add: extension toggle, dashed preview,
// LINE × ARC / CIRCLE methods, multi-candidate cycling,
// output modes (trim / extend / build corner), polyline-
// segment + RAY + INFINITE-LINE sources.

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

  // Compute the candidate intersection. lineLineIntersection
  // returns null when the lines are parallel; we also derive
  // "within both extents" via segment-segment containment.
  const candidate: Point2D | null = sourceA && sourceB
    ? lineLineIntersection(sourceA.start, sourceA.end, sourceB.start, sourceB.end)
    : null;

  const withinBoth = candidate && sourceA && sourceB
    ? isWithinSegment(candidate, sourceA) && isWithinSegment(candidate, sourceB)
    : false;

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
  }

  const canConfirm = sourceA != null && sourceB != null && candidate != null;

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
            onPick={() => setPickingSlot(pickingSlot === 'A' ? null : 'A')}
            onClear={() => setSourceA(null)}
          />
          {/* Source B picker */}
          <SourcePickerRow
            label="Source B"
            picked={sourceB}
            isPicking={pickingSlot === 'B'}
            onPick={() => setPickingSlot(pickingSlot === 'B' ? null : 'B')}
            onClear={() => setSourceB(null)}
          />

          {/* Candidate readout */}
          <div className="bg-gray-900 border border-gray-700 rounded p-2 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              Candidates
            </div>
            {sourceA && sourceB ? (
              candidate ? (
                <div className="text-[11px] text-gray-300 font-mono">
                  <span className="text-blue-400">①</span>{' '}
                  ({candidate.x.toFixed(3)}, {candidate.y.toFixed(3)})
                  {' '}
                  <span className={withinBoth ? 'text-green-400' : 'text-amber-400'}>
                    {withinBoth ? '(within both)' : '(extended)'}
                  </span>
                </div>
              ) : (
                <p className="text-[11px] text-gray-500 italic">
                  Lines are parallel — no intersection. (Slice 1 doesn&apos;t yet handle the extension toggle.)
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
  onPick: () => void;
  onClear: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-gray-400">{props.label}</span>
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
 * Test whether `p` lies inside the segment a→b (within ε).
 * Used to flag intersection candidates as "within both
 * extents" vs. "extended past one or both."
 */
function isWithinSegment(p: Point2D, line: PickedLine): boolean {
  const EPS = 1e-6;
  const { start, end } = line;
  // Project p onto the line; t in [0, 1] means inside the segment.
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < EPS) return false;
  const t = ((p.x - start.x) * dx + (p.y - start.y) * dy) / lenSq;
  return t >= -EPS && t <= 1 + EPS;
}
