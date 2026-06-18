'use client';
// lib/hub/components/GridEditor.tsx
//
// Grid-painter widget editor. Opens as a full-screen modal when the
// surveyor wants direct manipulation: pick a widget type from the
// left palette, click on an open tile of the 8×12 grid to drop it,
// placed widget as a labelled colored block, click → resize/delete.
//
// This slice (222) ships the SHELL only — the grid renders the
// current draft widgets as static blocks but cells are non-interactive.
// Click + paint + select + resize land in Slices 223 / 224 / 225.
//
// Slice 222 of hub-grid-editor-and-banner-green-2026-05-29.md.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { UserRole } from '@/lib/auth';
import type { BundleId } from '@/lib/saas/bundles';
import {
  allWidgets,
  type WidgetCategory,
  type WidgetDefinition,
} from '@/lib/hub/widget-registry';
import { filterCatalog } from '@/lib/hub/widget-catalog-filter';
import { useHubStore } from '@/lib/hub/hub-store';
import { useHubActions } from '@/lib/hub/use-hub-actions';
// Slice 7 (employee-hub-overhaul-2026-05-30) — single source of truth
// for the grid coordinate system. The modal paints in HUB_GRID_COLS ×
// HUB_EDITOR_ROWS cells, the canvas renders the saved layout in the
// same HUB_GRID_COLS coordinate space (the canvas's rows are unbounded).
import { HUB_EDITOR_ROWS, HUB_GRID_COLS } from '@/lib/hub/grid-model';
// Slice 8/9 (employee-hub-overhaul-2026-05-30) — pure helpers for the
// in-modal drag-to-move interaction. applyMoveWithPush drives the
// live reflow preview while the surveyor drags; commitDrop snaps +
// compacts on release.
import { applyMoveWithPush, applyResizeWithPush, commitDrop, trimLeadingRows } from '@/lib/hub/grid-reflow';
import { compactLayout } from '@/lib/hub/grid-math';
import type { WidgetInstance } from '@/lib/hub/types';
// Slice 11 — per-widget options surface (Size + Header color +
// Title + the widget's own SettingsForm) opened from the ⚙ button on
// the selected painted widget.
import WidgetOptionsPanel from './WidgetOptionsPanel';

export const GRID_EDITOR_COLS = HUB_GRID_COLS;
export const GRID_EDITOR_ROWS = HUB_EDITOR_ROWS;

export interface GridEditorProps {
  open: boolean;
  onClose: () => void;
  /** Roles the current surveyor holds — gates the palette. */
  roles: UserRole[];
  /** Active subscription bundles. `null` skips the gate. */
  activeBundles?: BundleId[] | null;
}

export default function GridEditor({
  open,
  onClose,
  roles,
  activeBundles = null,
}: GridEditorProps) {
  if (!open) return null;
  return (
    <GridEditorBody
      onClose={onClose}
      roles={roles}
      activeBundles={activeBundles}
    />
  );
}

interface GridEditorBodyProps {
  onClose: () => void;
  roles: UserRole[];
  activeBundles: BundleId[] | null;
}

