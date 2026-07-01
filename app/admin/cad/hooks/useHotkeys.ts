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
  type UserBinding,
} from '@/lib/cad/hotkeys';
import { applyHotkeyPreset } from '@/lib/cad/hotkeys/presets';
import { confirmAction } from '../components/ConfirmDialog';
import { useAIConversationsStore } from '@/lib/cad/store/ai-conversations-store';
import { undoMostRecentAIBatch } from '@/lib/cad/ai/undo-batch';
import {
  useAIStore,
  useDrawingStore,
  useHotkeysStore,
  useSelectionStore,
  useToolStore,
  useTransferStore,
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

/** cad-domain-audit Slice K — find the action whose RESOLVED binding
 *  matches `key` (user override → registry default). Returns null
 *  when nothing's bound. Mirrors the engine's `buildTree` merge
 *  semantics so any rebind is honoured immediately. Exported for the
 *  Slice K test fixture. */
export function findActionForKey(
  actions: ReadonlyArray<BindableAction>,
  userBindings: ReadonlyArray<UserBinding>,
  key: string,
): BindableAction | null {
  const overrideById = new Map<string, string | null>();
  for (const ub of userBindings) overrideById.set(ub.actionId, ub.key);
  // Mirror the engine's `buildTree` semantics: when two actions
  // resolve to the same key (e.g. AutoCAD preset binds tool.select →
  // escape while edit.deselect still defaults to escape), the later-
  // inserted action wins. Walk the list and remember the last match.
  let last: BindableAction | null = null;
  for (const action of actions) {
    const override = overrideById.get(action.id);
    const resolved = override === undefined ? action.defaultKey : override;
    if (resolved === key) last = action;
  }
  return last;
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
      // cad-ux-cleanup-pass Slice 5 — `s` no longer chord-prefixes
      // Scale/Spline (both moved to Shift+S / Shift+P), so plain `s`
      // is now a clean leaf that fires Select on keydown. The chord
      // window still guards the remaining prefixes (`p l` polyline,
      // `z e` zoom-extents, `i n v` inverse, etc.) — 1.5 s gives a
      // comfortable type-the-second-key budget without keeping the
      // ambiguous-single-key tools (`p` Point, etc.) feeling sluggish.
      // Surveyors can dismiss the HUD instantly with Escape (see
      // onKeyDown below).
      chordTimeoutMs: 1500,
      onAction: (action) => {
        // Caller-side override gets first crack.
        if (optionsRef.current.onAction?.(action)) return;
        dispatchDefaultAction(action);
      },
    });
    engineRef.current = engine;

    let lastPrefix = '';
    // Tracks the deferred chord-prefix refresh so each keystroke supersedes the
    // previous pending timer (instead of stacking one per keypress) and the
    // effect cleanup can cancel it on unmount.
    let prefixTimeout: number | null = null;
    const emitPrefix = () => {
      const next = engine.getBufferedPrefix();
      if (next !== lastPrefix) {
        lastPrefix = next;
        window.dispatchEvent(new CustomEvent('cad:chordPrefixChanged', {
          detail: { prefix: next },
        }));
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreEventTarget(event)) return;
      // cad-ux-cleanup-pass Slice 5 — Escape during a buffered chord
      // clears the buffer WITHOUT firing the pending action. Without
      // this, hitting Esc to "back out" of an in-progress chord (e.g.
      // pressed `p` by mistake) would fire Point AND then Deselect.
      // After clearing we still emit the prefix-changed event so the
      // ChordHUD hides immediately.
      if (event.key === 'Escape' && engine.getBufferedPrefix().length > 0) {
        engine.resetBuffer();
        event.preventDefault();
        emitPrefix();
        // cad-domain-audit Slice K — Slice 5 made Esc a "back out of
        // a chord" verb under the DEFAULT preset (Esc → edit.deselect)
        // and explicitly suppresses the bound action so the surveyor
        // can abort an accidental chord without also deselecting. But
        // the AutoCAD preset rebinds Esc to `tool.select`, and those
        // surveyors expect Esc to STILL fire Select even when a chord
        // was buffered. Discriminator: dispatch the bound action UNLESS
        // it's the cancel-verb default (`edit.deselect`). Reading the
        // live store keeps a runtime rebind in effect.
        const liveBindings = useHotkeysStore.getState().userBindings;
        const escAction = findActionForKey(DEFAULT_ACTIONS, liveBindings, 'escape');
        if (escAction && escAction.id !== 'edit.deselect') {
          dispatchDefaultAction(escAction);
        }
        return;
      }
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
      // Surface the chord buffer state for the HUD. The engine
      // commits / clears its buffer inside `handleKeyEvent`, so
      // reading right after gives the canonical post-keystroke
      // prefix. A timeout covers the chord-timeout auto-clear.
      emitPrefix();
      if (prefixTimeout !== null) window.clearTimeout(prefixTimeout);
      prefixTimeout = window.setTimeout(emitPrefix, 1100);
    };

    const onBlur = () => engine.flushPending();

    // Capture phase so this canonical engine is the FIRST responder
    // for every keydown. When it handles a key it calls
    // preventDefault(); the legacy useKeyboard hook (which mounts a
    // separate bubble-phase listener inside CanvasViewport) bails on
    // event.defaultPrevented, so a shared shortcut like Ctrl+Z fires
    // exactly once instead of twice. Keys this engine doesn't own
    // (arrow nudge, Ctrl+D duplicate, Enter confirm) fall through to
    // useKeyboard untouched.
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', onBlur);
      if (prefixTimeout !== null) window.clearTimeout(prefixTimeout);
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

  // §32 Slice 13 — MANUAL mode lockdown. Every ai.* action
  // except the mode-cycle is a no-op while AI is off; the
  // surveyor sees a toast that points at Ctrl+Shift+M so they
  // can switch modes if they actually wanted AI.
  if (
    action.id.startsWith('ai.') &&
    action.id !== 'ai.cycleMode' &&
    useAIStore.getState().mode === 'MANUAL'
  ) {
    window.dispatchEvent(new CustomEvent('cad:commandOutput', {
      detail: { text: 'AI is off (MANUAL mode). Press Ctrl+Shift+M to switch modes.' },
    }));
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
    case 'edit.undo': {
      // While the LayerTransferDialog is in Pick mode, Ctrl+Z walks
      // the pick history instead of the document undo stack so a
      // surveyor can roll back accidental picks without losing
      // drawing edits (Phase 8 §11.7.12).
      const tx = useTransferStore.getState();
      if (tx.pickModeActive) { tx.undoPick(); return; }
      // During an in-progress multi-point draw (spline / curved line /
      // polyline / polygon), Ctrl+Z removes just the LAST placed point
      // instead of undoing the whole in-flight curve — so a mis-clicked
      // anchor can be backed out one at a time.
      const ts = useToolStore.getState();
      if (
        ts.state.drawingPoints.length > 0 &&
        (ts.state.activeTool === 'DRAW_CURVED_LINE' ||
          ts.state.activeTool === 'DRAW_SPLINE_FIT' ||
          ts.state.activeTool === 'DRAW_SPLINE_CONTROL' ||
          ts.state.activeTool === 'DRAW_POLYLINE' ||
          ts.state.activeTool === 'DRAW_POLYGON')
      ) {
        // CanvasViewport owns the per-tool logic: for POLYLINE it also removes
        // the committed segment feature, not just the point.
        window.dispatchEvent(new CustomEvent('cad:undoDrawVertex'));
        return;
      }
      useUndoStore.getState().undo();
      return;
    }
    case 'edit.redo':
    case 'edit.redo2': {
      const tx = useTransferStore.getState();
      if (tx.pickModeActive) { tx.redoPick(); return; }
      useUndoStore.getState().redo();
      return;
    }
    case 'edit.deselect':
      // Escape fully releases the active tool: clear the selection AND
      // return to SELECT so the cursor isn't still "wired" to the last
      // modify tool (e.g. Scale) when the surveyor goes to pick another.
      useSelectionStore.getState().deselectAll();
      useToolStore.getState().setTool('SELECT');
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
    case 'view.regenerate':
      // cad-ux-cleanup-pass Slice 11 — manual canvas refresh. The
      // CanvasViewport listener clears its LOD + feature-index
      // caches and schedules an rAF render. Same path the canvas
      // right-click "Refresh canvas" item + the AI tool registry
      // can fire.
      window.dispatchEvent(new CustomEvent('cad:regenerateCanvas'));
      window.dispatchEvent(new CustomEvent('cad:commandOutput', {
        detail: { text: 'Canvas refresh requested.' },
      }));
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

    case 'layer.quickAdd': {
      // cad-ux-cleanup-pass Slice 8 — open the existing Layer Transfer
      // dialog pre-targeted at the active layer so the surveyor
      // doesn't have to pick the target again. Same code path that the
      // LayerPanel `+` button and "Quick-add points…" context-menu
      // item fire, so the AI tool registry can target any specific
      // layer the same way by setting `targetLayerId` on the transfer
      // store before dispatching `cad:openLayerTransfer`.
      const drawingStore = useDrawingStore.getState();
      const layerId = drawingStore.activeLayerId;
      const target = drawingStore.document.layers[layerId];
      if (!target) {
        window.dispatchEvent(new CustomEvent('cad:commandOutput', {
          detail: { text: 'Quick-add Points — no active layer.' },
        }));
        return;
      }
      useTransferStore.getState().setOptions({ targetLayerId: layerId });
      window.dispatchEvent(new CustomEvent('cad:openLayerTransfer'));
      return;
    }

    // ── AI ───────────────────────────────────────────
    case 'ai.start':
      window.dispatchEvent(new CustomEvent('cad:openAIDrawingDialog'));
      return;
    case 'ai.chat':
      // CAD_UX_2026_05 §02 — open the consolidated AI chat dock.
      useAIConversationsStore.getState().open();
      return;
    case 'ai.cycleMode': {
      const aiStore = useAIStore.getState();
      aiStore.cycleMode();
      // Read the *post-cycle* mode for the toast — the cycleMode
      // action mutates synchronously so a fresh getState() works.
      const nextMode = useAIStore.getState().mode;
      window.dispatchEvent(new CustomEvent('cad:commandOutput', {
        detail: { text: `AI mode: ${nextMode}` },
      }));
      return;
    }
    // Phase 6 §32.9 — palette-driven canned prompts. Each one
    // seeds a prompt + opens the sidebar; the surveyor can edit
    // before sending (Ctrl+Enter) or send as-is.
    case 'ai.parseCodes':
      useAIStore.getState().openCopilotWithPrompt(
        'Walk every point code in the current document and propose layer assignments. ' +
          'Create any missing layers via createLayer; do not modify existing features.',
      );
      window.dispatchEvent(new CustomEvent('cad:focusAICopilot'));
      return;
    case 'ai.fillCorners':
      useAIStore.getState().openCopilotWithPrompt(
        'Find any nearly-closed polygons or polylines whose endpoints stop short of meeting. ' +
          'For each, propose a best-fit corner via the line intersect helpers.',
      );
      window.dispatchEvent(new CustomEvent('cad:focusAICopilot'));
      return;
    case 'ai.checkClosure':
      useAIStore.getState().openCopilotWithPrompt(
        'Run a closure report on the active polygon / traverse. ' +
          'List the closure error in feet and angle, and flag any legs longer than 200 ft for review.',
      );
      window.dispatchEvent(new CustomEvent('cad:focusAICopilot'));
      return;
    case 'ai.createLayerFromCodes':
      useAIStore.getState().openCopilotWithPrompt(
        'Create a new layer from a code pattern (e.g. BC-*) and a draw-as instruction (POINT / POLYLINE / POLYGON). ' +
          'Ask me which pattern + draw-as to use if you need more detail.',
      );
      window.dispatchEvent(new CustomEvent('cad:focusAICopilot'));
      return;
    case 'ai.explainFeature': {
      // If a single feature is selected and it carries
      // provenance, open the existing §32.7 popup directly.
      const sel = Array.from(useSelectionStore.getState().selectedIds);
      if (sel.length === 1) {
        useAIStore.getState().openExplanation(sel[0]);
        return;
      }
      window.dispatchEvent(new CustomEvent('cad:commandOutput', {
        detail: { text: 'Select exactly one feature to explain.' },
      }));
      return;
    }
    case 'ai.startAuto': {
      const ai = useAIStore.getState();
      if (ai.mode !== 'AUTO') ai.setMode('AUTO');
      ai.startAutoRun();
      window.dispatchEvent(new CustomEvent('cad:focusAICopilot'));
      window.dispatchEvent(new CustomEvent('cad:commandOutput', {
        detail: { text: 'AUTO run started — see chat sidebar.' },
      }));
      return;
    }
    case 'ai.pauseAuto': {
      const ai = useAIStore.getState();
      if (ai.mode !== 'AUTO') {
        window.dispatchEvent(new CustomEvent('cad:commandOutput', {
          detail: { text: 'AUTO is not running.' },
        }));
        return;
      }
      ai.setMode('COPILOT');
      ai.appendCopilotMessage({
        id: `pause_${Date.now().toString(36)}`,
        role: 'SYSTEM',
        content: 'AUTO paused — switched to COPILOT for the rest of this session. Cycle the mode (Ctrl+Shift+M) to resume.',
        ts: new Date().toISOString(),
      });
      window.dispatchEvent(new CustomEvent('cad:commandOutput', {
        detail: { text: 'AUTO paused — switched to COPILOT.' },
      }));
      return;
    }
    case 'ai.replaySequence': {
      const ai = useAIStore.getState();
      const total = ai.aiBatches.length;
      if (total === 0) {
        window.dispatchEvent(new CustomEvent('cad:commandOutput', {
          detail: { text: 'Replay AI sequence: nothing recorded yet.' },
        }));
        return;
      }
      // cad-trv-fidelity Slice 13 — Starr-styled confirm (the dispatcher
      // is sync, so chain the promise rather than awaiting).
      confirmAction({
        title: 'Replay AI sequence?',
        message:
          `Replay ${total} AI turn${total === 1 ? '' : 's'} against the current document?\n\n` +
          'Each prompt re-fires through the AI proposer; proposals land in the queue for review just like a fresh run.',
        confirmLabel: 'Replay',
        cancelLabel: 'Cancel',
      }).then((confirmed) => {
        if (!confirmed) return;
        ai.replayAISequence().then((result) => {
          window.dispatchEvent(new CustomEvent('cad:commandOutput', {
            detail: {
              text:
                `Replay complete — ${result.replayed} succeeded` +
                (result.failed > 0 ? `, ${result.failed} failed` : '') +
                (result.aborted ? ', aborted' : '') + '.',
            },
          }));
        });
      });
      return;
    }
    case 'ai.undoBatch': {
      const popped = undoMostRecentAIBatch();
      if (!popped) {
        window.dispatchEvent(new CustomEvent('cad:commandOutput', {
          detail: { text: 'No AI batch at the top of the undo stack.' },
        }));
        return;
      }
      window.dispatchEvent(new CustomEvent('cad:commandOutput', {
        detail: {
          text: `Undid AI batch (${popped.count} feature${popped.count === 1 ? '' : 's'}).`,
        },
      }));
      return;
    }

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
    case 'edit.sendToLayer':
      window.dispatchEvent(new CustomEvent('cad:openLayerTransfer'));
      return;
    case 'tool.intersect':
      window.dispatchEvent(new CustomEvent('cad:openIntersect'));
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
