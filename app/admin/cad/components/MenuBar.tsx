'use client';
// app/admin/cad/components/MenuBar.tsx — Top application menu bar

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Settings as SettingsIcon, Keyboard as KeyboardIcon, LogOut as LogOutIcon } from 'lucide-react';
import {
  useAnnotationStore,
  useDeliveryStore,
  useDrawingStore,
  useReviewWorkflowStore,
  useSelectionStore,
  useToolStore,
  useViewportStore,
  useUndoStore,
  useUIStore,
  useAIStore,
  AI_MODE_CYCLE,
  useSaveTargetStore,
} from '@/lib/cad/store';
import { saveDrawingToCloud } from '@/lib/cad/persistence/cloud-save';
import type { AIMode } from '@/lib/cad/store';
import { computeBounds } from '@/lib/cad/geometry/bounds';
// S8b — the research-platform bridge. Structurally typed, so importing it here does not couple the
// CAD build to the worker's.
import { featuresFromSurveyReading, researchLayersToCreate, type SurveyReadingLike } from '@/lib/cad/import/from-survey-reading';
// S9b — compare two records of the same parcel; the basis difference is the headline finding.
import { compareSurveys, callsFromPoints } from '@/lib/cad/compare/survey-compare';
// S9c — the comparison as geometry on a locked layer, not just a report.
import { comparisonOverlay } from '@/lib/cad/compare/comparison-overlay';
import {
  reconcileSurveys, pointsFromReconciled, type ReconcileSource,
} from '@/lib/cad/compare/survey-reconcile';
import { reverseFeature, explodeFeature, smoothPolyline, simplifyPolylineFeature } from '@/lib/cad/operations';
import { cadLog } from '@/lib/cad/logger';
import { validateAndMigrateDocument } from '@/lib/cad/validate';
import { downloadCsv, downloadPnezd } from '@/lib/cad/persistence/export-csv';
// cad-trv-import-export Slice 4 — File menu Import / Export TRV.
import { downloadTrv, importTrvFromText, formatRenderedElements, type TrvImportReport } from '@/lib/cad/io/trv-io';
import { confirmAction, alertAction } from './ConfirmDialog';
import { requestDiscard } from '../hooks/useUnsavedChangesGuard';
// cad-trv-import-export-deep-semantic Pass 6 — apply TRV metadata
// to the survey title block (non-destructive).
import { applyTrvMetadataToTitleBlock } from '@/lib/cad/io/trv-titleblock';
// cad-trv-import-display Slice 3 — auto-size the paper sheet to
// fit the imported survey extent + pick a standard 1" = N' scale.
// 2026-05-31 follow-up: the strict bbox was being dragged out to
// ~13k ft on the Garland sample by one or two stray GPS points
// — the paper picker then escalated to ARCH_E + 2000 ft/in.
// Switched to the OUTLIER-RESISTANT robust bbox (1st-99th
// percentile) so the surveyor's actual lot determines the paper.
import { fitPaperToBounds, bboxOfFeaturePointsRobust } from '@/lib/cad/io/trv-paper-fit';
// cad-duplicate-point-handling Slice 4 — merge-time auto-rename
// for TRV POINT features whose trvPointId already exists in the
// drawing (cross-file collisions).
import { dedupeTrvFeaturesAgainstDrawing } from '@/lib/cad/io/dedupe-trv-features';
// cad-trv-import-export-deep-semantic Pass 8 — sniff file format
// + structured error diagnostics for the Open… dialog.
import { detectFileFormat, buildFileLoadDiagnostic, formatFileLoadDiagnostic } from '@/lib/cad/io/file-detect';
// cad-multi-error-report-modal Slice 1 — file-load errors go
// through the global error-report store + the new MultiErrorModal
// rendered by CADLayout. Replaces the single-error inline modal.
import { reportFileLoadError } from '@/lib/cad/io/error-report';
import { clearAutosave } from '@/lib/cad/persistence/autosave';
// cad-desktop-tauri-and-perf Slice T4b — native open routing.
// `openCadFileViaPlatform` is a no-op (returns null) on the web build
// because `isTauri()` is false there, so the existing
// <input type="file"> flow continues to fire.
import { isTauri } from '@/lib/cad/platform/runtime';
import { openCadFileViaPlatform } from '@/lib/cad/persistence/native-file';
import { registerNativeDropListener } from '@/lib/cad/persistence/native-drop';
import { saveCadFileViaPlatform, saveCadFileToPath } from '@/lib/cad/persistence/native-save';
import { registerMenuBridge } from '@/lib/cad/platform/menu-bridge';
import { addRecentFile, clearRecentFiles } from '@/lib/cad/persistence/recent-files';
import { downloadDxf, downloadLandXML, downloadTraversePcBundle, downloadGeoJSON, downloadPdf, downloadDeliverableBundle, downloadSleeveCards, importFromDxf, importFromGeoJSON, scopeDocument } from '@/lib/cad/delivery';
import { MASTER_CODE_LIBRARY } from '@/lib/cad/codes/code-library';
import { useTemplateStore } from '@/lib/cad/store/template-store';
import SaveToDBDialog from './SaveToDBDialog';
import ExportLayersDialog from './ExportLayersDialog';
import ModalFrame from '@/app/admin/components/ui/ModalFrame';
import { useAIConversationsStore } from '@/lib/cad/store/ai-conversations-store';
import { getCadReturnPath, clearCadReturnPath } from '@/lib/admin/cad-return-path';

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  separator?: false;
  disabled?: boolean;
  /** When present, the item is a parent that reveals a flyout of
   *  these entries on hover instead of firing an action. */
  submenu?: MenuEntry[];
}
interface SeparatorItem {
  separator: true;
}
type MenuEntry = MenuItem | SeparatorItem;

interface MenuDef {
  label: string;
  items: MenuEntry[];
}