function GridEditorBody({ onClose, roles, activeBundles }: GridEditorBodyProps) {
  const draftWidgets = useHubStore((s) => s.draftWidgets);
  const { saveDraft, cancelEdit, addWidget, removeWidget, setDraftWidgets } = useHubActions();

  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  // Slice W1 — "already added" alert. The store fires a
  // `hub:duplicate-widget` event when addWidget rejects a
  // type-level duplicate; the editor listens and surfaces a
  // small toast.
  const [duplicateToast, setDuplicateToast] = useState<string | null>(null);
  useEffect(() => {
    function onDup(e: Event) {
      const detail = (e as CustomEvent<{ type?: string }>).detail;
      const type = detail?.type;
      if (!type) return;
      const def = catalog.find((w) => w.id === type);
      setDuplicateToast(def ? `${def.label} is already on the grid.` : 'Widget already on the grid.');
    }
    window.addEventListener('hub:duplicate-widget', onDup);
    return () => window.removeEventListener('hub:duplicate-widget', onDup);
    // catalog never changes per mount; safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!duplicateToast) return;
    const t = setTimeout(() => setDuplicateToast(null), 2400);
    return () => clearTimeout(t);
  }, [duplicateToast]);
  // Slice P2 — single-click placement: `placeHover` is the cell the
  // pointer is currently over while a widget type is armed; it drives
  // the live preview footprint. Null when not hovering / not armed.
  const [placeHover, setPlaceHover] = useState<{ x: number; y: number } | null>(null);
  // Slice 224 — id of the currently-selected painted widget, or null
  // when nothing is selected. Drives the highlight outline + the
  // delete-key handler.
  const [selectedPlacedId, setSelectedPlacedId] = useState<string | null>(null);
  // Slice 225 — live target dimensions during a corner-drag resize.
  // Null when no resize is in progress. The grid renders the
  // resizing widget using these dimensions while the drag is active.
  // Slice G3/G4 — `previewLayout` carries the push-resolved positions
  // of EVERY widget (the resizing one at its new w/h + every neighbor
  // flowed out of the way) so the surveyor watches the board reflow
  // live as they drag the corner, matching the move-drag preview.
  const [resizeTarget, setResizeTarget] = useState<
    { id: string; w: number; h: number; previewLayout: WidgetInstance[] } | null
  >(null);
  // Slice 9 — live drag-to-move state. `id` names the widget being
  // dragged; `previewLayout` is the result of applyMoveWithPush at
  // the current pointer cell. Render walks this list (when non-null)
  // so the surveyor sees the others shift live without a draftWidgets
  // commit on every pointer tick.
  const [moveDrag, setMoveDrag] = useState<{ id: string; previewLayout: WidgetInstance[] } | null>(null);
  // Slice 10 — handle the drag exposes its cleanup callback so the
  // Esc handler (and a pointer-cancel) can abort the move without
  // touching draftWidgets. The ref is set inside startMove + cleared
  // once the drag ends (commit OR cancel).
  const cancelMoveRef = useRef<(() => void) | null>(null);
  // Slice 11 — id of the widget whose Options panel is currently
  // open. Decoupled from selectedPlacedId so the surveyor can open
  // options without losing the painted-widget selection highlight.
  const [optionsForId, setOptionsForId] = useState<string | null>(null);
  // Slice G2 — id of the widget the pointer is currently over (or
  // null). Drives the per-widget control cluster reveal alongside
  // selection + keyboard focus, so the delete/options/resize buttons
  // pop up on mouse-over and disappear on mouse-leave.
  const [hoveredPlacedId, setHoveredPlacedId] = useState<string | null>(null);
  // Slice G2 — id of the widget that currently holds keyboard focus
  // (or null). Keeps the controls reachable for keyboard + touch users
  // who have no hover state.
  const [focusedPlacedId, setFocusedPlacedId] = useState<string | null>(null);
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => searchInputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Slice 224 — Delete / Backspace removes the selected widget.
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPlacedId) {
        e.preventDefault();
        removeWidget(selectedPlacedId);
        setSelectedPlacedId(null);
        return;
      }
      // Slice G4b — arrow keys nudge the SELECTED widget one cell, with
      // the same dynamic push (applyMoveWithPush) + leading-row trim
      // the pointer drag uses. Window-level so it fires regardless of
      // DOM focus (startMove's pointer-down preventDefault can stop the
      // widget div from focusing on click). Inert while a pointer
      // drag / resize / placement is in flight.
      const ARROW_DELTA: Record<string, { dx: number; dy: number }> = {
        ArrowLeft: { dx: -1, dy: 0 },
        ArrowRight: { dx: 1, dy: 0 },
        ArrowUp: { dx: 0, dy: -1 },
        ArrowDown: { dx: 0, dy: 1 },
      };
      const delta = ARROW_DELTA[e.key];
      // `selectedType` (not the derived `selected`) — a widget is armed
      // for placement; declared before this effect so no TDZ issue.
      if (delta && selectedPlacedId && !moveDrag && !resizeTarget && !selectedType) {
        e.preventDefault();
        const current = useHubStore.getState().draftWidgets ?? [];
        const self = current.find((w) => w.id === selectedPlacedId);
        if (!self) return;
        const nextX = Math.max(0, Math.min(HUB_GRID_COLS - self.w, self.x + delta.dx));
        const nextY = Math.max(0, self.y + delta.dy);
        if (nextX === self.x && nextY === self.y) return;
        const moved = commitDrop(
          current,
          selectedPlacedId,
          { x: nextX, y: nextY, w: self.w, h: self.h },
          HUB_GRID_COLS,
        );
        setDraftWidgets(moved);
        return;
      }
      if (e.key === 'Escape') {
        // Esc cascades through pending states before closing:
        // (0) Slice 10 — mid-drag move cancels first, highest
        //     priority. cancelMoveRef.current() restores the
        //     pre-drag layout (moveDrag → null; draftWidgets was
        //     never mutated during the live drag).
        // (1) Slice P2 — disarm the currently-armed placement type,
        // (2) painted-widget selection, (3) close the editor entirely.
        if (cancelMoveRef.current) {
          e.preventDefault();
          cancelMoveRef.current();
        } else if (selectedType) {
          setSelectedType(null);
          setPlaceHover(null);
        } else if (selectedPlacedId) {
          setSelectedPlacedId(null);
        } else {
          onClose();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, selectedPlacedId, removeWidget, moveDrag, resizeTarget, selectedType, setDraftWidgets]);

  // Slice P2 — reset the hover preview when the surveyor picks a
  // different widget type so a stale cell doesn't leak between
  // selections.
  useEffect(() => {
    setPlaceHover(null);
    // Slice 224 — arming a new widget for placement also drops any
    // existing painted-widget selection so the two modes stay
    // mutually exclusive in the surveyor's mental model.
    setSelectedPlacedId(null);
  }, [selectedType]);

  const catalog = useMemo(() => allWidgets(), []);
  const filtered = useMemo(
    () => filterCatalog(catalog, { roles, activeBundles, search, category: 'all' }),
    [catalog, roles, activeBundles, search],
  );
  const selected = selectedType
    ? catalog.find((w) => w.id === selectedType) ?? null
    : null;

  const placedCount = draftWidgets?.length ?? 0;
  const cellCountUsed = (draftWidgets ?? []).reduce((sum, w) => sum + w.w * w.h, 0);
  const cellCountTotal = GRID_EDITOR_COLS * GRID_EDITOR_ROWS;

  // Slice P2 (grid-editor-single-click-and-8x12) — single-click
  // placement. When a widget type is armed, the preview is that
  // widget's DEFAULT footprint anchored at the cell the pointer is
  // currently over (clamped so it can't hang off the right/bottom
  // edge). A single click drops it there. No more two-click "paint a
  // rectangle" anchor flow — the surveyor resizes after placing via
  // the corner handle. `null` whenever nothing is armed / no cell is
  // hovered yet.
  const previewRect = (() => {
    if (!selected) return null;
    if (!placeHover) return null;
    // Anchor the widget's default size at the hovered cell, clamped to
    // the grid via the same envelope helper (min === default === max
    // here, so it just bounds-checks + shifts back inside the grid).
    const size = selected.defaultSize;
    const raw = { x: placeHover.x, y: placeHover.y, w: size.w, h: size.h };
    return clampRectToEnvelope(raw, size, size);
  })();
  const previewBlocked = previewRect
    ? overlapsAny(previewRect, draftWidgets ?? [])
    : false;

  function handleCellPointerDown(x: number, y: number) {
    if (!selected) {
      // Clicking an empty cell with nothing armed for placement
      // deselects whatever painted widget is currently selected
      // (background-click-to-deselect).
      if (selectedPlacedId) setSelectedPlacedId(null);
      return;
    }
    // Slice P2 — single click drops the armed widget at its default
    // footprint anchored on the clicked cell, as long as it fits
    // without overlapping. Clamp here too so a click that lands before
    // a hover (e.g. keyboard / fast click) still places correctly.
    const size = selected.defaultSize;
    const rect = clampRectToEnvelope({ x, y, w: size.w, h: size.h }, size, size);
    if (overlapsAny(rect, draftWidgets ?? [])) return; // blocked → no-op
    // Slice W1 — type-level guard at the call site too, so the
    // duplicate toast fires immediately and we don't even
    // attempt the addWidget (the store ALSO guards but firing
    // here keeps the UX snappier + handles the case where the
    // user smashes the placement before the React render has
    // cleared `selected`).
    if ((draftWidgets ?? []).some((w) => w.type === selected.id)) {
      if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
        try {
          window.dispatchEvent(new CustomEvent('hub:duplicate-widget', { detail: { type: selected.id } }));
        } catch { /* ignore */ }
      }
      setSelectedType(null);
      setPlaceHover(null);
      return;
    }
    addWidget({
      id: generatePlacementId(),
      type: selected.id,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      customization: { content: selected.defaultContent },
    });
    // Disarm after placing so a stray second click doesn't double-drop.
    // The surveyor re-clicks the palette to add another.
    setSelectedType(null);
    setPlaceHover(null);
  }

  function handleCellPointerEnter(x: number, y: number) {
    // Live preview follows the pointer whenever a widget is armed.
    if (selected) setPlaceHover({ x, y });
  }

  function startResize(
    e: React.PointerEvent<HTMLButtonElement>,
    inst: { id: string; x: number; y: number; w: number; h: number },
  ) {
    e.preventDefault();
    e.stopPropagation();
    const def = catalog.find((w) => w.id === inst.id) ?? null; // unused but kept for symmetry
    void def;
    const widgetDef = catalog.find((w) => w.id === (draftWidgets ?? []).find((dw) => dw.id === inst.id)?.type);
    if (!widgetDef) return;
    const gridEl = gridContainerRef.current;
    if (!gridEl) return;

    const baseLayout = useHubStore.getState().draftWidgets ?? [];
    setResizeTarget({ id: inst.id, w: inst.w, h: inst.h, previewLayout: baseLayout });
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);

    function pointerToCell(clientX: number, clientY: number): { x: number; y: number } {
      const cell = cellUnderPointer(
        gridEl!.getBoundingClientRect(),
        clientX,
        clientY,
        GRID_EDITOR_COLS,
        GRID_EDITOR_ROWS,
      );
      return cell;
    }

    // Slice G4 — compute the pushed layout for a pointer position. The
    // resizing widget keeps its top-left (inst.x/y) and grows toward
    // the pointer via computeResizedRect; applyResizeWithPush then
    // flows overlapped neighbors out of the way in the drag direction.
    function resolve(ev: PointerEvent) {
      const cell = pointerToCell(ev.clientX, ev.clientY);
      const target = computeResizedRect(
        { x: inst.x, y: inst.y, w: inst.w, h: inst.h },
        cell,
        widgetDef!.minSize,
        widgetDef!.maxSize,
      );
      const current = useHubStore.getState().draftWidgets ?? [];
      const pushed = applyResizeWithPush(
        current,
        inst.id,
        { x: inst.x, y: inst.y, w: target.w, h: target.h },
        HUB_GRID_COLS,
      );
      return { target, pushed };
    }

    function handleMove(ev: PointerEvent) {
      const { target, pushed } = resolve(ev);
      setResizeTarget({ id: inst.id, w: target.w, h: target.h, previewLayout: pushed });
    }

    function handleUp(ev: PointerEvent) {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      const { target, pushed } = resolve(ev);
      setResizeTarget(null);
      // No-op when nothing actually changed.
      if (target.w === inst.w && target.h === inst.h) return;
      // Slice G4 — commit the push-resolved layout (neighbors flowed
      // out of the way), then trim a fully-empty top band. No
      // compaction — free placement is preserved. The old "abort if it
      // would overlap a sibling" guard is gone; the push guarantees no
      // overlaps instead of refusing the resize.
      setDraftWidgets(trimLeadingRows(pushed));
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  }

  /** Slice 9 — pointer-driven full-widget move. On pointer-down the
   *  pipeline records the start coordinates but does NOT enter drag
   *  mode until the pointer travels > DRAG_THRESHOLD px, so single
   *  clicks still toggle selection. Once the threshold is exceeded
   *  every pointer-move runs `applyMoveWithPush` against the live
   *  draftWidgets and writes the result into `moveDrag.previewLayout`
   *  — the render path below picks each cell's position from that
   *  list so the other widgets visibly shift while the surveyor
   *  drags. Pointer-up runs `commitDrop` (snap + compact) and writes
   *  the final layout through `setDraftWidgets`. Pointer-cancel /
   *  Escape both fall back to "no move happened" via the
   *  no-didDrag branch. */
  function startMove(
    e: React.PointerEvent<HTMLDivElement>,
    inst: WidgetInstance,
  ) {
    // Skip when the surveyor has a widget armed for placement —
    // clicks in that mode are paint actions, not selection/drag.
    if (selected) return;
    const gridEl = gridContainerRef.current;
    if (!gridEl) return;

    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const DRAG_THRESHOLD_PX = 6;
    let didDrag = false;

    function pointerToCell(clientX: number, clientY: number): { x: number; y: number } {
      return cellUnderPointer(
        gridEl!.getBoundingClientRect(),
        clientX,
        clientY,
        GRID_EDITOR_COLS,
        GRID_EDITOR_ROWS,
      );
    }

    function handleMove(ev: PointerEvent) {
      if (!didDrag) {
        const dx = ev.clientX - startClientX;
        const dy = ev.clientY - startClientY;
        if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
        didDrag = true;
        // Entering drag mode: drop the click-selection so the
        // mid-drag visual treatment isn't competing with the
        // selected-ring outline.
        setSelectedPlacedId(null);
      }
      const cell = pointerToCell(ev.clientX, ev.clientY);
      const target = { x: cell.x, y: cell.y, w: inst.w, h: inst.h };
      const current = useHubStore.getState().draftWidgets ?? [];
      const preview = applyMoveWithPush(current, inst.id, target, HUB_GRID_COLS);
      setMoveDrag({ id: inst.id, previewLayout: preview });
    }

    /** Slice 10 — tear down listeners + drag state without touching
     *  draftWidgets. Used by pointer-cancel, mid-drag Esc, and
     *  drop-outside-the-grid. Safe to call from anywhere (idempotent
     *  via the ref clear). */
    function teardown() {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      cancelMoveRef.current = null;
      setMoveDrag(null);
    }

    function handlePointerCancel(_ev: PointerEvent) {
      teardown();
    }

    function handleUp(ev: PointerEvent) {
      if (!didDrag) {
        // Pure click → toggle selection (matches the pre-Slice-9
        // single-click semantics). Teardown clears moveDrag + the
        // window-level listeners.
        teardown();
        setSelectedPlacedId(selectedPlacedId === inst.id ? null : inst.id);
        return;
      }
      // Slice 10 — drop-outside-the-grid cancels (restores pre-drag
      // layout). The pointer-up firing position is the surveyor's
      // final intent; if they let go outside the painter, treat it
      // like a "nope, never mind".
      const rect = gridEl!.getBoundingClientRect();
      const inside =
        ev.clientX >= rect.left &&
        ev.clientX <= rect.right &&
        ev.clientY >= rect.top &&
        ev.clientY <= rect.bottom;
      if (!inside) {
        teardown();
        return;
      }
      const cell = pointerToCell(ev.clientX, ev.clientY);
      const target = { x: cell.x, y: cell.y, w: inst.w, h: inst.h };
      const current = useHubStore.getState().draftWidgets ?? [];
      const committed = commitDrop(current, inst.id, target, HUB_GRID_COLS);
      teardown();
      setDraftWidgets(committed);
    }

    cancelMoveRef.current = teardown;
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handlePointerCancel);
  }

  /** Slice G2 — per-widget keyboard handler. Enter / Space toggle
   *  selection. Arrow-key movement is handled at the window level (see
   *  the onKey effect) so it works regardless of which element holds
   *  DOM focus — startMove's pointer-down preventDefault can stop the
   *  widget div from focusing on click. */
  function handlePlacedKeyDown(
    e: React.KeyboardEvent<HTMLDivElement>,
    inst: WidgetInstance,
  ) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSelectedPlacedId((cur) => (cur === inst.id ? null : inst.id));
    }
  }

  async function handleSave() {
    await saveDraft();
    onClose();
  }

  function handleCancel() {
    cancelEdit();
    onClose();
  }

  /** grid-editor-auto-format 2026-05-30 — "Auto-format" button: pack
   *  every widget snug against the top-left, preserving the surveyor's
   *  intended row-then-column order (top-left first, bottom-right
   *  last). Widget sizes are kept as-is; only positions move. No-op
   *  when the draft is empty or when the layout is already compact. */
  function handleAutoFormat() {
    const current = draftWidgets ?? [];
    if (current.length === 0) return;
    const compacted = sortAndCompactDraft(current, GRID_EDITOR_COLS);
    // Skip the state update when nothing actually moved so a stray
    // click doesn't churn the undo stack / re-render.
    if (layoutsMatch(current, compacted)) return;
    setDraftWidgets(compacted);
    // Drop any in-flight gesture state so the auto-format result
    // doesn't fight the live preview.
    setMoveDrag(null);
    setResizeTarget(null);
    setPlaceHover(null);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Customize hub layout"
      data-testid="grid-editor"
      style={overlayStyle}
    >
      {/* Slice W1 — duplicate-widget toast. Sits inside the
          overlay so it's visible from any pane. Auto-dismisses
          after 2.4s. */}
      {duplicateToast && (
        <div
          role="alert"
          data-testid="grid-editor-duplicate-toast"
          style={duplicateToastStyle}
        >
          {duplicateToast}
        </div>
      )}
      <div style={modalStyle}>
        <header style={headerStyle}>
          <div>
            <h2 style={titleStyle}>Customize your hub</h2>
            <p style={subtitleStyle}>
              Pick a widget on the left + click an open tile to drop it.
              The 8×12 grid maps directly to your hub canvas.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close customize hub"
            style={closeButtonStyle}
          >
            ×
          </button>
        </header>

        <div style={bodyStyle}>
          {/* ── Palette (left) ──────────────────────────────────────── */}
          <aside aria-label="Widget palette" style={paletteStyle} data-testid="grid-editor-palette">
            <input
              ref={searchInputRef}
              type="search"
              placeholder="Search widgets…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search widgets"
              style={paletteSearchStyle}
            />
            <ul role="listbox" aria-label="Available widgets" style={paletteListStyle}>
              {filtered.length === 0 && (
                <li style={paletteEmptyStyle}>No widgets match.</li>
              )}
              {filtered.map((w) => {
                const isSelected = w.id === selectedType;
                // Slice W1 — paint a "✓ placed" indicator on
                // palette chips whose widget type is already on
                // the grid. The store rejects duplicate-type
                // placements; this is the visual signal so the
                // user knows BEFORE they try.
                const isPlaced = (draftWidgets ?? []).some((dw) => dw.type === w.id);
                const entryStyle = isSelected
                  ? paletteEntryActiveStyle
                  : (isPlaced ? paletteEntryPlacedStyle : paletteEntryStyle);
                return (
                  <li key={w.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={isPlaced && !isSelected}
                      data-placed={isPlaced ? 'true' : undefined}
                      // Slice W2 — drag-and-drop placement. The
                      // chip becomes a native HTML5 drag source;
                      // dragstart arms `selectedType` so the
                      // existing preview lights up and dragover
                      // tracks the cursor cell. Disabled when the
                      // widget is already on the grid.
                      draggable={!isPlaced}
                      onDragStart={isPlaced ? undefined : (e) => {
                        try {
                          e.dataTransfer.effectAllowed = 'copy';
                          e.dataTransfer.setData('application/x-hub-widget-type', w.id);
                          // Fallback for browsers that need text/plain
                          // to enable drag (Firefox in some configs).
                          e.dataTransfer.setData('text/plain', w.id);
                          // grid-editor-polish-2026-06-18 — replace the
                          // default chip-shaped drag ghost with one
                          // sized to the widget's actual grid footprint
                          // (defaultSize × cell px). Surveyor sees an
                          // outlined preview the size the widget will
                          // be once dropped, not a tiny chip. Falls
                          // back silently to the default ghost when
                          // we can't measure (grid hasn't laid out
                          // yet, headless test envs, etc.).
                          const gridEl = gridContainerRef.current;
                          if (gridEl && typeof document !== 'undefined') {
                            const rect = gridEl.getBoundingClientRect();
                            const cellW = rect.width / GRID_EDITOR_COLS;
                            const cellH = rect.height / GRID_EDITOR_ROWS;
                            const ghostW = Math.max(80, Math.round(cellW * w.defaultSize.w));
                            const ghostH = Math.max(60, Math.round(cellH * w.defaultSize.h));
                            const ghost = document.createElement('div');
                            ghost.textContent = `${w.label} · ${w.defaultSize.w}×${w.defaultSize.h}`;
                            ghost.setAttribute('aria-hidden', 'true');
                            ghost.style.cssText = [
                              'position:fixed', 'top:-10000px', 'left:-10000px',
                              `width:${ghostW}px`, `height:${ghostH}px`,
                              'box-sizing:border-box',
                              'border:2px dashed var(--theme-accent, #3b82f6)',
                              'border-radius:10px',
                              'background:color-mix(in srgb, var(--theme-accent, #3b82f6) 18%, transparent)',
                              'color:var(--theme-fg-primary, #111827)',
                              'font:600 0.85rem/1.2 ui-sans-serif, system-ui, sans-serif',
                              'display:flex', 'align-items:center', 'justify-content:center',
                              'padding:6px 10px', 'text-align:center',
                              'pointer-events:none',
                            ].join(';');
                            document.body.appendChild(ghost);
                            // drag-anchor-fix-2026-06-18 — anchor the
                            // ghost to its TOP-LEFT so the widget
                            // preview matches the cell where the
                            // placed widget's top-left actually
                            // lands. The previous (ghostW/2, ghostH/2)
                            // anchor centered the ghost on the cursor,
                            // but `cellUnderPointer` resolves the
                            // cursor cell to the widget's top-left,
                            // so the placed widget appeared shifted
                            // down-right relative to the ghost.
                            e.dataTransfer.setDragImage(ghost, 0, 0);
                            // Clean up after the browser snapshots
                            // the element (next tick is enough).
                            setTimeout(() => { try { ghost.remove(); } catch { /* ignore */ } }, 0);
                          }
                        } catch { /* setData / setDragImage can throw on weird shells */ }
                        setSelectedType(w.id);
                      }}
                      onDragEnd={() => {
                        // Clear arming after a failed drop (drop
                        // outside the grid). A successful drop on
                        // the grid already disarms via
                        // handleCellPointerDown.
                        setSelectedType((cur) => (cur === w.id ? null : cur));
                        setPlaceHover(null);
                      }}
                      onClick={() => {
                        if (isPlaced && !isSelected) {
                          if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
                            try {
                              window.dispatchEvent(new CustomEvent('hub:duplicate-widget', { detail: { type: w.id } }));
                            } catch { /* ignore */ }
                          }
                          return;
                        }
                        setSelectedType(isSelected ? null : w.id);
                      }}
                      style={entryStyle}
                      data-widget-type={w.id}
                      data-testid={`grid-editor-palette-entry-${w.id}`}
                      // grid-editor-polish-2026-06-18 — palette hover
                      // tooltip surfaces the widget's own description
                      // (1-3 sentences) so the surveyor reads what the
                      // tile does before placing it. Native `title`
                      // shows on hover with no extra DOM cost. The
                      // already-placed badge stays in the trailer.
                      title={`${w.label} — ${w.description}${isPlaced ? '\n\n✓ Already on the grid' : ''}`}
                    >
                      <span style={paletteEntryLabelStyle}>
                        {isPlaced ? '✓ ' : ''}{w.label}
                      </span>
                      <span style={paletteEntryHintStyle}>
                        {w.defaultSize.w}×{w.defaultSize.h}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* ── 8×12 Grid (right) ────────────────────────────────────── */}
          <section aria-label="Hub grid" style={gridWrapperStyle}>
            <div
              ref={gridContainerRef}
              style={selected ? gridContainerPlacingStyle : gridContainerStyle}
              data-testid="grid-editor-grid"
              data-placing={selected ? 'true' : 'false'}
              // grid-editor-placement-polish 2026-05-30 — when a
              // widget type is armed, track the cursor at container
              // level using `cellUnderPointer`. That way the preview
              // follows the pointer continuously (no missed cells on
              // fast moves) AND it keeps tracking when the cursor
              // crosses over a placed widget (whose own pointer
              // handlers would otherwise swallow the cell-level
              // events). Click-to-place is mirrored here so a click
              // on top of a placed widget reaches the placement logic
              // (which then no-ops on overlap) instead of starting a
              // move-drag on the widget under it.
              onPointerMove={selected ? (ev) => {
                const el = gridContainerRef.current;
                if (!el) return;
                const cell = cellUnderPointer(
                  el.getBoundingClientRect(),
                  ev.clientX,
                  ev.clientY,
                );
                setPlaceHover((cur) =>
                  cur && cur.x === cell.x && cur.y === cell.y ? cur : cell,
                );
              } : undefined}
              onPointerDown={selected ? (ev) => {
                const el = gridContainerRef.current;
                if (!el) return;
                const cell = cellUnderPointer(
                  el.getBoundingClientRect(),
                  ev.clientX,
                  ev.clientY,
                );
                ev.stopPropagation();
                handleCellPointerDown(cell.x, cell.y);
              } : undefined}
              onPointerLeave={selected ? () => setPlaceHover(null) : undefined}
              // Slice W2 — drag-and-drop placement. dragover
              // updates the preview cell + signals a valid drop
              // target via dropEffect; drop resolves to a
              // placement at the cursor's cell via the existing
              // handleCellPointerDown.
              onDragOver={(ev) => {
                if (!ev.dataTransfer.types.includes('application/x-hub-widget-type')) return;
                ev.preventDefault();
                ev.dataTransfer.dropEffect = 'copy';
                const el = gridContainerRef.current;
                if (!el) return;
                const cell = cellUnderPointer(
                  el.getBoundingClientRect(),
                  ev.clientX,
                  ev.clientY,
                );
                setPlaceHover((cur) =>
                  cur && cur.x === cell.x && cur.y === cell.y ? cur : cell,
                );
              }}
              onDrop={(ev) => {
                const type = ev.dataTransfer.getData('application/x-hub-widget-type')
                  || ev.dataTransfer.getData('text/plain');
                if (!type) return;
                ev.preventDefault();
                ev.stopPropagation();
                const el = gridContainerRef.current;
                if (!el) return;
                const cell = cellUnderPointer(
                  el.getBoundingClientRect(),
                  ev.clientX,
                  ev.clientY,
                );
                // Resolve the widget definition from the catalog
                // by the dropped type. This sidesteps `selected`
                // (which reads stale via closure inside drop
                // handlers) and goes straight to the placement
                // math with everything we need.
                const def = catalog.find((w) => w.id === type);
                if (!def) return;
                // Type-level dup guard: fire the toast + bail.
                if ((draftWidgets ?? []).some((w) => w.type === type)) {
                  if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
                    try {
                      window.dispatchEvent(new CustomEvent('hub:duplicate-widget', { detail: { type } }));
                    } catch { /* ignore */ }
                  }
                  setSelectedType(null);
                  setPlaceHover(null);
                  return;
                }
                const size = def.defaultSize;
                const rect = clampRectToEnvelope({ x: cell.x, y: cell.y, w: size.w, h: size.h }, size, size);
                if (overlapsAny(rect, draftWidgets ?? [])) {
                  // Drop overlaps an existing widget — disarm + clear preview.
                  setSelectedType(null);
                  setPlaceHover(null);
                  return;
                }
                addWidget({
                  id: generatePlacementId(),
                  type,
                  x: rect.x,
                  y: rect.y,
                  w: rect.w,
                  h: rect.h,
                  customization: { content: def.defaultContent },
                });
                setSelectedType(null);
                setPlaceHover(null);
              }}
              onDragLeave={() => setPlaceHover(null)}
            >
              {Array.from({ length: GRID_EDITOR_ROWS * GRID_EDITOR_COLS }).map((_, idx) => {
                const x = idx % GRID_EDITOR_COLS;
                const y = Math.floor(idx / GRID_EDITOR_COLS);
                // grid-editor-pointer-fix 2026-05-30 — pin each cell
                // to its logical (x, y) via explicit gridColumn /
                // gridRow. Without this, the 96 cells auto-flow and
                // skip past the explicit-positioned widgets, so the
                // cell labelled `data-grid-x=0` ends up rendered
                // wherever the auto-placement algorithm could fit it
                // (usually far below the visible widgets). That makes
                // `onPointerEnter(x, y)` fire with coordinates that
                // don't match the visual cell the cursor is over →
                // the placement preview teleports to a stale earlier
                // cell instead of following the cursor.
                const cellStyle: React.CSSProperties = {
                  ...(selected ? gridCellArmedStyle : gridCellStyle),
                  gridColumn: `${x + 1} / span 1`,
                  gridRow: `${y + 1} / span 1`,
                };
                return (
                  <div
                    key={`${x}-${y}`}
                    style={cellStyle}
                    data-grid-x={x}
                    data-grid-y={y}
                    aria-label={`Grid cell ${x + 1}, ${y + 1}`}
                    role={selected ? 'button' : undefined}
                    tabIndex={selected ? 0 : undefined}
                    onPointerDown={() => handleCellPointerDown(x, y)}
                    onPointerEnter={selected ? () => handleCellPointerEnter(x, y) : undefined}
                  />
                );
              })}

              {/* Slice 223 — preview rectangle the surveyor is currently
                  painting. Solid accent outline when the placement is
                  viable; danger outline when it would collide. */}
              {previewRect && (
                <div
                  aria-hidden
                  data-testid="grid-editor-preview"
                  data-blocked={previewBlocked ? 'true' : 'false'}
                  style={{
                    ...(previewBlocked ? previewBlockedStyle : previewStyle),
                    gridColumn: `${previewRect.x + 1} / span ${previewRect.w}`,
                    gridRow: `${previewRect.y + 1} / span ${previewRect.h}`,
                  }}
                />
              )}

              {/* Render every placed widget as a labelled block.
                  Slice 9 — when a move-drag is active, look up each
                  widget's live x/y in `moveDrag.previewLayout` so the
                  cascade-pushed siblings shift visibly while the
                  surveyor drags. The dragged widget itself is the one
                  whose id matches `moveDrag.id`. */}
              {(draftWidgets ?? []).map((inst) => {
                const def = catalog.find((w) => w.id === inst.type);
                const label = def?.label ?? inst.type;
                const isSelected = selectedPlacedId === inst.id;
                const isResizing = resizeTarget?.id === inst.id;
                const isMoving = moveDrag?.id === inst.id;
                // Live geometry source-of-truth while a gesture is in
                // flight:
                //   - resize (Slice G4): resizeTarget.previewLayout
                //     holds the push-resolved positions of EVERY widget
                //     (the resizing one at its new w/h + neighbors
                //     flowed out of the way), so all cells shift live.
                //   - move (Slice 9): moveDrag.previewLayout holds the
                //     cascade-pushed positions.
                // Falls back to the widget's committed x/y/w/h at rest.
                const resizeSlot = resizeTarget?.previewLayout.find((w) => w.id === inst.id);
                const moveSlot = moveDrag?.previewLayout.find((w) => w.id === inst.id);
                const liveSlot = resizeSlot ?? moveSlot;
                const liveX = liveSlot?.x ?? inst.x;
                const liveY = liveSlot?.y ?? inst.y;
                const liveW = liveSlot?.w ?? inst.w;
                const liveH = liveSlot?.h ?? inst.h;
                // Slice G2 — controls reveal on hover OR selection OR
                // keyboard focus. Suppressed for every widget while a
                // drag/resize is in flight so the cluster doesn't
                // flicker under the cursor mid-gesture.
                const aGestureActive = moveDrag !== null || resizeTarget !== null;
                const controlsVisible =
                  !aGestureActive &&
                  (hoveredPlacedId === inst.id ||
                    isSelected ||
                    focusedPlacedId === inst.id);
                return (
                  <div
                    key={inst.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${label} at ${liveX + 1}, ${liveY + 1}`}
                    aria-pressed={isSelected}
                    data-testid="grid-editor-placed-widget"
                    data-widget-id={inst.id}
                    data-selected={isSelected ? 'true' : 'false'}
                    data-resizing={isResizing ? 'true' : 'false'}
                    data-moving={isMoving ? 'true' : 'false'}
                    data-controls-visible={controlsVisible ? 'true' : 'false'}
                    onPointerDown={(e) => {
                      // grid-editor-placement-polish 2026-05-30 — when
                      // a widget type is armed for placement, ignore
                      // pointer-down on placed widgets and let the
                      // event bubble to the container's placement
                      // handler. Result: click-to-place always wins
                      // (blocked clicks still no-op on overlap; they
                      // just don't accidentally start a move-drag of
                      // whatever widget is under the cursor).
                      if (selected) return;
                      // Slice 224 — stop the pointer-down from
                      // bubbling to the cell underneath so click-to-
                      // select doesn't double as a placement anchor.
                      // Slice 9 — startMove handles both click-toggle
                      // and drag-with-reflow now (threshold-gated).
                      startMove(e, inst);
                    }}
                    onPointerEnter={() => setHoveredPlacedId(inst.id)}
                    onPointerLeave={() =>
                      setHoveredPlacedId((cur) => (cur === inst.id ? null : cur))
                    }
                    onFocus={() => setFocusedPlacedId(inst.id)}
                    onBlur={() =>
                      setFocusedPlacedId((cur) => (cur === inst.id ? null : cur))
                    }
                    onKeyDown={(e) => handlePlacedKeyDown(e, inst)}
                    style={{
                      ...(isSelected ? placedWidgetSelectedStyle : placedWidgetStyle),
                      gridColumn: `${liveX + 1} / span ${liveW}`,
                      gridRow: `${liveY + 1} / span ${liveH}`,
                      // Slice 9 — lift the dragged widget above its
                      // settling neighbours via a small z-index so the
                      // cursor's "this is what I'm holding" anchor
                      // reads clearly.
                      ...(isMoving ? { zIndex: 5, cursor: 'grabbing' } : null),
                      // Skip the smooth-transition while moving so
                      // the preview tracks the pointer crisply.
                      transition: isMoving ? 'none' : undefined,
                    }}
                  >
                    <span style={placedLabelStyle}>{label}</span>
                    {/* grid-editor-polish-2026-06-18 — the size badge
                        (e.g. "4×3") used to render permanently next
                        to the name, swallowing the label on short
                        widgets. Only surface it while a gesture is
                        actively in flight (resize or move) so the
                        surveyor sees live feedback during the drag;
                        at rest the name wins. */}
                    {(isResizing || isMoving) && (
                      <span style={placedSizeStyle} data-testid="grid-editor-placed-size">
                        {liveW}×{liveH}
                      </span>
                    )}
                    {controlsVisible && (
                      <>
                        <button
                          type="button"
                          aria-label="Remove widget from layout"
                          title="Remove widget (Delete)"
                          data-testid="grid-editor-placed-remove"
                          onPointerDown={(e) => { e.stopPropagation(); }}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeWidget(inst.id);
                            setSelectedPlacedId(null);
                          }}
                          style={placedRemoveButtonStyle}
                        >
                          ✕
                        </button>
                        {/* Slice 11 — per-widget options trigger.
                            Opens the WidgetOptionsPanel below. */}
                        <button
                          type="button"
                          aria-label="Widget options"
                          title="Options"
                          data-testid="grid-editor-placed-options"
                          onPointerDown={(e) => { e.stopPropagation(); }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOptionsForId(inst.id);
                          }}
                          style={placedOptionsButtonStyle}
                        >
                          <span aria-hidden style={optionsGlyphStyle}>⚙</span>
                        </button>
                        {/* Slice 225 — corner drag handle. */}
                        <button
                          type="button"
                          aria-label={`Resize widget. Current ${liveW} by ${liveH}.`}
                          title="Drag to resize"
                          data-testid="grid-editor-placed-resize"
                          onPointerDown={(e) => startResize(e, inst)}
                          style={placedResizeHandleStyle}
                        >
                          <span aria-hidden style={resizeGlyphStyle}>⤡</span>
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <footer style={footerStyle}>
          <div style={statusStyle} data-testid="grid-editor-status">
            <span>
              <strong>{placedCount}</strong> widget{placedCount === 1 ? '' : 's'} ·{' '}
              <strong>{cellCountUsed}</strong>/{cellCountTotal} cells used
            </span>
            {selected && (
              <span style={selectedPillStyle} data-testid="grid-editor-selected-pill">
                Selected: {selected.label}
              </span>
            )}
          </div>
          <div style={footerActionsStyle}>
            <button
              type="button"
              onClick={handleAutoFormat}
              style={autoFormatButtonStyle}
              data-testid="grid-editor-auto-format"
              disabled={placedCount === 0}
              title="Pack widgets snug against the top-left, preserving order"
            >
              ✨ Auto-format
            </button>
            <button type="button" onClick={handleCancel} style={cancelButtonStyle}>
              Cancel
            </button>
            <button type="button" onClick={handleSave} style={saveButtonStyle}>
              Save layout
            </button>
          </div>
        </footer>
      </div>
      {/* Slice 11 — per-widget options panel. Renders only when a
          widget's ⚙ Options button has been clicked. Self-contained:
          reads the live instance from the hub store + writes edits
          through patchWidgetCustomization / setDraftWidgets. */}
      <WidgetOptionsPanel
        open={optionsForId !== null}
        instanceId={optionsForId}
        onClose={() => setOptionsForId(null)}
      />
    </div>
  );
}

// ─── Helpers (exported for tests) ─────────────────────────────────────

export interface PlacementRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Slice 223 — derive the (x, y, w, h) rectangle between two click
 *  anchors. Either click order produces the same rectangle (the
 *  surveyor can paint top-left → bottom-right OR bottom-right →
 *  top-left). Coordinates are clamped to the grid bounds. */
export function rectFromAnchors(
  a: { x: number; y: number },
  b: { x: number; y: number },
  cols: number = GRID_EDITOR_COLS,
  rows: number = GRID_EDITOR_ROWS,
): PlacementRect {
  const x1 = Math.max(0, Math.min(cols - 1, Math.min(a.x, b.x)));
  const x2 = Math.max(0, Math.min(cols - 1, Math.max(a.x, b.x)));
  const y1 = Math.max(0, Math.min(rows - 1, Math.min(a.y, b.y)));
  const y2 = Math.max(0, Math.min(rows - 1, Math.max(a.y, b.y)));
  return { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 };
}

/** Clamp a raw placement rect to the widget's minSize / maxSize
 *  envelope. Grows from the top-left so the anchor cell always
 *  stays inside the final rectangle. */
export function clampRectToEnvelope(
  rect: PlacementRect,
  minSize: { w: number; h: number },
  maxSize: { w: number; h: number },
  cols: number = GRID_EDITOR_COLS,
  rows: number = GRID_EDITOR_ROWS,
): PlacementRect {
  const w = Math.max(minSize.w, Math.min(maxSize.w, rect.w));
  const h = Math.max(minSize.h, Math.min(maxSize.h, rect.h));
  // Clamp so the widget still fits inside the grid.
  const x = Math.max(0, Math.min(cols - w, rect.x));
  const y = Math.max(0, Math.min(rows - h, rect.y));
  return { x, y, w, h };
}

/** Slice 223 — true when `a` overlaps any rect in `others`. The
 *  same rectangle-overlap formula used by `grid-math.compactLayout`. */
export function overlapsAny(
  a: PlacementRect,
  others: ReadonlyArray<{ x: number; y: number; w: number; h: number }>,
): boolean {
  for (const b of others) {
    const overlap =
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y;
    if (overlap) return true;
  }
  return false;
}

/** Generate a stable id for a freshly-placed widget instance. Uses
 *  `crypto.randomUUID` when available, with a `Date.now` +
 *  `Math.random` fallback for older runtimes. Slice 223 — extracted
 *  so the test suite can stub it without touching the global. */
export function generatePlacementId(): string {
  if (typeof globalThis !== 'undefined'
    && typeof (globalThis as { crypto?: Crypto }).crypto?.randomUUID === 'function') {
    return (globalThis as { crypto: Crypto }).crypto.randomUUID();
  }
  return `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Pure: given a draft widget list, compute the count of grid cells
 *  consumed. Useful for the status indicator + future "doesn't fit"
 *  validation. */
export function cellsUsed(widgets: Array<{ w: number; h: number }>): number {
  return widgets.reduce((s, w) => s + Math.max(1, w.w) * Math.max(1, w.h), 0);
}

/** grid-editor-auto-format 2026-05-30 — sort widgets by reading
 *  order (y, then x) and pack them snug against (0, 0). Preserves
 *  the surveyor's intent (top-left widgets stay near the top-left)
 *  while removing all gaps. Pure / exported for tests. */
export function sortAndCompactDraft(
  widgets: ReadonlyArray<WidgetInstance>,
  cols: number = GRID_EDITOR_COLS,
): WidgetInstance[] {
  const sorted = [...widgets].sort((a, b) =>
    a.y !== b.y ? a.y - b.y :
    a.x !== b.x ? a.x - b.x :
    0,
  );
  return compactLayout(sorted, cols);
}

/** True when two layouts have the same widgets in the same positions /
 *  sizes (id-keyed comparison; ignores ordering). Used to short-circuit
 *  the auto-format state update when nothing would change. */
export function layoutsMatch(
  a: ReadonlyArray<WidgetInstance>,
  b: ReadonlyArray<WidgetInstance>,
): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((w) => [w.id, w]));
  for (const aw of a) {
    const bw = byId.get(aw.id);
    if (!bw) return false;
    if (aw.x !== bw.x || aw.y !== bw.y || aw.w !== bw.w || aw.h !== bw.h) return false;
  }
  return true;
}

/** Slice 225 — compute the grid cell the pointer is currently over,
 *  given the grid container's bounding rect. Used by the corner-drag
 *  resize so the user can drag past the grid edge without producing
 *  off-grid coordinates. Pure / no DOM access. */
export function cellUnderPointer(
  bounds: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
  cols: number = GRID_EDITOR_COLS,
  rows: number = GRID_EDITOR_ROWS,
): { x: number; y: number } {
  const cellW = bounds.width / cols;
  const cellH = bounds.height / rows;
  const rawX = Math.floor((clientX - bounds.left) / Math.max(1, cellW));
  const rawY = Math.floor((clientY - bounds.top) / Math.max(1, cellH));
  return {
    x: Math.max(0, Math.min(cols - 1, rawX)),
    y: Math.max(0, Math.min(rows - 1, rawY)),
  };
}

/** Slice 225 — derive the new rectangle for a widget being resized
 *  by dragging its bottom-right corner. The anchor cell stays at
 *  the existing (x, y); the new width + height are read from the
 *  cell currently under the pointer + clamped to the widget's
 *  envelope (and the grid bounds). */
export function computeResizedRect(
  current: PlacementRect,
  pointerCell: { x: number; y: number },
  minSize: { w: number; h: number },
  maxSize: { w: number; h: number },
  cols: number = GRID_EDITOR_COLS,
  rows: number = GRID_EDITOR_ROWS,
): PlacementRect {
  const rawW = pointerCell.x - current.x + 1;
  const rawH = pointerCell.y - current.y + 1;
  const w = Math.max(minSize.w, Math.min(maxSize.w, Math.min(cols - current.x, rawW)));
  const h = Math.max(minSize.h, Math.min(maxSize.h, Math.min(rows - current.y, rawH)));
  return { x: current.x, y: current.y, w, h };
}

// ─── Style fragments ─────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'color-mix(in srgb, var(--theme-bg-page, #0b1320) 75%, transparent)',
  zIndex: 80,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
};

const modalStyle: React.CSSProperties = {
  width: 'min(1280px, 100%)',
  height: 'min(90vh, 920px)',
  background: 'var(--theme-bg-surface, #ffffff)',
  color: 'var(--theme-fg-primary, #0f1419)',
  borderRadius: 14,
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 24px 60px rgba(0,0,0,0.32)',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  padding: '20px 24px 16px',
  borderBottom: '1px solid var(--theme-border, #e5e7eb)',
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '1.35rem',
  fontWeight: 700,
  letterSpacing: -0.01,
};

const subtitleStyle: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: '0.9rem',
  color: 'var(--theme-fg-secondary, #4b5563)',
  maxWidth: '60ch',
};

const closeButtonStyle: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  fontSize: '1.5rem',
  lineHeight: 1,
  color: 'var(--theme-fg-secondary, #4b5563)',
  cursor: 'pointer',
  padding: 4,
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  display: 'grid',
  gridTemplateColumns: '280px 1fr',
  gap: 0,
  minHeight: 0,
};

const paletteStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  borderRight: '1px solid var(--theme-border, #e5e7eb)',
  background: 'var(--theme-bg-page, #f7f9fb)',
  minHeight: 0,
};

const paletteSearchStyle: React.CSSProperties = {
  margin: '16px 16px 8px',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--theme-border, #e5e7eb)',
  background: 'var(--theme-bg-surface, #ffffff)',
  fontSize: '0.9rem',
};

const paletteListStyle: React.CSSProperties = {
  margin: 0,
  padding: '4px 8px 16px',
  listStyle: 'none',
  overflowY: 'auto',
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const paletteEmptyStyle: React.CSSProperties = {
  padding: '12px 8px',
  fontSize: '0.85rem',
  color: 'var(--theme-fg-secondary, #4b5563)',
};

const paletteEntryStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid transparent',
  background: 'transparent',
  color: 'inherit',
  textAlign: 'left',
  fontSize: '0.9rem',
  cursor: 'pointer',
};

const paletteEntryActiveStyle: React.CSSProperties = {
  ...paletteEntryStyle,
  background: 'var(--theme-accent, #3b82f6)',
  color: 'var(--theme-accent-fg, #ffffff)',
  borderColor: 'var(--theme-accent, #3b82f6)',
};

// Slice W1 — palette entry style for widgets already on the
// grid. Soft green hue + a green outline so the user can see at
// a glance which widgets are in use without losing affordance
// (the chip is still clickable; the click fires the
// "already added" alert).
const paletteEntryPlacedStyle: React.CSSProperties = {
  ...paletteEntryStyle,
  background: 'color-mix(in srgb, #10B981 12%, transparent)',
  borderColor: '#10B981',
  color: 'var(--theme-fg-secondary, #4b5563)',
  cursor: 'not-allowed',
};

// Slice W1 — duplicate-widget toast pinned to the top of the
// editor overlay so the user sees the "already added" message
// even if they're scrolled inside the grid.
const duplicateToastStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'var(--hub-spc-4, 16px)',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 1100,
  padding: '8px 14px',
  borderRadius: 8,
  background: '#0f1419',
  color: '#ffffff',
  fontSize: '0.85rem',
  fontWeight: 600,
  boxShadow: '0 10px 28px rgba(15, 23, 42, 0.35)',
};

const paletteEntryLabelStyle: React.CSSProperties = {
  fontWeight: 600,
};

const paletteEntryHintStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  opacity: 0.7,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

const gridWrapperStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  minHeight: 0,
  overflow: 'auto',
};

const gridContainerStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: `repeat(${GRID_EDITOR_COLS}, minmax(0, 1fr))`,
  gridTemplateRows: `repeat(${GRID_EDITOR_ROWS}, minmax(0, 1fr))`,
  gap: 6,
  // 8 wide × 12 tall → portrait. Bound by height so all 12 rows fit
  // the modal body; the width follows the 8/12 aspect ratio. Capped
  // width keeps it from getting absurdly wide on tall viewports.
  height: 'min(100%, 1020px)',
  maxWidth: '100%',
  aspectRatio: '8 / 12',
  padding: 8,
  border: '1px solid var(--theme-border, #e5e7eb)',
  borderRadius: 12,
  background: 'var(--theme-bg-page, #f7f9fb)',
};

const gridCellStyle: React.CSSProperties = {
  background: 'var(--theme-bg-surface, #ffffff)',
  border: '1px dashed var(--theme-border, #e5e7eb)',
  borderRadius: 6,
};

/** Slice 223 — when a widget is armed for placement, every cell
 *  becomes a click target so the surveyor can paint a rectangle. */
const gridCellArmedStyle: React.CSSProperties = {
  ...gridCellStyle,
  cursor: 'crosshair',
  background: 'color-mix(in srgb, var(--theme-accent, #3b82f6) 6%, var(--theme-bg-surface, #ffffff))',
};

const gridContainerPlacingStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: `repeat(${GRID_EDITOR_COLS}, minmax(0, 1fr))`,
  gridTemplateRows: `repeat(${GRID_EDITOR_ROWS}, minmax(0, 1fr))`,
  gap: 6,
  height: 'min(100%, 1020px)',
  maxWidth: '100%',
  aspectRatio: '8 / 12',
  padding: 8,
  border: '1px solid var(--theme-accent, #3b82f6)',
  borderRadius: 12,
  background: 'var(--theme-bg-page, #f7f9fb)',
  boxShadow: '0 0 0 3px color-mix(in srgb, var(--theme-accent, #3b82f6) 18%, transparent)',
};

const previewStyle: React.CSSProperties = {
  border: '2px dashed var(--theme-accent, #3b82f6)',
  borderRadius: 8,
  background: 'color-mix(in srgb, var(--theme-accent, #3b82f6) 14%, transparent)',
  pointerEvents: 'none',
};

const previewBlockedStyle: React.CSSProperties = {
  ...previewStyle,
  border: '2px dashed var(--theme-danger, #ef4444)',
  background: 'color-mix(in srgb, var(--theme-danger, #ef4444) 14%, transparent)',
};

const placedWidgetStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  padding: 6,
  borderRadius: 8,
  background: 'color-mix(in srgb, var(--theme-accent, #3b82f6) 22%, transparent)',
  border: '2px solid var(--theme-accent, #3b82f6)',
  color: 'var(--theme-fg-primary, #0f1419)',
  fontSize: '0.85rem',
  fontWeight: 600,
  textAlign: 'center',
  minWidth: 0,
  overflow: 'hidden',
  cursor: 'pointer',
  // Slice 224 — placed widgets sit above the cell layer so click-to-
  // select wins over the cell's placement handler.
  position: 'relative',
  zIndex: 1,
  transition: 'box-shadow 120ms ease, transform 120ms ease',
};

