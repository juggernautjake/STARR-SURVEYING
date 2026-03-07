'use client';
// app/admin/cad/components/ScaleBarEditorModal.tsx
// Robust editor for the graphic scale bar with immediate canvas preview.

import { useEffect } from 'react';
import { X, Ruler, ZoomIn, RotateCw, Eye, EyeOff } from 'lucide-react';
import { useDrawingStore } from '@/lib/cad/store';
import type { TitleBlockConfig } from '@/lib/cad/types';
import { TB_ELEM_SCALE_MIN, TB_ELEM_SCALE_MAX } from './TitleBlockEditorModal';

interface Props {
  onClose: () => void;
}

const inputCls =
  'w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-400 transition-colors';

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-2 items-center">
      <label className="text-xs text-gray-400 truncate">{label}</label>
      {children}
    </div>
  );
}

/** Mini preview of the scale bar drawn in an HTML canvas. */
function ScaleBarPreview({
  segFt,
  numSegs,
  totalFt,
  units,
  drawingScale,
}: {
  segFt: number;
  numSegs: number;
  totalFt: number;
  units: string;
  drawingScale: number;
}) {
  // We just render a simple SVG-like preview inside the panel
  const barW = 260;
  const barH = 14;
  const segW = barW / numSegs;

  return (
    <div className="mt-2 bg-gray-800 rounded border border-gray-600 p-3">
      <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-2 font-semibold text-center">
        GRAPHIC SCALE
      </div>
      <svg width={barW} height={barH + 22} className="mx-auto block" overflow="visible">
        {Array.from({ length: numSegs }).map((_, i) => (
          <rect
            key={i}
            x={i * segW}
            y={0}
            width={segW}
            height={barH}
            fill={i % 2 === 0 ? '#000' : '#fff'}
            stroke="#000"
            strokeWidth={0.5}
          />
        ))}
        <rect x={0} y={0} width={barW} height={barH} fill="none" stroke="#000" strokeWidth={1} />
        {Array.from({ length: numSegs + 1 }).map((_, i) => (
          <g key={i}>
            <line x1={i * segW} y1={barH} x2={i * segW} y2={barH + 5} stroke="#000" strokeWidth={0.75} />
            <text x={i * segW} y={barH + 14} textAnchor="middle" fontSize={8} fontFamily="Arial" fill="#111">
              {i * segFt >= 1000 ? `${Math.round((i * segFt) / 100) / 10}K` : i * segFt}
            </text>
          </g>
        ))}
        <text x={barW + 4} y={barH + 14} textAnchor="start" fontSize={8} fontFamily="Arial" fill="#444" fontStyle="italic">
          {units}
        </text>
      </svg>
      <div className="text-[9px] text-gray-500 text-center mt-1">
        Total: {totalFt} {units.toLowerCase()} at 1&quot; = {drawingScale}&apos;
      </div>
    </div>
  );
}

