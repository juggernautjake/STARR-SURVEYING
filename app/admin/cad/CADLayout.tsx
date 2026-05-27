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
import UndoRedoButtons from './components/UndoRedoButtons';
import CommandPalette from './components/CommandPalette';
import ConfirmDialog from './components/ConfirmDialog';
import KeyboardShortcutOverlay from './components/KeyboardShortcutOverlay';
import FeaturePropertiesDialog from './components/FeaturePropertiesDialog';
import SettingsDialog from './components/SettingsDialog';
import LayerTransferDialog from './components/LayerTransferDialog';
import IntersectDialog from './components/IntersectDialog';
import CalcPointDialog from './components/CalcPointDialog';
import CloseDrawingDialog from './components/CloseDrawingDialog';
import SketchReconcileDialog from './components/SketchReconcileDialog';
import ImportDialog from './components/ImportDialog';
import AIDrawingDialog from './components/AIDrawingDialog';
import QuestionDialog from './components/QuestionDialog';
import ElementExplanationPopup from './components/ElementExplanationPopup';
import AIProvenancePopup from './components/AIProvenancePopup';
import CopilotCard from './components/CopilotCard';
import AICopilotSidebar from './components/AICopilotSidebar';
import AIChatDock from './components/AIChatDock';
import { useAIConversationsStore } from '@/lib/cad/store/ai-conversations-store';
import AIAutoRunner from './components/AIAutoRunner';
import ChordHUD from './components/ChordHUD';
import CompletenessPanel from './components/CompletenessPanel';
import RPLSSubmissionDialog from './components/RPLSSubmissionDialog';
import RPLSReviewModePanel from './components/RPLSReviewModePanel';
import SealHashBanner from './components/SealHashBanner';
import { TooltipProvider } from './components/TooltipProvider';
import SurveyDescriptionPanel from './components/SurveyDescriptionPanel';
import DeliveryHydrator from './components/DeliveryHydrator';
import RecentRecoveriesDialog from './components/RecentRecoveriesDialog';
import CodeStylePanel from './components/CodeStylePanel';
import AISidebar from './components/AISidebar';
import BidirectionalSync from './components/BidirectionalSync';
import ReviewQueuePanel from './components/ReviewQueuePanel';
import PointTablePanel from './components/PointTablePanel';
import TraversePanel from './components/TraversePanel';
import CurveCalculator from './components/CurveCalculator';
import NewDrawingDialog from './components/NewDrawingDialog';
import DisplayPreferencesPanel, { DisplayPrefsToggleButton } from './components/DisplayPreferencesPanel';
import FullscreenToggle from './components/FullscreenToggle';
import ResizeHandle from './components/ResizeHandle';
import { usePanelSize } from './hooks/usePanelSize';
import PointDataViewer from './components/PointDataViewer';
import RenameConfirmDialog, { type RenameDialogData } from './components/RenameConfirmDialog';
import TraverseViewer from './components/TraverseViewer';
import { findNameReferences, planRename, planDuplicate, nameIsTaken } from '@/lib/cad/points/point-rename';
import { makeBatchEntry } from '@/lib/cad/store';
import OrientationDialog from './components/OrientationDialog';
import DrawingRotationDialog from './components/DrawingRotationDialog';
import TitleBlockPanel from './components/TitleBlockPanel';
import ImagePanel from './components/ImagePanel';
import HiddenItemsPanel from './components/HiddenItemsPanel';
import LayerPreferencesPanel from './components/LayerPreferencesPanel';
import FeatureLabelPreferencesPanel from './components/FeatureLabelPreferencesPanel';
import {
  useUIStore,
  useDrawingStore,
  useSelectionStore,
  useUndoStore,
  useAIStore,
  useDeliveryStore,
  useReviewWorkflowStore,
  useTransferStore,
  useImportStore,
} from '@/lib/cad/store';
import type { CompletenessSummary } from '@/lib/cad/delivery';
import { useUnsavedChangesGuard } from './hooks/useUnsavedChangesGuard';
import { useHotkeys } from './hooks/useHotkeys';
import { cadLog } from '@/lib/cad/logger';
import { validateAndMigrateDocument } from '@/lib/cad/validate';
import {
  mountLinkedInstanceSubscriber,
  unmountLinkedInstanceSubscriber,
} from '@/lib/cad/operations/linked-instances';
import {
  clearAutosave,
  readAutosave,
  writeAutosave,
} from '@/lib/cad/persistence/autosave';
import {
  buildSettingsPatch as buildCompassSettingsPatch,
  consumePendingCompassJob,
  isStale as isCompassPayloadStale,
  type CompassJobImport,
} from '@/lib/cad/integrations/compass';
import {
  buildSyncPayload as buildCompassSyncPayload,
  sendCompassSync,
} from '@/lib/cad/integrations/compass-sync';
import {
  buildForgePayload,
  sendForgeSync,
  shouldSync as shouldForgeSync,
} from '@/lib/cad/integrations/forge-sync';
import {
  buildOrbitPayload,
  sendOrbitSync,
  shouldSync as shouldOrbitSync,
} from '@/lib/cad/integrations/orbit-sync';

