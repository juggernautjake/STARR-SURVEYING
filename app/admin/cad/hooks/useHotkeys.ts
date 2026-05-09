'use client';
// app/admin/cad/hooks/useHotkeys.ts
//
// Phase 8 §2.3 — React layer for the hotkey engine.
//
// Owns the engine instance, registers a window-level
// `keydown` listener, filters events so typing in inputs /
// textareas / contenteditable doesn't accidentally trigger
// global shortcuts, and dispatches matched actions into the
// existing tool / undo / drawing / AI stores.
//
// The dispatcher lives here so the engine module stays free
// of store imports and React-only UI primitives. Adding a
// new bindable action is a single switch case below + a
// registry entry in `lib/cad/hotkeys/registry.ts`.

import { useEffect, useRef } from 'react';

import {
  createHotkeyEngine,
  DEFAULT_ACTIONS,
  type BindableAction,
  type HotkeyEngine,
} from '@/lib/cad/hotkeys';
import { applyHotkeyPreset } from '@/lib/cad/hotkeys/presets';
import {
  useAIStore,
  useDrawingChatStore,
  useDrawingStore,
  useHotkeysStore,
  useSelectionStore,
  useToolStore,
  useUIStore,
  useUndoStore,
} from '@/lib/cad/store';
import type { ToolType } from '@/lib/cad/types';

interface UseHotkeysOptions {
  /** Optional override callback. When supplied, it
   *  intercepts every dispatched action; returning true
   *  marks the event handled so the default dispatcher
   *  skips it. Useful for surfaces (e.g. a dialog) that
   *  need to consume Escape themselves. */
  onAction?: (action: BindableAction) => boolean;
}

/** Map a `tool.*` action id to the corresponding ToolType.
 *  Returning `null` means the action has no tool bound (UI
 *  follows up later). */
function toolForAction(actionId: string): ToolType | null {
  switch (actionId) {
    case 'tool.select':   return 'SELECT';
    case 'tool.pan':      return 'PAN';
    case 'tool.point':    return 'DRAW_POINT';
    case 'tool.line':     return 'DRAW_LINE';
    case 'tool.polyline': return 'DRAW_POLYLINE';
    case 'tool.polygon':  return 'DRAW_POLYGON';
    case 'tool.arc':      return 'DRAW_ARC';
    case 'tool.spline':   return 'DRAW_SPLINE_FIT';
    case 'tool.text':     return 'DRAW_TEXT';
    case 'tool.move':     return 'MOVE';
    case 'tool.copyTool': return 'COPY';
    case 'tool.rotate':   return 'ROTATE';
    case 'tool.mirror':   return 'MIRROR';
    case 'tool.scale':    return 'SCALE';
    case 'tool.offset':   return 'OFFSET';
    case 'tool.fillet':   return 'CURB_RETURN';
    case 'tool.chamfer':  return 'CHAMFER';
    case 'tool.split':    return 'SPLIT';
    case 'tool.join':     return 'JOIN';
    case 'tool.divide':   return 'DIVIDE';
    case 'tool.explode':  return 'EXPLODE';
    case 'tool.reverse':  return 'REVERSE';
    case 'tool.matchProps':    return 'MATCH_PROPERTIES';
    case 'tool.pointAtDist':   return 'POINT_AT_DISTANCE';
    case 'tool.perpendicular': return 'PERPENDICULAR';
    case 'tool.smooth':   return 'SMOOTH_POLYLINE';
    case 'tool.simplify': return 'SIMPLIFY_POLYLINE';
    case 'tool.insertVertex':  return 'INSERT_VERTEX';
    case 'tool.removeVertex':  return 'REMOVE_VERTEX';
    case 'tool.list':     return 'LIST';
    case 'tool.array':    return 'ARRAY';
    case 'tool.flip':     return 'FLIP';
    case 'tool.invert':   return 'INVERT';
    case 'tool.measureArea': return 'MEASURE_AREA';
    case 'tool.dim':      return 'DIM';
    case 'tool.erase':    return 'ERASE';
    case 'tool.inverse':  return 'INVERSE';
    case 'tool.forward':  return 'FORWARD_POINT';
    default:              return null;
  }
}

