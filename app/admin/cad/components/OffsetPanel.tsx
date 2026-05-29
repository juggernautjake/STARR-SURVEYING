'use client';
// app/admin/cad/components/OffsetPanel.tsx
//
// Floating numeric panel for the OFFSET tool. Mounts when the tool
// has a source feature picked. Lets the surveyor type an exact
// distance + pick a unit instead of dragging, mirroring the existing
// OnLineOffsetPanel UX for the PERPENDICULAR tool.
//
// Values write straight to the tool-store, so the canvas preview
// reads them every frame. Apply hands off to
// `applyOffsetFromPanel(state)` which converts to feet + calls the
// existing `applyInteractiveOffset` operation.
//
// Slice 1 of cad-offset-tool-2026-05-29.md.

import { useEffect, useMemo, useRef } from 'react';
import { ArrowRightLeft, X } from 'lucide-react';

import { useToolStore, useDrawingStore } from '@/lib/cad/store';
import { applyOffsetFromPanel, distanceToFeet } from '@/lib/cad/operations/apply-offset-from-panel';
import type { LinearUnit } from '@/lib/cad/types';

interface Props {
  onCommit: () => void;
  onCancel: () => void;
}

const UNIT_OPTIONS: ReadonlyArray<{ value: LinearUnit; label: string }> = [
  { value: 'FT',   label: 'ft' },
  { value: 'IN',   label: 'in' },
  { value: 'MILE', label: 'mi' },
  { value: 'M',    label: 'm' },
  { value: 'CM',   label: 'cm' },
  { value: 'MM',   label: 'mm' },
];

const SIDE_OPTIONS: ReadonlyArray<{ value: 'LEFT' | 'RIGHT' | 'BOTH'; label: string }> = [
  { value: 'LEFT',  label: 'Left' },
  { value: 'RIGHT', label: 'Right' },
  { value: 'BOTH',  label: 'Both' },
];

const CORNER_OPTIONS: ReadonlyArray<{ value: 'MITER' | 'ROUND' | 'CHAMFER'; label: string }> = [
  { value: 'MITER',   label: 'Miter' },
  { value: 'ROUND',   label: 'Round' },
  { value: 'CHAMFER', label: 'Chamfer' },
];