// CanvasViewport requires browser APIs; load it client-side only
const CanvasViewport = dynamic(() => import('./components/CanvasViewport'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-gray-100 text-gray-400">
      Loading canvas…
    </div>
  ),
});

/** Fallback periodic interval (ms) — overridden by autoSaveIntervalSec setting */
const DEFAULT_AUTOSAVE_INTERVAL_MS = 60_000;
/** Debounce delay (ms) after a document change before writing to IndexedDB */
const AUTOSAVE_DEBOUNCE_MS = 5_000;

export default function CADLayout() {
  const { showLayerPanel, showPropertyPanel } = useUIStore();
  const [layerPanelWidth, setLayerPanelWidth] = usePanelSize('layer', 192, 160, 480);
  const [rightDockWidth, setRightDockWidth] = usePanelSize('right', 192, 160, 520);
  const [pointTableHeight, setPointTableHeight] = usePanelSize('pointTable', 192, 120, 520);
  const [pointViewerHeight, setPointViewerHeight] = usePanelSize('pointViewer', 240, 140, 600);
  const [showPointViewer, setShowPointViewer] = useState(false);
  const [renameDialog, setRenameDialog] = useState<RenameDialogData | null>(null);
  const [traverseViewerHeight, setTraverseViewerHeight] = usePanelSize('traverseViewer', 240, 140, 600);
  const [showTraverseViewer, setShowTraverseViewer] = useState(false);
  const drawingStore = useDrawingStore();
  const selectionStore = useSelectionStore();
  const undoStore = useUndoStore();
  const [autoSaveFailed, setAutoSaveFailed] = useState(false);

  // Dynamic browser-tab title so multi-tab users can tell drawings
  // apart. Falls back to a generic title before the document hydrates.
  useEffect(() => {
    const name = drawingStore.document.name?.trim();
    document.title = name && name.length > 0
      ? `${name} — Starr CAD`
      : 'Starr CAD — Drawing Editor';
  }, [drawingStore.document.name]);

  const [featureDialog, setFeatureDialog] = useState<{
    featureId: string;
    x: number;
    y: number;
  } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  // Always reset the import wizard before opening so a new file starts at
  // step 1 — the store is an in-memory singleton, so without this a prior
  // completed import would reopen stuck on "Done".
  const openImport = () => {
    useImportStore.getState().reset();
    setShowImportDialog(true);
  };
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
  // Phase 8 §2.3 — wire the hotkey engine + dispatcher.
  useHotkeys();
  const [showNewDrawingDialog, setShowNewDrawingDialog] = useState(false);
  const [showDisplayPrefs, setShowDisplayPrefs] = useState(false);
  const [showOrientationDialog, setShowOrientationDialog] = useState(false);
  const [showHiddenItems, setShowHiddenItems] = useState(false);
  const [showCompletenessPanel, setShowCompletenessPanel] = useState(false);
  const [showReviewModePanel, setShowReviewModePanel] = useState(false);
  const [showDescriptionPanel, setShowDescriptionPanel] = useState(false);
  const [showRecentRecoveries, setShowRecentRecoveries] = useState(false);
  const [showCodeStylePanel, setShowCodeStylePanel] = useState(false);
  const [compassNotice, setCompassNotice] =
    useState<{ payload: CompassJobImport; stale: boolean } | null>(null);
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
    // ── Job-workspace deep link (JOB_WORKSPACE_BUILDOUT slice A) ────────────
    // /admin/cad?drawing=<id>  → load that saved drawing.
    // /admin/cad?job=<id>      → start a drawing pre-linked to the job;
    //                            the param is read by SaveToDBDialog on save.
    // Either param suppresses the New Drawing startup dialog.
    const cadParams = new URLSearchParams(window.location.search);
    const deepLinkDrawingId = cadParams.get('drawing');
    const deepLinkJobId = cadParams.get('job');
    if (deepLinkDrawingId) {
      (async () => {
        try {
          const res = await fetch(`/api/admin/cad/drawings?id=${encodeURIComponent(deepLinkDrawingId)}`);
          if (!res.ok) throw new Error(`Failed to load drawing (${res.status})`);
          const { drawing } = await res.json() as { drawing: { document: { document?: unknown } | unknown; job_id?: string | null } };
          // Stored payload is { version, application, document }. Unwrap.
          const raw = (drawing.document as { document?: unknown })?.document ?? drawing.document;
          const doc = validateAndMigrateDocument(raw as Parameters<typeof validateAndMigrateDocument>[0]);
          drawingStore.loadDocument(doc);
          selectionStore.deselectAll();
          undoStore.clear();
          // Keep the editor's save aware of the drawing id + job link so
          // re-saves update the same row and preserve the job.
          if (drawing.job_id && !deepLinkJobId) {
            const u = new URL(window.location.href);
            u.searchParams.set('job', drawing.job_id);
            window.history.replaceState(null, '', u.toString());
          }
          cadLog.info('JobLink', `Loaded job drawing ${deepLinkDrawingId}`);
          setTimeout(() => window.dispatchEvent(new CustomEvent('cad:zoomExtents')), 200);
        } catch (err) {
          cadLog.error('JobLink', 'Failed to load deep-linked drawing', err);
          window.dispatchEvent(new CustomEvent('cad:commandOutput', {
            detail: { text: `Could not load drawing ${deepLinkDrawingId}. It may have been deleted.` },
          }));
        }
      })();
      return; // Skip RECON / Compass / autosave flows for a deep-linked load
    }
    if (deepLinkJobId) {
      // New drawing for a job — let the user set it up via the normal
      // startup dialog, but skip autosave recovery. The job param stays
      // in the URL for SaveToDBDialog to read on save.
      if (drawingStore.document.layerOrder.length === 0) setShowNewDrawingDialog(true);
      return;
    }

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

    // ── §17.1 Compass → CAD bootstrap ───────────────────────
    // Compass writes a `CompassJobImport` payload to
    // `starr-cad-pending-compass` when the user clicks "Open
    // in CAD" on a finalized job. We patch the title block
    // and surface a small notice with one-click links to the
    // field / deed files.
    const compassPayload = consumePendingCompassJob();
    if (compassPayload) {
      const patch = buildCompassSettingsPatch(
        compassPayload,
        drawingStore.document.settings
      );
      drawingStore.updateSettings(patch);
      setCompassNotice({
        payload: compassPayload,
        stale: isCompassPayloadStale(compassPayload),
      });
      cadLog.info(
        'CompassImport',
        `Applied Compass hand-off for job ${compassPayload.jobId} ` +
          `(${compassPayload.fieldFiles.length} field / ` +
          `${compassPayload.deedFiles.length} deed file(s))`
      );
    }

    // ── Existing crash-recovery autosave check ──────────────────────────────
    // Per-doc keying lets us check the active drawing without
    // pulling in autosaves for unrelated jobs.
    readAutosave(drawingStore.document.id).then((saved) => {
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

  // Open the import wizard (always reset to step 1 first).
  useEffect(() => {
    const handler = () => { useImportStore.getState().reset(); setShowImportDialog(true); };
    window.addEventListener('cad:openImport', handler);
    return () => window.removeEventListener('cad:openImport', handler);
  }, []);

  // Phase 3 §15 — code-to-style mapping panel
  useEffect(() => {
    const handler = () => setShowCodeStylePanel(true);
    window.addEventListener('cad:openCodeStylePanel', handler);
    return () => window.removeEventListener('cad:openCodeStylePanel', handler);
  }, []);

  // Phase 6 §3084 — when the AI pipeline finishes with usable
  // PLSS / flood-zone data, merge it into the title-block notes
  // field so the surveyor doesn't have to retype values that
  // BLM + FEMA already published. We only touch `notes`; the
  // surveyor's manual edits stay sticky because we skip the
  // merge when `notes` already contains the auto-generated
  // marker line.
  useEffect(() => {
    type EnrichmentDetail = {
      plssSection: string | null;
      plssTownship: string | null;
      plssRange: string | null;
      femaFloodZone: string | null;
    };
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<EnrichmentDetail>).detail;
      if (!detail) return;
      const lines: string[] = [];
      if (detail.plssTownship || detail.plssRange || detail.plssSection) {
        const parts = [
          detail.plssTownship,
          detail.plssRange,
          detail.plssSection ? `Sec ${detail.plssSection}` : null,
        ].filter((p): p is string => !!p);
        if (parts.length > 0) lines.push(`PLSS: ${parts.join(' ')}`);
      }
      if (detail.femaFloodZone) {
        lines.push(`Flood Zone: ${detail.femaFloodZone}`);
      }
      if (lines.length === 0) return;
      const block = lines.join('\n');
      const current = drawingStore.document.settings.titleBlock?.notes ?? '';
      if (current.includes('PLSS:') || current.includes('Flood Zone:')) {
        // Already populated (manually or by a prior pipeline run);
        // don't clobber the surveyor's edits.
        return;
      }
      const merged = current.length > 0 ? `${current}\n${block}` : block;
      drawingStore.updateTitleBlock({ notes: merged });
    };
    window.addEventListener('cad:enrichmentReady', handler);
    return () => window.removeEventListener('cad:enrichmentReady', handler);
  }, [drawingStore]);

  // Phase 8 §11.7 Slice 10 — mount the linked-instance
  // subscriber so duplicates created via the
  // LayerTransferDialog with `linkDuplicatesToSource` on
  // re-track their source feature's geometry changes.
  // Unmount on dialog teardown for hot-reload safety.
  useEffect(() => {
    const unsub = mountLinkedInstanceSubscriber();
    return () => {
      unsub();
      unmountLinkedInstanceSubscriber();
    };
  }, []);

  // Listen for layer-transfer open event (Ctrl+Shift+L hotkey,
  // MenuBar entry, right-click context menu).
  useEffect(() => {
    const handler = () => {
      // Pre-load the active selection so right-click on a
      // selection lands the right features in the dialog.
      const ids = Array.from(useSelectionStore.getState().selectedIds);
      useTransferStore.getState().open(ids);
    };
    window.addEventListener('cad:openLayerTransfer', handler);
    return () => window.removeEventListener('cad:openLayerTransfer', handler);
  }, []);

  // Phase 8 §11.6 Slice 1 — Intersect dialog open event.
  // Hotkey (chord I X) and MenuBar Tools entry both fire
  // cad:openIntersect; CADLayout flips a local flag so the
  // dialog mounts.
  const [showIntersect, setShowIntersect] = useState(false);
  useEffect(() => {
    const handler = () => setShowIntersect(true);
    window.addEventListener('cad:openIntersect', handler);
    return () => window.removeEventListener('cad:openIntersect', handler);
  }, []);

  // CAD_POINTS_AND_AI slice D — Calc Point dialogue. Opens on
  // `cad:openCalcPointDialog` (fired from the MenuBar AI submenu
  // or the AI Copilot quick-actions).
  const [showCalcPoint, setShowCalcPoint] = useState(false);
  useEffect(() => {
    const handler = () => setShowCalcPoint(true);
    window.addEventListener('cad:openCalcPointDialog', handler);
    return () => window.removeEventListener('cad:openCalcPointDialog', handler);
  }, []);

  // CAD_POINTS_AND_AI slice E — Close Drawing dialogue. Opens on
  // `cad:openCloseDrawingDialog` (fired from the MenuBar AI submenu).
  const [showCloseDrawing, setShowCloseDrawing] = useState(false);
  useEffect(() => {
    const handler = () => setShowCloseDrawing(true);
    window.addEventListener('cad:openCloseDrawingDialog', handler);
    return () => window.removeEventListener('cad:openCloseDrawingDialog', handler);
  }, []);

  // CAD_POINTS_AND_AI slice F — Sketch reconciliation dialogue.
  const [showSketchReconcile, setShowSketchReconcile] = useState(false);
  useEffect(() => {
    const handler = () => setShowSketchReconcile(true);
    window.addEventListener('cad:openSketchReconcileDialog', handler);
    return () => window.removeEventListener('cad:openSketchReconcileDialog', handler);
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

  // Point Data Viewer toggle (§10c)
  useEffect(() => {
    const handler = () => setShowPointViewer((v) => !v);
    window.addEventListener('cad:togglePointDataViewer', handler);
    return () => window.removeEventListener('cad:togglePointDataViewer', handler);
  }, []);

  // Points panel (bottom dock) toggle.
  useEffect(() => {
    const handler = () => setShowPointTable((v) => !v);
    window.addEventListener('cad:togglePointTable', handler);
    return () => window.removeEventListener('cad:togglePointTable', handler);
  }, []);

  // Traverse Viewer toggle (§10e)
  useEffect(() => {
    const handler = () => setShowTraverseViewer((v) => !v);
    window.addEventListener('cad:toggleTraverseViewer', handler);
    return () => window.removeEventListener('cad:toggleTraverseViewer', handler);
  }, []);

  // Phase 8 §2.3 — bridge hotkey-only events into local UI
  // state. These dispatchers fire from `useHotkeys` so the
  // engine module stays free of CADLayout-specific imports.
  useEffect(() => {
    const aiHandler = () => setShowAIDrawingDialog(true);
    const completenessHandler = () => setShowCompletenessPanel(true);
    window.addEventListener('cad:openAIDrawingDialog', aiHandler);
    window.addEventListener('cad:openCompletenessPanel', completenessHandler);
    return () => {
      window.removeEventListener('cad:openAIDrawingDialog', aiHandler);
      window.removeEventListener('cad:openCompletenessPanel', completenessHandler);
    };
  }, []);

  // §17.2 / §17.3 — auto-sync to Compass + Forge on
  // workflow transitions. We subscribe to the workflow store
  // directly (not via the hook) so the effect fires once per
  // transition rather than on every render. The refs guard
  // against re-firing for the same status during a single
  // browser session.
  const lastSyncedStatusRef = useRef<string | null>(null);
  const lastForgeSyncedRef = useRef<string | null>(null);
  const lastOrbitSyncedRef = useRef<string | null>(null);
  useEffect(() => {
    const unsubscribe = useReviewWorkflowStore.subscribe((state) => {
      const status = state.record?.status;
      if (status !== 'SEALED' && status !== 'DELIVERED') return;
      const cacheKey = `${state.record!.jobId}:${status}`;
      if (lastSyncedStatusRef.current === cacheKey) return;
      lastSyncedStatusRef.current = cacheKey;
      const payload = buildCompassSyncPayload({
        doc: useDrawingStore.getState().document,
        reviewRecord: state.record,
        description: useDeliveryStore.getState().description,
        automatic: true,
      });
      if (!payload) return;
      void sendCompassSync(payload).then((response) => {
        if (response.ok) {
          cadLog.info(
            'CompassSync',
            `Synced ${status} for job ${payload.jobId}` +
              (response.forwardedTo
                ? ` → ${response.forwardedTo}`
                : ' (logged; webhook not configured)')
          );
        } else {
          cadLog.warn(
            'CompassSync',
            `Sync ${status} for job ${payload.jobId} failed: ${response.message ?? 'unknown'}`
          );
        }
      });

      // §17.3 / §17.4 — Forge + Orbit sync only fire on
      // DELIVERED (their downstream UIs only want the final
      // as-built, not interim seal events).
      if (!shouldForgeSync(state.record)) return;
      const forgeKey = `${state.record!.jobId}:DELIVERED`;
      if (lastForgeSyncedRef.current === forgeKey) return;
      lastForgeSyncedRef.current = forgeKey;
      void buildForgePayload({
        doc: useDrawingStore.getState().document,
        reviewRecord: state.record,
        automatic: true,
      })
        .then(async (forgePayload) => {
          if (!forgePayload) return;
          const response = await sendForgeSync(forgePayload);
          if (response.ok) {
            cadLog.info(
              'ForgeSync',
              `Pushed ${forgePayload.slices.length} slice(s) for ` +
                `job ${forgePayload.jobId}` +
                (response.forwardedTo
                  ? ` → ${response.forwardedTo}`
                  : ' (logged; webhook not configured)')
            );
          } else {
            cadLog.warn(
              'ForgeSync',
              `Forge sync for job ${forgePayload.jobId} failed: ` +
                `${response.message ?? 'unknown'}`
            );
          }
        })
        .catch((err) => {
          cadLog.warn(
            'ForgeSync',
            `Forge payload build failed: ${err instanceof Error ? err.message : String(err)}`
          );
        });

      // §17.4 — Orbit sync fires alongside Forge on
      // DELIVERED. Independent ref so a Forge failure
      // doesn't suppress the Orbit push (and vice versa).
      if (!shouldOrbitSync(state.record)) return;
      const orbitKey = `${state.record!.jobId}:DELIVERED`;
      if (lastOrbitSyncedRef.current === orbitKey) return;
      lastOrbitSyncedRef.current = orbitKey;
      const orbitPayload = buildOrbitPayload({
        doc: useDrawingStore.getState().document,
        reviewRecord: state.record,
        automatic: true,
      });
      if (orbitPayload) {
        void sendOrbitSync(orbitPayload).then((response) => {
          if (response.ok) {
            cadLog.info(
              'OrbitSync',
              `Pushed boundary + ${orbitPayload.monumentRefs.length} ` +
                `monument(s) for job ${orbitPayload.jobId}` +
                (response.forwardedTo
                  ? ` → ${response.forwardedTo}`
                  : ' (logged; webhook not configured)')
            );
          } else {
            cadLog.warn(
              'OrbitSync',
              `Orbit sync for job ${orbitPayload.jobId} failed: ` +
                `${response.message ?? 'unknown'}`
            );
          }
        });
      }
    });
    return unsubscribe;
  }, []);

  // §10.3/§10.4 — guarded point-name change. Opens the rename dialog
  // unless the user previously chose to remember a strategy.
  const RENAME_PREF_KEY = 'starr-cad-rename-strategy';
  function applyRenameInPlace(featureId: string, oldName: string, newName: string) {
    const doc = drawingStore.document;
    const updates = planRename(doc, oldName, newName);
    const ops = updates.map((u) => {
      const f = drawingStore.getFeature(u.featureId);
      return {
        type: 'MODIFY_FEATURE' as const,
        data: { id: u.featureId, before: { properties: f?.properties }, after: { properties: u.properties } },
      };
    });
    updates.forEach((u) => drawingStore.updateFeature(u.featureId, { properties: u.properties }));
    if (ops.length > 0) undoStore.pushUndo(makeBatchEntry(`Rename point ${oldName} → ${newName}`, ops));
  }
  function applyDuplicate(featureId: string, newName: string) {
    const dup = planDuplicate(drawingStore.document, featureId, newName);
    if (!dup) return;
    drawingStore.addFeature(dup);
    undoStore.pushUndo(makeBatchEntry(`Duplicate point as ${newName}`, [
      { type: 'ADD_FEATURE', data: dup },
    ]));
  }
  function handlePointRename(featureId: string, oldName: string, newName: string) {
    const doc = drawingStore.document;
    const refs = findNameReferences(doc, oldName);
    const taken = nameIsTaken(doc, newName, featureId);
    const remembered = (typeof window !== 'undefined' && window.localStorage.getItem(RENAME_PREF_KEY)) || 'ASK';
    if (remembered === 'RENAME' && !taken) { applyRenameInPlace(featureId, oldName, newName); return; }
    if (remembered === 'DUPLICATE') { applyDuplicate(featureId, newName); return; }
    setRenameDialog({
      featureId,
      oldName,
      newName,
      referenceCount: refs.linework.length,
      derivatives: refs.derivatives,
      nameTaken: taken,
    });
  }

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
      // Per-doc keying — switching drawings no longer kicks
      // the prior autosave out of the slot.
      await writeAutosave(drawingStore.document.id, payload);
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
    <TooltipProvider>
    <div
      className="flex flex-col h-screen w-full overflow-hidden bg-white select-none"
      onContextMenu={(e) => {
        // The CAD app owns right-click (feature/layer/canvas menus). Suppress
        // the browser's native context menu everywhere EXCEPT real text fields,
        // where native copy/paste/spellcheck is still useful.
        const t = e.target as HTMLElement | null;
        if (t && (t.closest('input, textarea, [contenteditable="true"]'))) return;
        e.preventDefault();
      }}
    >
      {/* Phase 7 delivery hydrator — keeps useDeliveryStore +
          useReviewWorkflowStore in sync with the active doc. */}
      <DeliveryHydrator />

      {/* Phase 7 §3.3 bidirectional element sync — flags AI
          explanations stale + review-queue items MODIFIED on
          manual canvas edits. */}
      <BidirectionalSync />

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

      {/* Phase 7 §17.1 Compass hand-off notice */}
      {compassNotice ? (
        <div
          role="status"
          className="bg-indigo-50 border-b border-indigo-200 text-indigo-900 text-xs px-4 py-2 flex items-center gap-3"
        >
          <span aria-hidden>🧭</span>
          <div className="flex-1 min-w-0">
            <strong>Compass job loaded:</strong>{' '}
            {compassNotice.payload.jobName ||
              compassNotice.payload.jobId}
            {compassNotice.payload.address ? (
              <span className="text-indigo-700">
                {' '}
                · {compassNotice.payload.address}
              </span>
            ) : null}
            {compassNotice.stale ? (
              <span className="text-amber-700">
                {' '}
                · ⚠ payload is &gt; 24h old
              </span>
            ) : null}
            {compassNotice.payload.fieldFiles.length > 0 ? (
              <span className="ml-2">
                Field files:{' '}
                {compassNotice.payload.fieldFiles.map((f, i) => (
                  <a
                    key={f.url}
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {f.name}
                    {i < compassNotice.payload.fieldFiles.length - 1
                      ? ', '
                      : ''}
                  </a>
                ))}
              </span>
            ) : null}
            {compassNotice.payload.deedFiles.length > 0 ? (
              <span className="ml-2">
                · Deeds:{' '}
                {compassNotice.payload.deedFiles.map((f, i) => (
                  <a
                    key={f.url}
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {f.name}
                    {i < compassNotice.payload.deedFiles.length - 1
                      ? ', '
                      : ''}
                  </a>
                ))}
              </span>
            ) : null}
          </div>
          {compassNotice.payload.fieldFiles.length > 0 ? (
            <button
              type="button"
              onClick={openImport}
              className="px-3 py-1 bg-indigo-700 text-white rounded text-xs font-semibold hover:bg-indigo-600"
            >
              Open import
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setCompassNotice(null)}
            className="text-indigo-700 hover:text-indigo-900 font-bold px-2"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      ) : null}

      {/* Top menu bar */}
      <MenuBar
        onOpenImport={openImport}
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
        onToggleDescriptionPanel={() => setShowDescriptionPanel(p => !p)}
        onOpenRecentRecoveries={() => setShowRecentRecoveries(true)}
      />

      {/* Contextual tool options strip — with Undo/Redo on the left and Prefs button on the right */}
      <div className="relative flex items-stretch shrink-0">
        {/* Undo / Redo — toolbar-level affordance for the
            Edit-menu actions; tooltips read the next undo/redo
            description so users know what they're reverting. */}
        <div className="border-b border-gray-700 shrink-0">
          <UndoRedoButtons />
        </div>
        <div className="flex-1 min-w-0">
          <ToolOptionsBar />
        </div>
        {/* Display Preferences toggle + Fullscreen — always visible at right end of toolbar */}
        <div
          className="flex items-center gap-1 px-2 border-b border-l border-gray-700 shrink-0"
          style={{ backgroundColor: '#1a1f2e' }}
        >
          <FullscreenToggle />
          <DisplayPrefsToggleButton
            open={showDisplayPrefs}
            onToggle={() => setShowDisplayPrefs((v) => !v)}
          />
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar: tools. overflow-y-auto + min-h-0 so the button
            column scrolls within the available height instead of
            spilling over the command bar / point table on short
            viewports. */}
        <div className="flex flex-col bg-gray-800 border-r border-gray-700 overflow-y-auto overflow-x-hidden min-h-0" style={{ width: 52 }}>
          <ToolBar />
        </div>

        {/* Layer panel (toggleable, resizable) */}
        {showLayerPanel && (
          <>
            <div
              className="flex flex-col bg-gray-800 border-r border-gray-700 cad-slide-left shrink-0"
              style={{ width: layerPanelWidth }}
            >
              <LayerPanel />
            </div>
            <ResizeHandle
              axis="x"
              sign={1}
              size={layerPanelWidth}
              min={160}
              max={480}
              onResize={setLayerPanelWidth}
              ariaLabel="Resize layer panel"
            />
          </>
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

        {/* Right sidebar: property panel + traverse panel + image panel (toggleable, resizable) */}
        {(showPropertyPanel || showTraversePanel || showImagePanel) && (
          <>
          <ResizeHandle
            axis="x"
            sign={-1}
            size={rightDockWidth}
            min={160}
            max={520}
            onResize={setRightDockWidth}
            ariaLabel="Resize properties panel"
          />
          <div
            className="flex bg-gray-800 border-l border-gray-700 flex-shrink-0 cad-slide-right"
            style={{ width: rightDockWidth }}
          >
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
          </>
        )}
      </div>

      {/* Bottom area: command bar + optional point table + status bar */}
      <CommandBar />
      {showPointTable && (
        <>
        <ResizeHandle
          axis="y"
          sign={-1}
          size={pointTableHeight}
          min={120}
          max={520}
          onResize={setPointTableHeight}
          ariaLabel="Resize point table"
        />
        <div
          className="border-t border-gray-700 shrink-0 animate-[slideInUp_200ms_cubic-bezier(0.16,1,0.3,1)]"
          style={{ height: pointTableHeight }}
        >
          <PointTablePanel
            codeDisplayMode={drawingStore.document.settings.codeDisplayMode ?? 'NUMERIC'}
            onCodeDisplayModeChange={(mode) => drawingStore.updateSettings({ codeDisplayMode: mode })}
          />
        </div>
        </>
      )}
      {showPointViewer && (
        <>
        <ResizeHandle
          axis="y"
          sign={-1}
          size={pointViewerHeight}
          min={140}
          max={600}
          onResize={setPointViewerHeight}
          ariaLabel="Resize point data viewer"
        />
        <div className="border-t border-gray-700 shrink-0 animate-[slideInUp_180ms_cubic-bezier(0.16,1,0.3,1)] motion-reduce:animate-none" style={{ height: pointViewerHeight }}>
          <PointDataViewer
            open={showPointViewer}
            onClose={() => setShowPointViewer(false)}
            onRenameRequest={handlePointRename}
          />
        </div>
        </>
      )}
      {showTraverseViewer && (
        <>
        <ResizeHandle
          axis="y"
          sign={-1}
          size={traverseViewerHeight}
          min={140}
          max={600}
          onResize={setTraverseViewerHeight}
          ariaLabel="Resize traverse viewer"
        />
        <div className="border-t border-gray-700 shrink-0 animate-[slideInUp_180ms_cubic-bezier(0.16,1,0.3,1)] motion-reduce:animate-none" style={{ height: traverseViewerHeight }}>
          <TraverseViewer open={showTraverseViewer} onClose={() => setShowTraverseViewer(false)} />
        </div>
        </>
      )}
      <StatusBar onOpenRecentRecoveries={() => setShowRecentRecoveries(true)} />

      {/* Feature properties dialog (opened by double-clicking a feature) */}
      {featureDialog && drawingStore.getFeature(featureDialog.featureId) && (
        <FeaturePropertiesDialog
          featureId={featureDialog.featureId}
          initialX={featureDialog.x}
          initialY={featureDialog.y}
          onClose={() => setFeatureDialog(null)}
        />
      )}

      {/* §10.4 guarded point-rename dialog */}
      {renameDialog && (
        <RenameConfirmDialog
          data={renameDialog}
          onCancel={() => setRenameDialog(null)}
          onChoose={(strategy, remember) => {
            if (remember && typeof window !== 'undefined') {
              window.localStorage.setItem('starr-cad-rename-strategy', strategy);
            }
            if (strategy === 'RENAME') {
              applyRenameInPlace(renameDialog.featureId, renameDialog.oldName, renameDialog.newName);
            } else {
              applyDuplicate(renameDialog.featureId, renameDialog.newName);
            }
            setRenameDialog(null);
          }}
        />
      )}

      {/* Settings dialog */}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}

      {/* Cross-layer copy / move / duplicate dialog (Phase 8 §11.7) */}
      <LayerTransferGate />

      {/* Intersect Tool dialog (Phase 8 §11.6 Slice 1) */}
      {showIntersect && <IntersectDialog onClose={() => setShowIntersect(false)} />}

      {/* Calc Point dialog (CAD_POINTS_AND_AI slice D) */}
      {showCalcPoint && <CalcPointDialog onClose={() => setShowCalcPoint(false)} />}

      {/* Close Drawing dialog (CAD_POINTS_AND_AI slice E) */}
      {showCloseDrawing && <CloseDrawingDialog onClose={() => setShowCloseDrawing(false)} />}

      {/* Sketch reconciliation dialog (CAD_POINTS_AND_AI slice F) */}
      {showSketchReconcile && <SketchReconcileDialog onClose={() => setShowSketchReconcile(false)} />}


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

      {/* Phase 6 §32.7 provenance fallback — opened by the
          right-click "Why did AI draw this?" entry on any
          feature carrying tool-registry provenance stamps but
          no full pipeline explanation. Renders only when the
          full popup above has nothing to show. */}
      <AIProvenancePopup />

      {/* Phase 6 §32 Slice 5 COPILOT proposal card — renders
          the head of useAIStore.proposalQueue with Accept /
          Modify / Skip + ghost preview on the canvas. */}
      <CopilotCard />

      {/* Phase 6 §32 Slice 7 COMMAND-mode chat sidebar — input
          surface for proposeFromPrompt. Auto-opens on COPILOT /
          COMMAND modes; right-click "Ask AI about this…" seeds
          the input via openCopilotWithPrompt. */}
      <AICopilotSidebar />

      {/* Phase 6 §32 Slice 8 AUTO escalation runner — headless;
          auto-accepts proposals whose confidence ≥ threshold
          while mode === AUTO. Below-threshold proposals stay
          queued for surveyor review via CopilotCard. */}
      <AIAutoRunner />

      {/* Chord-shortcut HUD — pops a small toast at bottom-centre
          showing the available second-key completions while a
          chord (e.g. `I`, `Z`, `R`) is in progress. Clears
          automatically on completion / escape / timeout. */}
      <ChordHUD />

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

      {/* Phase 7 §5.5 survey-description panel — generate +
          edit the metes-and-bounds + notes + certification */}
      <SurveyDescriptionPanel
        open={showDescriptionPanel}
        onClose={() => setShowDescriptionPanel(false)}
      />

      {/* CAD_UX_2026_05 §02 — consolidated AI chat (tabbed,
          right-docked / undockable). Replaces the drawing chat
          panel + inline "Ask AI" popup. */}
      <AIChatDock />

      {/* Phase 7 §16 recent crash recoveries — picker over
          all per-doc autosave slots so dropped tabs don't
          lose work even when reopening a different drawing */}
      <RecentRecoveriesDialog
        open={showRecentRecoveries}
        onClose={() => setShowRecentRecoveries(false)}
      />

      {/* Phase 3 §15 — code-to-style mapping panel */}
      <CodeStylePanel
        open={showCodeStylePanel}
        onClose={() => setShowCodeStylePanel(false)}
      />

      {/* Phase 7 §3 unified AI sidebar — tabbed view with
          quick-access entry points to the existing detail
          panels. Visibility tracked in `useUIStore`. */}
      <AISidebar
        onOpenReviewPanel={() => useAIStore.getState().openQueuePanel()}
        onOpenAssistantPanel={() => useAIConversationsStore.getState().open()}
        onOpenCompletenessPanel={() => setShowCompletenessPanel(true)}
      />

      {/* New Drawing / Get Started dialog */}
      {showNewDrawingDialog && (
        <NewDrawingDialog
          onClose={() => setShowNewDrawingDialog(false)}
          onImport={() => { setShowNewDrawingDialog(false); openImport(); }}
        />
      )}

      {/* Phase 8 §10.6 — Command palette (Ctrl+K). Self-mounts
          on `cad:openCommandPalette`; renders nothing until
          opened so it has zero idle cost. */}
      <CommandPalette />

      {/* Phase 8 §10.4 — Global confirm dialog. Listens for
          `cad:openConfirmDialog` so any module can call
          `confirmAction()` and await the surveyor's choice
          without prop-drilling a dialog handle. */}
      <ConfirmDialog />

      {/* Phase 8 §10.5 — Keyboard-shortcut cheat sheet (Shift
          + ?). Listens for `cad:openShortcutHelp`; renders
          nothing until opened. Reads merged default + user
          bindings from useHotkeysStore so user customisations
          show with their override key. */}
      <KeyboardShortcutOverlay />
    </div>
    </TooltipProvider>
  );
}

// Subscribes to useTransferStore.isOpen so the dialog only
// mounts when actually needed. Keeps the parent component
// lean — useTransferStore changes don't ripple through every
// other panel.
function LayerTransferGate() {
  const isOpen = useTransferStore((s) => s.isOpen);
  const close = useTransferStore((s) => s.close);
  if (!isOpen) return null;
  return <LayerTransferDialog onClose={close} />;
}