/** Slice 224 — Selected painted widget: thicker accent ring + lift +
 *  brighter fill so the user can see at a glance which widget the
 *  Delete key will remove. */
const placedWidgetSelectedStyle: React.CSSProperties = {
  ...placedWidgetStyle,
  background: 'color-mix(in srgb, var(--theme-accent, #3b82f6) 32%, transparent)',
  border: '3px solid var(--theme-accent, #3b82f6)',
  boxShadow: '0 6px 18px rgba(0, 0, 0, 0.22), 0 0 0 4px color-mix(in srgb, var(--theme-accent, #3b82f6) 22%, transparent)',
  transform: 'translateY(-1px)',
  zIndex: 2,
};

/** Slice 225 — Corner-drag resize handle, only rendered while a
 *  painted widget is selected. Same accent surface + ⤡ glyph as
 *  the canvas's WidgetResizeHandle so the surveyor's muscle memory
 *  transfers between the editor + the live grid. */
const placedResizeHandleStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 4,
  right: 4,
  width: 24,
  height: 24,
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
  border: 'none',
  background: 'var(--theme-accent, #3b82f6)',
  color: 'var(--theme-accent-fg, #ffffff)',
  cursor: 'nwse-resize',
  fontSize: '0.8rem',
  fontWeight: 700,
  lineHeight: 1,
  boxShadow: '0 1px 3px rgba(0,0,0,0.22)',
  zIndex: 3,
};

