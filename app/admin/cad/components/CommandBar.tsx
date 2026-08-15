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
import { useHotkeyContext } from '../hooks/useHotkeyContext';
import { featureBounds, computeBounds } from '@/lib/cad/geometry/bounds';
// S7a — the inverse of formatCoordinates. Typed coordinates are in DISPLAY space.
import { coordinatesFromDisplay } from '@/lib/cad/geometry/units';
import { DEFAULT_DISPLAY_PREFERENCES } from '@/lib/cad/constants';
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
      const ang  = parseAngle(body.slice(ltIdx + 1).trim(), 'AUTO', {
        dmsPackedEnabled: useUIStore.getState().dmsPackedShortcutEnabled,
      });
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
      return 'Click to select · Shift+click to add/remove · drag to box-select · Space+drag or middle-drag to pan · or type a command';
    case 'PAN':
      return 'Click and drag to pan. Scroll to zoom. Middle-mouse drag also pans. Press S to return to Select.';
    case 'DRAW_POINT':
      // S7b — the typed path exists now, so the hint says so. It said "click" only, which was an
      // accurate description of a tool that ignored what you typed; a surveyor entering a control
      // point from a data sheet needs the coordinate, not the mouse.
      return 'Click to place a point, or type the coordinates. Use snap for precision. Esc to cancel.';
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
    // ── C15 — the 29 tools that had no prompt ────────────────────────────────────────────────────
    //
    // Measured: 22 of the 51 tools had a case here. The other 29 fell through to the default below,
    // which reads "Type a command (e.g. line, polyline, move, rotate)". That is the IDLE message.
    // So picking Trim and looking at the command line told the surveyor to type a command — not
    // silence, which would be merely unhelpful, but active misdirection about what the tool wants.
    //
    // The wording follows `docs/cad-click-order-contract.md`: say what is wanted NEXT, name which
    // of two picks is which, and state how a variable-length tool ends. Grouped below by the
    // contract's tool shapes rather than alphabetically, because that is what makes the phrasing
    // consistent between them — the whole point of writing the contract before the prompts.

    // Pick-then-act: one click, acts immediately.
    case 'EXPLODE':
      return 'Click a polyline, polygon or spline to break it into separate segments';
    case 'REVERSE':
      return 'Click a line or polyline to reverse its direction — start becomes end';
    case 'LIST':
      return 'Click any feature to print its full description here — type, layer, length, area';
    case 'SMOOTH_POLYLINE':
      return 'Click a polyline to convert it into a smooth spline through its vertices';
    case 'SIMPLIFY_POLYLINE':
      return 'Click a polyline to remove redundant vertices — tolerance is set in the options bar';
    case 'SPLIT':
      return 'Click anywhere on a line, polyline or polygon to break it in two at that point';
    case 'TRIM':
      return 'Click the section between two crossings — that section is removed';
    case 'EXTEND':
      return 'Click near the END you want to lengthen — it extends along its own direction to the next feature';
    case 'DIVIDE':
      return 'Click a line, polyline or polygon to drop station points at equal intervals — count is in the options bar';

    // Pick-two: the prompt must name which pick is which.
    case 'FILLET':
      return drawingPointsCount === 0
        ? 'Click the FIRST line, on the side you want to keep — radius is set in the options bar'
        : 'Click the SECOND line, on the side you want to keep';
    case 'CHAMFER':
      return drawingPointsCount === 0
        ? 'Click the FIRST line, on the side you want to keep'
        : 'Click the SECOND line, on the side you want to keep';
    case 'JOIN':
      return 'Click each line or polyline to add it to the chain — Enter to merge them into one polyline';
    case 'MATCH_PROPERTIES':
      return 'Click the feature to copy style FROM, then click each feature to apply it to';

    // Vertex editing.
    case 'INSERT_VERTEX':
      return 'Click a point on a polyline segment to insert a new vertex there';
    case 'REMOVE_VERTEX':
      return 'Click a vertex to remove it from its polyline';

    // Selection-then-act.
    case 'ARRAY':
      return 'Select the objects to replicate — set rows, columns and spacing in the options bar, then confirm';
    case 'FLIP':
      return 'Select objects, choose H / V / D1 / D2 in the options bar, then click the canvas to reflect them';
    case 'INVERT':
      return 'Select objects, then click the centre point to invert through — a 180° rotation about that point';

    // Two-click fixed.
    case 'DIM':
      return drawingPointsCount === 0
        ? 'Specify the first point of the dimension — click or snap'
        : 'Specify the second point — the bearing and distance label is placed on commit';
    case 'DRAW_ARC':
      return drawingPointsCount === 0
        ? 'Specify the arc start point — click or type x,y'
        : drawingPointsCount === 1
          ? 'Specify a point ALONG the arc — click or type x,y'
          : 'Specify the arc end point — click or type x,y';
    case 'DRAW_CIRCLE_EDGE':
      return drawingPointsCount === 0
        ? 'Specify a point on the circle edge — click or type x,y'
        : 'Specify the opposite edge point — the circle is drawn through both';
    case 'DRAW_ELLIPSE':
      return drawingPointsCount === 0
        ? 'Specify the ellipse centre — click or type x,y'
        : 'Specify the corner of the bounding box — click or type x,y';
    case 'DRAW_ELLIPSE_EDGE':
      return drawingPointsCount === 0
        ? 'Specify the first edge point of the ellipse — click or type x,y'
        : 'Specify the opposite edge point — click or type x,y';

    // One-click place.
    case 'DRAW_TEXT':
      return 'Click where the text should start — then type it and press Enter';
    case 'DRAW_IMAGE':
      return 'Click where the image should go — a dialog opens to choose the file';

    // Numeric-assisted.
    case 'POINT_AT_DISTANCE':
      return 'Click a line, polyline or polygon near the END to measure from — then type the distance and press Enter';
    case 'PERPENDICULAR':
      return drawingPointsCount === 0
        ? 'Hover a line to lock the start point onto it, then click to anchor'
        : 'Click the end point, or type a distance and press Enter';

    // Drag-capture and variable-length.
    case 'DRAW_FREEHAND':
      return 'Press and drag to draw freehand — release to finish. Esc cancels.';
    case 'MEASURE_AREA':
      return drawingPointsCount === 0
        ? 'Click the first vertex of the area to measure'
        : `Click the next vertex (${drawingPointsCount} pt${drawingPointsCount !== 1 ? 's' : ''}) — perimeter and area appear here. Enter to finish, Esc to clear.`;

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

  // cad-domain-audit Slice I — narrow hotkey context to COMMAND_BAR
  // while this input is focused, so a single-key tool shortcut
  // (`s` Select, `p` Point, etc.) doesn't fire when the surveyor is
  // typing in the bar. `commandBarFocused` is already tracked in the
  // UI store by the input's onFocus / onBlur handlers below.
  useHotkeyContext('COMMAND_BAR', uiStore.commandBarFocused);

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

  // Focus the command input on the keyboard shortcut (previously dispatched
  // with no listener — the shortcut did nothing).
  useEffect(() => {
    const focus = () => { inputRef.current?.focus(); };
    window.addEventListener('cad:focusCommandBar', focus);
    return () => window.removeEventListener('cad:focusCommandBar', focus);
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
          // S7a — an ABSOLUTE pair is what the user READ off the screen, so it is in display space:
          // ordered by `coordMode` (N then E by default, not X then Y) and carrying the origin
          // offset that a survey import sets automatically. Taking it as raw world feet — which is
          // what this line used to do — put the point somewhere the user did not type, silently, on
          // exactly the drawings where coordinates matter most.
          //
          // RELATIVE entries above are deliberately untouched: `@dx,dy` is a displacement, and a
          // displacement has no origin to remove. Only its unit conversion applies, which
          // `parseLength` already did.
          const prefs = useDrawingStore.getState().document.settings.displayPreferences
            ?? DEFAULT_DISPLAY_PREFERENCES;
          pt = coordinatesFromDisplay(val.x ?? 0, val.y ?? 0, prefs);
        }
        // S7b — the Point tool has no confirm step, and it never consumed `drawingPoints`: it
        // creates its feature from the click's own world coordinate. So a typed pair went into the
        // store and stayed there, doing nothing. Hand it to the canvas, which places it through the
        // same function the click uses.
        if (toolState.activeTool === 'DRAW_POINT') {
          window.dispatchEvent(new CustomEvent('cad:placeTypedPoint', { detail: { point: pt } }));
          return;
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
        // Draw Circle: typed radius after the center is picked. The
        // CommandBar prompt says "type a distance value"; the click
        // path at CanvasViewport.tsx:7875 emits a CIRCLE feature
        // using `Math.hypot(worldPt - center)`. Mirror that here so
        // surveyors can punch in an exact radius without scrubbing
        // the second click.
        if (
          (toolState.activeTool === 'DRAW_CIRCLE' || toolState.activeTool === 'DRAW_CIRCLE_EDGE') &&
          toolState.drawingPoints.length >= 1
        ) {
          const radius = (parsed.value as { value: number }).value;
          if (radius > 0) {
            window.dispatchEvent(
              new CustomEvent('cad:drawCircleByRadius', {
                detail: { center: toolState.drawingPoints[0], radius },
              }),
            );
          }
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
      case 'connect linework':
      case 'field to finish':
      case 'f2f':
        window.dispatchEvent(new CustomEvent('cad:buildLineworkFromCodes'));
        break;
      case 'zs':
      case 'zoom selection':
        zoomToSelection();
        break;
      case 'fit page':
      case 'fit to page':
      case 'ftp':
        window.dispatchEvent(new CustomEvent('cad:fitDrawingToPage'));
        break;
      case 'zi':
      case 'zoom in':
        window.dispatchEvent(new CustomEvent('cad:zoomIn'));
        break;
      case 'zo':
      case 'zoom out':
        window.dispatchEvent(new CustomEvent('cad:zoomOut'));
        break;
      case 'sa':
      case 'select all':
        window.dispatchEvent(new CustomEvent('cad:selectAll'));
        break;
      case 'print':
        window.dispatchEvent(new CustomEvent('cad:openPrintDialog'));
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
            data-testid="command-bar-input"
            /* admin-ui-alignment-2026-08-15 — `h-7` stated rather than left to the line box. This
               field used to measure 52px, which nobody chose: it was inheriting `padding: .875rem`
               from the marketing-site form rule in globals.css, which reached the editor because
               it renders outside `.admin-layout`. With that leak closed the height would otherwise
               fall to whatever the text happens to occupy. This is the editor's primary text
               entry; it gets a height on purpose. */
            className="w-full h-7 bg-transparent text-white outline-none placeholder-gray-600 transition-colors duration-150"
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