export default function OffsetPanel({ onCommit, onCancel }: Props) {
  const ts = useToolStore((s) => s.state);
  const setOffsetDistance = useToolStore((s) => s.setOffsetDistance);
  const setOffsetSide = useToolStore((s) => s.setOffsetSide);
  const setOffsetCornerHandling = useToolStore((s) => s.setOffsetCornerHandling);

  // Surveyor's drawing-wide unit preference — used as the default
  // for the panel's unit selector. Reading once at mount is fine
  // because the picker is per-panel-instance state once opened.
  const drawingLinearUnit = useDrawingStore(
    (s) => s.document.settings.displayPreferences.linearUnit,
  );

  // `offsetDistance` in the tool-store is canonical feet (the world
  // unit). We mirror the user's typed value + chosen unit in a local
  // ref so they can switch units without losing what they typed.
  const localValueRef = useRef<{ value: number; unit: LinearUnit }>({
    value: ts.offsetDistance > 0 ? ts.offsetDistance : 0,
    unit: drawingLinearUnit,
  });

  const distanceRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => distanceRef.current?.select(), 80);
    return () => clearTimeout(t);
  }, []);

  // Feet-equivalent preview for non-FT units so the surveyor sees
  // exactly what the geometry engine will use.
  const feetPreview = useMemo(() => {
    const f = distanceToFeet(localValueRef.current.value, localValueRef.current.unit);
    return f !== null && localValueRef.current.unit !== 'FT'
      ? `= ${f.toFixed(3)} ft`
      : null;
  }, []);

  function syncToolStore(next: { value: number; unit: LinearUnit }) {
    localValueRef.current = next;
    const feet = distanceToFeet(next.value, next.unit);
    if (feet !== null) setOffsetDistance(feet);
  }

  function handleApply() {
    const ok = applyOffsetFromPanel({
      sourceId: ts.offsetSourceId ?? '',
      distance: localValueRef.current.value,
      unit: localValueRef.current.unit,
      side: ts.offsetSide,
      cornerHandling: ts.offsetCornerHandling,
    });
    if (ok) onCommit();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleApply();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }

  const canApply =
    !!ts.offsetSourceId &&
    distanceToFeet(localValueRef.current.value, localValueRef.current.unit) !== null;

  return (
    <div
      className="absolute z-40 left-3 bottom-10 w-72 bg-gray-900 border border-blue-500/60 rounded-lg shadow-2xl overflow-hidden"
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      onKeyDown={onKeyDown}
      data-testid="offset-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700 bg-gray-800/80">
        <div className="flex items-center gap-1.5 text-blue-300 text-xs font-semibold">
          <ArrowRightLeft size={11} />
          Offset
        </div>
        <button
          className="p-0.5 rounded text-gray-500 hover:text-white hover:bg-gray-700 transition-colors"
          onClick={onCancel}
          title="Cancel (Esc)"
          aria-label="Cancel"
        >
          <X size={11} />
        </button>
      </div>

      <div className="px-3 pt-2.5 pb-2 space-y-2">
        {/* Distance + unit */}
        <div className="grid grid-cols-[1fr_72px] gap-2">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-gray-400">Distance</span>
            <input
              ref={distanceRef}
              type="number"
              inputMode="decimal"
              step="any"
              defaultValue={localValueRef.current.value || ''}
              placeholder="e.g. 12.5"
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                if (Number.isFinite(n)) {
                  syncToolStore({ ...localValueRef.current, value: n });
                }
              }}
              className="mt-0.5 w-full px-2 h-7 rounded bg-gray-800 border border-gray-600 text-gray-100 text-xs focus:border-blue-500 outline-none"
              aria-label="Offset distance"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-gray-400">Unit</span>
            <select
              defaultValue={localValueRef.current.unit}
              onChange={(e) => {
                syncToolStore({
                  ...localValueRef.current,
                  unit: e.target.value as LinearUnit,
                });
              }}
              className="mt-0.5 w-full px-1 h-7 rounded bg-gray-800 border border-gray-600 text-gray-100 text-xs focus:border-blue-500 outline-none"
              aria-label="Offset unit"
            >
              {UNIT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>

        {feetPreview && (
          <p className="text-[10px] text-gray-500">{feetPreview}</p>
        )}

        {/* Side */}
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-gray-400">Side</span>
          <select
            value={ts.offsetSide}
            onChange={(e) => setOffsetSide(e.target.value as 'LEFT' | 'RIGHT' | 'BOTH')}
            className="mt-0.5 w-full px-2 h-7 rounded bg-gray-800 border border-gray-600 text-gray-100 text-xs focus:border-blue-500 outline-none"
            aria-label="Offset side"
          >
            {SIDE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        {/* Corner handling */}
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-gray-400">Corner</span>
          <select
            value={ts.offsetCornerHandling}
            onChange={(e) => setOffsetCornerHandling(e.target.value as 'MITER' | 'ROUND' | 'CHAMFER')}
            className="mt-0.5 w-full px-2 h-7 rounded bg-gray-800 border border-gray-600 text-gray-100 text-xs focus:border-blue-500 outline-none"
            aria-label="Offset corner handling"
          >
            {CORNER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-2 pt-0.5">
          <button
            onClick={handleApply}
            disabled={!canApply}
            className="flex-1 h-7 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-medium transition-colors"
          >
            Apply (Enter)
          </button>
          <button
            onClick={onCancel}
            className="px-2 h-7 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs transition-colors"
          >
            Cancel
          </button>
        </div>

        <p className="text-[10px] text-gray-500 leading-snug">
          Type a number + pick a unit. Apply creates a parallel offset
          on the chosen side of the source feature.
        </p>
      </div>
    </div>
  );
}