/** True when the event target is an editable surface that
 *  should swallow the keystroke (typed text, contenteditable
 *  document, etc.). The engine's GLOBAL hotkeys still fire
 *  for Ctrl/Cmd + key combinations even inside inputs so
 *  Save / Undo keep working in the title-block panel etc. */
function shouldIgnoreEventTarget(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  const tag = target.tagName?.toUpperCase?.() ?? '';
  const isEditable =
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable === true;
  if (!isEditable) return false;
  // Allow modifier-prefixed shortcuts to pass through to the
  // engine so Ctrl+S, Ctrl+Z, Ctrl+K, etc. still work even
  // when the surveyor's cursor is in a form field.
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return true;
}

export function useHotkeys(options: UseHotkeysOptions = {}): void {
  const engineRef = useRef<HotkeyEngine | null>(null);
  // The hook subscribes to userBindings so a settings-page
  // change rebuilds the engine tree on the fly.
  const userBindings = useHotkeysStore((s) => s.userBindings);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const engine = createHotkeyEngine({
      actions: DEFAULT_ACTIONS,
      userBindings,
      getContext: () => useHotkeysStore.getState().activeContext,
      onAction: (action) => {
        // Caller-side override gets first crack.
        if (optionsRef.current.onAction?.(action)) return;
        dispatchDefaultAction(action);
      },
    });
    engineRef.current = engine;

    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreEventTarget(event)) return;
      const handled = engine.handleKeyEvent(event);
      if (handled) {
        // Hotkeys with modifiers (Ctrl+S, Ctrl+Z, etc.) and
        // function keys (F2, F3) usually have a browser
        // default we want to suppress. Single-character
        // bindings like `s` for select tool also benefit
        // from preventDefault so they don't accidentally
        // type into a stray contenteditable.
        event.preventDefault();
      }
    };

    const onBlur = () => engine.flushPending();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', onBlur);
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push live binding changes into the existing engine
  // without recreating it.
  useEffect(() => {
    engineRef.current?.setUserBindings(userBindings);
  }, [userBindings]);
}

// ────────────────────────────────────────────────────────────
// Default dispatcher
// ────────────────────────────────────────────────────────────

/**
 * Dispatch a `BindableAction` against the canonical store /
 * event surface. Exported so the command palette (Ctrl+K)
 * can fire any registry action by id without re-implementing
 * the switch.
 */
