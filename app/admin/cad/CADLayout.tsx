'use client';
// app/admin/cad/CADLayout.tsx — Main CAD editor UI shell

import { useEffect, useRef, useState } from 'react';
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
import ImportDialog from './components/ImportDialog';
import AIDrawingDialog from './components/AIDrawingDialog';
import QuestionDialog from './components/QuestionDialog';
import ElementExplanationPopup from './components/ElementExplanationPopup';
import CompletenessPanel from './components/CompletenessPanel';
import RPLSSubmissionDialog from './components/RPLSSubmissionDialog';
import RPLSReviewModePanel from './components/RPLSReviewModePanel';
import SealHashBanner from './components/SealHashBanner';
import ReviewQueuePanel from './components/ReviewQueuePanel';
import PointTablePanel from './components/PointTablePanel';
import TraversePanel from './components/TraversePanel';
import CurveCalculator from './components/CurveCalculator';
import NewDrawingDialog from './components/NewDrawingDialog';
import DisplayPreferencesPanel, { DisplayPrefsToggleButton } from './components/DisplayPreferencesPanel';
import OrientationDialog from './components/OrientationDialog';
import DrawingRotationDialog from './components/DrawingRotationDialog';
import TitleBlockPanel from './components/TitleBlockPanel';
import ImagePanel from './components/ImagePanel';
import HiddenItemsPanel from './components/HiddenItemsPanel';
import LayerPreferencesPanel from './components/LayerPreferencesPanel';
import FeatureLabelPreferencesPanel from './components/FeatureLabelPreferencesPanel';
import { useUIStore, useDrawingStore, useSelectionStore, useUndoStore, useAIStore } from '@/lib/cad/store';
import type { CompletenessSummary } from '@/lib/cad/delivery';
import { useUnsavedChangesGuard } from './hooks/useUnsavedChangesGuard';
import { cadLog } from '@/lib/cad/logger';
import { validateAndMigrateDocument } from '@/lib/cad/validate';

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
/** Fallback periodic interval (ms) — overridden by autoSaveIntervalSec setting */
const DEFAULT_AUTOSAVE_INTERVAL_MS = 60_000;
/** Debounce delay (ms) after a document change before writing to IndexedDB */
const AUTOSAVE_DEBOUNCE_MS = 5_000;

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
  const selectionStore = useSelectionStore();
  const undoStore = useUndoStore();
  const [autoSaveFailed, setAutoSaveFailed] = useState(false);
  const [featureDialog, setFeatureDialog] = useState<{
    featureId: string;
    x: number;
    y: number;
  } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showAIDrawingDialog, setShowAIDrawingDialog] = useState(false);
  const [showPointTable, setShowPointTable] = useState(false);
  const [showTraversePanel, setShowTraversePanel] = useState(false);
  const [showCurveCalculator, setShowCurveCalculator] = useState(false);
  const [showDrawingRotation, setShowDrawingRotation] = useState(false);
  const [showTitleBlock, setShowTitleBlock] = useState(false);
  const [showImagePanel, setShowImagePanel] = useState(false);
  /** When set, DRAW_IMAGE tool should pre-select this image id */
  const [pendingPlaceImageId, setPendingPlaceImageId] = useState<string | null>(null);

  // Register beforeunload guard (shows native "Leave site?" dialog when dirty)
  useUnsavedChangesGuard();
  const [showNewDrawingDialog, setShowNewDrawingDialog] = useState(false);
  const [showDisplayPrefs, setShowDisplayPrefs] = useState(false);
  const [showOrientationDialog, setShowOrientationDialog] = useState(false);
  const [showHiddenItems, setShowHiddenItems] = useState(false);
  const [showCompletenessPanel, setShowCompletenessPanel] = useState(false);
  const [showReviewModePanel, setShowReviewModePanel] = useState(false);
  const [pendingSubmission, setPendingSubmission] =
    useState<CompletenessSummary | null>(null);
  const [layerPrefsLayerId, setLayerPrefsLayerId] = useState<string | null>(null);
  const [featureLabelPrefsId, setFeatureLabelPrefsId] = useState<string | null>(null);
  const [recoveryPayload, setRecoveryPayload] = useState<{
    savedAt: string;
    document: unknown;
  } | null>(null);

  // On mount: check for a pending RECON import, then check IndexedDB for a crash-recovery autosave
  useEffect(() => {
    // ── RECON → CAD import ──────────────────────────────────────────────────
    // When the user clicks "Open in CAD Editor" in the RECON research interface,
    // the converted DrawingDocument is stored in localStorage under this key.
    // We pick it up here and load it, bypassing the normal autosave recovery flow.
    const RECON_PENDING_KEY = 'starr-cad-pending-recon';
    const pendingRecon = localStorage.getItem(RECON_PENDING_KEY);
    if (pendingRecon) {
      localStorage.removeItem(RECON_PENDING_KEY);
      try {
        const reconDoc = validateAndMigrateDocument(JSON.parse(pendingRecon));
        drawingStore.loadDocument(reconDoc);
        selectionStore.deselectAll();
        undoStore.clear();
        cadLog.info('ReconImport', `Loaded RECON drawing: ${reconDoc.name}`);
        setTimeout(() => window.dispatchEvent(new CustomEvent('cad:zoomExtents')), 200);
        return; // Skip autosave-recovery check — the RECON import takes priority
      } catch (err) {
        cadLog.error('ReconImport', 'Failed to load pending RECON drawing — falling through to autosave', err);
        // Fall through to the normal autosave flow below
      }
    }

    // ── Existing crash-recovery autosave check ──────────────────────────────
    readAutosave().then((saved) => {
      if (!saved?.savedAt) {
        // No autosave — show new drawing dialog if starting blank
        if (drawingStore.document.layerOrder.length === 0) {
          setShowNewDrawingDialog(true);
        }
        return;
      }
      const savedTime = new Date(saved.savedAt).getTime();
      const docTime = new Date(drawingStore.document.modified).getTime();
      // Offer recovery only when the autosave is meaningfully newer (> 5 s)
      if (savedTime - docTime > 5_000) {
        setRecoveryPayload(saved);
      } else if (drawingStore.document.layerOrder.length === 0) {
        setShowNewDrawingDialog(true);
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

  // Listen for new drawing dialog event (dispatched by MenuBar "New Drawing")
  useEffect(() => {
    const handler = () => setShowNewDrawingDialog(true);
    window.addEventListener('cad:openNewDrawingDialog', handler);
    return () => window.removeEventListener('cad:openNewDrawingDialog', handler);
  }, []);

  // Listen for layer preferences open event
  useEffect(() => {
    const handler = (e: Event) => {
      const { layerId } = (e as CustomEvent).detail as { layerId: string };
      setLayerPrefsLayerId(layerId);
    };
    window.addEventListener('cad:openLayerPrefs', handler);
    return () => window.removeEventListener('cad:openLayerPrefs', handler);
  }, []);

  // Listen for feature label preferences open event
  useEffect(() => {
    const handler = (e: Event) => {
      const { featureId } = (e as CustomEvent).detail as { featureId: string };
      setFeatureLabelPrefsId(featureId);
    };
    window.addEventListener('cad:openFeatureLabelPrefs', handler);
    return () => window.removeEventListener('cad:openFeatureLabelPrefs', handler);
  }, []);

  // Listen for hidden items panel toggle event
  useEffect(() => {
    const handler = () => setShowHiddenItems((v) => !v);
    window.addEventListener('cad:toggleHiddenItems', handler);
    return () => window.removeEventListener('cad:toggleHiddenItems', handler);
  }, []);

  // ─── Autosave helpers ────────────────────────────────────────────────────────
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function performAutosave() {
    if (!drawingStore.document.settings.autoSaveEnabled) return;
    try {
      const payload = {
        version: '1.0',
        application: 'starr-cad',
        savedAt: new Date().toISOString(),
        document: drawingStore.document,
      };
      await writeAutosave(payload);
      setAutoSaveFailed(false);
      cadLog.debug('AutoSave', `Auto-saved drawing: ${drawingStore.document.name}`);
    } catch (err) {
      setAutoSaveFailed(true);
      cadLog.warn('AutoSave', 'Auto-save failed', err);
    }
  }

  // Debounced autosave — fires 5 s after every document change
  useEffect(() => {
    if (!drawingStore.isDirty) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => { void performAutosave(); }, AUTOSAVE_DEBOUNCE_MS);
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawingStore.document]);

  // Periodic autosave — interval driven by the user's autoSaveIntervalSec setting
  useEffect(() => {
    const intervalMs =
      (drawingStore.document.settings.autoSaveIntervalSec ?? 120) * 1_000 ||
      DEFAULT_AUTOSAVE_INTERVAL_MS;
    const interval = setInterval(() => { void performAutosave(); }, intervalMs);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawingStore.document.settings.autoSaveIntervalSec, drawingStore.document.settings.autoSaveEnabled]);

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-white select-none">
      {/* Crash-recovery dialog — offered when an autosave newer than current document is found */}
      {recoveryPayload && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 animate-[fadeIn_150ms_ease-out]">
          <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl p-5 max-w-md w-full text-sm text-gray-200 space-y-4 animate-[scaleIn_200ms_cubic-bezier(0.16,1,0.3,1)]">
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
                  try {
                    const doc = validateAndMigrateDocument(recoveryPayload.document);
                    drawingStore.loadDocument(doc);
                    selectionStore.deselectAll();
                    undoStore.clear();
                    cadLog.info('AutoSave', `Recovered drawing: ${doc.name}`);
                  } catch (err) {
                    cadLog.error('AutoSave', 'Recovery failed — document was invalid', err);
                    alert('The auto-save could not be recovered (invalid format). Starting fresh.');
                  }
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
        <div className="bg-yellow-500 text-black text-xs px-3 py-1 flex justify-between items-center animate-[slideInDown_200ms_cubic-bezier(0.16,1,0.3,1)]">
          <span>⚠️ Auto-save failed. Please save manually with Ctrl+S.</span>
          <button onClick={() => setAutoSaveFailed(false)} className="ml-4 font-bold">✕</button>
        </div>
      )}

      {/* Phase 7 §8.3 seal hash-mismatch banner — sticky strip
          flagged when the active document's content has drifted
          from the recorded seal hash */}
      <SealHashBanner onOpenReviewMode={() => setShowReviewModePanel(true)} />

      {/* Top menu bar */}
      <MenuBar
        onOpenImport={() => setShowImportDialog(true)}
        onOpenAIDrawing={() => setShowAIDrawingDialog(true)}
        onTogglePointTable={() => setShowPointTable(p => !p)}
        onToggleTraversePanel={() => setShowTraversePanel(p => !p)}
        onOpenCurveCalculator={() => setShowCurveCalculator(true)}
        onOpenOrientationDialog={() => setShowOrientationDialog(true)}
        onOpenDrawingRotation={() => setShowDrawingRotation(true)}
        onOpenTitleBlock={() => setShowTitleBlock(true)}
        onToggleImagePanel={() => setShowImagePanel(p => !p)}
        onToggleCompletenessPanel={() => setShowCompletenessPanel(p => !p)}
        onToggleReviewModePanel={() => setShowReviewModePanel(p => !p)}
      />

      {/* Contextual tool options strip — with Prefs button on the right */}
      <div className="relative flex items-stretch shrink-0">
        <div className="flex-1 min-w-0">
          <ToolOptionsBar />
        </div>
        {/* Display Preferences toggle button — always visible at right end of toolbar */}
        <div
          className="flex items-center px-2 border-b border-l border-gray-700 shrink-0"
          style={{ backgroundColor: '#1a1f2e' }}
        >
          <DisplayPrefsToggleButton
            open={showDisplayPrefs}
            onToggle={() => setShowDisplayPrefs((v) => !v)}
          />
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar: tools */}
        <div className="flex flex-col bg-gray-800 border-r border-gray-700" style={{ width: 52 }}>
          <ToolBar />
        </div>

        {/* Layer panel (toggleable) */}
        {showLayerPanel && (
          <div className="flex flex-col bg-gray-800 border-r border-gray-700 w-48 cad-slide-left">
            <LayerPanel />
          </div>
        )}

        {/* Canvas fills remaining space */}
        <div className="flex-1 relative min-w-0">
          <CanvasViewport pendingPlaceImageId={pendingPlaceImageId} onPlaceImageConsumed={() => setPendingPlaceImageId(null)} />
          {/* Display Preferences slide-down panel — anchored to top-right of canvas */}
          <div className="absolute top-0 right-0 z-30">
            <DisplayPreferencesPanel
              open={showDisplayPrefs}
              onClose={() => setShowDisplayPrefs(false)}
            />
          </div>
          {/* Title Block panel — slides in from right over canvas */}
          {showTitleBlock && (
            <div className="absolute inset-y-0 right-0 z-20">
              <TitleBlockPanel open={showTitleBlock} onClose={() => setShowTitleBlock(false)} />
            </div>
          )}
          {/* Layer Preferences panel — anchored to right side of canvas */}
          {layerPrefsLayerId && !showTitleBlock && (
            <LayerPreferencesPanel
              layerId={layerPrefsLayerId}
              open={!!layerPrefsLayerId}
              onClose={() => setLayerPrefsLayerId(null)}
            />
          )}
          {/* Feature Label Preferences panel — anchored to right side of canvas */}
          {featureLabelPrefsId && drawingStore.getFeature(featureLabelPrefsId) && !showTitleBlock && (
            <FeatureLabelPreferencesPanel
              featureId={featureLabelPrefsId}
              open={!!featureLabelPrefsId}
              onClose={() => setFeatureLabelPrefsId(null)}
            />
          )}
          {/* Hidden Items panel — anchored to left side of canvas */}
          <HiddenItemsPanel
            open={showHiddenItems}
            onClose={() => setShowHiddenItems(false)}
          />
        </div>

        {/* Right sidebar: property panel + traverse panel + image panel (toggleable) */}
        {(showPropertyPanel || showTraversePanel || showImagePanel) && (
          <div className="flex bg-gray-800 border-l border-gray-700 flex-shrink-0 cad-slide-right w-48">
            <div className="flex flex-col flex-1 min-w-0">
              {showPropertyPanel && <PropertyPanel />}
              {showTraversePanel && (
                <div className="flex-1 overflow-hidden">
                  <TraversePanel />
                </div>
              )}
              {showImagePanel && (
                <ImagePanel
                  open={showImagePanel}
                  onClose={() => setShowImagePanel(false)}
                  onPlaceImage={(imgId) => {
                    setPendingPlaceImageId(imgId);
                    // Switch to image tool
                    window.dispatchEvent(new CustomEvent('cad:activateTool', { detail: { tool: 'DRAW_IMAGE' } }));
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom area: command bar + optional point table + status bar */}
      <CommandBar />
      {showPointTable && (
        <div className="h-48 border-t border-gray-700 shrink-0 animate-[slideInUp_200ms_cubic-bezier(0.16,1,0.3,1)]">
          <PointTablePanel
            codeDisplayMode={drawingStore.document.settings.codeDisplayMode ?? 'ALPHA'}
            onCodeDisplayModeChange={(mode) => drawingStore.updateSettings({ codeDisplayMode: mode })}
          />
        </div>
      )}
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

      {/* Curve Calculator dialog */}
      {showCurveCalculator && <CurveCalculator onClose={() => setShowCurveCalculator(false)} />}

      {/* Survey Orientation Adjustment dialog */}
      {showOrientationDialog && <OrientationDialog onClose={() => setShowOrientationDialog(false)} />}

      {/* Drawing Rotation dialog */}
      {showDrawingRotation && <DrawingRotationDialog onClose={() => setShowDrawingRotation(false)} />}

      {/* Import field data dialog */}
      {showImportDialog && (
        <ImportDialog
          onClose={() => setShowImportDialog(false)}
          onImportComplete={() => { setShowImportDialog(false); setShowPointTable(true); }}
        />
      )}

      {/* Phase 6 AI drawing pipeline dialog */}
      {showAIDrawingDialog && (
        <AIDrawingDialog onClose={() => setShowAIDrawingDialog(false)} />
      )}

      {/* Phase 6 review queue panel — visibility tracked in
          useAIStore so other surfaces can pop it open */}
      <ReviewQueuePanel />

      {/* Phase 6 §28.4 clarifying-question dialog — auto-opened
          when deliberation flags shouldShowDialog */}
      <QuestionDialog />

      {/* Phase 6 §30.3 element-explanation popup — opened by
          clicking a review-queue card */}
      <ElementExplanationPopup />

      {/* Phase 7 §6.2 completeness checklist — slides in from the
          right, gates "Mark Ready for RPLS Review" on summary.ready */}
      <CompletenessPanel
        open={showCompletenessPanel}
        onClose={() => setShowCompletenessPanel(false)}
        onFix={(hint) => {
          if (hint === 'TITLE_BLOCK') {
            setShowTitleBlock(true);
          } else if (hint === 'REVIEW_QUEUE') {
            useAIStore.getState().openQueuePanel();
          } else if (hint === 'LAYERS') {
            const ui = useUIStore.getState();
            if (!ui.showLayerPanel) ui.toggleLayerPanel();
          }
        }}
        onMarkReady={(_checks, summary) => {
          // §7.2 — open the submission dialog so the surveyor
          // can review the resolved RPLS, add a message, and
          // explicitly confirm. The dialog runs the actual
          // markReadyForReview transition.
          setPendingSubmission(summary);
          window.dispatchEvent(
            new CustomEvent('cad:completenessReady', { detail: summary })
          );
        }}
      />

      {/* Phase 7 §7.2 RPLS submission dialog — opened by the
          completeness panel after Mark Ready */}
      <RPLSSubmissionDialog
        open={pendingSubmission !== null}
        summary={pendingSubmission}
        onClose={() => setPendingSubmission(null)}
      />

      {/* Phase 7 §7.3 RPLS review-mode panel — opens from the
          File menu and switches its body based on workflow status */}
      <RPLSReviewModePanel
        open={showReviewModePanel}
        onClose={() => setShowReviewModePanel(false)}
      />

      {/* New Drawing / Get Started dialog */}
      {showNewDrawingDialog && (
        <NewDrawingDialog
          onClose={() => setShowNewDrawingDialog(false)}
          onImport={() => { setShowNewDrawingDialog(false); setShowImportDialog(true); }}
        />
      )}
    </div>
  );
}