export default function MenuBar({ onOpenImport, onOpenAIDrawing, onToggleTraversePanel, onOpenCurveCalculator, onOpenCalculator, onOpenOrientationDialog, onOpenDrawingRotation, onOpenTitleBlock, onToggleImagePanel, onToggleCompletenessPanel, onToggleReviewModePanel, onToggleDescriptionPanel, onOpenRecentRecoveries }: { onOpenImport?: () => void; onOpenAIDrawing?: () => void; onToggleTraversePanel?: () => void; onOpenCurveCalculator?: () => void; onOpenCalculator?: () => void; onOpenOrientationDialog?: () => void; onOpenDrawingRotation?: () => void; onOpenTitleBlock?: () => void; onToggleImagePanel?: () => void; onToggleCompletenessPanel?: () => void; onToggleReviewModePanel?: () => void; onToggleDescriptionPanel?: () => void; onOpenRecentRecoveries?: () => void }) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  // cad-multi-error-report-modal Slice 1 — file-load errors now
  // push into useErrorReportStore + render in MultiErrorModal
  // (mounted at CADLayout). The inline single-error modal that
  // lived here is retired in the same change.
  // Submenu (Export/Import flyout) open/close with a short grace delay so a
  // diagonal cursor move from the parent row to the flyout doesn't drop it.
  const submenuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openSub = (label: string) => {
    if (submenuCloseTimer.current) { clearTimeout(submenuCloseTimer.current); submenuCloseTimer.current = null; }
    setOpenSubmenu(label);
  };
  const scheduleCloseSub = () => {
    if (submenuCloseTimer.current) clearTimeout(submenuCloseTimer.current);
    submenuCloseTimer.current = setTimeout(() => setOpenSubmenu(null), 180);
  };
  // Clear any pending submenu-close timer on unmount so it can't fire
  // setOpenSubmenu after the menu bar is gone.
  useEffect(() => () => {
    if (submenuCloseTimer.current) clearTimeout(submenuCloseTimer.current);
  }, []);
  const [dbDialog, setDbDialog] = useState<'save' | 'open' | null>(null);
  const [exportLayersOpen, setExportLayersOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  // cad-desktop-tauri-and-perf Slice P6c + P6h — every store the
  // MenuBar reads is now subscribed via per-field selectors so AI
  // runs (which mutate `doc` many times per
  // second) and selection changes don't reconcile the whole menu.
  // Render-time reads: `isDirty` + `document` (for `.name`) on
  // drawingStore, `selectedIds` (for `.size` on the three Export
  // Selection disabled gates) on the selection store. Every other store
  // access is a callback — those read the latest snapshot via
  // `useXStore.getState().X` at click time, no subscription cost.
  const isDirty = useDrawingStore((s) => s.isDirty);
  const doc = useDrawingStore((s) => s.document);
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const setTool = useToolStore((s) => s.setTool);
  const zoomToExtents = useViewportStore((s) => s.zoomToExtents);
  // cad-desktop-tauri-and-perf Slice P6i — last two MenuBar
  // whole-store subs. Undo + UI both have small render-time
  // surfaces (undo/redo description + can/canRedo for the Edit
  // menu disabled gates; showLayerPanel / showPropertyPanel
  // labels for the View menu). Subscribe to the underlying
  // primitives (stack lengths drive can/canRedo + desc reads;
  // the two UI flags are read directly) so the menu reconciles
  // only when those values actually change. The remaining
  // callbacks read through `useXStore.getState().X(...)`.
  const undoStackLen = useUndoStore((s) => s.undoStack.length);
  const redoStackLen = useUndoStore((s) => s.redoStack.length);
  const showLayerPanel = useUIStore((s) => s.showLayerPanel);
  const showPropertyPanel = useUIStore((s) => s.showPropertyPanel);
  const aiQueuePanelOpen = useAIStore((s) => s.isQueuePanelOpen);
  const toggleAIQueuePanel = useAIStore((s) => s.toggleQueuePanel);
  const aiResultLoaded = useAIStore((s) => s.result !== null);
  const openAIQuestionDialog = useAIStore((s) => s.openQuestionDialog);
  const aiQuestionsAvailable = useAIStore(
    (s) => (s.result?.deliberationResult?.questions.length ?? 0) > 0
  );
  const drawingChatOpen = useAIConversationsStore((s) => s.isOpen);
  const toggleDrawingChat = useAIConversationsStore((s) => s.toggle);
  const aiSidebarOpen = useUIStore((s) => s.showAISidebar);
  const toggleAISidebar = useUIStore((s) => s.toggleAISidebar);
  // Phase 6 §AI-mode-framework — surface the four AI modes here so
  // the surveyor isn't forced to discover the Ctrl+Shift+M chord
  // through the StatusBar chip tooltip alone. UX_POLISH §2.4.
  const aiMode = useAIStore((s) => s.mode);
  const setAIMode = useAIStore((s) => s.setMode);
  const cycleAIMode = useAIStore((s) => s.cycleMode);

  // ─── File I/O ───────────────────────────────
  // Download the current drawing as a local .starr file. `silentName`,
  // when given, re-saves under the remembered name (the browser writes to
  // the download folder without a picker when "ask where to save" is off)
  // and records a local save target so the next Ctrl+S repeats it.
  async function saveLocalCopy(silentName?: string) {
    const doc = useDrawingStore.getState().document;
    const name = (silentName ?? doc.name).trim() || 'drawing';
    const payload = { version: '1.0', application: 'starr-cad', document: doc };
    const contents = JSON.stringify(payload, null, 2);
    // cad-desktop-tauri-and-perf Slice T5b — Tauri shell uses the
    // native save dialog + filesystem write instead of the URL-blob
    // download. `silentName` paired with a remembered path means
    // "Save" (write straight back); everything else is "Save As"
    // (prompt for a destination).
    if (isTauri()) {
      try {
        const target = useSaveTargetStore.getState().targetFor(doc.id);
        const rememberedPath =
          target && target.kind === 'local' ? target.path ?? null : null;
        const result = silentName && rememberedPath
          ? await saveCadFileToPath(rememberedPath, contents)
          : await saveCadFileViaPlatform({ defaultPath: `${name}.starr` }, contents);
        if (!result) return; // user cancelled the dialog
        useDrawingStore.getState().markClean();
        const baseName = result.name.replace(/\.starr$/i, '');
        useSaveTargetStore.getState().setLocalTarget(doc.id, baseName, result.path);
        void clearAutosave(doc.id);
        // cad-desktop-tauri-and-perf Slice T7b — saves go on the
        // Recent Files list too so "Open Recent" can re-open the
        // freshly-saved file later.
        void addRecentFile(result.path, result.name);
        cadLog.info('FileIO', `Saved drawing locally: ${result.path}`);
      } catch (err) {
        cadLog.error('FileIO', 'Failed to save document', err);
        void alertAction({ title: 'Starr CAD', message: 'Failed to save the drawing. Try again, or contact support if it keeps failing.' });
      }
      return;
    }
    try {
      const blob = new Blob([contents], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: `${name}.starr` });
      a.click();
      URL.revokeObjectURL(url);
      useDrawingStore.getState().markClean();
      useSaveTargetStore.getState().setLocalTarget(doc.id, name);
      void clearAutosave(doc.id);
      cadLog.info('FileIO', `Saved drawing locally: ${name}`);
    } catch (err) {
      cadLog.error('FileIO', 'Failed to save document', err);
      void alertAction({ title: 'Starr CAD', message: 'Failed to save the drawing. Try again, or contact support if it keeps failing.' });
    }
  }

  // One-click Save: write back to wherever this drawing was last saved
  // (same cloud record or same local file name) — no destination prompt.
  // If the drawing has never been saved, alert and open the save dialog
  // so the surveyor picks a destination once.
  async function saveDocument() {
    const doc = useDrawingStore.getState().document;
    const target = useSaveTargetStore.getState().targetFor(doc.id);

    if (!target) {
      // First save for this drawing — prompt for a name / destination.
      // After this, Save writes back here automatically.
      setDbDialog('save');
      return;
    }

    if (target.kind === 'local') {
      saveLocalCopy(target.name);
      return;
    }

    // Cloud: silent update of the existing record.
    try {
      const { id, name } = await saveDrawingToCloud(doc, {
        id: target.cloudId,
        name: target.name,
        description: target.description,
      });
      useSaveTargetStore.getState().setCloudTarget(doc.id, id, name, target.description);
      useDrawingStore.getState().markClean();
      void clearAutosave(doc.id);
      cadLog.info('FileIO', `Saved drawing to cloud: ${name}`);
      window.dispatchEvent(new CustomEvent('cad:commandOutput', { detail: { text: `Saved “${name}” to the cloud.` } }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      cadLog.error('FileIO', 'Failed to save drawing to cloud', err);
      void alertAction({ title: 'Starr CAD', message: `Couldn’t save to the cloud: ${msg}\n\nYou can try again or use “Save to Cloud…”.` });
    }
  }

  // Phase 8 §2.3 — let the hotkey dispatcher trigger save
  // without coupling its module to the MenuBar's local
  // `saveDocument` closure.
  useEffect(() => {
    const handler = () => saveDocument();
    window.addEventListener('cad:saveDocument', handler);
    return () => window.removeEventListener('cad:saveDocument', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // cad-desktop-tauri-and-perf Slice T7 — the native menu bridge
  // dispatches `cad:openFileDialog` (File → Open…) and
  // `cad:saveDocumentAs` (File → Save As…). MenuBar owns those
  // closures, so the listeners live here. Web behavior is
  // untouched; the bridge no-ops on `isTauri() === false`.
  //
  // cad-desktop-tauri-and-perf Slice T7b — also listens for
  // `cad:openRecentFile` carrying `{ path }`. The future menu
  // rebuild (T7c) and any other Recent-Files surface will
  // dispatch this event with an absolute path; we read it via
  // the fs plugin and feed it through the same processOpenedCadFile
  // helper the open dialog uses.
  useEffect(() => {
    const onOpen = () => openFileDialog();
    const onSaveAs = () => { void saveLocalCopy(); };
    const onOpenRecent = (e: Event) => {
      const detail = (e as CustomEvent<{ path?: string }>).detail;
      const recentPath = detail?.path;
      if (!recentPath || typeof recentPath !== 'string') return;
      void (async () => {
        if (typeof window === 'undefined') return;
        const w = window as unknown as {
          __TAURI_INTERNALS__?: { invoke?: <T = unknown>(c: string, a?: Record<string, unknown>) => Promise<T> };
        };
        const invoke = w.__TAURI_INTERNALS__?.invoke;
        if (!invoke) return;
        let contents: string;
        try {
          contents = await invoke<string>('plugin:fs|read_text_file', { path: recentPath });
        } catch (err) {
          const diag = buildFileLoadDiagnostic(recentPath, '', err, 'sniff');
          cadLog.error('FileIO', formatFileLoadDiagnostic(diag), err);
          reportFileLoadError(diag);
          return;
        }
        const name = recentPath.split(/[\\/]/).pop() ?? recentPath;
        setFileLoading(true);
        await processOpenedCadFile(name, contents);
        void addRecentFile(recentPath, name);
      })();
    };
    const onClearRecent = () => { void clearRecentFiles(); };
    window.addEventListener('cad:openFileDialog', onOpen);
    window.addEventListener('cad:saveDocumentAs', onSaveAs);
    window.addEventListener('cad:openRecentFile', onOpenRecent);
    window.addEventListener('cad:clearRecentFiles', onClearRecent);
    return () => {
      window.removeEventListener('cad:openFileDialog', onOpen);
      window.removeEventListener('cad:saveDocumentAs', onSaveAs);
      window.removeEventListener('cad:openRecentFile', onOpenRecent);
      window.removeEventListener('cad:clearRecentFiles', onClearRecent);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // cad-desktop-tauri-and-perf Slice T7 — subscribe to the Rust
  // menu's `cad:menu` event so each native menu click reaches the
  // matching `cad:*` window event the existing CAD app already
  // handles. The bridge swallows itself on the web build.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;
    void (async () => {
      const stop = await registerMenuBridge();
      if (disposed && stop) {
        stop();
      } else {
        unlisten = stop;
      }
    })();
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, []);

  // Let other surfaces (e.g. the startup New Drawing dialog) open the
  // cloud Save/Open dialog without reaching into this component's state.
  useEffect(() => {
    const handler = (e: Event) => {
      const mode = (e as CustomEvent<{ mode?: 'save' | 'open' }>).detail?.mode;
      setDbDialog(mode === 'save' ? 'save' : 'open');
    };
    window.addEventListener('cad:openDbDialog', handler);
    return () => window.removeEventListener('cad:openDbDialog', handler);
  }, []);

  // Open the Export-layers dialog from elsewhere (e.g. the LayerPanel
  // right-click menu).
  useEffect(() => {
    const handler = () => setExportLayersOpen(true);
    window.addEventListener('cad:openExportLayers', handler);
    return () => window.removeEventListener('cad:openExportLayers', handler);
  }, []);

  // cad-desktop-tauri-and-perf Slice T4c — Tauri-only OS drag-drop
  // of survey files onto the canvas. The web build skips this
  // entirely because `isTauri()` inside `registerNativeDropListener`
  // returns false there; the existing browser drop affordances are
  // untouched. On Tauri, each recognised file (.starr / .trv / .csv
  // — see `NATIVE_DROP_EXTENSIONS`) feeds through the same
  // `processOpenedCadFile` helper Slice T4b extracted from
  // `openFileDialog`, so the format-sniff + loader chain stays
  // single-source.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;
    void (async () => {
      const stop = await registerNativeDropListener(async (files) => {
        for (const file of files) {
          setFileLoading(true);
          await processOpenedCadFile(file.name, file.contents);
          // cad-desktop-tauri-and-perf Slice T7b — record each
          // successfully-processed drop.
          void addRecentFile(file.path, file.name);
        }
      });
      if (disposed && stop) {
        stop();
      } else {
        unlisten = stop;
      }
    })();
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // cad-trv-import-display Slice 3 — auto-size the paper sheet
  // around the imported survey extent + pick a standard 1" = N'
  // engineering scale. The bare zoom-extents (Slice 1) panned
  // the CAMERA to the survey; this also moves the paper SHEET +
  // updates the title-block scaleLabel + the drawingScale so the
  // print + the canvas line up. Only fires when the import has
  // ≥ 1 feature with geometry; otherwise the existing paper
  // settings stay untouched.
  function maybeFitPaperToImportedFeatures(features: ReadonlyArray<unknown>) {
    try {
      const bbox = bboxOfFeaturePointsRobust(features as Parameters<typeof bboxOfFeaturePointsRobust>[0]);
      if (!bbox) return;
      const fit = fitPaperToBounds(bbox);
      if (!fit) {
        cadLog.warn('FileIO', `TRV import bbox doesn't fit even ARCH_E at 10000 ft/in scale — leaving paper settings alone.`);
        return;
      }
      useDrawingStore.getState().updateSettings({
        paperSize: fit.paperSize,
        paperOrientation: fit.paperOrientation,
        drawingScale: fit.drawingScale,
        paperOrigin: fit.paperOriginWorld,
      });
      // Title-block scale label only fills if currently empty
      // (matching the non-destructive policy of the metadata
      // apply step). The surveyor can override afterward via
      // the Title Block panel.
      const tb = doc.settings?.titleBlock;
      if (tb && (!tb.scaleLabel || tb.scaleLabel.trim().length === 0)) {
        useDrawingStore.getState().updateSettings({ titleBlock: { ...tb, scaleLabel: fit.scaleLabel } });
      }
      cadLog.info('FileIO', `Fitted paper to imported survey: ${fit.paperSize} ${fit.paperOrientation} @ ${fit.scaleLabel}`);
    } catch (err) {
      cadLog.warn('FileIO', 'Paper auto-fit failed; falling back to existing paper.', err);
    }
  }

  // cad-desktop-tauri-and-perf Slice T4b — given a loaded file's
  // `{ name, contents }`, run the existing sniff + loader chain. The
  // Tauri branch and the web `<input type="file">` branch both feed
  // into this so the format-detection + dispatch + diagnostic
  // pipelines stay single-source. Caller is responsible for calling
  // setFileLoading(true) before invoking; this function owns the
  // setFileLoading(false) in its finally + the catch-and-report on
  // dispatch errors. Behavior is byte-for-byte identical to the
  // pre-extraction inline body for any (name, text) input.
  async function processOpenedCadFile(name: string, text: string) {
    const format = detectFileFormat(name, text);
    try {
      if (format === 'TRV') {
        // Route TRV files through the same import flow as
        // File → Import → "Import Traverse PC (.TRV)…" with
        // the count preview + non-destructive title-block apply.
        const report: TrvImportReport = importTrvFromText(text, { fileName: name });
        const noteSummary = report.notes.length > 0
          ? `\n\n${report.notes.length} note(s):\n  - ${report.notes.slice(0, 5).join('\n  - ')}${report.notes.length > 5 ? `\n  …and ${report.notes.length - 5} more` : ''}`
          : '';
        const drawingSummary = formatRenderedElements(report.renderedElements);
        // cad-trv-fidelity Slice 13 — Starr-styled import modal in
        // place of the native window.confirm popup.
        const ok = await confirmAction({
          title: 'Open Traverse PC (.TRV)',
          message:
            `Open ${name} as a Traverse PC TRV?\n\n` +
            `  ${report.layerCount} layer(s)\n` +
            `  ${report.pointCount} point(s)\n` +
            `  ${report.traverseCount} traverse(s)` +
            (drawingSummary ? `\n  drawing: ${drawingSummary}` : '') +
            noteSummary +
            `\n\nThis will ADD the records to the current drawing.`,
          confirmLabel: 'Open',
          cancelLabel: 'Cancel',
        });
        if (!ok) {
          setFileLoading(false);
          return;
        }
        for (const l of report.mapped.layers) useDrawingStore.getState().addLayer(l);
        // cad-duplicate-point-handling Slice 4 — rename any
        // imported POINT whose trvPointId already exists in
        // the current drawing using the `:N` convention.
        const dedupedOpen = dedupeTrvFeaturesAgainstDrawing(
          report.mapped.features,
          Object.values(doc.features),
        );
        useDrawingStore.getState().addFeatures(dedupedOpen.features);
        // cad-trv-fidelity Slice 2 — add the per-traverse feature
        // groups so each traverse shows as a sublayer in the panel.
        useDrawingStore.getState().addFeatureGroups(report.mapped.featureGroups);
        if (dedupedOpen.renames.length > 0) {
          cadLog.info('FileIO', `Auto-renamed ${dedupedOpen.renames.length} colliding TRV point id(s) on import`);
        }
        cadLog.info('FileIO', `Loaded TRV via Open dialog: ${report.layerCount} layers, ${report.pointCount} points, ${report.traverseCount} traverses`);
        // Offer the title-block metadata apply (same as importTrv).
        const m = report.metadata;
        const hasMetadata = !!(m.projectName || m.surveyDate || m.scale || m.sourcePath);
        if (hasMetadata) {
          const applyMeta = await confirmAction({
            title: 'Apply title-block metadata?',
            message:
              'Apply TRV project metadata to the survey title block?\n\n' +
              (m.projectName ? `  Project name: ${m.projectName}\n` : '') +
              (m.surveyDate  ? `  Survey date: ${m.surveyDate}\n` : '') +
              (m.scale       ? `  Scale: ${m.scale}\n` : '') +
              (m.sourcePath  ? `  Source: ${m.sourcePath}\n` : '') +
              '\nOnly fields you haven\'t set will be filled (non-destructive).',
            confirmLabel: 'Apply',
            cancelLabel: 'Skip',
          });
          if (applyMeta) {
            const current = doc.settings?.titleBlock;
            if (current) useDrawingStore.getState().updateSettings({ titleBlock: applyTrvMetadataToTitleBlock(m, current, report.titleBlockHints) });
          }
        }
        maybeFitPaperToImportedFeatures(report.mapped.features);
        // cad-trv-element-coverage Slice 1 — zoom to the PAPER
        // sheet (sized to the robust bbox by paper-fit above)
        // not the strict feature bbox, so outlier GPS shots
        // don't drag the camera out + the lot is immediately
        // viewable.
        setTimeout(() => window.dispatchEvent(new CustomEvent('cad:zoomToPaper')), 200);
        setFileLoading(false);
        return;
      }
      // STARR or UNKNOWN: try the JSON path. UNKNOWN attempts the
      // STARR path optimistically — the structured diagnostic
      // below will hint the right loader if it fails.
      let payload: { document: unknown };
      try {
        payload = JSON.parse(text) as { document: unknown };
      } catch (err) {
        const diag = buildFileLoadDiagnostic(name, text, err, 'parse');
        cadLog.error('FileIO', formatFileLoadDiagnostic(diag), err);
        reportFileLoadError(diag);
        setFileLoading(false);
        return;
      }
      // P6h — the outer `doc` is the live drawing-store doc selector;
      // this is the just-parsed candidate, so use a distinct name.
      let loadedDoc;
      try {
        loadedDoc = validateAndMigrateDocument(payload?.document ?? payload);
      } catch (err) {
        const diag = buildFileLoadDiagnostic(name, text, err, 'map');
        cadLog.error('FileIO', formatFileLoadDiagnostic(diag), err);
        reportFileLoadError(diag);
        setFileLoading(false);
        return;
      }
      useDrawingStore.getState().loadDocument(loadedDoc);
      useSelectionStore.getState().deselectAll();
      useUndoStore.getState().clear();
      useSaveTargetStore.getState().setLocalTarget(loadedDoc.id, loadedDoc.name);
      cadLog.info('FileIO', `Loaded drawing: ${loadedDoc.name}`);
      setTimeout(() => window.dispatchEvent(new CustomEvent('cad:zoomExtents')), 200);
    } catch (err) {
      const diag = buildFileLoadDiagnostic(name, text, err, 'apply');
      cadLog.error('FileIO', formatFileLoadDiagnostic(diag), err);
      reportFileLoadError(diag);
    } finally {
      setFileLoading(false);
    }
  }

  function openFileDialog() {
    // cad-desktop-tauri-and-perf Slice T4b — inside the Tauri shell,
    // route Open through the native dialog plugin instead of a
    // browser-synthesized <input type="file">. The web build stays
    // on the original path; isTauri() returns false there, so this
    // branch is a no-op.
    if (isTauri()) {
      void (async () => {
        let result;
        try {
          result = await openCadFileViaPlatform();
        } catch (err) {
          const diag = buildFileLoadDiagnostic('', '', err, 'sniff');
          cadLog.error('FileIO', formatFileLoadDiagnostic(diag), err);
          reportFileLoadError(diag);
          return;
        }
        if (!result) return; // user cancelled the dialog
        setFileLoading(true);
        await processOpenedCadFile(result.name, result.contents);
        // cad-desktop-tauri-and-perf Slice T7b — record the file in
        // Recent Files. We use result.path (not file.name) so future
        // menu rebuilds can re-open by absolute path.
        void addRecentFile(result.path, result.name);
      })();
      return;
    }
    const input = Object.assign(document.createElement('input'), {
      type: 'file',
      // cad-trv-import-export-deep-semantic Pass 8 — accept TRV
      // alongside .starr so the Open dialog can route to either
      // loader. Content sniff handles other extensions too.
      accept: '.starr,.TRV,.trv',
    });
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setFileLoading(true);
      let text = '';
      try {
        text = await file.text();
      } catch (err) {
        const diag = buildFileLoadDiagnostic(file.name, '', err, 'sniff');
        cadLog.error('FileIO', formatFileLoadDiagnostic(diag), err);
        reportFileLoadError(diag);
        setFileLoading(false);
        return;
      }
      await processOpenedCadFile(file.name, text);
    };
    input.click();
  }

  function handleZoomExtents() {
    const features = useDrawingStore.getState().getAllFeatures();
    if (features.length === 0) {
      zoomToExtents({ minX: -100, minY: -100, maxX: 100, maxY: 100 });
      return;
    }
    const allPoints = features.flatMap((f) => {
      const g = f.geometry;
      if (g.type === 'POINT') return g.point ? [g.point] : [];
      if (g.type === 'LINE') return [g.start!, g.end!].filter(Boolean);
      return g.vertices ?? [];
    });
    if (allPoints.length === 0) return;
    zoomToExtents(computeBounds(allPoints));
  }

  function startEditName() {
    setNameValue(doc.name);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.select(), 0);
  }

  function commitEditName() {
    const trimmed = nameValue.trim();
    if (trimmed) {
      useDrawingStore.getState().updateDocumentName(trimmed);
    }
    setEditingName(false);
  }

  function exportCsv(flavor: 'simplified' | 'full' = 'simplified') {
    try {
      const { rowCount, filename } = downloadCsv(doc, { flavor });
      cadLog.info('FileIO', `Exported ${rowCount} points as ${flavor} CSV → ${filename}`);
    } catch (err) {
      cadLog.error('FileIO', 'CSV export failed', err);
      void alertAction({ title: 'Starr CAD', message: 'Failed to export CSV. Try again, or contact support if it keeps failing.' });
    }
  }

  function exportTraversePc() {
    try {
      const { rowCount, filename } = downloadPnezd(doc);
      cadLog.info('FileIO', `Exported ${rowCount} points as Traverse PC PNEZD → ${filename}`);
    } catch (err) {
      cadLog.error('FileIO', 'Traverse PC export failed', err);
      void alertAction({ title: 'Starr CAD', message: 'Failed to export Traverse PC file. Try again, or contact support if it keeps failing.' });
    }
  }

  // cad-trv-import-export Slice 4 — Traverse PC `.TRV` round-trip.
  // exportTrv writes the current drawing back out as a TRV file;
  // importTrv opens a file picker, parses the chosen .TRV, shows a
  // confirm-with-counts prompt, then writes the layers + features
  // into the drawing store.
  function exportTrv() {
    try {
      const { byteSize, filename } = downloadTrv(doc);
      cadLog.info('FileIO', `Exported drawing as TRV: ${filename} (${byteSize} bytes)`);
    } catch (err) {
      cadLog.error('FileIO', 'TRV export failed', err);
      void alertAction({ title: 'Starr CAD', message: 'Failed to export TRV. Try again, or contact support if it keeps failing.' });
    }
  }

  function importTrv() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.TRV,.trv,text/plain';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      let report: TrvImportReport;
      try {
        report = importTrvFromText(text, { fileName: file.name });
      } catch (err) {
        cadLog.error('FileIO', 'TRV parse failed', err);
        await confirmAction({
          title: 'Import failed',
          message: 'Failed to parse TRV file. Check that it came from Traverse PC.',
          confirmLabel: 'OK',
          cancelLabel: 'Close',
        });
        return;
      }
      const noteSummary = report.notes.length > 0
        ? `\n\n${report.notes.length} note(s):\n  - ${report.notes.slice(0, 5).join('\n  - ')}${report.notes.length > 5 ? `\n  …and ${report.notes.length - 5} more` : ''}`
        : '';
      const drawingSummary = formatRenderedElements(report.renderedElements);
      // cad-trv-fidelity Slice 13 — Starr-styled import modal in place
      // of the native window.confirm popup.
      const ok = await confirmAction({
        title: 'Import Traverse PC (.TRV)',
        message:
          `Import ${file.name}?\n\n` +
          `  ${report.layerCount} layer(s)\n` +
          `  ${report.pointCount} point(s)\n` +
          `  ${report.traverseCount} traverse(s)` +
          (drawingSummary ? `\n  drawing: ${drawingSummary}` : '') +
          noteSummary +
          `\n\nThis will ADD the records to the current drawing.`,
        confirmLabel: 'Import',
        cancelLabel: 'Cancel',
      });
      if (!ok) return;
      for (const l of report.mapped.layers) useDrawingStore.getState().addLayer(l);
      // cad-duplicate-point-handling Slice 4 — rename any
      // imported POINT whose trvPointId already exists in the
      // current drawing using the `:N` convention.
      const dedupedImport = dedupeTrvFeaturesAgainstDrawing(
        report.mapped.features,
        Object.values(doc.features),
      );
      useDrawingStore.getState().addFeatures(dedupedImport.features);
      // cad-trv-fidelity Slice 2 — per-traverse feature groups (sublayers).
      useDrawingStore.getState().addFeatureGroups(report.mapped.featureGroups);
      if (dedupedImport.renames.length > 0) {
        cadLog.info('FileIO', `Auto-renamed ${dedupedImport.renames.length} colliding TRV point id(s) on import`);
      }
      cadLog.info('FileIO', `Imported TRV: ${report.layerCount} layers, ${report.pointCount} points, ${report.traverseCount} traverses`);
      // Pass 6 — offer to apply TRV project metadata to the
      // drawing's title block. Non-destructive: the helper only
      // fills currently-empty fields, so accepting is safe even
      // mid-project. We prompt separately so the surveyor can
      // skip without skipping the whole import.
      const m = report.metadata;
      const hasMetadata = !!(m.projectName || m.surveyDate || m.scale || m.sourcePath);
      if (hasMetadata) {
        const applyMeta = await confirmAction({
          title: 'Apply title-block metadata?',
          message:
            'Apply TRV project metadata to the survey title block?\n\n' +
            (m.projectName ? `  Project name: ${m.projectName}\n` : '') +
            (m.surveyDate  ? `  Survey date: ${m.surveyDate}\n` : '') +
            (m.scale       ? `  Scale: ${m.scale}\n` : '') +
            (m.sourcePath  ? `  Source: ${m.sourcePath}\n` : '') +
            '\nOnly fields you haven\'t set will be filled (non-destructive).',
          confirmLabel: 'Apply',
          cancelLabel: 'Skip',
        });
        if (applyMeta) {
          const current = doc.settings?.titleBlock;
          if (current) {
            const nextTitleBlock = applyTrvMetadataToTitleBlock(m, current, report.titleBlockHints);
            useDrawingStore.getState().updateSettings({ titleBlock: nextTitleBlock });
            cadLog.info('FileIO', 'Applied TRV metadata to title block');
          }
        }
      }
      // cad-trv-import-display Slice 1 — TRV coords are state-
      // plane survey feet (typical GNSS: northing ~10M, easting
      // ~3M). Without auto-zoom the imported survey lands miles
      // off-screen and the user sees an empty canvas.
      maybeFitPaperToImportedFeatures(report.mapped.features);
      // cad-trv-element-coverage Slice 1 — zoom to the PAPER
      // sheet (sized to the robust bbox by paper-fit above)
      // not the strict feature bbox, so outlier GPS shots don't
      // drag the camera out + the lot is immediately viewable.
      setTimeout(() => window.dispatchEvent(new CustomEvent('cad:zoomToPaper')), 200);
    };
    input.click();
  }

  function exportDxf() {
    try {
      const annotations = useAnnotationStore.getState().annotations;
      const { byteSize, filename } = downloadDxf(doc, {
        annotations,
      });
      cadLog.info(
        'FileIO',
        `Exported drawing as DXF: ${filename} (${byteSize} bytes)`
      );
    } catch (err) {
      cadLog.error('FileIO', 'DXF export failed', err);
      void alertAction({ title: 'Starr CAD', message: 'Failed to export DXF. Try again, or contact support if it keeps failing.' });
    }
  }

  function exportLandXml() {
    try {
      const { byteSize, filename } = downloadLandXML(doc);
      cadLog.info('FileIO', `Exported drawing as LandXML: ${filename} (${byteSize} bytes)`);
    } catch (err) {
      cadLog.error('FileIO', 'LandXML export failed', err);
      void alertAction({ title: 'Starr CAD', message: 'Failed to export LandXML. Try again, or contact support if it keeps failing.' });
    }
  }

  // ── Selection-scoped exports ────────────────
  // Export only the currently-selected features. `scopeDocument`
  // returns a doc clone narrowed to the selection (layers/settings
  // preserved) so the existing writers work unchanged.
  function exportSelection(format: 'CSV' | 'DXF' | 'LANDXML') {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      void alertAction({ title: 'Starr CAD', message: 'Select one or more features first, then choose Export selection.' });
      return;
    }
    try {
      const scoped = scopeDocument(doc, { kind: 'SELECTION', featureIds: ids });
      if (format === 'CSV') {
        const { rowCount, filename } = downloadCsv(scoped, { flavor: 'full' });
        cadLog.info('FileIO', `Exported ${rowCount} selected points as CSV → ${filename}`);
      } else if (format === 'DXF') {
        const annotations = useAnnotationStore.getState().annotations;
        const { filename } = downloadDxf(scoped, { annotations });
        cadLog.info('FileIO', `Exported selection as DXF → ${filename}`);
      } else {
        const { filename } = downloadLandXML(scoped);
        cadLog.info('FileIO', `Exported selection as LandXML → ${filename}`);
      }
    } catch (err) {
      cadLog.error('FileIO', `Selection export (${format}) failed`, err);
      void alertAction({ title: 'Starr CAD', message: `Failed to export the selection as ${format}. Try again, or contact support if it keeps failing.` });
    }
  }

  async function exportTraversePcBundle() {
    try {
      const annotations = useAnnotationStore.getState().annotations;
      const { filename, pointCount } = await downloadTraversePcBundle({
        doc: doc,
        annotations,
      });
      cadLog.info('FileIO', `Exported Traverse PC bundle (${pointCount} points) → ${filename}`);
    } catch (err) {
      cadLog.error('FileIO', 'Traverse PC bundle export failed', err);
      void alertAction({ title: 'Starr CAD', message: 'Failed to export Traverse PC bundle. Try again, or contact support if it keeps failing.' });
    }
  }

  async function openGeoJson() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.geojson,.json,application/geo+json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const result = importFromGeoJSON(text);
        result.document.name = file.name.replace(/\.(geojson|json)$/i, '');
        useDrawingStore.getState().loadDocument(result.document);
        const warnSuffix =
          result.warnings.length > 0
            ? ` with ${result.warnings.length} warning(s); see console`
            : '';
        cadLog.info(
          'FileIO',
          `Imported GeoJSON: ${result.stats.featuresEmitted} feature(s), ` +
            `${result.stats.layersParsed} layer(s)${warnSuffix}`
        );
        if (result.warnings.length > 0) {
          for (const w of result.warnings) cadLog.warn('FileIO', w);
        }
      } catch (err) {
        cadLog.error('FileIO', 'GeoJSON import failed', err);
        void alertAction({ title: 'Starr CAD', message: 'Failed to import GeoJSON. Try again, or contact support if it keeps failing.' });
      }
    };
    input.click();
  }

  /** CAD_AUDIT Slice S8b — import a boundary the research platform already read.
   *
   *  S8a built the adapter; this is the half that makes it reachable. Without it the research side
   *  computes a boundary and a surveyor still re-types the calls by hand, which is this codebase's
   *  most frequent defect and would be a poor place to repeat it.
   *
   *  THREE DECISIONS HERE THAT DIFFER FROM THE OTHER IMPORTERS, EACH DELIBERATE:
   *
   *  1. **It ADDS, it does not replace.** `importFromDxf`/`importFromGeoJSON` call `loadDocument`,
   *     which throws the current drawing away. That is right for "open a DXF" and wrong here: a
   *     deed boundary is something you bring INTO a drawing you are already working in, and
   *     replacing would silently destroy the surveyor's work.
   *  2. **Omissions are confirmed BEFORE anything lands, not logged after.** S8a's whole design is
   *     that a drawing must not present an incomplete figure as a complete one. Putting the
   *     `notDrawn` list in the console — where the other importers put their warnings — would mean
   *     the one person who needs it is the one least likely to see it.
   *  3. **A file that is not a reading is refused by NAME.** Parsing arbitrary JSON and producing an
   *     empty drawing would look like "this deed had no boundary" rather than "wrong file". */
  async function openResearchReading() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text()) as unknown;
        // Duck-check before trusting it. `traverse` is the field that makes a reading a reading, and
        // it is legitimately null for a lot-and-block description — so PRESENCE is the test, not
        // truthiness.
        if (!parsed || typeof parsed !== 'object' || !('traverse' in parsed)) {
          void alertAction({
            title: 'Not a research reading',
            message: 'That file does not look like a survey reading — it has no traverse field. '
              + 'Pick the JSON the research platform produced for this property.',
          });
          return;
        }

        const result = featuresFromSurveyReading(parsed as SurveyReadingLike);

        if (result.notDrawn.length > 0) {
          const lines = result.notDrawn.map((n) => `• ${n.what} — ${n.why}`).join('\n');
          const ok = await confirmAction({
            title: result.features.length ? 'Some of this reading cannot be drawn' : 'Nothing can be drawn',
            message:
              `${result.features.length} feature(s) will be added.\n\n`
              + `NOT drawn:\n${lines}\n\n`
              + (result.closed
                ? ''
                : 'The boundary is left OPEN because at least one call could not be used — a closed '
                  + 'shape would look complete when it is not.\n\n')
              + 'Coordinates are relative to the point of beginning; this is not tied to the state plane.',
            confirmLabel: result.features.length ? 'Add anyway' : 'OK',
          });
          if (!ok || result.features.length === 0) return;
        }

        // S8c — the layers FIRST, and this order is not cosmetic. `getVisibleFeatures` drops any
        // feature whose `layerId` is not in `document.layers`, so features added before their
        // layers exist are invisible until something else re-renders. Adding features to a
        // drawing that cannot show them is the failure this whole adapter exists to prevent, and
        // it is exactly what happened here: the dialog said "3 feature(s) will be added", they
        // were added, and the canvas stayed empty.
        const store = useDrawingStore.getState();
        const doc = store.document;
        // S8d — was this drawing empty before the import? A new document seeds 28 default layers
        // but zero features, so this is a reliable test and it decides whether we may move the
        // sheet (below).
        const wasEmpty = Object.keys(doc.features).length === 0;
        const newLayers = researchLayersToCreate(
          result.requiredLayers,
          Object.keys(doc.layers),
          doc.layerOrder.length,
        );

        for (const layer of newLayers) store.addLayer(layer);

        useDrawingStore.getState().addFeatures(result.features);

        // S8d — put it ON THE SHEET, not merely on screen.
        //
        // S8c made the geometry visible; driving it showed the next problem. A reading's
        // coordinates are relative to a point of beginning at (0,0), and a traverse that runs
        // south of the POB has negative northings — while the paper occupies y ∈ [0, height]. So a
        // correctly imported tract sat entirely off the white sheet, on the grey. It looked drawn
        // and would have plotted blank.
        //
        // `cad:fitDrawingToPage` is the right instrument because of WHICH thing it moves: it picks
        // a standard engineering plot scale and repositions the PAPER over the data, leaving every
        // coordinate, distance and bearing untouched. Moving the geometry onto the sheet instead
        // would falsify the survey to make the picture tidy.
        //
        // Only when the drawing was empty, though. Re-fitting the sheet under a surveyor who
        // already has work in progress silently changes their plot scale and page position, which
        // is their decision and not an import's. In that case just bring the new geometry into
        // view and leave the sheet alone; `Fit Drawing to Page` is on the View menu when they want
        // it.
        //
        // Deferred a tick like `ImportDialog` does, so the fit is computed from a document that
        // already contains the new features.
        setTimeout(() => window.dispatchEvent(new CustomEvent(
          wasEmpty ? 'cad:fitDrawingToPage' : 'cad:zoomExtents',
        )), 50);

        cadLog.info(
          'FileIO',
          `Imported research reading: ${result.features.length} feature(s), `
            + `${result.closed ? 'closed' : 'OPEN (incomplete)'}, `
            + `${newLayers.length} layer(s) created, `
            + `${result.notDrawn.length} item(s) not drawn`,
        );
      } catch (err) {
        cadLog.error('FileIO', 'Research reading import failed', err);
        void alertAction({ title: 'Starr CAD', message: 'Could not read that file. It may not be valid JSON.' });
      }
    };
    input.click();
  }

  /** CAD_AUDIT Slice S9b — compare this parcel's record against a prior survey of the same land.
   *
   *  Takes TWO research readings and reports the difference. Two files rather than "the current
   *  drawing versus a file" on purpose: extracting courses back out of arbitrary drawn geometry means
   *  guessing which features are the boundary and in what order, and a comparison built on a guess is
   *  worse than no comparison — it would report differences that are artefacts of the guess.
   *
   *  The report leads with the BASIS, because that is the finding that stops a surveyor chasing
   *  ghosts: two records of the same land written forty years apart disagree about every bearing and
   *  usually agree perfectly, being on different bases of bearings. S9a estimates that rotation and
   *  removes it; what this dialog shows is what is left. */
  async function openCompareSurveys() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.multiple = true;
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      if (files.length !== 2) {
        void alertAction({
          title: 'Pick two readings',
          message: 'Select exactly two research reading files — the earlier survey and the later one.',
        });
        return;
      }
      try {
        const readings = await Promise.all(files.map(async (f) => JSON.parse(await f.text()) as {
          traverse?: { points?: Array<{ x: number; y: number }> } | null;
        }));
        const pointsOf = (r: typeof readings[number]) => r?.traverse?.points ?? [];
        if (pointsOf(readings[0]).length < 2 || pointsOf(readings[1]).length < 2) {
          void alertAction({
            title: 'Nothing to compare',
            message: 'At least one of those readings has no traversable boundary — a lot-and-block or '
              + 'reference-only description cannot be compared course by course.',
          });
          return;
        }

        const result = compareSurveys(
          callsFromPoints(pointsOf(readings[0])),
          callsFromPoints(pointsOf(readings[1])),
        );

        const rows = result.comparisons
          .filter((c) => c.flagged)
          .map((c) => `• course ${c.index + 1}: ${c.reason}`)
          .join('\n');
        const skipped = result.uncomparable.map((u) => `• course ${u.index + 1}: ${u.why}`).join('\n');

        void alertAction({
          title: `${files[0].name} vs ${files[1].name}`,
          message: [
            result.basisStatement,
            '',
            result.flaggedCount === 0
              ? 'No course differs beyond tolerance once the basis is accounted for.'
              : `${result.flaggedCount} course(s) differ:\n${rows}`,
            result.countMismatch
              ? `\nThe records describe a different number of courses (${result.countMismatch.a} vs ${result.countMismatch.b}).`
              : '',
            skipped ? `\nCould not be compared:\n${skipped}` : '',
          ].filter(Boolean).join('\n'),
        });
        cadLog.info('Survey', `Compared surveys: ${result.flaggedCount} flagged, basis offset ${result.basisOffsetDeg ?? 'n/a'}`);

        // S9c — offer to put the OTHER survey on the canvas.
        //
        // The report above says a course differs; it cannot say WHERE, and that is the question a
        // surveyor actually has. The second reading goes onto its own locked, dashed, magenta layer
        // — see `comparison-overlay.ts` for why a real layer beats a bespoke render pass.
        //
        // ASKED, not done automatically. This writes features into the surveyor's drawing, and a
        // comparison that silently adds geometry is indistinguishable from one that corrupted it.
        // Declining still leaves the report, which is what S9b always gave.
        const wantsOverlay = await confirmAction({
          title: 'Show it on the drawing?',
          message:
            `Add "${files[1].name}" as a locked reference layer, so you can see where the two ` +
            `records differ. It is drawn dashed and in magenta, it cannot be edited or moved, and ` +
            `you can hide or delete it from the layer panel at any time.`,
          confirmLabel: 'Add reference layer',
        });
        if (wantsOverlay) {
          const doc = useDrawingStore.getState().document;
          const overlay = comparisonOverlay(
            readings[1] as unknown as SurveyReadingLike,
            files[1].name,
            doc.layerOrder.length,
          );
          // Replace rather than duplicate when the same record is compared twice — otherwise the
          // second run stacks an identical figure on the first and every course looks doubled.
          if (doc.layers[overlay.layer.id]) {
            useDrawingStore.getState().removeFeatures(
              Object.values(doc.features).filter((f) => f.layerId === overlay.layer.id).map((f) => f.id),
            );
          } else {
            useDrawingStore.getState().addLayer(overlay.layer);
          }
          useDrawingStore.getState().addFeatures(overlay.features);
          // Never re-fits the page: by definition there is existing work here, and re-scaling a
          // surveyor's sheet to accommodate a reference is their decision (the S8d rule).
          setTimeout(() => window.dispatchEvent(new CustomEvent('cad:zoomExtents')), 50);
          cadLog.info('Survey', `Added comparison layer ${overlay.layer.id} (${overlay.features.length} feature(s))`);
        }
      } catch (err) {
        cadLog.error('Survey', 'Survey comparison failed', err);
        void alertAction({ title: 'Starr CAD', message: 'Could not read those files. They may not be valid JSON.' });
      }
    };
    input.click();
  }

  /** CAD_AUDIT Slice S14b — reconcile SEVERAL records into the drawing to start from.
   *
   *  S9b compares exactly two readings and reports. This takes as many as the surveyor has — a deed,
   *  the plat, a prior survey, an adjoiner's description — agrees them course by course, and draws
   *  the agreed figure.
   *
   *  THE CONFIRMATION IS THE FEATURE, not a formality. A reconciled boundary looks exactly as
   *  authoritative whether four records agreed on every course or two contradicted each other and
   *  the median picked one. So the disputed courses are listed BEFORE anything lands, the same way
   *  S8b puts its `notDrawn` list in front of the surveyor rather than in the console — the one
   *  person who needs it is otherwise the one least likely to see it. */
  async function openReconcileSurveys() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.multiple = true;
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      if (files.length < 2) {
        void alertAction({
          title: 'Pick at least two records',
          message: 'Select two or more research readings of the same land. One record cannot be '
            + 'reconciled — there is nothing to agree with.',
        });
        return;
      }
      try {
        const sources: ReconcileSource[] = [];
        const unusable: string[] = [];
        for (const f of files) {
          const reading = JSON.parse(await f.text()) as { traverse?: { points?: Array<{ x: number; y: number }> } | null };
          const points = reading?.traverse?.points ?? [];
          // Named rather than dropped: a file that vanishes silently reads as one the surveyor
          // forgot to pick, and they will not add it again.
          if (points.length < 2) { unusable.push(f.name); continue; }
          sources.push({ label: f.name, calls: callsFromPoints(points) });
        }
        if (sources.length < 2) {
          void alertAction({
            title: 'Not enough traversable records',
            message: `Only ${sources.length} of those files has a traversable boundary. A `
              + 'lot-and-block or reference-only description cannot be reconciled course by course.'
              + (unusable.length ? `\n\nNot traversable:\n${unusable.map((u) => `• ${u}`).join('\n')}` : ''),
          });
          return;
        }

        const rec = reconcileSurveys(sources);
        const walked = pointsFromReconciled(rec.calls);

        const disputes = rec.calls
          .filter((c) => c.bearingAgreement === 'disputed' || c.distanceAgreement === 'disputed')
          .map((c) => `• course ${c.index + 1}: ${c.note}`)
          .join('\n');
        const uncorroborated = rec.calls
          .filter((c) => c.bearingAgreement === 'single-source' || c.distanceAgreement === 'single-source')
          .map((c) => `• course ${c.index + 1}: ${c.note}`)
          .join('\n');

        const ok = await confirmAction({
          title: rec.fullyAgreed ? 'Every record agrees' : 'Some courses are contested',
          message: [
            rec.summary,
            unusable.length ? `\nNot traversable, and left out:\n${unusable.map((u) => `• ${u}`).join('\n')}` : '',
            disputes ? `\nDISPUTED — the records do not agree:\n${disputes}` : '',
            uncorroborated ? `\nUNCORROBORATED — only one record states these:\n${uncorroborated}` : '',
            rec.differingCallCounts.length
              ? `\nThese records describe a different number of courses:\n${rec.differingCallCounts.map((d) => `• ${d.source}: ${d.count}`).join('\n')}`
              : '',
            walked.stoppedReason
              ? `\nThe figure stops early: ${walked.stoppedReason}. ${walked.usedCalls} course(s) drawn.`
              : '',
            '\nCoordinates are relative to the point of beginning; this is not tied to the state plane.',
          ].filter(Boolean).join('\n'),
          confirmLabel: walked.points.length >= 2 ? 'Draw the agreed figure' : 'OK',
        });
        if (!ok || walked.points.length < 2) return;

        // Reuses the S8a adapter and the S8c/S8d import path rather than building geometry here, so
        // the reconciled figure gets the same layer creation, the same OPEN-when-incomplete rule and
        // the same fit-to-page as a single-reading import. A second way to turn calls into features
        // is how the two come to disagree.
        const result = featuresFromSurveyReading({
          traverse: {
            points: walked.points,
            // An early stop is exactly an unusable call, so the boundary must come in OPEN. Saying
            // "reconciled" and drawing a closed polygon over a figure that stopped at course 2 is
            // the failure S8a exists to prevent.
            unusable: walked.stoppedReason
              ? [{ index: walked.stoppedAt ?? walked.usedCalls, reason: walked.stoppedReason }]
              : [],
          },
          located: [],
          monuments: [],
          features: [],
          confidence: null,
        });

        const store = useDrawingStore.getState();
        const doc = store.document;
        const wasEmpty = Object.keys(doc.features).length === 0;
        for (const layer of researchLayersToCreate(result.requiredLayers, Object.keys(doc.layers), doc.layerOrder.length)) {
          store.addLayer(layer);
        }
        useDrawingStore.getState().addFeatures(result.features);
        setTimeout(() => window.dispatchEvent(new CustomEvent(
          wasEmpty ? 'cad:fitDrawingToPage' : 'cad:zoomExtents',
        )), 50);

        cadLog.info(
          'Survey',
          `Reconciled ${sources.length} record(s): ${rec.consensusCalls} agreed, `
            + `${rec.disputedCalls} disputed, ${rec.singleSourceCalls} uncorroborated, `
            + `${walked.usedCalls} course(s) drawn`,
        );
      } catch (err) {
        cadLog.error('Survey', 'Survey reconciliation failed', err);
        void alertAction({ title: 'Starr CAD', message: 'Could not read those files. They may not be valid JSON.' });
      }
    };
    input.click();
  }

  async function openDxf() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.dxf,application/dxf,application/vnd.dxf';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const result = importFromDxf(text);
        result.document.name = file.name.replace(/\.dxf$/i, '');
        useDrawingStore.getState().loadDocument(result.document);
        const warnSuffix =
          result.warnings.length > 0
            ? ` with ${result.warnings.length} warning(s); see console`
            : '';
        cadLog.info(
          'FileIO',
          `Imported DXF: ${result.stats.featuresEmitted} features, ` +
            `${result.stats.layersParsed} layers${warnSuffix}`
        );
        if (result.warnings.length > 0) {
          for (const w of result.warnings) cadLog.warn('FileIO', w);
        }
      } catch (err) {
        cadLog.error('FileIO', 'DXF import failed', err);
        void alertAction({ title: 'Starr CAD', message: 'Failed to import DXF. Try again, or contact support if it keeps failing.' });
      }
    };
    input.click();
  }

  function exportPdf() {
    try {
      // Pull plotStyle from the template store so the Print
      // dialog's choice (AS_DISPLAYED / MONOCHROME / GRAYSCALE)
      // actually drives the resolver. Reading via getState()
      // instead of a top-of-component hook keeps the
      // subscription out of MenuBar's render path — print
      // settings change rarely and the menu doesn't need to
      // re-render when they do.
      const { plotStyle, scaleMode, scale } = useTemplateStore.getState().printConfig;
      const { byteSize, filename } = downloadPdf(doc, {
        plotStyle,
        scaleMode,
        scale,
      });
      cadLog.info(
        'FileIO',
        `Exported drawing as PDF: ${filename} (${byteSize} bytes, plotStyle=${plotStyle}, scaleMode=${scaleMode}${scaleMode === 'FIXED' ? `, 1"=${scale}'` : ''})`
      );
    } catch (err) {
      cadLog.error('FileIO', 'PDF export failed', err);
      void alertAction({ title: 'Starr CAD', message: 'Failed to export PDF. Try again, or contact support if it keeps failing.' });
    }
  }

  function exportFieldCards() {
    try {
      const result = downloadSleeveCards(
        doc,
        MASTER_CODE_LIBRARY
      );
      cadLog.info(
        'FileIO',
        `Exported field reference cards: ${result.filename} ` +
          `(${result.codesIncluded} codes, ${result.cardCount} cards, ` +
          `${result.pageCount} pages, ${result.byteSize} bytes)`
      );
    } catch (err) {
      cadLog.error('FileIO', 'Field reference cards export failed', err);
      void alertAction({
        title: 'Starr CAD',
        message: 'Failed to export field reference cards. Try again, or contact support if it keeps failing.',
      });
    }
  }

  function exportGeoJSON() {
    try {
      const { byteSize, filename } = downloadGeoJSON(doc);
      cadLog.info(
        'FileIO',
        `Exported drawing as GeoJSON: ${filename} (${byteSize} bytes)`
      );
    } catch (err) {
      cadLog.error('FileIO', 'GeoJSON export failed', err);
      void alertAction({ title: 'Starr CAD', message: 'Failed to export GeoJSON. Try again, or contact support if it keeps failing.' });
    }
  }

  async function exportDeliverable() {
    try {
      const annotations = useAnnotationStore.getState().annotations;
      const description = useDeliveryStore.getState().description;
      const reviewRecord = useReviewWorkflowStore.getState().record;
      const { filename, byteSize, manifest } = await downloadDeliverableBundle({
        doc: doc,
        annotations,
        description,
        reviewRecord,
      });
      cadLog.info(
        'FileIO',
        `Exported deliverable bundle: ${filename} (${byteSize} bytes; ` +
          `${manifest.fileList.length} files; status ${manifest.status})`
      );
    } catch (err) {
      cadLog.error('FileIO', 'Deliverable bundle export failed', err);
      void alertAction({
        title: 'Starr CAD',
        message: 'Failed to export deliverable bundle. Try again, or contact support if it keeps failing.',
      });
    }
  }

  // P6i — `undoStackLen` / `redoStackLen` selectors above force a
  // re-render whenever a stack push/pop changes the head; the
  // descriptions then come from the current snapshot.
  const undoDesc = useUndoStore.getState().undoDescription();
  const redoDesc = useUndoStore.getState().redoDescription();
  const canUndo = undoStackLen > 0;
  const canRedo = redoStackLen > 0;

  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        { label: 'New Drawing', shortcut: 'Ctrl+N', action: () => { window.dispatchEvent(new CustomEvent('cad:openNewDrawingDialog')); setOpenMenu(null); } },
        // CAD_AUDIT S5a — these two open completely different things and their labels did not say so.
        // `Open…` is a file picker on this machine; `Open Saved Drawing…` lists the drawings saved to
        // the cloud. S1a recorded it as "the difference between them is not discoverable from the
        // labels", and a surveyor picking wrong gets a dialog that looks broken rather than one that
        // looks like the other option.
        //
        // The fix is to name the SOURCE, which is what the Save side of this menu already does —
        // "Save to Cloud…" beside "Save a copy (local .starr)…". Now both halves read the same way,
        // so the menu teaches the distinction instead of hiding it.
        { label: 'Open from this computer…', shortcut: 'Ctrl+O', action: () => requestDiscard(openFileDialog) },
        { label: 'Open from Cloud…', action: () => { setDbDialog('open'); setOpenMenu(null); } },
        { label: 'File Manager…', action: () => { window.dispatchEvent(new CustomEvent('cad:openFileManager')); setOpenMenu(null); } },
        // drawings-collaboration Slice 4 — notes thread for the current
        // drawing. The RPLS / drawer / job-overseer dialog.
        { label: '💬 Drawing notes…', action: () => { window.dispatchEvent(new CustomEvent('cad:openDrawingNotes')); setOpenMenu(null); } },
        // cad-branching — GitHub-style branch / review workflow for the shared
        // drawing, and the shared point-file library.
        { label: '🔀 Branches & Reviews…', action: () => { window.dispatchEvent(new CustomEvent('cad:openBranchDialog')); setOpenMenu(null); } },
        { label: '📍 Point File Library…', action: () => { window.dispatchEvent(new CustomEvent('cad:openPointFileLibrary')); setOpenMenu(null); } },
        { label: 'Recover unsaved drawings…', action: () => { onOpenRecentRecoveries?.(); setOpenMenu(null); } },
        { separator: true },
        { label: 'Save', shortcut: 'Ctrl+S', action: () => { void saveDocument(); setOpenMenu(null); } },
        { label: 'Save to Cloud…', action: () => { setDbDialog('save'); setOpenMenu(null); } },
        { label: 'Save a copy (local .starr)…', action: () => { saveLocalCopy(); setOpenMenu(null); } },
        { separator: true },
        {
          label: 'Export',
          submenu: [
            { label: 'Export as CSV (simplified)…', action: () => { exportCsv('simplified'); setOpenMenu(null); } },
            { label: 'Export as CSV (full)…', action: () => { exportCsv('full'); setOpenMenu(null); } },
            { separator: true },
            { label: 'Export for Traverse PC (PNEZD)…', action: () => { exportTraversePc(); setOpenMenu(null); } },
            // cad-trv-import-export Slice 4 — round-trippable .TRV
            // export (layers + points + traverses + projection /
            // metadata / GNSS when sourced from a TRV).
            { label: 'Export as Traverse PC (.TRV)…', action: () => { exportTrv(); setOpenMenu(null); } },
            { label: '📦 Export Traverse PC bundle (zip)…', action: () => { void exportTraversePcBundle(); setOpenMenu(null); } },
            { label: 'Export as DXF…', action: () => { exportDxf(); setOpenMenu(null); } },
            { label: 'Export as LandXML…', action: () => { exportLandXml(); setOpenMenu(null); } },
            { separator: true },
            { label: 'Export as PDF (sealed)…', action: () => { exportPdf(); setOpenMenu(null); } },
            { label: 'Export as GeoJSON…', action: () => { exportGeoJSON(); setOpenMenu(null); } },
            { label: '🪪 Field reference cards…', action: () => { exportFieldCards(); setOpenMenu(null); } },
            { label: '📦 Download deliverable bundle…', action: () => { void exportDeliverable(); setOpenMenu(null); } },
            { separator: true },
            { label: 'Export selection as CSV…', disabled: selectedIds.size === 0, action: () => { exportSelection('CSV'); setOpenMenu(null); } },
            { label: 'Export selection as DXF…', disabled: selectedIds.size === 0, action: () => { exportSelection('DXF'); setOpenMenu(null); } },
            { label: 'Export selection as LandXML…', disabled: selectedIds.size === 0, action: () => { exportSelection('LANDXML'); setOpenMenu(null); } },
            { label: 'Export layers…', action: () => { setExportLayersOpen(true); setOpenMenu(null); } },
          ],
        },
        {
          label: 'Import',
          submenu: [
            { label: 'Import Survey Data (CSV / RW5 / JobXML)…', action: () => { onOpenImport?.(); setOpenMenu(null); } },
            { label: '📍 From Shared Point-File Library…', action: () => { window.dispatchEvent(new CustomEvent('cad:openPointFileLibrary')); setOpenMenu(null); } },
            { label: 'Import DXF…', action: () => { void openDxf(); setOpenMenu(null); } },
            { label: 'Import GeoJSON…', action: () => { void openGeoJson(); setOpenMenu(null); } },
            // S8b — the research platform's own reading. Listed with the other imports because that
            // is where a surveyor looks for "bring something in", not under a research-specific menu
            // they would have to know exists.
            { label: '📐 Import Research Reading (boundary from a deed)…', action: () => { void openResearchReading(); setOpenMenu(null); } },
            // cad-trv-import-export Slice 4 — opens a file picker,
            // parses + previews counts in a confirm dialog, then
            // appends layers + features to the current drawing.
            { label: 'Import Traverse PC (.TRV)…', action: () => { requestDiscard(importTrv); setOpenMenu(null); } },
          ],
        },
        { separator: true },
        {
          label: 'Review & Delivery',
          submenu: [
            { label: '📜 Survey description…', action: () => { onToggleDescriptionPanel?.(); setOpenMenu(null); } },
            { label: '✓ Drawing completeness…', action: () => { onToggleCompletenessPanel?.(); setOpenMenu(null); } },
            { label: '🪪 RPLS review mode…', action: () => { onToggleReviewModePanel?.(); setOpenMenu(null); } },
          ],
        },
      ],
    },
    {
      label: 'Edit',
      items: [
        {
          label: undoDesc ? `Undo ${undoDesc}` : 'Undo',
          shortcut: 'Ctrl+Z',
          action: () => useUndoStore.getState().undo(),
          disabled: !canUndo,
        },
        {
          label: redoDesc ? `Redo ${redoDesc}` : 'Redo',
          shortcut: 'Ctrl+Y',
          action: () => useUndoStore.getState().redo(),
          disabled: !canRedo,
        },
        { separator: true },
        { label: 'Delete Selection', shortcut: 'Del', action: () => {
          const ids = Array.from(selectedIds);
          for (const id of ids) useDrawingStore.getState().removeFeature(id);
          useSelectionStore.getState().deselectAll();
        }},
        { label: 'Select All', shortcut: 'Ctrl+A', action: () => {
          const ids = useDrawingStore.getState().getAllFeatures().map((f) => f.id);
          useSelectionStore.getState().selectMultiple(ids, 'REPLACE');
        }},
        { label: 'Deselect All', shortcut: 'Esc', action: () => useSelectionStore.getState().deselectAll() },
        { separator: true },
        { label: 'Send to Layer…', shortcut: 'Ctrl+Shift+L', action: () => {
          window.dispatchEvent(new CustomEvent('cad:openLayerTransfer'));
          setOpenMenu(null);
        }},
        { label: 'Intersect Lines…', shortcut: 'I X', action: () => {
          window.dispatchEvent(new CustomEvent('cad:openIntersect'));
          setOpenMenu(null);
        }},
        { separator: true },
        // ── Line-editing operations on the single-feature
        // selection. Disabled when zero / multiple features are
        // selected, or the single feature isn't a vertex chain.
        // Surveyors who navigate via menu rather than the
        // toolbar SPLIT flyout still see these operations here.
        ...(() => {
          const selIds = Array.from(selectedIds);
          const single = selIds.length === 1 ? useDrawingStore.getState().getFeature(selIds[0]) : null;
          const isLine = single?.geometry.type === 'LINE';
          const isPolyline = single?.geometry.type === 'POLYLINE';
          const isPolygon = single?.geometry.type === 'POLYGON';
          const isVertexChain = isLine || isPolyline || isPolygon || single?.geometry.type === 'MIXED_GEOMETRY';
          const canSmoothOrSimplify =
            (isPolyline || isPolygon) &&
            !!single?.geometry.vertices &&
            single.geometry.vertices.length >= 3;
          return [
            {
              label: 'Reverse Direction',
              disabled: !isVertexChain,
              action: () => { if (single) reverseFeature(single.id); },
            },
            {
              label: 'Explode (Polyline → Lines)',
              disabled: !(isPolyline || isPolygon || single?.geometry.type === 'MIXED_GEOMETRY'),
              action: () => { if (single) explodeFeature(single.id); },
            },
            {
              label: 'Smooth → Spline',
              disabled: !canSmoothOrSimplify,
              action: () => { if (single) smoothPolyline(single.id); },
            },
            {
              label: 'Simplify polyline (0.5 ft tolerance)',
              disabled: !canSmoothOrSimplify,
              action: () => { if (single) simplifyPolylineFeature(single.id, 0.5); },
            },
          ];
        })(),
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Zoom Extents', shortcut: 'Z E', action: handleZoomExtents },
        {
          label: 'Fit Drawing to Page',
          action: () => { window.dispatchEvent(new CustomEvent('cad:fitDrawingToPage')); setOpenMenu(null); },
        },
        {
          label: 'Move Page (drag to reposition)',
          action: () => { window.dispatchEvent(new CustomEvent('cad:movePageMode')); setOpenMenu(null); },
        },
        { separator: true },
        {
          label: doc.settings.gridVisible ? 'Hide Grid' : 'Show Grid',
          shortcut: 'F7',
          action: () => useDrawingStore.getState().updateSettings({ gridVisible: !doc.settings.gridVisible }),
        },
        {
          label: doc.settings.snapEnabled ? 'Disable Snap' : 'Enable Snap',
          shortcut: 'F3',
          action: () => useDrawingStore.getState().updateSettings({ snapEnabled: !doc.settings.snapEnabled }),
        },
        { separator: true },
        {
          label: showLayerPanel ? 'Hide Layer Panel' : 'Show Layer Panel',
          action: () => useUIStore.getState().toggleLayerPanel(),
        },
        {
          label: showPropertyPanel ? 'Hide Properties' : 'Show Properties',
          action: () => useUIStore.getState().togglePropertyPanel(),
        },
        { separator: true },
        {
          label: 'Data tables & viewers',
          submenu: [
            { label: 'Point Data Viewer', action: () => { window.dispatchEvent(new CustomEvent('cad:togglePointDataViewer')); setOpenMenu(null); } },
            { label: 'Traverse Viewer (line/curve data)', action: () => { window.dispatchEvent(new CustomEvent('cad:toggleTraverseViewer')); setOpenMenu(null); } },
            { separator: true },
            { label: 'Toggle Traverse Panel', action: () => { onToggleTraversePanel?.(); setOpenMenu(null); } },
          ],
        },
        {
          label: 'Project Images…',
          shortcut: 'IM',
          action: () => { onToggleImagePanel?.(); setOpenMenu(null); },
        },
        { separator: true },
        {
          label: doc.settings.titleBlock?.visible ? 'Hide Title Block' : 'Show Title Block',
          action: () => {
            useDrawingStore.getState().updateTitleBlock({ visible: !doc.settings.titleBlock?.visible });
            setOpenMenu(null);
          },
        },
      ],
    },
    {
      label: 'Survey',
      items: [
        {
          label: 'Adjust Orientation…',
          shortcut: 'OA',
          action: () => { onOpenOrientationDialog?.(); setOpenMenu(null); },
        },
        {
          label: 'Rotate Drawing View…',
          shortcut: 'RV',
          action: () => { onOpenDrawingRotation?.(); setOpenMenu(null); },
        },
        { separator: true },
        {
          label: 'Title Block & North Arrow…',
          action: () => { onOpenTitleBlock?.(); setOpenMenu(null); },
        },
        {
          label: 'Code-to-Style Mapping…',
          action: () => { window.dispatchEvent(new CustomEvent('cad:openCodeStylePanel')); setOpenMenu(null); },
        },
        {
          label: 'Connect Points into Linework',
          action: () => { window.dispatchEvent(new CustomEvent('cad:buildLineworkFromCodes')); setOpenMenu(null); },
        },
        { separator: true },
        {
          label: 'Curve Calculator…',
          shortcut: 'CC',
          action: () => { onOpenCurveCalculator?.(); setOpenMenu(null); },
        },
        // cad-calculator-suite Slice 4 — new multi-calculator
        // modal (Generic + Curve in Slice 6). Opens at the
        // last-used calculator + restores per-calculator state.
        {
          label: 'Calculator…',
          shortcut: 'C',
          action: () => { onOpenCalculator?.(); setOpenMenu(null); },
        },
        { separator: true },
        { label: 'Arc', shortcut: 'A', action: () => { setTool('DRAW_ARC'); setOpenMenu(null); } },
        { label: 'Spline (Fit-Point)', shortcut: 'SF', action: () => { setTool('DRAW_SPLINE_FIT'); setOpenMenu(null); } },
        { label: 'Spline (NURBS)', shortcut: 'SN', action: () => { setTool('DRAW_SPLINE_CONTROL'); setOpenMenu(null); } },
        { separator: true },
        { label: 'Curb Return / Fillet', shortcut: 'CR', action: () => { setTool('CURB_RETURN'); setOpenMenu(null); } },
        { label: 'Offset', shortcut: 'OF', action: () => { setTool('OFFSET'); setOpenMenu(null); } },
        { separator: true },
        { label: 'Inverse (Bearing & Distance)', shortcut: 'INV', action: () => { setTool('INVERSE'); setOpenMenu(null); } },
        { label: 'Forward Point', shortcut: 'FP', action: () => { setTool('FORWARD_POINT'); setOpenMenu(null); } },
        { label: 'Compare with a prior survey…', action: () => { void openCompareSurveys(); setOpenMenu(null); } },
        // S14b — sits next to Compare because it answers the next question. Compare tells you
        // whether two records agree; this agrees several and draws the result.
        { label: '⚖ Reconcile several records into a drawing…', action: () => { void openReconcileSurveys(); setOpenMenu(null); } },
        // CAD_AUDIT Slice S6a — the SAME dialogue as AI → "Calc Point", surfaced where a surveyor
        // would actually look for it.
        //
        // The owner asked for "bearing/distance calculations, distance/distance calculations,
        // bearing/bearing calculations" as though they needed building. They were already built —
        // CalcPointDialog has DIST_DIST, BRG_DIST, TWO_BEARINGS, FOURTH_CORNER and PARALLEL over
        // lib/cad/geometry/cogo.ts — and filed under the AI menu, because they happen to deliver
        // their result as a reviewable ghost proposal. That is an implementation detail of HOW the
        // answer is presented, and it had become the reason nobody could find the feature. Classic
        // COGO is not an AI feature; it is the oldest arithmetic in surveying.
        //
        // Deliberately listed in BOTH menus rather than moved: the AI entry is a documented path and
        // silently relocating it would break anyone who knows where it lives.
        { separator: true },
        { label: 'Calc Point (dist–dist, bearing–dist, bearing–bearing, 4th corner)…', action: () => { window.dispatchEvent(new CustomEvent('cad:openCalcPointDialog')); setOpenMenu(null); } },
        { label: 'Close Drawing (Bowditch adjust)…', action: () => { window.dispatchEvent(new CustomEvent('cad:openCloseDrawingDialog')); setOpenMenu(null); } },
      ],
    },
    {
      label: 'Draw',
      items: [
        { label: 'Point', shortcut: 'P', action: () => setTool('DRAW_POINT') },
        { label: 'Line', shortcut: 'L', action: () => setTool('DRAW_LINE') },
        { label: 'Polyline', shortcut: 'PL', action: () => setTool('DRAW_POLYLINE') },
        { label: 'Polygon', shortcut: 'PG', action: () => setTool('DRAW_POLYGON') },
        { label: 'Rectangle', shortcut: 'RE', action: () => setTool('DRAW_RECTANGLE') },
        { label: 'Circle', shortcut: 'CI', action: () => setTool('DRAW_CIRCLE') },
        { label: 'Regular Polygon', shortcut: 'RP', action: () => setTool('DRAW_REGULAR_POLYGON') },
        { separator: true },
        { label: 'Move', shortcut: 'M', action: () => setTool('MOVE') },
        { label: 'Copy', shortcut: 'CO', action: () => setTool('COPY') },
        { label: 'Rotate', shortcut: 'RO', action: () => setTool('ROTATE') },
        { label: 'Mirror', shortcut: 'MI', action: () => setTool('MIRROR') },
        { label: 'Scale', shortcut: 'SC', action: () => setTool('SCALE') },
        { label: 'Erase', shortcut: 'E', action: () => setTool('ERASE') },
      ],
    },
    {
      label: 'AI',
      items: [
        // CAD_AUDIT S5b — five top-level entries for one setting, condensed into one.
        //
        // S1a recorded this as the third of its three observations: *"`AI` spends five entries on one
        // setting — four mode items plus Cycle."* Half the menu was a radio group. The current mode
        // is now on the parent row, so the menu ANSWERS "what mode am I in?" at a glance instead of
        // requiring the reader to scan four lines for a bullet.
        //
        // The submenu keeps every mode individually selectable — condensing must not cost the ability
        // to jump straight to COMMAND — and keeps the chord visible, which was the original reason
        // for listing Cycle here at all.
        {
          label: `AI mode: ${aiMode}`,
          submenu: [
            ...AI_MODE_CYCLE.map((mode: AIMode) => ({
              label: `${mode === aiMode ? '● ' : '  '}${mode}`,
              action: () => { setAIMode(mode); setOpenMenu(null); },
            })),
            { separator: true },
            {
              label: 'Cycle to next mode',
              shortcut: 'Ctrl+Shift+M',
              action: () => { cycleAIMode(); setOpenMenu(null); },
            },
          ],
        },
        { separator: true },
        { label: 'Run AI Drawing Engine…', action: () => { onOpenAIDrawing?.(); setOpenMenu(null); } },
        {
          label: aiQueuePanelOpen ? 'Hide AI review queue' : 'Show AI review queue',
          action: () => { toggleAIQueuePanel(); setOpenMenu(null); },
          disabled: !aiResultLoaded,
        },
        {
          label: 'AI clarifying questions…',
          action: () => { openAIQuestionDialog(); setOpenMenu(null); },
          disabled: !aiQuestionsAvailable,
        },
        { separator: true },
        {
          label: drawingChatOpen ? 'Hide AI drawing chat' : 'AI drawing chat…',
          action: () => { toggleDrawingChat(); setOpenMenu(null); },
        },
        {
          label: aiSidebarOpen ? 'Hide AI sidebar' : 'AI sidebar (tabs)',
          action: () => { toggleAISidebar(); setOpenMenu(null); },
        },
        { separator: true },
        // CAD_POINTS_AND_AI slice D — geometry-solver dialogue. Lets
        // the surveyor pick a method (4th corner / bearing-distance /
        // two-bearings / parallel) against the current point
        // selection. Result is enqueued as a ghost-previewed AI
        // proposal that they accept or skip.
        {
          label: 'Calc Point (dist–dist, bearing–dist, bearing–bearing, 4th corner)…',
          action: () => {
            window.dispatchEvent(new CustomEvent('cad:openCalcPointDialog'));
            setOpenMenu(null);
          },
        },
        // CAD_POINTS_AND_AI slice E — closure repair workflow.
        {
          label: 'Close Drawing (Bowditch adjust)…',
          action: () => {
            window.dispatchEvent(new CustomEvent('cad:openCloseDrawingDialog'));
            setOpenMenu(null);
          },
        },
        // CAD_POINTS_AND_AI slice F — sketch reconciliation.
        {
          label: 'Reconcile Hand Sketch…',
          action: () => {
            window.dispatchEvent(new CustomEvent('cad:openSketchReconcileDialog'));
            setOpenMenu(null);
          },
        },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'Settings & Preferences…', action: () => { window.dispatchEvent(new CustomEvent('cad:openSettings')); setOpenMenu(null); } },
        { separator: true },
        { label: 'Keyboard Shortcuts…', action: () => { setShowShortcuts(true); setOpenMenu(null); } },
        { label: 'About Starr CAD', action: () => void alertAction({ title: 'Starr CAD', message: 'Starr CAD — Phase 1\nBuilt for Starr Surveying Company\nVersion 1.0' }) },
      ],
    },
  ];

  return (
    <>
    <div className="flex items-center bg-gray-900 border-b border-gray-700 text-xs text-gray-200 select-none">
      {/* Logo */}
      <span className="px-3 py-1.5 font-bold text-white text-sm">Starr CAD</span>

      {/* Menu items */}
      {menus.map((menu) => (
        // z-50 keeps the buttons above the click-away overlay (z-40) so
        // hovering across menus and clicking items always registers.
        <div key={menu.label} className="relative z-50">
          <button
            className={`px-3 py-1.5 hover:bg-gray-700 transition-colors ${openMenu === menu.label ? 'bg-gray-700' : ''}`}
            onClick={() => { setOpenMenu(openMenu === menu.label ? null : menu.label); setOpenSubmenu(null); }}
            onMouseEnter={() => { if (openMenu !== null) { setOpenMenu(menu.label); setOpenSubmenu(null); } }}
          >
            {menu.label}
          </button>

          {openMenu === menu.label && (
            // Stays open until an item is chosen or the user clicks away
            // (handled by the overlay) — it no longer vanishes when the
            // cursor merely leaves the menu, which felt flaky.
            <div
              className="absolute top-full left-0 z-50 bg-gray-800 border border-gray-600 rounded shadow-xl py-1 min-w-[200px] animate-[slideInDown_150ms_cubic-bezier(0.16,1,0.3,1)]"
            >
              {menu.items.map((item, idx) => {
                if ('separator' in item && item.separator) {
                  return <div key={idx} className="my-1 border-t border-gray-600" />;
                }
                const mi = item as MenuItem;
                if (mi.submenu) {
                  return (
                    <div
                      key={idx}
                      className="relative"
                      onMouseEnter={() => openSub(mi.label)}
                      onMouseLeave={scheduleCloseSub}
                    >
                      <button
                        className={`w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors duration-100 hover:bg-gray-700 hover:text-white ${
                          openSubmenu === mi.label ? 'bg-gray-700 text-white' : ''
                        }`}
                      >
                        <span>{mi.label}</span>
                        <span className="text-gray-400 text-[10px] ml-4">▸</span>
                      </button>
                      {openSubmenu === mi.label && (
                        <div
                          className="absolute top-0 left-full -ml-px z-50 bg-gray-800 border border-gray-600 rounded shadow-xl py-1 min-w-[240px] animate-[slideInDown_120ms_cubic-bezier(0.16,1,0.3,1)]"
                          onMouseEnter={() => openSub(mi.label)}
                          onMouseLeave={scheduleCloseSub}
                        >
                          {mi.submenu.map((sub, sidx) =>
                            'separator' in sub && sub.separator ? (
                              <div key={sidx} className="my-1 border-t border-gray-600" />
                            ) : (
                              <button
                                key={sidx}
                                className={`w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors duration-100 ${
                                  (sub as MenuItem).disabled
                                    ? 'opacity-40 cursor-default'
                                    : 'hover:bg-gray-700 hover:text-white'
                                }`}
                                disabled={(sub as MenuItem).disabled}
                                onClick={() => {
                                  if (!(sub as MenuItem).disabled) {
                                    (sub as MenuItem).action?.();
                                    setOpenMenu(null);
                                    setOpenSubmenu(null);
                                  }
                                }}
                              >
                                <span>{(sub as MenuItem).label}</span>
                                {(sub as MenuItem).shortcut && (
                                  <span className="text-gray-500 text-[10px] ml-4">{(sub as MenuItem).shortcut}</span>
                                )}
                              </button>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  );
                }
                return (
                  <button
                    key={idx}
                    className={`w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors duration-100 ${
                      mi.disabled ? 'opacity-40 cursor-default' : 'hover:bg-gray-700 hover:text-white'
                    }`}
                    disabled={mi.disabled}
                    onMouseEnter={() => setOpenSubmenu(null)}
                    onClick={() => {
                      if (!mi.disabled) {
                        mi.action?.();
                        setOpenMenu(null);
                        setOpenSubmenu(null);
                      }
                    }}
                  >
                    <span>{mi.label}</span>
                    {mi.shortcut && (
                      <span className="text-gray-500 text-[10px] ml-4">{mi.shortcut}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {/* Dirty indicator */}
      {isDirty && (
        <span className="ml-2 text-yellow-400 text-[10px] animate-[fadeIn_300ms_ease-out]">● unsaved</span>
      )}

      {/* One-click Save — writes back to the drawing's last save target
          (cloud record or local file name); prompts on the first save. */}
      <button
        type="button"
        onClick={() => { void saveDocument(); }}
        title="Save (Ctrl+S) — saves to this drawing's last file; prompts the first time"
        className={`ml-2 px-2 py-0.5 text-[11px] rounded transition-colors flex items-center gap-1 ${
          isDirty
            ? 'bg-blue-600 hover:bg-blue-500 text-white'
            : 'text-gray-400 hover:text-white hover:bg-gray-700'
        }`}
      >
        Save
      </button>

      {/* Document name — click to rename */}
      <div className="ml-auto mr-2 flex items-center gap-2 min-w-0">
        {editingName ? (
          <input
            ref={nameInputRef}
            className="bg-gray-700 text-white text-xs px-1 rounded outline-none max-w-48"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={commitEditName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEditName();
              if (e.key === 'Escape') setEditingName(false);
            }}
            autoFocus
          />
        ) : (
          <span
            className="text-gray-400 text-xs truncate max-w-48 cursor-pointer hover:text-white"
            title="Double-click to rename"
            onDoubleClick={startEditName}
          >
            {doc.name}
          </span>
        )}
      </div>

      {/* Right-side chrome — exit, keyboard shortcuts + settings live
          here so the surveyor doesn't have to drill into Help. */}
      <div className="mr-3 flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={async () => {
            // cad-exit-return-path 2026-05-30 — send the user back to
            // the page they came from (recorded by
            // `useCadReturnPathTracker` in AdminLayoutClient), defaulting
            // to /admin/research-cad when nothing is on file (direct
            // URL hit / browser refresh inside CAD / cleared session).
            const returnTo = getCadReturnPath('/admin/research-cad');
            if (isDirty) {
              // cad-trv-fidelity Slice 13 — Starr-styled confirm instead
              // of the native window.confirm.
              const ok = await confirmAction({
                title: 'Leave the CAD editor?',
                message: `You have unsaved changes. Leave and return to ${returnTo}? Unsaved changes will be lost.`,
                confirmLabel: 'Leave',
                cancelLabel: 'Stay',
                danger: true,
              });
              if (!ok) return;
            }
            clearCadReturnPath();
            router.push(returnTo);
          }}
          className="flex items-center gap-1.5 px-2 py-1 mr-1 rounded text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
          title="Exit the CAD editor and return to where you came from"
          aria-label="Exit CAD editor"
        >
          <LogOutIcon size={14} />
          <span className="hidden sm:inline">Exit</span>
        </button>
        <button
          type="button"
          onClick={() => setShowShortcuts(true)}
          className="text-gray-400 hover:text-white p-1 rounded transition-colors"
          title="Keyboard shortcuts (Shift+/)"
          aria-label="Keyboard shortcuts"
        >
          <KeyboardIcon size={14} />
        </button>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('cad:openSettings'))}
          className="text-gray-400 hover:text-white p-1 rounded transition-colors"
          title="Settings & Preferences (Ctrl+,)"
          aria-label="Settings"
        >
          <SettingsIcon size={14} />
        </button>
      </div>

      {/* Close overlay */}
      {openMenu && (
        <div
          className="fixed inset-0 z-40 animate-[fadeIn_100ms_ease-out]"
          onClick={() => { setOpenMenu(null); setOpenSubmenu(null); }}
        />
      )}

      {/* Keyboard Shortcuts modal */}
      {showShortcuts && (
        <ModalFrame
          open
          onClose={() => setShowShortcuts(false)}
          title="Keyboard Shortcuts"
          initialWidth={560}
          initialHeight={560}
          minWidth={400}
          minHeight={320}
        >
          <div className="p-6 text-xs text-gray-200">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              {[
                ['File', null],
                ['New Drawing', 'Ctrl+N'],
                ['Open…', 'Ctrl+O'],
                ['Save', 'Ctrl+S'],
                ['Edit', null],
                ['Undo', 'Ctrl+Z'],
                ['Redo', 'Ctrl+Y / Ctrl+Shift+Z'],
                ['Select All', 'Ctrl+A'],
                ['Copy', 'Ctrl+C'],
                ['Paste', 'Ctrl+V'],
                ['Duplicate', 'Ctrl+D'],
                ['Delete Selection', 'Delete / Backspace'],
                ['Cancel / Deselect', 'Escape'],
                ['View', null],
                ['Zoom Extents', 'Z then E'],
                ['Zoom to Selection', 'Z then S'],
                ['Zoom In', 'Ctrl+='],
                ['Zoom Out', 'Ctrl+-'],
                ['Toggle Snap', 'F3'],
                ['Toggle Grid', 'F7'],
                ['Toggle Ortho', 'F8'],
                ['Toggle Polar', 'F10'],
                ['Toggle Layer Panel', 'F2'],
                ['Tools', null],
                ['Select', 'S'],
                ['Pan', 'H (or Space+drag)'],
                ['Point', 'P'],
                ['Line', 'L'],
                ['Polyline', 'P then L'],
                ['Polygon', 'P then G'],
                ['Rectangle', 'R then E'],
                ['Circle', 'C then I'],
                ['Regular Polygon', 'RP (command bar)'],
                ['Move', 'M'],
                ['Copy (tool)', 'C then O'],
                ['Rotate', 'R then O'],
                ['Mirror', 'M then I'],
                ['Scale', 'S then C'],
                ['Erase', 'E'],
                ['Drawing', null],
                ['Finish Polyline/Polygon', 'Enter or double-click'],
                ['Undo last vertex', 'U (while drawing)'],
                ['Absolute coordinate', 'x,y  (e.g. 100,200)'],
                ['Relative offset', '@dx,dy  (e.g. @50,0)'],
                ['Polar input', '@dist<angle  (e.g. @50<45)'],
                ['Confirm / Finish', 'Enter'],
              ].map(([label, shortcut], i) =>
                shortcut === null ? (
                  <div key={i} className="col-span-2 mt-2 pt-1 border-t border-gray-600 font-semibold text-gray-400 uppercase tracking-wider text-[10px]">
                    {label}
                  </div>
                ) : (
                  <div key={i} className="contents">
                    <span className="text-gray-300">{label}</span>
                    <span className="font-mono text-blue-300 text-right">{shortcut}</span>
                  </div>
                )
              )}
            </div>
          </div>
        </ModalFrame>
      )}
    </div>

    {/* Full-screen loading overlay — shown while parsing a .starr file */}
    {fileLoading && (
      <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-black/75 animate-[fadeIn_150ms_ease-out]">
        <span className="inline-block w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-white text-sm font-semibold">Opening drawing…</p>
        <p className="text-gray-400 text-xs mt-1">Parsing and rendering data, please wait.</p>
      </div>
    )}

    {/* Save/Open from Database dialogs */}
    {dbDialog && (
      <SaveToDBDialog mode={dbDialog} onClose={() => setDbDialog(null)} />
    )}
    {exportLayersOpen && (
      <ExportLayersDialog onClose={() => setExportLayersOpen(false)} />
    )}
  </>
  );
}