export default function ScaleBarEditorModal({ onClose }: Props) {
  const drawingStore = useDrawingStore();
  const tb = drawingStore.document.settings.titleBlock;
  const drawingScale = drawingStore.document.settings.drawingScale ?? 50;

  function update(updates: Partial<TitleBlockConfig>) {
    drawingStore.updateTitleBlock(updates);
  }

  // Compute actual bar properties (mirrors renderTitleBlock logic)
  const targetLenIn = tb.scaleBarLengthIn ?? 2.0;
  const targetWorldFt = targetLenIn * drawingScale;
  const niceSteps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const numSegs = Math.max(2, Math.min(8, tb.scaleBarSegments ?? 4));
  const rawSeg = targetWorldFt / numSegs;
  let segFt = niceSteps[0];
  for (const s of niceSteps) { if (s <= rawSeg) segFt = s; }
  const totalFt = segFt * numSegs;
  const units = (tb.scaleBarUnits ?? 'FEET').trim() || 'FEET';

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const isInput = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
      if (e.key === 'Escape' && !isInput) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[480px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <Ruler size={15} className="text-blue-400" />
            <span className="text-sm font-semibold text-white">Scale Bar Editor</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">

          {/* Visibility */}
          <FieldRow label="Visibility">
            <button
              onClick={() => update({ scaleBarVisible: !(tb.scaleBarVisible ?? true) })}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs border transition-colors w-full justify-center ${
                (tb.scaleBarVisible ?? true)
                  ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                  : 'bg-gray-700 border-gray-600 text-gray-400'
              }`}
            >
              {(tb.scaleBarVisible ?? true) ? <Eye size={11} /> : <EyeOff size={11} />}
              {(tb.scaleBarVisible ?? true) ? 'Visible' : 'Hidden'}
            </button>
          </FieldRow>

          {/* Length */}
          <FieldRow label="Target Length (inches)">
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0.5}
                max={6}
                step={0.25}
                value={tb.scaleBarLengthIn ?? 2.0}
                onChange={(e) => update({ scaleBarLengthIn: parseFloat(e.target.value) })}
                className="flex-1 accent-blue-500"
              />
              <span className="text-xs text-gray-300 w-10 text-right">
                {(tb.scaleBarLengthIn ?? 2.0).toFixed(2)}&quot;
              </span>
            </div>
          </FieldRow>

          {/* Segments */}
          <FieldRow label="Segments (2–8)">
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={2}
                max={8}
                step={1}
                value={tb.scaleBarSegments ?? 4}
                onChange={(e) => update({ scaleBarSegments: parseInt(e.target.value, 10) })}
                className="flex-1 accent-blue-500"
              />
              <span className="text-xs text-gray-300 w-10 text-right">
                {tb.scaleBarSegments ?? 4}
              </span>
            </div>
          </FieldRow>

          {/* Units label */}
          <FieldRow label="Units Label">
            <input
              type="text"
              value={tb.scaleBarUnits ?? 'FEET'}
              onChange={(e) => update({ scaleBarUnits: e.target.value })}
              className={inputCls}
              placeholder="FEET"
            />
          </FieldRow>

          {/* Scale factor */}
          <FieldRow label={`Scale (${TB_ELEM_SCALE_MIN}–${TB_ELEM_SCALE_MAX}×)`}>
            <div className="flex items-center gap-2">
              <ZoomIn size={11} className="text-gray-500 shrink-0" />
              <input
                type="range"
                min={TB_ELEM_SCALE_MIN}
                max={TB_ELEM_SCALE_MAX}
                step={0.05}
                value={tb.scaleBarScale ?? 1.0}
                onChange={(e) => update({ scaleBarScale: parseFloat(e.target.value) })}
                className="flex-1 accent-blue-500"
              />
              <span className="text-xs text-gray-300 w-10 text-right">
                {(tb.scaleBarScale ?? 1.0).toFixed(2)}×
              </span>
            </div>
          </FieldRow>

          {/* Rotation */}
          <FieldRow label="Rotation (0–360°)">
            <div className="flex items-center gap-2">
              <RotateCw size={11} className="text-gray-500 shrink-0" />
              <input
                type="range"
                min={0}
                max={360}
                step={5}
                value={tb.scaleBarRotationDeg ?? 0}
                onChange={(e) => update({ scaleBarRotationDeg: parseFloat(e.target.value) })}
                className="flex-1 accent-blue-500"
              />
              <span className="text-xs text-gray-300 w-12 text-right">
                {(tb.scaleBarRotationDeg ?? 0).toFixed(0)}°
              </span>
            </div>
          </FieldRow>

          {/* Live preview */}
          <ScaleBarPreview
            segFt={segFt}
            numSegs={numSegs}
            totalFt={totalFt}
            units={units}
            drawingScale={drawingScale}
          />

          <p className="text-[10px] text-gray-500 leading-relaxed">
            The bar snaps to nice round-number intervals. Changing the target length or segments
            adjusts which interval is used. Changes render immediately on the canvas.
          </p>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-700 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-md font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
