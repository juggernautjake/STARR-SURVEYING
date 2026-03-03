'use client';
// app/admin/cad/components/StatusBar.tsx — Bottom status bar

import { useDrawingStore, useViewportStore, useSelectionStore, useToolStore } from '@/lib/cad/store';

const TOOL_LABELS: Record<string, string> = {
  SELECT: 'Select',
  PAN: 'Pan',
  DRAW_POINT: 'Point',
  DRAW_LINE: 'Line',
  DRAW_POLYLINE: 'Polyline',
  DRAW_POLYGON: 'Polygon',
  MOVE: 'Move',
  COPY: 'Copy',
  ROTATE: 'Rotate',
  MIRROR: 'Mirror',
  SCALE: 'Scale',
  ERASE: 'Erase',
};

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
  const { activeTool, drawingPoints, basePoint, rotateCenter } = toolStore.state;

  // Express zoom as a percentage of 1px-per-world-unit baseline
  const zoomPct = Math.round(zoom * 100);

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

      {/* Zoom level */}
      <span className="font-mono shrink-0" title="Current zoom level">
        {zoomPct}%
      </span>

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

      {/* Drawing scale */}
      <span className="text-gray-500 shrink-0" title="Drawing scale">
        1″={drawingScale}′
      </span>
    </div>
  );
}
