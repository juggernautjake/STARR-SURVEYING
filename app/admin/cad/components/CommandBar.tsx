'use client';
// app/admin/cad/components/CommandBar.tsx — Bottom command input

import { useRef, useState, useCallback, useEffect } from 'react';
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
import { parseBearing } from '@/lib/cad/geometry/bearing';
import { parseLength } from '@/lib/cad/units/parse-length';
import { parseAngle } from '@/lib/cad/units/parse-angle';

// ─────────────────────────────────────────────
// Command parser
// ─────────────────────────────────────────────
function parseCommand(raw: string): ParsedCommand {
  const trimmed = raw.trim();

  // Coordinate forms — every numeric chunk routes through the
  // unit-aware parsers (`parseLength` / `parseAngle`) so the
  // command bar accepts the same input vocabulary as the
  // §11.5 UnitInput components. Examples that now resolve:
  //   @50<45           plain math-angle polar, 50 ft at 45°
  //   @6in,12in        relative (0.5 ft, 1.0 ft)
  //   @10ft<45.3000    polar with DMS-packed shortcut → 45°30'00"
  //   @50<N 45-30 E    polar with quadrant-bearing angle
  //   12.5,7.25        absolute, default unit (FT)
  // Angle convention is math-mode (CCW from +X) to match the
  // existing semantics; survey-mode polar lives in the tool
  // option strips, not the command bar.
  if (trimmed.startsWith('@')) {
    const body = trimmed.slice(1);
    const ltIdx = body.indexOf('<');
    if (ltIdx > 0) {
      const dist = parseLength(body.slice(0, ltIdx).trim());
      const ang  = parseAngle(body.slice(ltIdx + 1).trim(), 'AUTO');
      if (dist && ang) {
        const angleRad = (ang.azimuth * Math.PI) / 180;
        return {
          type: 'COORDINATE',
          value: {
            relative: true,
            dx: dist.feet * Math.cos(angleRad),
            dy: dist.feet * Math.sin(angleRad),
          },
        };
      }
    } else {
      const commaIdx = body.indexOf(',');
      if (commaIdx > 0) {
        const a = parseLength(body.slice(0, commaIdx).trim());
        const b = parseLength(body.slice(commaIdx + 1).trim());
        if (a && b) {
          return {
            type: 'COORDINATE',
            value: { relative: true, dx: a.feet, dy: b.feet },
          };
        }
      }
    }
  } else {
    // Absolute `x,y` — same parseLength routing.
    const commaIdx = trimmed.indexOf(',');
    if (commaIdx > 0 && trimmed.indexOf(' ') < 0) {
      const a = parseLength(trimmed.slice(0, commaIdx).trim());
      const b = parseLength(trimmed.slice(commaIdx + 1).trim());
      if (a && b) {
        return { type: 'COORDINATE', value: { x: a.feet, y: b.feet } };
      }
    }
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
function getPromptHint(activeTool: string, drawingPointsCount: number, rotateCenter?: unknown, basePoint?: unknown, regularPolygonSides?: number): string {
  switch (activeTool) {
    case 'SELECT':
      return 'Click to select, Shift+click to add/remove, drag to box-select, or type a command';
    case 'PAN':
      return 'Click and drag to pan. Scroll to zoom. Middle-mouse drag also pans. Press S to return to Select.';
    case 'DRAW_POINT':
      return 'Click to place a point. Use snap for precision. Esc to cancel.';
    case 'DRAW_LINE':
      return drawingPointsCount === 0
        ? 'Specify first point — click or type x,y'
        : 'Specify endpoint — click, type x,y, @dx,dy, or @dist<angle. Right-click or Esc to cancel.';
    case 'DRAW_POLYLINE':
      return drawingPointsCount === 0
        ? 'Specify start point — click or type x,y'
        : `Specify next point (${drawingPointsCount} pt${drawingPointsCount !== 1 ? 's' : ''}) — Right-click, Enter, or double-click to finish  [U] removes last pt`;
    case 'DRAW_POLYGON':
      return drawingPointsCount === 0
        ? 'Specify start point — click or type x,y'
        : `Specify next vertex (${drawingPointsCount} pt${drawingPointsCount !== 1 ? 's' : ''}, min 3) — Enter or double-click to close polygon  [U] removes last pt`;
    case 'DRAW_RECTANGLE':
      return drawingPointsCount === 0
        ? 'Specify first corner of rectangle — click or type x,y'
        : 'Specify opposite corner — click, type x,y, or @dx,dy. Right-click or Esc to cancel.';
    case 'DRAW_REGULAR_POLYGON':
      return drawingPointsCount === 0
        ? `Specify center of ${regularPolygonSides ?? 6}-sided polygon — change sides in the toolbar above`
        : 'Specify radius or click a vertex position. Esc to cancel.';
    case 'DRAW_CIRCLE':
      return drawingPointsCount === 0
        ? 'Specify circle center point — click or type x,y'
        : 'Specify radius — click a point on the circle or type a distance value';
    case 'MOVE':
      return basePoint == null
        ? 'Select objects then specify base point — click or type x,y'
        : 'Specify destination point — click, type x,y, or @dx,dy relative offset';
    case 'COPY':
      return basePoint == null
        ? 'Select objects then specify base point — click or type x,y'
        : 'Specify destination — click to place copies, Esc when done';
    case 'ROTATE':
      return rotateCenter == null
        ? 'Specify rotation center point — click or type x,y'
        : 'Type rotation angle in degrees (positive=CCW) and press Enter, or use the toolbar presets above';
    case 'SCALE':
      return basePoint == null
        ? 'Specify base point for scale — click or type x,y'
        : 'Type scale factor (e.g. 2=double, 0.5=half) and press Enter, or use the toolbar presets above';
    case 'MIRROR':
      return drawingPointsCount === 0
        ? 'Specify first point of mirror line — click or type x,y'
        : 'Specify second point of mirror line — click or type x,y. Esc to cancel.';
    case 'ERASE':
      return 'Click features to erase them, or select features first then press Delete';
    case 'OFFSET':
      return drawingPointsCount === 0
        ? 'Click the feature to offset'
        : 'Click the side to offset toward, or type a distance and press Enter';
    case 'INVERSE':
      return drawingPointsCount === 0
        ? 'Click first point (or snap to a feature endpoint)'
        : 'Click second point — bearing and distance will be displayed here';
    case 'FORWARD_POINT':
      return drawingPointsCount === 0
        ? 'Click base point — then type "bearing distance" (e.g. N45-30-15E 150.00) and press Enter'
        : 'Type bearing and distance (e.g. N45-30-15E 150.00) and press Enter to place point';
    case 'CURB_RETURN':
      return drawingPointsCount === 0
        ? 'Click first line for curb return'
        : drawingPointsCount === 1
          ? 'Click second line — then type radius in feet and press Enter'
          : 'Type radius in feet (e.g. 25) and press Enter — append "T" to trim lines (e.g. 25T)';
    case 'DRAW_CURVED_LINE':
    case 'DRAW_SPLINE_FIT':
      return drawingPointsCount === 0
        ? 'Click to place fit points for a smooth spline — double-click or Enter to finish'
        : `${drawingPointsCount} fit point${drawingPointsCount !== 1 ? 's' : ''} — continue clicking or double-click/Enter to finish  [U] removes last pt`;
    case 'DRAW_SPLINE_CONTROL':
      return drawingPointsCount === 0
        ? 'Click to place NURBS control points — double-click or Enter to finish (min 4 pts)'
        : `${drawingPointsCount} control point${drawingPointsCount !== 1 ? 's' : ''} — continue clicking or double-click/Enter to finish  [U] removes last pt`;
    default:
      return 'Type a command (e.g. line, polyline, move, rotate) or coordinates (x,y or @dx,dy)';
  }
}

export default function CommandBar() {
  const [input, setInput] = useState('');
  const [outputMsg, setOutputMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const drawingStore = useDrawingStore();
  const selectionStore = useSelectionStore();
  const toolStore = useToolStore();
  const viewportStore = useViewportStore();
  const undoStore = useUndoStore();
  const uiStore = useUIStore();

  // Listen for cad:commandOutput events from CanvasViewport (e.g. INVERSE result)
  useEffect(() => {
    let clearTimer: number | null = null;
    const handler = (e: Event) => {
      const { text } = (e as CustomEvent<{ text: string }>).detail;
      if (clearTimer !== null) window.clearTimeout(clearTimer);
      setOutputMsg(text);
      // Auto-clear after 8 seconds
      clearTimer = window.setTimeout(() => setOutputMsg(null), 8000);
    };
    window.addEventListener('cad:commandOutput', handler);
    return () => {
      window.removeEventListener('cad:commandOutput', handler);
      if (clearTimer !== null) window.clearTimeout(clearTimer);
    };
  }, []);

  // Stable ref so handleSubmit can call executeCommand without a stale closure
  const executeCommandRef = useRef<(name: string) => void>(() => {});

  const toolState = toolStore.state;
  const hint = getPromptHint(
    toolState.activeTool,
    toolState.drawingPoints.length,
    toolState.rotateCenter,
    toolState.basePoint,
    toolState.regularPolygonSides,
  );

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
        // Curb return: pure number = radius, append "T" (e.g. "25T") handled below
        if (toolState.activeTool === 'CURB_RETURN' && toolState.drawingPoints.length >= 2) {
          const { value: numericValue } = parsed.value as { value: number };
          window.dispatchEvent(new CustomEvent('cad:curbReturn', { detail: { radius: numericValue, trim: false } }));
        }
        return;
      }

      if (parsed.type === 'COMMAND') {
        const { name } = parsed.value as { name: string; args: string[] };

        // Forward Point: raw input like "N45-30-15E 150.00" — bearing + distance
        if (toolState.activeTool === 'FORWARD_POINT' && toolState.drawingPoints.length >= 1) {
          const raw = input.trim();
          // Pattern: bearing followed by whitespace and a number
          const fpMatch = raw.match(/^(.+?)\s+([\d.]+)$/);
          if (fpMatch) {
            const bearingAz = parseBearing(fpMatch[1].trim());
            const distance = parseFloat(fpMatch[2]);
            if (bearingAz !== null && !isNaN(distance) && distance > 0) {
              window.dispatchEvent(new CustomEvent('cad:forwardPoint', { detail: { bearing: bearingAz, distance } }));
              return;
            }
          }
        }

        // Curb return: command like "25T" (radius + T for trim)
        if (toolState.activeTool === 'CURB_RETURN' && toolState.drawingPoints.length >= 2) {
          const trimMatch = name.match(/^([\d.]+)t$/i);
          if (trimMatch) {
            const radius = parseFloat(trimMatch[1]);
            window.dispatchEvent(new CustomEvent('cad:curbReturn', { detail: { radius, trim: true } }));
            return;
          }
        }

        executeCommandRef.current(name);
      }

      // Return focus to canvas
      inputRef.current?.blur();
    },
    [input, toolState, toolStore],
  );

  function executeCommand(name: string) {
    switch (name) {
      case 'undo':
        undoStore.undo();
        break;
      case 'u':
        // During active polyline/polygon drawing, 'u' removes the last placed vertex
        // without cancelling the entire operation (like AutoCAD/Carlson behavior)
        if (
          (toolState.activeTool === 'DRAW_POLYLINE' || toolState.activeTool === 'DRAW_POLYGON') &&
          toolState.drawingPoints.length > 0
        ) {
          toolStore.popDrawingPoint();
        } else {
          undoStore.undo();
        }
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
      case 'scale':
      case 'sc':
        toolStore.setTool('SCALE');
        break;
      case 'pan':
      case 'h':
        toolStore.setTool('PAN');
        break;
      case 'rectangle':
      case 'rect':
      case 're':
        toolStore.setTool('DRAW_RECTANGLE');
        break;
      case 'circle':
      case 'ci':
        toolStore.setTool('DRAW_CIRCLE');
        break;
      case 'regpoly':
      case 'rp':
        toolStore.setTool('DRAW_REGULAR_POLYGON');
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
      case 'ortho on':
        toolStore.setOrthoEnabled(true);
        break;
      case 'ortho off':
        toolStore.setOrthoEnabled(false);
        break;
      case 'polar on':
        toolStore.setPolarEnabled(true);
        break;
      case 'polar off':
        toolStore.setPolarEnabled(false);
        break;
    }
  }
  executeCommandRef.current = executeCommand;

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
    <div className="flex flex-col bg-gray-900 border-t border-gray-700 text-xs transition-colors duration-150">
      {outputMsg && (
        <div className="flex items-center gap-2 px-2 py-1 bg-gray-800 border-b border-gray-700 text-green-400 font-mono">
          <span className="shrink-0 text-gray-500">↳</span>
          <span>{outputMsg}</span>
          <button onClick={() => setOutputMsg(null)} className="ml-auto text-gray-600 hover:text-gray-400 text-xs">✕</button>
        </div>
      )}
      <div className="flex items-center px-2 py-1 gap-2">
        <span className="text-gray-400 shrink-0">Command:</span>
        <form onSubmit={handleSubmit} className="flex-1">
          <input
            ref={inputRef}
            className="w-full bg-transparent text-white outline-none placeholder-gray-600 transition-colors duration-150"
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
    </div>
  );
}
