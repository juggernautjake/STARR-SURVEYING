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
import { reverseFeature, explodeFeature, smoothPolyline, simplifyPolylineFeature } from '@/lib/cad/operations';
import { cadLog } from '@/lib/cad/logger';
import { validateAndMigrateDocument } from '@/lib/cad/validate';
import { downloadCsv, downloadPnezd } from '@/lib/cad/persistence/export-csv';
// cad-trv-import-export Slice 4 — File menu Import / Export TRV.
import { downloadTrv, importTrvFromText, formatRenderedElements, type TrvImportReport } from '@/lib/cad/io/trv-io';
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
  const [dbDialog, setDbDialog] = useState<'save' | 'open' | null>(null);
  const [exportLayersOpen, setExportLayersOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const drawingStore = useDrawingStore();
  const selectionStore = useSelectionStore();
  const toolStore = useToolStore();
  const viewportStore = useViewportStore();
  const undoStore = useUndoStore();
  const uiStore = useUIStore();
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
  function saveLocalCopy(silentName?: string) {
    try {
      const doc = drawingStore.document;
      const name = (silentName ?? doc.name).trim() || 'drawing';
      const payload = { version: '1.0', application: 'starr-cad', document: doc };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: `${name}.starr` });
      a.click();
      URL.revokeObjectURL(url);
      drawingStore.markClean();
      useSaveTargetStore.getState().setLocalTarget(doc.id, name);
      void clearAutosave(doc.id);
      cadLog.info('FileIO', `Saved drawing locally: ${name}`);
    } catch (err) {
      cadLog.error('FileIO', 'Failed to save document', err);
      alert('Failed to save the drawing. Try again, or contact support if it keeps failing.');
    }
  }

  // One-click Save: write back to wherever this drawing was last saved
  // (same cloud record or same local file name) — no destination prompt.
  // If the drawing has never been saved, alert and open the save dialog
  // so the surveyor picks a destination once.
  async function saveDocument() {
    const doc = drawingStore.document;
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
      drawingStore.markClean();
      void clearAutosave(doc.id);
      cadLog.info('FileIO', `Saved drawing to cloud: ${name}`);
      window.dispatchEvent(new CustomEvent('cad:commandOutput', { detail: { text: `Saved “${name}” to the cloud.` } }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      cadLog.error('FileIO', 'Failed to save drawing to cloud', err);
      alert(`Couldn’t save to the cloud: ${msg}\n\nYou can try again or use “Save to Cloud…”.`);
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
      drawingStore.updateSettings({
        paperSize: fit.paperSize,
        paperOrientation: fit.paperOrientation,
        drawingScale: fit.drawingScale,
        paperOrigin: fit.paperOriginWorld,
      });
      // Title-block scale label only fills if currently empty
      // (matching the non-destructive policy of the metadata
      // apply step). The surveyor can override afterward via
      // the Title Block panel.
      const tb = drawingStore.document.settings?.titleBlock;
      if (tb && (!tb.scaleLabel || tb.scaleLabel.trim().length === 0)) {
        drawingStore.updateSettings({ titleBlock: { ...tb, scaleLabel: fit.scaleLabel } });
      }
      cadLog.info('FileIO', `Fitted paper to imported survey: ${fit.paperSize} ${fit.paperOrientation} @ ${fit.scaleLabel}`);
    } catch (err) {
      cadLog.warn('FileIO', 'Paper auto-fit failed; falling back to existing paper.', err);
    }
  }

  function openFileDialog() {
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
      // Pass 8 — sniff first so the right loader runs.
      const format = detectFileFormat(file.name, text);
      try {
        if (format === 'TRV') {
          // Route TRV files through the same import flow as
          // File → Import → "Import Traverse PC (.TRV)…" with
          // the count preview + non-destructive title-block apply.
          const report: TrvImportReport = importTrvFromText(text, { fileName: file.name });
          const noteSummary = report.notes.length > 0
            ? `\n\n${report.notes.length} note(s):\n  - ${report.notes.slice(0, 5).join('\n  - ')}${report.notes.length > 5 ? `\n  …and ${report.notes.length - 5} more` : ''}`
            : '';
          const drawingSummary = formatRenderedElements(report.renderedElements);
          const ok = window.confirm(
            `Open ${file.name} as a Traverse PC TRV?\n\n` +
            `  ${report.layerCount} layer(s)\n` +
            `  ${report.pointCount} point(s)\n` +
            `  ${report.traverseCount} traverse(s)` +
            (drawingSummary ? `\n  drawing: ${drawingSummary}` : '') +
            noteSummary +
            `\n\nThis will ADD the records to the current drawing.`
          );
          if (!ok) {
            setFileLoading(false);
            return;
          }
          for (const l of report.mapped.layers) drawingStore.addLayer(l);
          // cad-duplicate-point-handling Slice 4 — rename any
          // imported POINT whose trvPointId already exists in
          // the current drawing using the `:N` convention.
          const dedupedOpen = dedupeTrvFeaturesAgainstDrawing(
            report.mapped.features,
            Object.values(drawingStore.document.features),
          );
          drawingStore.addFeatures(dedupedOpen.features);
          if (dedupedOpen.renames.length > 0) {
            cadLog.info('FileIO', `Auto-renamed ${dedupedOpen.renames.length} colliding TRV point id(s) on import`);
          }
          cadLog.info('FileIO', `Loaded TRV via Open dialog: ${report.layerCount} layers, ${report.pointCount} points, ${report.traverseCount} traverses`);
          // Offer the title-block metadata apply (same as importTrv).
          const m = report.metadata;
          const hasMetadata = !!(m.projectName || m.surveyDate || m.scale || m.sourcePath);
          if (hasMetadata) {
            const applyMeta = window.confirm(
              'Apply TRV project metadata to the survey title block?\n\n' +
              (m.projectName ? `  Project name: ${m.projectName}\n` : '') +
              (m.surveyDate  ? `  Survey date: ${m.surveyDate}\n` : '') +
              (m.scale       ? `  Scale: ${m.scale}\n` : '') +
              (m.sourcePath  ? `  Source: ${m.sourcePath}\n` : '') +
              '\nOnly fields you haven\'t set will be filled (non-destructive).'
            );
            if (applyMeta) {
              const current = drawingStore.document.settings?.titleBlock;
              if (current) drawingStore.updateSettings({ titleBlock: applyTrvMetadataToTitleBlock(m, current, report.titleBlockHints) });
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
          const diag = buildFileLoadDiagnostic(file.name, text, err, 'parse');
          cadLog.error('FileIO', formatFileLoadDiagnostic(diag), err);
          reportFileLoadError(diag);
          setFileLoading(false);
          return;
        }
        let doc;
        try {
          doc = validateAndMigrateDocument(payload?.document ?? payload);
        } catch (err) {
          const diag = buildFileLoadDiagnostic(file.name, text, err, 'map');
          cadLog.error('FileIO', formatFileLoadDiagnostic(diag), err);
          reportFileLoadError(diag);
          setFileLoading(false);
          return;
        }
        drawingStore.loadDocument(doc);
        selectionStore.deselectAll();
        undoStore.clear();
        useSaveTargetStore.getState().setLocalTarget(doc.id, doc.name);
        cadLog.info('FileIO', `Loaded drawing: ${doc.name}`);
        setTimeout(() => window.dispatchEvent(new CustomEvent('cad:zoomExtents')), 200);
      } catch (err) {
        const diag = buildFileLoadDiagnostic(file.name, text, err, 'apply');
        cadLog.error('FileIO', formatFileLoadDiagnostic(diag), err);
        reportFileLoadError(diag);
      } finally {
        setFileLoading(false);
      }
    };
    input.click();
  }

  function zoomToExtents() {
    const features = drawingStore.getAllFeatures();
    if (features.length === 0) {
      viewportStore.zoomToExtents({ minX: -100, minY: -100, maxX: 100, maxY: 100 });
      return;
    }
    const allPoints = features.flatMap((f) => {
      const g = f.geometry;
      if (g.type === 'POINT') return g.point ? [g.point] : [];
      if (g.type === 'LINE') return [g.start!, g.end!].filter(Boolean);
      return g.vertices ?? [];
    });
    if (allPoints.length === 0) return;
    viewportStore.zoomToExtents(computeBounds(allPoints));
  }

  function startEditName() {
    setNameValue(drawingStore.document.name);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.select(), 0);
  }

  function commitEditName() {
    const trimmed = nameValue.trim();
    if (trimmed) {
      drawingStore.updateDocumentName(trimmed);
    }
    setEditingName(false);
  }

  function exportCsv(flavor: 'simplified' | 'full' = 'simplified') {
    try {
      const { rowCount, filename } = downloadCsv(drawingStore.document, { flavor });
      cadLog.info('FileIO', `Exported ${rowCount} points as ${flavor} CSV → ${filename}`);
    } catch (err) {
      cadLog.error('FileIO', 'CSV export failed', err);
      alert('Failed to export CSV. Try again, or contact support if it keeps failing.');
    }
  }

  function exportTraversePc() {
    try {
      const { rowCount, filename } = downloadPnezd(drawingStore.document);
      cadLog.info('FileIO', `Exported ${rowCount} points as Traverse PC PNEZD → ${filename}`);
    } catch (err) {
      cadLog.error('FileIO', 'Traverse PC export failed', err);
      alert('Failed to export Traverse PC file. Try again, or contact support if it keeps failing.');
    }
  }

  // cad-trv-import-export Slice 4 — Traverse PC `.TRV` round-trip.
  // exportTrv writes the current drawing back out as a TRV file;
  // importTrv opens a file picker, parses the chosen .TRV, shows a
  // confirm-with-counts prompt, then writes the layers + features
  // into the drawing store.
  function exportTrv() {
    try {
      const { byteSize, filename } = downloadTrv(drawingStore.document);
      cadLog.info('FileIO', `Exported drawing as TRV: ${filename} (${byteSize} bytes)`);
    } catch (err) {
      cadLog.error('FileIO', 'TRV export failed', err);
      alert('Failed to export TRV. Try again, or contact support if it keeps failing.');
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
        alert('Failed to parse TRV file. Check that it came from Traverse PC.');
        return;
      }
      const noteSummary = report.notes.length > 0
        ? `\n\n${report.notes.length} note(s):\n  - ${report.notes.slice(0, 5).join('\n  - ')}${report.notes.length > 5 ? `\n  …and ${report.notes.length - 5} more` : ''}`
        : '';
      const drawingSummary = formatRenderedElements(report.renderedElements);
      const ok = window.confirm(
        `Import ${file.name}?\n\n` +
        `  ${report.layerCount} layer(s)\n` +
        `  ${report.pointCount} point(s)\n` +
        `  ${report.traverseCount} traverse(s)` +
        (drawingSummary ? `\n  drawing: ${drawingSummary}` : '') +
        noteSummary +
        `\n\nThis will ADD the records to the current drawing.`
      );
      if (!ok) return;
      for (const l of report.mapped.layers) drawingStore.addLayer(l);
      // cad-duplicate-point-handling Slice 4 — rename any
      // imported POINT whose trvPointId already exists in the
      // current drawing using the `:N` convention.
      const dedupedImport = dedupeTrvFeaturesAgainstDrawing(
        report.mapped.features,
        Object.values(drawingStore.document.features),
      );
      drawingStore.addFeatures(dedupedImport.features);
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
        const applyMeta = window.confirm(
          'Apply TRV project metadata to the survey title block?\n\n' +
          (m.projectName ? `  Project name: ${m.projectName}\n` : '') +
          (m.surveyDate  ? `  Survey date: ${m.surveyDate}\n` : '') +
          (m.scale       ? `  Scale: ${m.scale}\n` : '') +
          (m.sourcePath  ? `  Source: ${m.sourcePath}\n` : '') +
          '\nOnly fields you haven\'t set will be filled (non-destructive).'
        );
        if (applyMeta) {
          const current = drawingStore.document.settings?.titleBlock;
          if (current) {
            const nextTitleBlock = applyTrvMetadataToTitleBlock(m, current, report.titleBlockHints);
            drawingStore.updateSettings({ titleBlock: nextTitleBlock });
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
      const { byteSize, filename } = downloadDxf(drawingStore.document, {
        annotations,
      });
      cadLog.info(
        'FileIO',
        `Exported drawing as DXF: ${filename} (${byteSize} bytes)`
      );
    } catch (err) {
      cadLog.error('FileIO', 'DXF export failed', err);
      alert('Failed to export DXF. Try again, or contact support if it keeps failing.');
    }
  }

  function exportLandXml() {
    try {
      const { byteSize, filename } = downloadLandXML(drawingStore.document);
      cadLog.info('FileIO', `Exported drawing as LandXML: ${filename} (${byteSize} bytes)`);
    } catch (err) {
      cadLog.error('FileIO', 'LandXML export failed', err);
      alert('Failed to export LandXML. Try again, or contact support if it keeps failing.');
    }
  }

  // ── Selection-scoped exports ────────────────
  // Export only the currently-selected features. `scopeDocument`
  // returns a doc clone narrowed to the selection (layers/settings
  // preserved) so the existing writers work unchanged.
  function exportSelection(format: 'CSV' | 'DXF' | 'LANDXML') {
    const ids = Array.from(selectionStore.selectedIds);
    if (ids.length === 0) {
      alert('Select one or more features first, then choose Export selection.');
      return;
    }
    try {
      const scoped = scopeDocument(drawingStore.document, { kind: 'SELECTION', featureIds: ids });
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
      alert(`Failed to export the selection as ${format}. Try again, or contact support if it keeps failing.`);
    }
  }

  async function exportTraversePcBundle() {
    try {
      const annotations = useAnnotationStore.getState().annotations;
      const { filename, pointCount } = await downloadTraversePcBundle({
        doc: drawingStore.document,
        annotations,
      });
      cadLog.info('FileIO', `Exported Traverse PC bundle (${pointCount} points) → ${filename}`);
    } catch (err) {
      cadLog.error('FileIO', 'Traverse PC bundle export failed', err);
      alert('Failed to export Traverse PC bundle. Try again, or contact support if it keeps failing.');
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
        drawingStore.loadDocument(result.document);
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
        alert('Failed to import GeoJSON. Try again, or contact support if it keeps failing.');
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
        drawingStore.loadDocument(result.document);
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
        alert('Failed to import DXF. Try again, or contact support if it keeps failing.');
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
      const { byteSize, filename } = downloadPdf(drawingStore.document, {
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
      alert('Failed to export PDF. Try again, or contact support if it keeps failing.');
    }
  }

  function exportFieldCards() {
    try {
      const result = downloadSleeveCards(
        drawingStore.document,
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
      alert(
        'Failed to export field reference cards. Try again, or contact support if it keeps failing.'
      );
    }
  }

  function exportGeoJSON() {
    try {
      const { byteSize, filename } = downloadGeoJSON(drawingStore.document);
      cadLog.info(
        'FileIO',
        `Exported drawing as GeoJSON: ${filename} (${byteSize} bytes)`
      );
    } catch (err) {
      cadLog.error('FileIO', 'GeoJSON export failed', err);
      alert('Failed to export GeoJSON. Try again, or contact support if it keeps failing.');
    }
  }

  async function exportDeliverable() {
    try {
      const annotations = useAnnotationStore.getState().annotations;
      const description = useDeliveryStore.getState().description;
      const reviewRecord = useReviewWorkflowStore.getState().record;
      const { filename, byteSize, manifest } = await downloadDeliverableBundle({
        doc: drawingStore.document,
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
      alert(
        'Failed to export deliverable bundle. Try again, or contact support if it keeps failing.'
      );
    }
  }

  const undoDesc = undoStore.undoDescription();
  const redoDesc = undoStore.redoDescription();

  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        { label: 'New Drawing', shortcut: 'Ctrl+N', action: () => { window.dispatchEvent(new CustomEvent('cad:openNewDrawingDialog')); setOpenMenu(null); } },
        { label: 'Open…', shortcut: 'Ctrl+O', action: () => requestDiscard(openFileDialog) },
        { label: 'Open Saved Drawing…', action: () => { setDbDialog('open'); setOpenMenu(null); } },
        { label: 'File Manager…', action: () => { window.dispatchEvent(new CustomEvent('cad:openFileManager')); setOpenMenu(null); } },
        // drawings-collaboration Slice 4 — notes thread for the current
        // drawing. The RPLS / drawer / job-overseer dialog.
        { label: '💬 Drawing notes…', action: () => { window.dispatchEvent(new CustomEvent('cad:openDrawingNotes')); setOpenMenu(null); } },
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
            { label: 'Export selection as CSV…', disabled: selectionStore.selectedIds.size === 0, action: () => { exportSelection('CSV'); setOpenMenu(null); } },
            { label: 'Export selection as DXF…', disabled: selectionStore.selectedIds.size === 0, action: () => { exportSelection('DXF'); setOpenMenu(null); } },
            { label: 'Export selection as LandXML…', disabled: selectionStore.selectedIds.size === 0, action: () => { exportSelection('LANDXML'); setOpenMenu(null); } },
            { label: 'Export layers…', action: () => { setExportLayersOpen(true); setOpenMenu(null); } },
          ],
        },
        {
          label: 'Import',
          submenu: [
            { label: 'Import Survey Data (CSV / RW5 / JobXML)…', action: () => { onOpenImport?.(); setOpenMenu(null); } },
            { label: 'Import DXF…', action: () => { void openDxf(); setOpenMenu(null); } },
            { label: 'Import GeoJSON…', action: () => { void openGeoJson(); setOpenMenu(null); } },
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
          action: () => undoStore.undo(),
          disabled: !undoStore.canUndo(),
        },
        {
          label: redoDesc ? `Redo ${redoDesc}` : 'Redo',
          shortcut: 'Ctrl+Y',
          action: () => undoStore.redo(),
          disabled: !undoStore.canRedo(),
        },
        { separator: true },
        { label: 'Delete Selection', shortcut: 'Del', action: () => {
          const ids = Array.from(selectionStore.selectedIds);
          for (const id of ids) drawingStore.removeFeature(id);
          selectionStore.deselectAll();
        }},
        { label: 'Select All', shortcut: 'Ctrl+A', action: () => {
          const ids = drawingStore.getAllFeatures().map((f) => f.id);
          selectionStore.selectMultiple(ids, 'REPLACE');
        }},
        { label: 'Deselect All', shortcut: 'Esc', action: () => selectionStore.deselectAll() },
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
          const selIds = Array.from(selectionStore.selectedIds);
          const single = selIds.length === 1 ? drawingStore.getFeature(selIds[0]) : null;
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
        { label: 'Zoom Extents', shortcut: 'Z E', action: zoomToExtents },
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
          label: drawingStore.document.settings.gridVisible ? 'Hide Grid' : 'Show Grid',
          shortcut: 'F7',
          action: () => drawingStore.updateSettings({ gridVisible: !drawingStore.document.settings.gridVisible }),
        },
        {
          label: drawingStore.document.settings.snapEnabled ? 'Disable Snap' : 'Enable Snap',
          shortcut: 'F3',
          action: () => drawingStore.updateSettings({ snapEnabled: !drawingStore.document.settings.snapEnabled }),
        },
        { separator: true },
        {
          label: uiStore.showLayerPanel ? 'Hide Layer Panel' : 'Show Layer Panel',
          action: () => uiStore.toggleLayerPanel(),
        },
        {
          label: uiStore.showPropertyPanel ? 'Hide Properties' : 'Show Properties',
          action: () => uiStore.togglePropertyPanel(),
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
          label: drawingStore.document.settings.titleBlock?.visible ? 'Hide Title Block' : 'Show Title Block',
          action: () => {
            drawingStore.updateTitleBlock({ visible: !drawingStore.document.settings.titleBlock?.visible });
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
        { label: 'Arc', shortcut: 'A', action: () => { toolStore.setTool('DRAW_ARC'); setOpenMenu(null); } },
        { label: 'Spline (Fit-Point)', shortcut: 'SF', action: () => { toolStore.setTool('DRAW_SPLINE_FIT'); setOpenMenu(null); } },
        { label: 'Spline (NURBS)', shortcut: 'SN', action: () => { toolStore.setTool('DRAW_SPLINE_CONTROL'); setOpenMenu(null); } },
        { separator: true },
        { label: 'Curb Return / Fillet', shortcut: 'CR', action: () => { toolStore.setTool('CURB_RETURN'); setOpenMenu(null); } },
        { label: 'Offset', shortcut: 'OF', action: () => { toolStore.setTool('OFFSET'); setOpenMenu(null); } },
        { separator: true },
        { label: 'Inverse (Bearing & Distance)', shortcut: 'INV', action: () => { toolStore.setTool('INVERSE'); setOpenMenu(null); } },
        { label: 'Forward Point', shortcut: 'FP', action: () => { toolStore.setTool('FORWARD_POINT'); setOpenMenu(null); } },
      ],
    },
    {
      label: 'Draw',
      items: [
        { label: 'Point', shortcut: 'P', action: () => toolStore.setTool('DRAW_POINT') },
        { label: 'Line', shortcut: 'L', action: () => toolStore.setTool('DRAW_LINE') },
        { label: 'Polyline', shortcut: 'PL', action: () => toolStore.setTool('DRAW_POLYLINE') },
        { label: 'Polygon', shortcut: 'PG', action: () => toolStore.setTool('DRAW_POLYGON') },
        { label: 'Rectangle', shortcut: 'RE', action: () => toolStore.setTool('DRAW_RECTANGLE') },
        { label: 'Circle', shortcut: 'CI', action: () => toolStore.setTool('DRAW_CIRCLE') },
        { label: 'Regular Polygon', shortcut: 'RP', action: () => toolStore.setTool('DRAW_REGULAR_POLYGON') },
        { separator: true },
        { label: 'Move', shortcut: 'M', action: () => toolStore.setTool('MOVE') },
        { label: 'Copy', shortcut: 'CO', action: () => toolStore.setTool('COPY') },
        { label: 'Rotate', shortcut: 'RO', action: () => toolStore.setTool('ROTATE') },
        { label: 'Mirror', shortcut: 'MI', action: () => toolStore.setTool('MIRROR') },
        { label: 'Scale', shortcut: 'SC', action: () => toolStore.setTool('SCALE') },
        { label: 'Erase', shortcut: 'E', action: () => toolStore.setTool('ERASE') },
      ],
    },
    {
      label: 'AI',
      items: [
        // AI mode picker — mirrors the StatusBar chip's cycle but
        // makes every mode + the chord visible from the menu.
        ...AI_MODE_CYCLE.map((mode: AIMode) => ({
          label: `${mode === aiMode ? '● ' : '  '}AI mode: ${mode}`,
          action: () => { setAIMode(mode); setOpenMenu(null); },
        })),
        {
          label: 'Cycle AI mode',
          shortcut: 'Ctrl+Shift+M',
          action: () => { cycleAIMode(); setOpenMenu(null); },
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
          label: 'Calc Point (4th corner, parallel, etc)…',
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
        { label: 'About Starr CAD', action: () => alert('Starr CAD — Phase 1\nBuilt for Starr Surveying Company\nVersion 1.0') },
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
      {drawingStore.isDirty && (
        <span className="ml-2 text-yellow-400 text-[10px] animate-[fadeIn_300ms_ease-out]">● unsaved</span>
      )}

      {/* One-click Save — writes back to the drawing's last save target
          (cloud record or local file name); prompts on the first save. */}
      <button
        type="button"
        onClick={() => { void saveDocument(); }}
        title="Save (Ctrl+S) — saves to this drawing's last file; prompts the first time"
        className={`ml-2 px-2 py-0.5 text-[11px] rounded transition-colors flex items-center gap-1 ${
          drawingStore.isDirty
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
            {drawingStore.document.name}
          </span>
        )}
      </div>

      {/* Right-side chrome — exit, keyboard shortcuts + settings live
          here so the surveyor doesn't have to drill into Help. */}
      <div className="mr-3 flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => {
            // cad-exit-return-path 2026-05-30 — send the user back to
            // the page they came from (recorded by
            // `useCadReturnPathTracker` in AdminLayoutClient), defaulting
            // to /admin/research-cad when nothing is on file (direct
            // URL hit / browser refresh inside CAD / cleared session).
            const returnTo = getCadReturnPath('/admin/research-cad');
            if (drawingStore.isDirty) {
              const ok = window.confirm(
                `You have unsaved changes. Leave the CAD editor and return to ${returnTo}? Unsaved changes will be lost.`,
              );
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

