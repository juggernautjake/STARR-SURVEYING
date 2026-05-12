'use client';
// app/admin/cad/hooks/useKeyboard.ts — Global keyboard shortcuts

import { useEffect, useRef } from 'react';
import {
  useDrawingStore,
  useSelectionStore,
  useToolStore,
  useViewportStore,
  useUndoStore,
  useUIStore,
  useTransferStore,
  makeRemoveFeatureEntry,
  makeBatchEntry,
} from '@/lib/cad/store';
import { computeBounds, featureBounds } from '@/lib/cad/geometry/bounds';
import type { Feature } from '@/lib/cad/types';
import { copyCadSelection, pasteCadClipboard, duplicateSelection } from '@/lib/cad/operations';
import { cadLog } from '@/lib/cad/logger';
import { validateAndMigrateDocument } from '@/lib/cad/validate';

// Phase 1 default bindings: key combo → actionId
const PHASE_1_SHORTCUTS: Record<string, string> = {
  'ctrl+z': 'edit.undo',
  'ctrl+y': 'edit.redo',
  'ctrl+shift+z': 'edit.redo2',
  'ctrl+s': 'file.save',
  'ctrl+o': 'file.open',
  'ctrl+n': 'file.new',
  'ctrl+a': 'edit.selectAll',
  'ctrl+c': 'edit.copy',
  'ctrl+v': 'edit.paste',
  'ctrl+d': 'edit.duplicate',
  escape: 'edit.deselect',
  delete: 'edit.delete',
  backspace: 'edit.delete',
  s: 'tool.select',
  b: 'tool.boxSelect',
  h: 'tool.pan',
  l: 'tool.line',
  p: 'tool.point',
  m: 'tool.move',
  e: 'tool.erase',
  // Two-key chords — checked first when a previous key is pending
  'p l': 'tool.polyline',
  'p g': 'tool.polygon',
  'r e': 'tool.rectangle',
  'c i': 'tool.circle',
  'c o': 'tool.copy',
  'r o': 'tool.rotate',
  'm i': 'tool.mirror',
  's c': 'tool.scale',
  'z e': 'view.zoomExtents',
  'z s': 'view.zoomSelection',
  'ctrl+=': 'view.zoomIn',
  'ctrl+-': 'view.zoomOut',
  f2: 'layer.panel',
  f3: 'snap.toggle',
  f7: 'snap.grid',
  f8: 'snap.ortho',
  f10: 'snap.polar',
  enter: 'tool.confirm',
};

/** Serialize a KeyboardEvent into a key combo string */
function serializeKey(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');
  const key = e.key.toLowerCase();
  if (!['control', 'shift', 'alt', 'meta'].includes(key)) parts.push(key);
  return parts.join('+');
}