const resizeGlyphStyle: React.CSSProperties = {
  transform: 'rotate(90deg)',
  display: 'inline-block',
};

/** Slice 11 — ⚙ options button. Top-right of the painted widget,
 *  visually distinct from the resize handle so the surveyor reads
 *  "config" instead of "drag to grow". */
const placedOptionsButtonStyle: React.CSSProperties = {
  position: 'absolute',
  top: 4,
  right: 32,
  width: 24,
  height: 24,
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-elevated)',
  color: 'var(--theme-fg-primary)',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: 600,
  lineHeight: 1,
  boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
  zIndex: 3,
};

const optionsGlyphStyle: React.CSSProperties = {
  display: 'inline-block',
};

/** Slice 224 — Per-widget delete button. Sits inside the painted
 *  block at the top-right; only renders while the widget is
 *  selected. */
const placedRemoveButtonStyle: React.CSSProperties = {
  position: 'absolute',
  top: 4,
  right: 4,
  width: 24,
  height: 24,
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
  border: 'none',
  background: 'var(--theme-danger, #ef4444)',
  color: '#ffffff',
  fontWeight: 700,
  fontSize: '0.8rem',
  lineHeight: 1,
  cursor: 'pointer',
  boxShadow: '0 1px 3px rgba(0,0,0,0.22)',
  zIndex: 3,
};

