'use client';
// app/admin/cad/components/AreaMeasureHUD.tsx
//
// Slice W10 (hub-cad-roles-polish-2026-06-18) — sticky in-canvas
// HUD for the MEASURE_AREA tool.
//
// Before W10 the tool's only feedback was a transient line in
// the bottom-left command bar, no in-place controls, and 4 px
// vertex markers (the user's complaint: "the area tool is
// weird … hit targets are tiny, no preview line, no undo, no
// auto-close").
//
// The HUD pops a small panel at the bottom-right of the canvas
// whenever MEASURE_AREA is the active tool. It shows:
//   - Live vertex count + perimeter (ft) + close-back leg (ft)
//   - Live area (sq ft + acres) once ≥ 3 vertices exist
//   - "Undo last" (pops the last vertex) + Backspace hotkey hint
//   - "Snap to foot" toggle — when on, vertex clicks round to
//     the nearest 1 ft via a `cad:setAreaSnap` event the
//     CanvasViewport listens for
//   - "Clear" — drops every vertex
//   - "Close & log" — writes the final readout into the
//     command bar (same payload the CanvasViewport already
//     emits) then clears
//
// The HUD never renders when the active tool is something
// else, so it stays out of the way for the rest of the editor.

import { useEffect, useState } from 'react';
import { useToolStore } from '@/lib/cad/store';
import { summarizeAreaMeasurement } from '@/lib/cad/geometry/area-measurement';

export default function AreaMeasureHUD() {
  const activeTool = useToolStore((s) => s.state.activeTool);
  const drawingPoints = useToolStore((s) => s.state.drawingPoints);
  const popDrawingPoint = useToolStore((s) => s.popDrawingPoint);
  const clearDrawingPoints = useToolStore((s) => s.clearDrawingPoints);

  const [snapToFoot, setSnapToFoot] = useState<boolean>(false);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('cad:setAreaSnap', { detail: { enabled: snapToFoot, stepFt: 1 } }),
    );
  }, [snapToFoot]);

  useEffect(() => {
    if (activeTool !== 'MEASURE_AREA') return;
    function onKey(e: KeyboardEvent) {
      // Backspace removes the last vertex when the user is
      // mid-measurement. We intentionally skip when a text input
      // is focused so we don't fight the command-bar typing.
      if (e.key !== 'Backspace') return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (useToolStore.getState().state.drawingPoints.length === 0) return;
      e.preventDefault();
      useToolStore.getState().popDrawingPoint();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTool]);

  if (activeTool !== 'MEASURE_AREA') return null;

  const summary = summarizeAreaMeasurement(drawingPoints);
  const hasArea = summary.area !== null;

  function closeAndLog() {
    if (drawingPoints.length === 0) return;
    const text = hasArea
      ? `MEASURE AREA — vertices: ${summary.vertexCount}, perimeter: ${summary.closedPerimeterFt.toFixed(2)}′, area: ${summary.area!.squareFeet.toFixed(2)} sq ft (${summary.area!.acres.toFixed(4)} ac)`
      : `MEASURE AREA — ${summary.vertexCount} vertex(es); need ≥ 3 for a closed area.`;
    window.dispatchEvent(new CustomEvent('cad:commandOutput', { detail: { text } }));
    clearDrawingPoints();
  }

  return (
    <div
      data-testid="area-measure-hud"
      className="fixed bottom-12 right-6 z-40 pointer-events-auto"
      role="region"
      aria-label="Area measurement"
    >
      <div className="bg-gray-900/95 border border-pink-500/60 rounded-lg shadow-2xl px-3 py-2 text-[12px] text-gray-200 min-w-[240px]">
        <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-gray-700/60">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-pink-500" aria-hidden />
            <span className="font-semibold text-pink-200 text-[11px] uppercase tracking-wide">
              Measure area
            </span>
          </div>
          <span className="text-[10px] text-gray-500">{summary.vertexCount} pts</span>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 mb-2">
          <dt className="text-gray-400 text-[10px] uppercase">Perimeter</dt>
          <dd
            className="text-gray-100 font-mono text-right"
            data-testid="area-measure-hud-perimeter"
          >
            {summary.closedPerimeterFt.toFixed(2)}′
          </dd>
          <dt className="text-gray-400 text-[10px] uppercase">Area</dt>
          <dd
            className="text-gray-100 font-mono text-right"
            data-testid="area-measure-hud-area-sqft"
          >
            {hasArea ? `${summary.area!.squareFeet.toFixed(2)} sq ft` : '—'}
          </dd>
          <dt className="text-gray-400 text-[10px] uppercase">Acres</dt>
          <dd
            className="text-gray-100 font-mono text-right"
            data-testid="area-measure-hud-acres"
          >
            {hasArea ? summary.area!.acres.toFixed(4) : '—'}
          </dd>
        </dl>

        <label className="flex items-center gap-2 mb-2 text-[11px] text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={snapToFoot}
            onChange={(e) => setSnapToFoot(e.target.checked)}
            data-testid="area-measure-hud-snap-toggle"
          />
          <span>Snap to nearest foot</span>
        </label>

        <div className="grid grid-cols-3 gap-1">
          <button
            type="button"
            onClick={popDrawingPoint}
            disabled={drawingPoints.length === 0}
            className="text-[11px] px-2 py-1 rounded border border-gray-700 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Undo last vertex (Backspace)"
            data-testid="area-measure-hud-undo"
          >
            ↶ Undo
          </button>
          <button
            type="button"
            onClick={clearDrawingPoints}
            disabled={drawingPoints.length === 0}
            className="text-[11px] px-2 py-1 rounded border border-gray-700 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Drop every vertex"
            data-testid="area-measure-hud-clear"
          >
            ✕ Clear
          </button>
          <button
            type="button"
            onClick={closeAndLog}
            disabled={drawingPoints.length === 0}
            className="text-[11px] px-2 py-1 rounded border border-pink-500/60 bg-pink-500/20 text-pink-100 hover:bg-pink-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Close polygon + log to command bar"
            data-testid="area-measure-hud-close"
          >
            ⏎ Close
          </button>
        </div>
      </div>
    </div>
  );
}
