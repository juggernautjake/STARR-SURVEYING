'use client';
// app/admin/cad/components/StatusBar.tsx — Bottom status bar

import { useDrawingStore, useViewportStore, useSelectionStore } from '@/lib/cad/store';

export default function StatusBar() {
  const drawingStore = useDrawingStore();
  const viewportStore = useViewportStore();
  const selectionStore = useSelectionStore();
  const cursor = viewportStore.cursorWorld;

  const { document: doc, activeLayerId } = drawingStore;
  const activeLayer = doc.layers[activeLayerId];
  const { snapEnabled, gridVisible } = doc.settings;
  const selCount = selectionStore.selectionCount();

  function toggleSnap() {
    drawingStore.updateSettings({ snapEnabled: !snapEnabled });
  }

  function toggleGrid() {
    drawingStore.updateSettings({ gridVisible: !gridVisible });
  }

  return (
    <div className="flex items-center bg-gray-900 border-t border-gray-700 px-3 py-0.5 text-xs text-gray-400 gap-4">
      {/* Coordinates */}
      <span className="font-mono">
        X: {cursor.x.toFixed(3)} &nbsp; Y: {cursor.y.toFixed(3)}
      </span>

      <span className="text-gray-600">|</span>

      {/* Active layer */}
      <button
        className="hover:text-white transition-colors"
        title="Active layer"
        onClick={() => drawingStore.setActiveLayer(activeLayerId)}
      >
        Layer: <span className="text-white">{activeLayer?.name ?? '—'}</span>
      </button>

      <span className="text-gray-600">|</span>

      {/* Selection count */}
      {selCount > 0 && (
        <>
          <span className="text-blue-400">{selCount} selected</span>
          <span className="text-gray-600">|</span>
        </>
      )}

      {/* Snap toggle */}
      <button
        onClick={toggleSnap}
        className={`hover:text-white transition-colors ${snapEnabled ? 'text-green-400' : 'text-gray-500'}`}
        title="Toggle snap (F3)"
      >
        Snap: {snapEnabled ? 'ON' : 'OFF'}
      </button>

      <span className="text-gray-600">|</span>

      {/* Grid toggle */}
      <button
        onClick={toggleGrid}
        className={`hover:text-white transition-colors ${gridVisible ? 'text-green-400' : 'text-gray-500'}`}
        title="Toggle grid (F7)"
      >
        Grid: {gridVisible ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}
