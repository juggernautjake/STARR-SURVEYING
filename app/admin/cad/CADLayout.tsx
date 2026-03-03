'use client';
// app/admin/cad/CADLayout.tsx — Main CAD editor UI shell

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import MenuBar from './components/MenuBar';
import ToolBar from './components/ToolBar';
import LayerPanel from './components/LayerPanel';
import PropertyPanel from './components/PropertyPanel';
import CommandBar from './components/CommandBar';
import StatusBar from './components/StatusBar';
import ToolOptionsBar from './components/ToolOptionsBar';
import FeaturePropertiesDialog from './components/FeaturePropertiesDialog';
import SettingsDialog from './components/SettingsDialog';
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

const AUTOSAVE_DB = 'starr-cad';
const AUTOSAVE_STORE = 'autosave';
const AUTOSAVE_KEY = 'current';
const AUTOSAVE_INTERVAL = 60_000;

/** Open (or create) the IndexedDB autosave store */
function openAutosaveDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(AUTOSAVE_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(AUTOSAVE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Write a value to the autosave store */
async function writeAutosave(value: unknown): Promise<void> {
  const db = await openAutosaveDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUTOSAVE_STORE, 'readwrite');
    tx.objectStore(AUTOSAVE_STORE).put(value, AUTOSAVE_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Read the autosave entry from IndexedDB */
async function readAutosave(): Promise<{ savedAt: string; document: unknown } | null> {
  try {
    const db = await openAutosaveDB();
    return new Promise((resolve) => {
      const tx = db.transaction(AUTOSAVE_STORE, 'readonly');
      const req = tx.objectStore(AUTOSAVE_STORE).get(AUTOSAVE_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    });
  } catch {
    return null;
  }
}

export default function CADLayout() {
  const { showLayerPanel, showPropertyPanel } = useUIStore();
  const drawingStore = useDrawingStore();
  const [autoSaveFailed, setAutoSaveFailed] = useState(false);
  const [featureDialog, setFeatureDialog] = useState<{
    featureId: string;
    x: number;
    y: number;
  } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [recoveryPayload, setRecoveryPayload] = useState<{
    savedAt: string;
    document: unknown;
  } | null>(null);

  // On mount: check IndexedDB for a crash-recovery autosave
  useEffect(() => {
    readAutosave().then((saved) => {
      if (!saved?.savedAt) return;
      const savedTime = new Date(saved.savedAt).getTime();
      const docTime = new Date(drawingStore.document.modified).getTime();
      // Offer recovery only when the autosave is meaningfully newer (> 5 s)
      if (savedTime - docTime > 5_000) {
        setRecoveryPayload(saved);
      }
    });
    // Zoom to a sensible default view after the canvas initialises
    const timer = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('cad:zoomExtents'));
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for feature dialog open events dispatched from CanvasViewport
  useEffect(() => {
    const handler = (e: Event) => {
      const { featureId, x, y } = (e as CustomEvent).detail as {
        featureId: string;
        x: number;
        y: number;
      };
      setFeatureDialog({ featureId, x, y });
    };
    window.addEventListener('cad:openFeatureDialog', handler);
    return () => window.removeEventListener('cad:openFeatureDialog', handler);
  }, []);

  // Listen for settings open event
  useEffect(() => {
    const handler = () => setShowSettings(true);
    window.addEventListener('cad:openSettings', handler);
    return () => window.removeEventListener('cad:openSettings', handler);
  }, []);

  // Auto-save to IndexedDB every 60 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const payload = {
          version: '1.0',
          application: 'starr-cad',
          savedAt: new Date().toISOString(),
          document: drawingStore.document,
        };
        await writeAutosave(payload);
        setAutoSaveFailed(false);
      } catch {
        // IndexedDB not available or quota exceeded — warn user
        setAutoSaveFailed(true);
      }
    }, AUTOSAVE_INTERVAL);
    return () => clearInterval(interval);
  }, [drawingStore]);

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-white select-none">
      {/* Crash-recovery dialog — offered when an autosave newer than current document is found */}
      {recoveryPayload && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70">
          <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl p-5 max-w-md w-full text-sm text-gray-200 space-y-4">
            <h2 className="text-white font-semibold text-base">Recover Unsaved Drawing?</h2>
            <p className="text-gray-400 text-xs leading-relaxed">
              An auto-saved version from{' '}
              <strong className="text-white">{new Date(recoveryPayload.savedAt).toLocaleString()}</strong>{' '}
              was found — this is newer than the current document. Would you like to restore it?
            </p>
            <div className="flex gap-3 justify-end pt-2">
              <button
                className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs transition-colors"
                onClick={() => setRecoveryPayload(null)}
              >
                Discard & Start Fresh
              </button>
              <button
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs transition-colors"
                onClick={() => {
                  const payload = recoveryPayload.document as Parameters<typeof drawingStore.loadDocument>[0];
                  drawingStore.loadDocument(payload);
                  setRecoveryPayload(null);
                  // Zoom to the recovered drawing's extents
                  setTimeout(() => window.dispatchEvent(new CustomEvent('cad:zoomExtents')), 200);
                }}
              >
                Recover Drawing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-save failure warning */}
      {autoSaveFailed && (
        <div className="bg-yellow-500 text-black text-xs px-3 py-1 flex justify-between items-center">
          <span>⚠️ Auto-save failed. Please save manually with Ctrl+S.</span>
          <button onClick={() => setAutoSaveFailed(false)} className="ml-4 font-bold">✕</button>
        </div>
      )}

      {/* Top menu bar */}
      <MenuBar />

      {/* Contextual tool options strip */}
      <ToolOptionsBar />

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar: tools */}
        <div className="flex flex-col bg-gray-800 border-r border-gray-700" style={{ width: 48 }}>
          <ToolBar />
        </div>

        {/* Layer panel (toggleable) */}
        {showLayerPanel && (
          <div className="flex flex-col bg-gray-800 border-r border-gray-700 w-48">
            <LayerPanel />
          </div>
        )}

        {/* Canvas fills remaining space */}
        <div className="flex-1 relative min-w-0">
          <CanvasViewport />
        </div>

        {/* Right sidebar: property panel (toggleable) */}
        {showPropertyPanel && (
          <div className="flex flex-col bg-gray-800 border-l border-gray-700 w-48 flex-shrink-0">
            <PropertyPanel />
          </div>
        )}
      </div>

      {/* Bottom area: command bar + status bar */}
      <CommandBar />
      <StatusBar />

      {/* Feature properties dialog (opened by double-clicking a feature) */}
      {featureDialog && drawingStore.getFeature(featureDialog.featureId) && (
        <FeaturePropertiesDialog
          featureId={featureDialog.featureId}
          initialX={featureDialog.x}
          initialY={featureDialog.y}
          onClose={() => setFeatureDialog(null)}
        />
      )}

      {/* Settings dialog */}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  );
}
