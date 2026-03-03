'use client';
// app/admin/cad/components/CommandBar.tsx — Bottom command input

import { useRef, useState, useCallback } from 'react';
import {
  useDrawingStore,
  useSelectionStore,
  useToolStore,
  useViewportStore,
  useUndoStore,
  useUIStore,
  makeRemoveFeatureEntry,
  makeBatchEntry,
} from '@/lib/cad/store';
import type { ParsedCommand, Feature } from '@/lib/cad/types';
import { featureBounds, computeBounds } from '@/lib/cad/geometry/bounds';

// ─────────────────────────────────────────────
// Command parser
// ─────────────────────────────────────────────
function parseCommand(raw: string): ParsedCommand {
  const trimmed = raw.trim();

  // @dist<angle — polar relative (e.g., @50<45 means 50 units at 45 degrees)
  if (/^@-?\d+(\.\d+)?<-?\d+(\.\d+)?$/.test(trimmed)) {
    const [distPart, anglePart] = trimmed.slice(1).split('<').map(Number);
    const angleRad = (anglePart * Math.PI) / 180;
    const dx = distPart * Math.cos(angleRad);
    const dy = distPart * Math.sin(angleRad);
    return { type: 'COORDINATE', value: { relative: true, dx, dy } };
  }

  // @dx,dy relative coordinate
  if (/^@-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(trimmed)) {
    const [dx, dy] = trimmed.slice(1).split(',').map(Number);
    return { type: 'COORDINATE', value: { relative: true, dx, dy } };
  }

  // x,y absolute coordinate
  if (/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(trimmed)) {
    const [x, y] = trimmed.split(',').map(Number);
    return { type: 'COORDINATE', value: { x, y } };
  }

  // Pure number → distance
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return { type: 'DISTANCE', value: { value: parseFloat(trimmed) } };
  }

  // Named commands
  const lower = trimmed.toLowerCase();
  return { type: 'COMMAND', value: { name: lower, args: [] } };
}

// ─────────────────────────────────────────────
// Tool prompt hints
// ─────────────────────────────────────────────
function getPromptHint(activeTool: string, drawingPointsCount: number, rotateCenter?: unknown, basePoint?: unknown): string {
  switch (activeTool) {
    case 'SELECT':
      return 'Select objects or type a command';
    case 'DRAW_POINT':
      return 'Specify point location';
    case 'DRAW_LINE':
      return drawingPointsCount === 0 ? 'Specify first point' : 'Specify endpoint';
    case 'DRAW_POLYLINE':
      return drawingPointsCount === 0
        ? 'Specify start point'
        : `Specify next point (${drawingPointsCount} pts) — Right-click/Enter/double-click to finish`;
    case 'DRAW_POLYGON':
      return drawingPointsCount === 0
        ? 'Specify start point'
        : `Specify next point (${drawingPointsCount} pts) — Enter/double-click to close`;
    case 'MOVE':
      return basePoint == null ? 'Specify base point' : 'Specify destination point';
    case 'COPY':
      return basePoint == null ? 'Specify base point' : 'Specify destination (click again for more copies)';
    case 'ROTATE':
      return rotateCenter == null
        ? 'Specify rotation center'
        : 'Type rotation angle in degrees, then press Enter';
    case 'SCALE':
      return basePoint == null
        ? 'Specify base point for scale'
        : 'Type scale factor (e.g. 2 for double, 0.5 for half), then press Enter';
    case 'MIRROR':
      return drawingPointsCount === 0 ? 'Specify first mirror line point' : 'Specify second mirror line point';
    case 'ERASE':
      return 'Click features to erase';
    default:
      return 'Type a command';
  }
}