const placedLabelStyle: React.CSSProperties = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '100%',
};

const placedSizeStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  fontWeight: 500,
  opacity: 0.85,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  padding: '14px 24px',
  borderTop: '1px solid var(--theme-border, #e5e7eb)',
  background: 'var(--theme-bg-page, #f7f9fb)',
};

const statusStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  fontSize: '0.9rem',
  color: 'var(--theme-fg-secondary, #4b5563)',
};

const selectedPillStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 999,
  background: 'var(--theme-accent, #3b82f6)',
  color: 'var(--theme-accent-fg, #ffffff)',
  fontSize: '0.8rem',
  fontWeight: 600,
};

const footerActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
};

const cancelButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  border: '1px solid var(--theme-border, #e5e7eb)',
  background: 'transparent',
  color: 'inherit',
  fontSize: '0.9rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const autoFormatButtonStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid var(--theme-accent, #3b82f6)',
  background: 'color-mix(in srgb, var(--theme-accent, #3b82f6) 10%, transparent)',
  color: 'var(--theme-accent, #3b82f6)',
  fontSize: '0.9rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const saveButtonStyle: React.CSSProperties = {
  padding: '8px 18px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--gradient-green, #10b981)',
  color: '#ffffff',
  fontSize: '0.95rem',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.28)',
};
