'use client';
// app/admin/cad/components/MenuBar.tsx — Top application menu bar

import { useRef, useState } from 'react';
import {
  useDrawingStore,
  useSelectionStore,
  useToolStore,
  useViewportStore,
  useUndoStore,
  useUIStore,
  useAIStore,
} from '@/lib/cad/store';
import { computeBounds } from '@/lib/cad/geometry/bounds';
import { cadLog } from '@/lib/cad/logger';
import { validateAndMigrateDocument } from '@/lib/cad/validate';
import { downloadCsv } from '@/lib/cad/persistence/export-csv';
import SaveToDBDialog from './SaveToDBDialog';

interface MenuItem {
  label: string;
  shortcut?: string;
  action: () => void;
  separator?: false;
  disabled?: boolean;
}
interface SeparatorItem {
  separator: true;
}
type MenuEntry = MenuItem | SeparatorItem;

interface MenuDef {
  label: string;
  items: MenuEntry[];
}

export default function MenuBar({ onOpenImport, onOpenAIDrawing, onTogglePointTable, onToggleTraversePanel, onOpenCurveCalculator, onOpenOrientationDialog, onOpenDrawingRotation, onOpenTitleBlock, onToggleImagePanel }: { onOpenImport?: () => void; onOpenAIDrawing?: () => void; onTogglePointTable?: () => void; onToggleTraversePanel?: () => void; onOpenCurveCalculator?: () => void; onOpenOrientationDialog?: () => void; onOpenDrawingRotation?: () => void; onOpenTitleBlock?: () => void; onToggleImagePanel?: () => void }) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [dbDialog, setDbDialog] = useState<'save' | 'open' | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const drawingStore = useDrawingStore();
  const selectionStore = useSelectionStore();
  const toolStore = useToolStore();
  const viewportStore = useViewportStore();
  const undoStore = useUndoStore();
  const uiStore = useUIStore();
  const aiQueuePanelOpen = useAIStore((s) => s.isQueuePanelOpen);
  const toggleAIQueuePanel = useAIStore((s) => s.toggleQueuePanel);
  const aiResultLoaded = useAIStore((s) => s.result !== null);

  // ─── File I/O ───────────────────────────────
  function saveDocument() {
    try {
      const payload = { version: '1.0', application: 'starr-cad', document: drawingStore.document };
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
      alert('Failed to save the drawing. See the browser console for details.');
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
      setFileLoading(true);
      try {
        const text = await file.text();
        const payload = JSON.parse(text) as { document: unknown };
        const doc = validateAndMigrateDocument(payload?.document ?? payload);
        drawingStore.loadDocument(doc);
        selectionStore.deselectAll();
        undoStore.clear();
        cadLog.info('FileIO', `Loaded drawing: ${doc.name}`);
        // Zoom to the loaded drawing's content after a short delay to let the canvas render
        setTimeout(() => window.dispatchEvent(new CustomEvent('cad:zoomExtents')), 200);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        cadLog.error('FileIO', 'Failed to load .starr file', err);
        alert(`Failed to load file: ${msg}\n\nMake sure this is a valid .starr drawing file.`);
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

  function exportCsv() {
    try {
      const { rowCount } = downloadCsv(drawingStore.document);
      cadLog.info('FileIO', `Exported ${rowCount} points as CSV`);
    } catch (err) {
      cadLog.error('FileIO', 'CSV export failed', err);
      alert('Failed to export CSV. See the browser console for details.');
    }
  }

  const undoDesc = undoStore.undoDescription();
  const redoDesc = undoStore.redoDescription();

  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        { label: 'New Drawing', shortcut: 'Ctrl+N', action: () => { window.dispatchEvent(new CustomEvent('cad:openNewDrawingDialog')); setOpenMenu(null); } },
        { label: 'Open…', shortcut: 'Ctrl+O', action: openFileDialog },
        { label: 'Open from Database…', action: () => { setDbDialog('open'); setOpenMenu(null); } },
        { separator: true },
        { label: 'Save', shortcut: 'Ctrl+S', action: saveDocument },
        { label: 'Save As…', action: saveDocument },
        { label: 'Save to Database…', action: () => { setDbDialog('save'); setOpenMenu(null); } },
        { separator: true },
        { label: 'Export as CSV…', action: () => { exportCsv(); setOpenMenu(null); } },
        { separator: true },
        { label: 'Import…', action: () => { onOpenImport?.(); setOpenMenu(null); } },
        { separator: true },
        { label: '🤖 Run AI Drawing Engine…', action: () => { onOpenAIDrawing?.(); setOpenMenu(null); } },
        {
          label: aiQueuePanelOpen ? 'Hide AI review queue' : 'Show AI review queue',
          action: () => { toggleAIQueuePanel(); setOpenMenu(null); },
          disabled: !aiResultLoaded,
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
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Zoom Extents', shortcut: 'Z E', action: zoomToExtents },
        { separator: true },
        {
          label: drawingStore.document.settings.gridVisible ? 'Hide Grid' : 'Show Grid',
          shortcut: 'F7',
          action: () => drawingStore.updateSettings({ gridVisible: !drawingStore.document.settings.gridVisible }),
        },
        {
          label: drawingStore.document.settings.snapEnabled ? 'Snap OFF' : 'Snap ON',
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
          label: 'Toggle Point Table',
          action: () => { onTogglePointTable?.(); setOpenMenu(null); },
        },
        {
          label: 'Toggle Traverse Panel',
          action: () => { onToggleTraversePanel?.(); setOpenMenu(null); },
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
        { separator: true },
        {
          label: 'Curve Calculator…',
          shortcut: 'CC',
          action: () => { onOpenCurveCalculator?.(); setOpenMenu(null); },
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
        <div key={menu.label} className="relative">
          <button
            className={`px-3 py-1.5 hover:bg-gray-700 transition-colors ${openMenu === menu.label ? 'bg-gray-700' : ''}`}
            onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
            onMouseEnter={() => openMenu !== null && setOpenMenu(menu.label)}
          >
            {menu.label}
          </button>

          {openMenu === menu.label && (
            <div
              className="absolute top-full left-0 z-50 bg-gray-800 border border-gray-600 rounded shadow-xl py-1 min-w-[200px] animate-[slideInDown_150ms_cubic-bezier(0.16,1,0.3,1)]"
              onMouseLeave={() => setOpenMenu(null)}
            >
              {menu.items.map((item, idx) =>
                'separator' in item && item.separator ? (
                  <div key={idx} className="my-1 border-t border-gray-600" />
                ) : (
                  <button
                    key={idx}
                    className={`w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors duration-100 ${
                      (item as MenuItem).disabled
                        ? 'opacity-40 cursor-default'
                        : 'hover:bg-gray-700 hover:text-white'
                    }`}
                    disabled={(item as MenuItem).disabled}
                    onClick={() => {
                      if (!(item as MenuItem).disabled) {
                        (item as MenuItem).action();
                        setOpenMenu(null);
                      }
                    }}
                  >
                    <span>{(item as MenuItem).label}</span>
                    {(item as MenuItem).shortcut && (
                      <span className="text-gray-500 text-[10px] ml-4">{(item as MenuItem).shortcut}</span>
                    )}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}

      {/* Dirty indicator */}
      {drawingStore.isDirty && (
        <span className="ml-2 text-yellow-400 text-[10px] animate-[fadeIn_300ms_ease-out]">● unsaved</span>
      )}

      {/* Document name — click to rename */}
      <div className="ml-auto mr-3 flex items-center min-w-0">
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

      {/* Close overlay */}
      {openMenu && (
        <div
          className="fixed inset-0 z-40 animate-[fadeIn_100ms_ease-out]"
          onClick={() => setOpenMenu(null)}
        />
      )}

      {/* Keyboard Shortcuts modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-[fadeIn_150ms_ease-out]" onClick={() => setShowShortcuts(false)}>
          <div
            className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl p-6 max-w-lg w-full mx-4 text-xs text-gray-200 animate-[scaleIn_200ms_cubic-bezier(0.16,1,0.3,1)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-white">Keyboard Shortcuts</h2>
              <button className="text-gray-400 hover:text-white text-lg leading-none" onClick={() => setShowShortcuts(false)}>✕</button>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 max-h-96 overflow-y-auto">
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
        </div>
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
  </>
  );
}