export default function CommandBar() {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const drawingStore = useDrawingStore();
  const selectionStore = useSelectionStore();
  const toolStore = useToolStore();
  const viewportStore = useViewportStore();
  const undoStore = useUndoStore();
  const uiStore = useUIStore();

  const toolState = toolStore.state;
  const hint = getPromptHint(toolState.activeTool, toolState.drawingPoints.length, toolState.rotateCenter, toolState.basePoint);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim()) return;

      const parsed = parseCommand(input.trim());
      setInput('');

      if (parsed.type === 'COORDINATE') {
        const val = parsed.value as { x?: number; y?: number; relative?: boolean; dx?: number; dy?: number };
        let pt: { x: number; y: number };
        if (val.relative) {
          const last =
            toolState.drawingPoints[toolState.drawingPoints.length - 1] ??
            toolState.basePoint ?? { x: 0, y: 0 };
          pt = { x: last.x + (val.dx ?? 0), y: last.y + (val.dy ?? 0) };
        } else {
          pt = { x: val.x ?? 0, y: val.y ?? 0 };
        }
        toolStore.addDrawingPoint(pt);
        return;
      }

      if (parsed.type === 'DISTANCE') {
        // Rotate tool: treat distance as rotation angle in degrees
        if (toolState.activeTool === 'ROTATE' && toolState.rotateCenter) {
          const angleDeg = (parsed.value as { value: number }).value;
          const angleRad = (angleDeg * Math.PI) / 180;
          const center = toolState.rotateCenter;
          window.dispatchEvent(new CustomEvent('cad:rotate', { detail: { center, angleDeg, angleRad } }));
          toolStore.resetToolState();
        }
        // Scale tool: treat distance as scale factor
        if (toolState.activeTool === 'SCALE' && toolState.basePoint) {
          const factor = (parsed.value as { value: number }).value;
          if (factor > 0) {
            window.dispatchEvent(new CustomEvent('cad:scale', { detail: { center: toolState.basePoint, factor } }));
            toolStore.resetToolState();
          }
        }
        return;
      }

      if (parsed.type === 'COMMAND') {
        const { name } = parsed.value as { name: string; args: string[] };
        executeCommand(name);
      }

      // Return focus to canvas
      inputRef.current?.blur();
    },
    [input, toolState, toolStore],
  );

  function executeCommand(name: string) {
    switch (name) {
      case 'undo':
      case 'u':
        undoStore.undo();
        break;
      case 'redo':
        undoStore.redo();
        break;
      case 'escape':
      case 'esc':
        toolStore.setTool('SELECT');
        selectionStore.deselectAll();
        break;
      case 'delete':
      case 'del':
        eraseSelected();
        break;
      case 'ze':
      case 'zoom extents':
        zoomToExtents();
        break;
      case 'zs':
      case 'zoom selection':
        zoomToSelection();
        break;
      case 'line':
      case 'l':
        toolStore.setTool('DRAW_LINE');
        break;
      case 'polyline':
      case 'pl':
        toolStore.setTool('DRAW_POLYLINE');
        break;
      case 'polygon':
      case 'pg':
        toolStore.setTool('DRAW_POLYGON');
        break;
      case 'point':
      case 'p':
        toolStore.setTool('DRAW_POINT');
        break;
      case 'move':
      case 'm':
        toolStore.setTool('MOVE');
        break;
      case 'copy':
      case 'co':
        toolStore.setTool('COPY');
        break;
      case 'rotate':
      case 'ro':
        toolStore.setTool('ROTATE');
        break;
      case 'mirror':
      case 'mi':
        toolStore.setTool('MIRROR');
        break;
      case 'scale':
      case 'sc':
        toolStore.setTool('SCALE');
        break;
      case 'erase':
      case 'e':
        toolStore.setTool('ERASE');
        break;
      case 'select':
      case 's':
        toolStore.setTool('SELECT');
        break;
      case 'snap on':
        drawingStore.updateSettings({ snapEnabled: true });
        break;
      case 'snap off':
        drawingStore.updateSettings({ snapEnabled: false });
        break;
      case 'grid on':
        drawingStore.updateSettings({ gridVisible: true });
        break;
      case 'grid off':
        drawingStore.updateSettings({ gridVisible: false });
        break;
    }
  }

  function eraseSelected() {
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
    const bounds = computeBounds(allPoints);
    viewportStore.zoomToExtents(bounds);
  }

  function zoomToSelection() {
    const ids = Array.from(selectionStore.selectedIds);
    if (ids.length === 0) return zoomToExtents();
    const features = ids.map((id) => drawingStore.getFeature(id)).filter(Boolean) as Feature[];
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setInput('');
      toolStore.setTool('SELECT');
      selectionStore.deselectAll();
      inputRef.current?.blur();
    }
  };

  return (
    <div className="flex items-center bg-gray-900 border-t border-gray-700 px-2 py-1 gap-2 text-xs">
      <span className="text-gray-400 shrink-0">Command:</span>
      <form onSubmit={handleSubmit} className="flex-1">
        <input
          ref={inputRef}
          className="w-full bg-transparent text-white outline-none placeholder-gray-600"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => uiStore.setCommandBarFocused(true)}
          onBlur={() => uiStore.setCommandBarFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={hint}
          autoComplete="off"
          spellCheck={false}
        />
      </form>
    </div>
  );
}
