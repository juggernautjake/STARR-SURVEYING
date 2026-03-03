'use client';
// app/admin/cad/CADLayout.tsx — Main CAD editor UI shell

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import MenuBar from './components/MenuBar';
import ToolBar from './components/ToolBar';
import LayerPanel from './components/LayerPanel';
import CommandBar from './components/CommandBar';
import StatusBar from './components/StatusBar';
import { useUIStore, useDrawingStore } from '@/lib/cad/store';

// CanvasViewport requires browser APIs; load it client-side only
const CanvasViewport = dynamic(() => import('./components/CanvasViewport'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-gray-100 text-gray-400">
      Loading canvas…
    </div>
  ),
});

const AUTOSAVE_KEY = 'starr-cad-autosave';
const AUTOSAVE_INTERVAL = 60_000;

export default function CADLayout() {
  const { showLayerPanel } = useUIStore();
  const drawingStore = useDrawingStore();
  const [autoSaveFailed, setAutoSaveFailed] = useState(false);

  // Auto-save to localStorage every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      try {
        const payload = {
          version: '1.0',
          application: 'starr-cad',
          savedAt: new Date().toISOString(),
          document: drawingStore.document,
        };
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
        setAutoSaveFailed(false);
      } catch {
        // Storage quota exceeded or serialization error — warn user
        setAutoSaveFailed(true);
      }
    }, AUTOSAVE_INTERVAL);
    return () => clearInterval(interval);
  }, [drawingStore]);

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-white select-none">
      {/* Auto-save failure warning */}
      {autoSaveFailed && (
        <div className="bg-yellow-500 text-black text-xs px-3 py-1 flex justify-between items-center">
          <span>⚠️ Auto-save failed (storage full). Please save manually with Ctrl+S.</span>
          <button onClick={() => setAutoSaveFailed(false)} className="ml-4 font-bold">✕</button>
        </div>
      )}

      {/* Top menu bar */}
      <MenuBar />

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar: tools + layer panel */}
        <div className="flex flex-col bg-gray-800 border-r border-gray-700" style={{ width: 48 }}>
          <ToolBar />
        </div>

        {showLayerPanel && (
          <div className="flex flex-col bg-gray-800 border-r border-gray-700 w-48">
            <LayerPanel />
          </div>
        )}

        {/* Canvas fills remaining space */}
        <div className="flex-1 relative min-w-0">
          <CanvasViewport />
        </div>
      </div>

      {/* Bottom area: command bar + status bar */}
      <CommandBar />
      <StatusBar />
    </div>
  );
}
