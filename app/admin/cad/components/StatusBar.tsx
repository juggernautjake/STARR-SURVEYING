'use client';
// app/admin/cad/components/StatusBar.tsx — Bottom status bar

import { useState, useEffect, useRef } from 'react';
import { useDrawingStore, useViewportStore, useSelectionStore, useToolStore } from '@/lib/cad/store';

const TOOL_LABELS: Record<string, string> = {
  SELECT: 'Select',
  PAN: 'Pan',
  DRAW_POINT: 'Point',
  DRAW_LINE: 'Line',
  DRAW_POLYLINE: 'Polyline',
  DRAW_POLYGON: 'Polygon',
  DRAW_RECTANGLE: 'Rectangle',
  DRAW_REGULAR_POLYGON: 'Reg.Polygon',
  DRAW_CIRCLE: 'Circle',
  MOVE: 'Move',
  COPY: 'Copy',
  ROTATE: 'Rotate',
  MIRROR: 'Mirror',
  SCALE: 'Scale',
  ERASE: 'Erase',
};

const MIN_ZOOM_PCT = 5;
const MAX_ZOOM_PCT = 500;
const ZOOM_STEP_PCT = 25;

export default function StatusBar() {
  const drawingStore = useDrawingStore();
  const viewportStore = useViewportStore();
  const selectionStore = useSelectionStore();
  const toolStore = useToolStore();
  const cursor = viewportStore.cursorWorld;
  const zoom = viewportStore.zoom;

  const { document: doc, activeLayerId } = drawingStore;
  const activeLayer = doc.layers[activeLayerId];
  const { snapEnabled, gridVisible, drawingScale } = doc.settings;
  const selCount = selectionStore.selectionCount();
  const { activeTool, drawingPoints, basePoint, rotateCenter, orthoEnabled, polarEnabled, polarAngle, copyMode } = toolStore.state;

  // Express zoom as a percentage of 1px-per-world-unit baseline
  const zoomPct = Math.round(zoom * 100);

  // Zoom input editing state
  const [zoomEditing, setZoomEditing] = useState(false);
  const [zoomInputValue, setZoomInputValue] = useState('');
  const zoomInputRef = useRef<HTMLInputElement>(null);

  // Sync input value whenever the external zoom changes (not while editing)
  useEffect(() => {
    if (!zoomEditing) {
      setZoomInputValue(String(zoomPct));
    }
  }, [zoomPct, zoomEditing]);

  function applyZoomPct(pct: number) {
    const clamped = Math.max(MIN_ZOOM_PCT, Math.min(MAX_ZOOM_PCT, pct));
    viewportStore.setZoom(clamped / 100);
  }

  function incrementZoom() {
    applyZoomPct(Math.min(MAX_ZOOM_PCT, zoomPct + ZOOM_STEP_PCT));
  }

  function decrementZoom() {
    applyZoomPct(Math.max(MIN_ZOOM_PCT, zoomPct - ZOOM_STEP_PCT));
  }

  function commitZoomInput() {
    const val = parseFloat(zoomInputValue);
    if (!isNaN(val) && val > 0) {
      applyZoomPct(val);
    } else {
      setZoomInputValue(String(zoomPct));
    }
    setZoomEditing(false);
  }

  function handleZoomKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      commitZoomInput();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setZoomInputValue(String(zoomPct));
      setZoomEditing(false);
      (e.target as HTMLInputElement).blur();
    }
  }

  // Live distance/angle when drawing
  let distanceInfo: { dist: string; angle: string } | null = null;
  const lastPt = drawingPoints[drawingPoints.length - 1] ?? basePoint ?? rotateCenter;
  if (lastPt && (activeTool.startsWith('DRAW_') || activeTool === 'MOVE' || activeTool === 'COPY' || activeTool === 'MIRROR')) {
    const dx = cursor.x - lastPt.x;
    const dy = cursor.y - lastPt.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    distanceInfo = { dist: dist.toFixed(3), angle: angleDeg.toFixed(1) };
  }

  function toggleSnap() {
    drawingStore.updateSettings({ snapEnabled: !snapEnabled });
  }

  function toggleGrid() {
    drawingStore.updateSettings({ gridVisible: !gridVisible });
  }

  return (
    <div className="flex items-center bg-gray-900 border-t border-gray-700 px-3 py-0.5 text-xs text-gray-400 gap-4 overflow-hidden">
      {/* Coordinates */}
      <span className="font-mono shrink-0">
        X: {cursor.x.toFixed(3)} &nbsp; Y: {cursor.y.toFixed(3)}
      </span>

      {/* Live dist/angle when drawing */}
      {distanceInfo && (
        <>
          <span className="text-gray-600">|</span>
          <span className="font-mono shrink-0 text-cyan-400">
            d={distanceInfo.dist} ∠{distanceInfo.angle}°
          </span>
        </>
      )}

      <span className="text-gray-600">|</span>

      {/* Zoom control: − [input %] + */}
      <div className="flex items-center gap-0.5 shrink-0" title="Zoom level (Ctrl+scroll to zoom, 5%–500%)">
        <button
          onClick={decrementZoom}
          disabled={zoomPct <= MIN_ZOOM_PCT}
          className="w-4 h-4 flex items-center justify-center rounded text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors leading-none"
          title={`Zoom out 25% (current: ${zoomPct}%)`}
        >
          −
        </button>
        <div className="relative flex items-center">
          <input
            ref={zoomInputRef}
            type="text"
            inputMode="numeric"
            value={zoomEditing ? zoomInputValue : String(zoomPct)}
            onChange={(e) => {
              setZoomEditing(true);
              setZoomInputValue(e.target.value);
            }}
            onFocus={() => {
              setZoomEditing(true);
              setZoomInputValue(String(zoomPct));
              setTimeout(() => zoomInputRef.current?.select(), 0);
            }}
            onBlur={commitZoomInput}
            onKeyDown={handleZoomKeyDown}
            className="w-10 text-center bg-gray-800 border border-gray-600 rounded text-gray-200 font-mono text-xs px-0.5 py-0 focus:outline-none focus:border-blue-500 focus:text-white"
            style={{ height: 18 }}
          />
          <span className="ml-0.5 text-gray-500 font-mono">%</span>
        </div>
        <button
          onClick={incrementZoom}
          disabled={zoomPct >= MAX_ZOOM_PCT}
          className="w-4 h-4 flex items-center justify-center rounded text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors leading-none"
          title={`Zoom in 25% (current: ${zoomPct}%)`}
        >
          +
        </button>
      </div>

      <span className="text-gray-600">|</span>

      {/* Active tool */}
      <span className="shrink-0 text-gray-500" title="Active tool">
        {TOOL_LABELS[activeTool] ?? activeTool}
      </span>

      <span className="text-gray-600">|</span>

      {/* Active layer */}
      <button
        className="hover:text-white transition-colors shrink-0"
        title="Active layer"
        onClick={() => drawingStore.setActiveLayer(activeLayerId)}
      >
        Layer: <span className={activeLayer?.locked ? 'text-yellow-400' : 'text-white'}>{activeLayer?.name ?? '—'}{activeLayer?.locked ? ' 🔒' : ''}</span>
      </button>

      <span className="text-gray-600">|</span>

      {/* Selection count */}
      {selCount > 0 && (
        <>
          <span className="text-blue-400 shrink-0">{selCount} selected</span>
          <span className="text-gray-600">|</span>
        </>
      )}

      {/* Snap toggle */}
      <button
        onClick={toggleSnap}
        className={`hover:text-white transition-colors shrink-0 ${snapEnabled ? 'text-green-400' : 'text-gray-500'}`}
        title="Toggle snap (F3)"
      >
        Snap: {snapEnabled ? 'ON' : 'OFF'}
      </button>

      <span className="text-gray-600">|</span>

      {/* Grid toggle */}
      <button
        onClick={toggleGrid}
        className={`hover:text-white transition-colors shrink-0 ${gridVisible ? 'text-green-400' : 'text-gray-500'}`}
        title="Toggle grid (F7)"
      >
        Grid: {gridVisible ? 'ON' : 'OFF'}
      </button>

      <span className="text-gray-600">|</span>

      {/* Ortho mode */}
      {orthoEnabled && (
        <>
          <span className="text-blue-400 font-semibold shrink-0" title="Ortho mode active — cursor constrained to H/V axes (F8)">ORTHO</span>
          <span className="text-gray-600">|</span>
        </>
      )}

      {/* Polar tracking */}
      {polarEnabled && !orthoEnabled && (
        <>
          <span className="text-indigo-400 font-semibold shrink-0" title={`Polar tracking active at ${polarAngle}° increments (F10)`}>POLAR {polarAngle}°</span>
          <span className="text-gray-600">|</span>
        </>
      )}

      {/* Copy mode */}
      {copyMode && (
        <>
          <span className="text-green-400 font-semibold shrink-0" title="Copy mode: operations will keep the original">COPY</span>
          <span className="text-gray-600">|</span>
        </>
      )}

      {/* Drawing scale */}
      <span className="text-gray-500 shrink-0" title="Drawing scale">
        1″={drawingScale}′
      </span>
    </div>
  );
}