export function dispatchDefaultAction(action: BindableAction): void {
  // Tool actions fan out through one switch.
  const tool = toolForAction(action.id);
  if (tool) {
    useToolStore.getState().setTool(tool);
    return;
  }

  switch (action.id) {
    // ── File ──────────────────────────────────────────
    case 'file.new':
      window.dispatchEvent(new CustomEvent('cad:openNewDrawingDialog'));
      return;
    case 'file.save':
    case 'file.saveAs':
      window.dispatchEvent(new CustomEvent('cad:saveDocument'));
      return;
    case 'file.print':
      window.dispatchEvent(new CustomEvent('cad:openPrintDialog'));
      return;

    // ── Edit ──────────────────────────────────────────
    case 'edit.undo':
      useUndoStore.getState().undo();
      return;
    case 'edit.redo':
    case 'edit.redo2':
      useUndoStore.getState().redo();
      return;
    case 'edit.deselect':
      useSelectionStore.getState().deselectAll();
      useToolStore.getState().resetToolState();
      return;
    case 'edit.delete':
      window.dispatchEvent(new CustomEvent('cad:deleteSelection'));
      return;
    case 'edit.selectAll':
      window.dispatchEvent(new CustomEvent('cad:selectAll'));
      return;
    case 'edit.cut':
      window.dispatchEvent(new CustomEvent('cad:clipboardCut'));
      return;
    case 'edit.copy':
      window.dispatchEvent(new CustomEvent('cad:clipboardCopy'));
      return;
    case 'edit.paste':
      window.dispatchEvent(new CustomEvent('cad:clipboardPaste'));
      return;

    // ── View / Zoom ──────────────────────────────────
    case 'view.zoomExtents':
      window.dispatchEvent(new CustomEvent('cad:zoomExtents'));
      return;
    case 'view.zoomSelection':
      window.dispatchEvent(new CustomEvent('cad:zoomSelection'));
      return;
    case 'view.zoomIn':
      window.dispatchEvent(new CustomEvent('cad:zoomIn'));
      return;
    case 'view.zoomOut':
      window.dispatchEvent(new CustomEvent('cad:zoomOut'));
      return;

    // ── Snap toggles ─────────────────────────────────
    case 'snap.toggle': {
      const drawing = useDrawingStore.getState();
      drawing.updateSettings({
        snapEnabled: !drawing.document.settings.snapEnabled,
      });
      return;
    }
    case 'snap.grid': {
      const drawing = useDrawingStore.getState();
      drawing.updateSettings({
        gridVisible: !drawing.document.settings.gridVisible,
      });
      return;
    }
    case 'snap.ortho':
      window.dispatchEvent(new CustomEvent('cad:toggleOrtho'));
      return;

    // ── Layers ───────────────────────────────────────
    case 'layer.panel':
      useUIStore.getState().toggleLayerPanel();
      return;

    case 'layer.isolateBySelection': {
      // Hide every layer that doesn't contain at least one
      // currently-selected feature. The active layer is kept
      // visible regardless so the surveyor can keep drawing
      // without re-toggling. No-op when nothing is selected
      // — print a hint to the command bar instead.
      const selStore = useSelectionStore.getState();
      const drawingStore = useDrawingStore.getState();
      const ids = Array.from(selStore.selectedIds);
      if (ids.length === 0) {
        window.dispatchEvent(new CustomEvent('cad:commandOutput', {
          detail: { text: 'Isolate by Selection — select features first.' },
        }));
        return;
      }
      const keepLayers = new Set<string>();
      keepLayers.add(drawingStore.activeLayerId);
      for (const id of ids) {
        const f = drawingStore.getFeature(id);
        if (f) keepLayers.add(f.layerId);
      }
      let hiddenCount = 0;
      for (const layerId of drawingStore.document.layerOrder) {
        const wasVisible = drawingStore.document.layers[layerId]?.visible !== false;
        const shouldBeVisible = keepLayers.has(layerId);
        if (wasVisible !== shouldBeVisible) {
          drawingStore.updateLayer(layerId, { visible: shouldBeVisible });
        }
        if (!shouldBeVisible) hiddenCount += 1;
      }
      window.dispatchEvent(new CustomEvent('cad:commandOutput', {
        detail: {
          text: `Isolated ${keepLayers.size} layer${keepLayers.size === 1 ? '' : 's'}; hid ${hiddenCount}.`,
        },
      }));
      return;
    }

    case 'layer.showAll': {
      const drawingStore = useDrawingStore.getState();
      let restored = 0;
      for (const layerId of drawingStore.document.layerOrder) {
        if (!drawingStore.document.layers[layerId]?.visible) {
          drawingStore.updateLayer(layerId, { visible: true });
          restored += 1;
        }
      }
      window.dispatchEvent(new CustomEvent('cad:commandOutput', {
        detail: { text: restored === 0 ? 'All layers already visible.' : `Restored ${restored} hidden layer${restored === 1 ? '' : 's'}.` },
      }));
      return;
    }

    // ── AI ───────────────────────────────────────────
    case 'ai.start':
      window.dispatchEvent(new CustomEvent('cad:openAIDrawingDialog'));
      return;
    case 'ai.chat':
      useDrawingChatStore.getState().open();
      return;

    // ── App ──────────────────────────────────────────
    case 'view.settings':
      window.dispatchEvent(new CustomEvent('cad:openSettings'));
      return;
    case 'view.commandBar':
      useUIStore.getState().setCommandBarFocused(true);
      window.dispatchEvent(new CustomEvent('cad:focusCommandBar'));
      return;
    case 'view.commandPalette':
      window.dispatchEvent(new CustomEvent('cad:openCommandPalette'));
      return;
    case 'view.shortcutHelp':
      window.dispatchEvent(new CustomEvent('cad:openShortcutHelp'));
      return;

    case 'view.stats': {
      // Drawing stats — feature count by type, total polygon
      // area, total line length, layer count. Fires through
      // the command bar so the surveyor can copy the result
      // out of the output channel.
      const drawing = useDrawingStore.getState();
      const features = drawing.getAllFeatures();
      const byType: Record<string, number> = {};
      let totalLineLength = 0;
      let totalPolygonArea = 0;
      for (const f of features) {
        const t = f.geometry.type;
        byType[t] = (byType[t] ?? 0) + 1;
        if (t === 'LINE' && f.geometry.start && f.geometry.end) {
          totalLineLength += Math.hypot(
            f.geometry.end.x - f.geometry.start.x,
            f.geometry.end.y - f.geometry.start.y,
          );
        } else if (t === 'POLYLINE' && f.geometry.vertices) {
          for (let i = 0; i + 1 < f.geometry.vertices.length; i += 1) {
            totalLineLength += Math.hypot(
              f.geometry.vertices[i + 1].x - f.geometry.vertices[i].x,
              f.geometry.vertices[i + 1].y - f.geometry.vertices[i].y,
            );
          }
        } else if (t === 'POLYGON' && f.geometry.vertices && f.geometry.vertices.length >= 3) {
          // Shoelace area
          let dbl = 0;
          const v = f.geometry.vertices;
          for (let i = 0; i < v.length; i += 1) {
            const j = (i + 1) % v.length;
            dbl += v[i].x * v[j].y - v[j].x * v[i].y;
          }
          totalPolygonArea += Math.abs(dbl / 2);
        }
      }
      const layerCount = Object.keys(drawing.document.layers).length;
      const typeSummary = Object.entries(byType)
        .sort((a, b) => b[1] - a[1])
        .map(([type, n]) => `${n} ${type.toLowerCase()}`)
        .join(', ');
      const acres = totalPolygonArea / 43560;
      const text = `Drawing — ${features.length} features (${typeSummary}); ${layerCount} layer${layerCount === 1 ? '' : 's'}; line length ${totalLineLength.toFixed(2)}′; polygon area ${totalPolygonArea.toFixed(2)} sq ft (${acres.toFixed(4)} ac).`;
      window.dispatchEvent(new CustomEvent('cad:commandOutput', { detail: { text } }));
      return;
    }

    // ── Preset switchers ────────────────────────────
    case 'preset.autocad':
      applyHotkeyPreset('AUTOCAD');
      window.dispatchEvent(new CustomEvent('cad:commandOutput', {
        detail: { text: 'Hotkeys — AutoCAD-style preset applied. Persisted across reloads.' },
      }));
      return;
    case 'preset.reset':
      applyHotkeyPreset('DEFAULT');
      window.dispatchEvent(new CustomEvent('cad:commandOutput', {
        detail: { text: 'Hotkeys — reset to registry defaults.' },
      }));
      return;

    default: {
      // Annotation tool actions that don't yet have a
      // ToolType land here; surface them via a custom
      // event so future surfaces can listen.
      window.dispatchEvent(
        new CustomEvent('cad:hotkey', { detail: { actionId: action.id } })
      );
      // Reference useAIStore so the lint rule doesn't trim
      // it from the import (we'll wire AI shortcuts through
      // it in a follow-up slice once the AI surface grows
      // bindable verbs).
      void useAIStore;
    }
  }
}