export function useKeyboard() {
  // Multi-key chord tracking
  const lastKeyRef = useRef<{ key: string; time: number } | null>(null);
  const CHORD_TIMEOUT = 500; // ms

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't fire shortcuts when typing in an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const combo = serializeKey(e);

      // Check for two-key chord (e.g., "z e")
      const now = Date.now();
      if (lastKeyRef.current && now - lastKeyRef.current.time < CHORD_TIMEOUT) {
        const chord = `${lastKeyRef.current.key} ${combo}`;
        const chordAction = PHASE_1_SHORTCUTS[chord];
        if (chordAction) {
          e.preventDefault();
          lastKeyRef.current = null;
          dispatch(chordAction, e);
          return;
        }
      }

      const action = PHASE_1_SHORTCUTS[combo];
      if (action) {
        e.preventDefault();
        lastKeyRef.current = { key: combo, time: now };
        dispatch(action, e);
      } else {
        lastKeyRef.current = { key: combo, time: now };
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dispatch(action: string, _e: KeyboardEvent) {
    const drawingStore = useDrawingStore.getState();
    const selectionStore = useSelectionStore.getState();
    const toolStore = useToolStore.getState();
    const viewportStore = useViewportStore.getState();
    const undoStore = useUndoStore.getState();

    switch (action) {
      case 'edit.undo': {
        // Phase 8 §11.7.12 — Pick-mode-scoped Undo. While the
        // LayerTransferDialog is in Pick mode, Ctrl+Z walks the
        // pick-history (add / remove of features in the source
        // set) without touching the document undo stack. So a
        // surveyor mid-pick can roll back accidental picks
        // without losing drawing edits they made before
        // opening the dialog.
        const tx = useTransferStore.getState();
        if (tx.pickModeActive) {
          tx.undoPick();
          break;
        }
        undoStore.undo();
        break;
      }
      case 'edit.redo':
      case 'edit.redo2': {
        const tx = useTransferStore.getState();
        if (tx.pickModeActive) {
          tx.redoPick();
          break;
        }
        undoStore.redo();
        break;
      }
      case 'file.save':
        saveDocument();
        break;
      case 'file.open':
        openFileDialog();
        break;
      case 'file.new':
        drawingStore.newDocument();
        selectionStore.deselectAll();
        undoStore.clear();
        break;
      case 'edit.deselect':
        toolStore.setTool('SELECT');
        selectionStore.deselectAll();
        toolStore.clearDrawingPoints();
        break;
      case 'edit.selectAll': {
        const allIds = drawingStore.getAllFeatures().map((f) => f.id);
        selectionStore.selectMultiple(allIds, 'REPLACE');
        break;
      }
      case 'edit.delete':
        eraseSelected();
        break;
      case 'edit.copy':
        copyCadSelected();
        break;
      case 'edit.paste':
        pasteCad();
        break;
      case 'edit.duplicate':
        duplicateCad();
        break;
      case 'tool.select':
        toolStore.setTool('SELECT');
        break;
      case 'tool.boxSelect':
        toolStore.setTool('BOX_SELECT');
        break;
      case 'tool.pan':
        toolStore.setTool('PAN');
        break;
      case 'tool.line':
        toolStore.setTool('DRAW_LINE');
        break;
      case 'tool.point':
        toolStore.setTool('DRAW_POINT');
        break;
      case 'tool.move':
        toolStore.setTool('MOVE');
        break;
      case 'tool.copy':
        toolStore.setTool('COPY');
        break;
      case 'tool.rotate':
        toolStore.setTool('ROTATE');
        break;
      case 'tool.mirror':
        toolStore.setTool('MIRROR');
        break;
      case 'tool.scale':
        toolStore.setTool('SCALE');
        break;
      case 'tool.erase':
        toolStore.setTool('ERASE');
        break;
      case 'tool.rectangle':
        toolStore.setTool('DRAW_RECTANGLE');
        break;
      case 'tool.circle':
        toolStore.setTool('DRAW_CIRCLE');
        break;
      case 'tool.polyline':
        toolStore.setTool('DRAW_POLYLINE');
        break;
      case 'tool.polygon':
        toolStore.setTool('DRAW_POLYGON');
        break;
      case 'view.zoomExtents':
        zoomToExtents();
        break;
      case 'view.zoomSelection':
        zoomToSelection();
        break;
      case 'view.zoomIn':
        viewportStore.zoomAt(viewportStore.screenWidth / 2, viewportStore.screenHeight / 2, 1.2);
        break;
      case 'view.zoomOut':
        viewportStore.zoomAt(viewportStore.screenWidth / 2, viewportStore.screenHeight / 2, 1 / 1.2);
        break;
      case 'snap.toggle':
        drawingStore.updateSettings({ snapEnabled: !drawingStore.document.settings.snapEnabled });
        break;
      case 'snap.grid':
        drawingStore.updateSettings({ gridVisible: !drawingStore.document.settings.gridVisible });
        break;
      case 'snap.ortho':
        toolStore.setOrthoEnabled(!toolStore.state.orthoEnabled);
        break;
      case 'snap.polar':
        toolStore.setPolarEnabled(!toolStore.state.polarEnabled);
        break;
      case 'layer.panel':
        useUIStore.getState().toggleLayerPanel();
        break;
      case 'tool.confirm':
        confirmCurrentTool();
        break;
    }
  }

  function eraseSelected() {
    const selectionStore = useSelectionStore.getState();
    const drawingStore = useDrawingStore.getState();
    const undoStore = useUndoStore.getState();
    const ids = Array.from(selectionStore.selectedIds);
    if (ids.length === 0) return;
    const features = ids
      .map((id) => drawingStore.getFeature(id))
      .filter(Boolean) as Feature[];
    for (const f of features) drawingStore.removeFeature(f.id);
    if (features.length === 1) {
      undoStore.pushUndo(makeRemoveFeatureEntry(features[0]));
    } else if (features.length > 1) {
      const ops = features.map((f) => ({ type: 'REMOVE_FEATURE' as const, data: f }));
      undoStore.pushUndo(makeBatchEntry('Delete', ops));
    }
    selectionStore.deselectAll();
  }

  function copyCadSelected() {
    copyCadSelection();
  }

  function pasteCad() {
    pasteCadClipboard();
  }

  function duplicateCad() {
    duplicateSelection();
  }

  function zoomToExtents() {
    const drawingStore = useDrawingStore.getState();
    const viewportStore = useViewportStore.getState();
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

  function zoomToSelection() {
    const selectionStore = useSelectionStore.getState();
    const drawingStore = useDrawingStore.getState();
    const viewportStore = useViewportStore.getState();
    const ids = Array.from(selectionStore.selectedIds);
    if (ids.length === 0) return zoomToExtents();
    const features = ids
      .map((id) => drawingStore.getFeature(id))
      .filter(Boolean) as Feature[];
    if (features.length === 0) return;
    const bounds = features.reduce(
      (acc, f) => {
        const fb = featureBounds(f);
        return {
          minX: Math.min(acc.minX, fb.minX),
          minY: Math.min(acc.minY, fb.minY),
          maxX: Math.max(acc.maxX, fb.maxX),
          maxY: Math.max(acc.maxY, fb.maxY),
        };
      },
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    );
    viewportStore.zoomToExtents(bounds);
  }

  function confirmCurrentTool() {
    const { state } = useToolStore.getState();
    const { activeTool, drawingPoints } = state;
    if (
      (activeTool === 'DRAW_POLYLINE' && drawingPoints.length >= 2) ||
      (activeTool === 'DRAW_POLYGON' && drawingPoints.length >= 3)
    ) {
      window.dispatchEvent(new CustomEvent('cad:confirm'));
    }
  }

  function saveDocument() {
    try {
      const drawingStore = useDrawingStore.getState();
      const payload = {
        version: '1.0',
        application: 'starr-cad',
        document: drawingStore.document,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), {
        href: url,
        download: `${drawingStore.document.name}.starr`,
      });
      a.click();
      URL.revokeObjectURL(url);
      drawingStore.markClean();
      cadLog.info('FileIO', `Saved drawing: ${drawingStore.document.name}`);
    } catch (err) {
      cadLog.error('FileIO', 'Failed to save document', err);
      alert('Failed to save the drawing. Try again, or contact support if it keeps failing.');
    }
  }

  function openFileDialog() {
    const input = Object.assign(document.createElement('input'), {
      type: 'file',
      accept: '.starr',
    });
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const payload = JSON.parse(text) as { document: unknown };
        const doc = validateAndMigrateDocument(payload?.document ?? payload);
        useDrawingStore.getState().loadDocument(doc);
        useSelectionStore.getState().deselectAll();
        useUndoStore.getState().clear();
        cadLog.info('FileIO', `Loaded drawing: ${doc.name}`);
        // Zoom to the loaded drawing's content after a short delay to let the canvas render
        setTimeout(() => window.dispatchEvent(new CustomEvent('cad:zoomExtents')), 200);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load file.';
        cadLog.error('FileIO', 'Failed to open .starr file', err);
        alert(`${msg}\n\nMake sure this is a valid .starr drawing file.`);
      }
    };
    input.click();
  }
}
