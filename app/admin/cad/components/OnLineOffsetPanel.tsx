'use client';
// app/admin/cad/components/OnLineOffsetPanel.tsx
//
// Floating numeric panel for the on-line offset (PERPENDICULAR) tool. Shown
// once the start point is locked onto a base line. Lets the surveyor type an
// exact length and either an angle measured off the base line (default 90°) or
// an absolute azimuth, instead of (or in addition to) dragging. Values write
// straight to the tool-store, which the canvas preview reads each frame.

import { useEffect, useRef } from 'react';
import { Spline, X } from 'lucide-react';

import { useToolStore } from '@/lib/cad/store';

interface Props {
  onCommit: () => void;
  onCancel: () => void;
}

export default function OnLineOffsetPanel({ onCommit, onCancel }: Props) {
  const ts = useToolStore((s) => s.state);
  const setAngle = useToolStore((s) => s.setPerpAngleOffDeg);
  const setUseAzimuth = useToolStore((s) => s.setPerpUseAzimuth);
  const setAzimuth = useToolStore((s) => s.setPerpAzimuthDeg);
  const setLength = useToolStore((s) => s.setPerpLengthFeet);

  const lengthRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => lengthRef.current?.select(), 80);
    return () => clearTimeout(t);
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCommit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }

  const angleLabel = ts.perpUseAzimuth ? 'Azimuth (°)' : 'Angle off line (°)';
  const angleValue = ts.perpUseAzimuth ? ts.perpAzimuthDeg : ts.perpAngleOffDeg;

  return (
    <div
      className="absolute z-40 left-3 bottom-10 w-60 bg-gray-900 border border-blue-500/60 rounded-lg shadow-2xl overflow-hidden"
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      onKeyDown={onKeyDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700 bg-gray-800/80">
        <div className="flex items-center gap-1.5 text-blue-300 text-xs font-semibold">
          <Spline size={11} />
          Offset Line
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
        {/* Length */}
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-gray-400">Length (ft)</span>
          <input
            ref={lengthRef}
            type="number"
            inputMode="decimal"
            value={ts.perpLengthFeet ?? ''}
            placeholder="drag to set"
            onChange={(e) => {
              const v = e.target.value;
              if (v.trim() === '') { setLength(null); return; }
              const n = parseFloat(v);
              setLength(Number.isFinite(n) ? n : null);
            }}
            className="mt-0.5 w-full px-2 h-7 rounded bg-gray-800 border border-gray-600 text-gray-100 text-xs focus:border-blue-500 outline-none"
          />
        </label>

        {/* Angle / azimuth */}
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-gray-400">{angleLabel}</span>
          <input
            type="number"
            inputMode="decimal"
            value={angleValue}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (!Number.isFinite(n)) return;
              if (ts.perpUseAzimuth) setAzimuth(n);
              else setAngle(n);
            }}
            className="mt-0.5 w-full px-2 h-7 rounded bg-gray-800 border border-gray-600 text-gray-100 text-xs focus:border-blue-500 outline-none"
          />
        </label>

        <label className="flex items-center gap-2 text-[11px] text-gray-300 select-none">
          <input
            type="checkbox"
            checked={ts.perpUseAzimuth}
            onChange={(e) => setUseAzimuth(e.target.checked)}
            className="accent-blue-500"
          />
          Use absolute azimuth (instead of angle off the line)
        </label>

        <div className="flex items-center gap-2 pt-0.5">
          <button
            onClick={onCommit}
            className="flex-1 h-7 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
          >
            Place (Enter)
          </button>
          <button
            onClick={onCancel}
            className="px-2 h-7 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs transition-colors"
          >
            Cancel
          </button>
        </div>

        <p className="text-[10px] text-gray-500 leading-snug">
          Default 90° off the line. Leave length blank to drag; type a value to
          set it exactly. Click the canvas to place.
        </p>
      </div>
    </div>
  );
}
