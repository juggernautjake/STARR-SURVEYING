'use client';
// lib/hub/components/GridEditor.tsx
//
// Grid-painter widget editor. Opens as a full-screen modal when the
// surveyor wants direct manipulation: pick a widget type from the
// left palette, click on the 8×8 grid to paint it, see every
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

export const GRID_EDITOR_COLS = 8;
export const GRID_EDITOR_ROWS = 8;

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
  // Slice 223 — two-click placement: anchor = first cell clicked,
  // hover = currently-hovered cell that drives the preview rectangle.
  // Both are null when not placing.
  const [placeAnchor, setPlaceAnchor] = useState<{ x: number; y: number } | null>(null);
  const [placeHover, setPlaceHover] = useState<{ x: number; y: number } | null>(null);
  // Slice 224 — id of the currently-selected painted widget, or null
  // when nothing is selected. Drives the highlight outline + the
  // delete-key handler.
  const [selectedPlacedId, setSelectedPlacedId] = useState<string | null>(null);
  // Slice 225 — live target dimensions during a corner-drag resize.
  // Null when no resize is in progress. The grid renders the
  // selected widget using these dimensions while the drag is active
  // so the surveyor sees the candidate footprint immediately.
  const [resizeTarget, setResizeTarget] = useState<{ id: string; w: number; h: number } | null>(null);
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
      if (e.key === 'Escape') {
        // Esc cascades through pending states before closing:
        // (1) mid-place rectangle, (2) painted-widget selection,
        // (3) close the editor entirely.
        if (placeAnchor) {
          setPlaceAnchor(null);
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
  }, [onClose, placeAnchor, selectedPlacedId, removeWidget]);

  // Slice 223 — cancel placement when the surveyor picks a different
  // widget type so the partial anchor doesn't leak between selections.
  useEffect(() => {
    setPlaceAnchor(null);
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

  // Slice 223 — preview rectangle the surveyor is currently painting.
  // Derived as `null` whenever placement isn't viable; the render
  // path uses it for the ghost outline + the click-2 handler uses it
  // as the committed footprint.
  const previewRect = (() => {
    if (!selected) return null;
    if (!placeAnchor) return null;
    const hover = placeHover ?? placeAnchor;
    const raw = rectFromAnchors(placeAnchor, hover);
    return clampRectToEnvelope(raw, selected.minSize, selected.maxSize);
  })();
  const previewBlocked = previewRect
    ? overlapsAny(previewRect, draftWidgets ?? [])
    : false;

  function handleCellPointerDown(x: number, y: number) {
    if (!selected) {
      // Slice 224 — clicking an empty cell with nothing armed for
      // placement deselects whatever painted widget is currently
      // selected (background-click-to-deselect).
      if (selectedPlacedId) setSelectedPlacedId(null);
      return;
    }
    if (!placeAnchor) {
      setPlaceAnchor({ x, y });
      setPlaceHover({ x, y });
      return;
    }
    // Second click commits — but only when the candidate doesn't
    // overlap an existing widget.
    if (previewRect && !previewBlocked) {
      addWidget({
        id: generatePlacementId(),
        type: selected.id,
        x: previewRect.x,
        y: previewRect.y,
        w: previewRect.w,
        h: previewRect.h,
        customization: { content: selected.defaultContent },
      });
      setPlaceAnchor(null);
      setPlaceHover(null);
    }
  }

  function handleCellPointerEnter(x: number, y: number) {
    if (selected && placeAnchor) setPlaceHover({ x, y });
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

    setResizeTarget({ id: inst.id, w: inst.w, h: inst.h });
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

    function handleMove(ev: PointerEvent) {
      const cell = pointerToCell(ev.clientX, ev.clientY);
      const target = computeResizedRect(
        { x: inst.x, y: inst.y, w: inst.w, h: inst.h },
        cell,
        widgetDef!.minSize,
        widgetDef!.maxSize,
      );
      setResizeTarget({ id: inst.id, w: target.w, h: target.h });
    }

    function handleUp(ev: PointerEvent) {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      const cell = pointerToCell(ev.clientX, ev.clientY);
      const final = computeResizedRect(
        { x: inst.x, y: inst.y, w: inst.w, h: inst.h },
        cell,
        widgetDef!.minSize,
        widgetDef!.maxSize,
      );
      setResizeTarget(null);
      const current = useHubStore.getState().draftWidgets ?? [];
      const candidate = { x: inst.x, y: inst.y, w: final.w, h: final.h };
      // Skip the commit when the new rect would overlap a sibling
      // OR when nothing actually changed.
      const siblings = current.filter((w) => w.id !== inst.id);
      if (overlapsAny(candidate, siblings)) return;
      if (final.w === inst.w && final.h === inst.h) return;
      setDraftWidgets(
        current.map((w) => (w.id === inst.id ? { ...w, w: final.w, h: final.h } : w)),
      );
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  }

  async function handleSave() {
    await saveDraft();
    onClose();
  }

  function handleCancel() {
    cancelEdit();
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Customize hub layout"
      data-testid="grid-editor"
      style={overlayStyle}
    >
      <div style={modalStyle}>
        <header style={headerStyle}>
          <div>
            <h2 style={titleStyle}>Customize your hub</h2>
            <p style={subtitleStyle}>
              Pick a widget on the left + click the grid to paint where it
              should sit. The 8×8 grid maps directly to your hub canvas.
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
                return (
                  <li key={w.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => setSelectedType(isSelected ? null : w.id)}
                      style={isSelected ? paletteEntryActiveStyle : paletteEntryStyle}
                      data-widget-type={w.id}
                    >
                      <span style={paletteEntryLabelStyle}>{w.label}</span>
                      <span style={paletteEntryHintStyle}>
                        {w.defaultSize.w}×{w.defaultSize.h}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* ── 8×8 Grid (right) ────────────────────────────────────── */}
          <section aria-label="Hub grid" style={gridWrapperStyle}>
            <div
              ref={gridContainerRef}
              style={selected ? gridContainerPlacingStyle : gridContainerStyle}
              data-testid="grid-editor-grid"
              data-placing={selected ? 'true' : 'false'}
            >
              {Array.from({ length: GRID_EDITOR_ROWS * GRID_EDITOR_COLS }).map((_, idx) => {
                const x = idx % GRID_EDITOR_COLS;
                const y = Math.floor(idx / GRID_EDITOR_COLS);
                const isAnchor = placeAnchor?.x === x && placeAnchor?.y === y;
                return (
                  <div
                    key={`${x}-${y}`}
                    style={
                      isAnchor ? gridCellAnchorStyle :
                      selected ? gridCellArmedStyle : gridCellStyle
                    }
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

              {/* Render every placed widget as a labelled block. */}
              {(draftWidgets ?? []).map((inst) => {
                const def = catalog.find((w) => w.id === inst.type);
                const label = def?.label ?? inst.type;
                const isSelected = selectedPlacedId === inst.id;
                // Slice 225 — while this widget is being resized,
                // render at the target dimensions so the surveyor
                // sees the live footprint without round-tripping
                // through the store on every pointer-move tick.
                const liveW = resizeTarget?.id === inst.id ? resizeTarget.w : inst.w;
                const liveH = resizeTarget?.id === inst.id ? resizeTarget.h : inst.h;
                const isResizing = resizeTarget?.id === inst.id;
                return (
                  <div
                    key={inst.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${label} at ${inst.x + 1}, ${inst.y + 1}`}
                    aria-pressed={isSelected}
                    data-testid="grid-editor-placed-widget"
                    data-widget-id={inst.id}
                    data-selected={isSelected ? 'true' : 'false'}
                    data-resizing={isResizing ? 'true' : 'false'}
                    onPointerDown={(e) => {
                      // Slice 224 — stop the pointer-down from
                      // bubbling to the cell underneath so click-to-
                      // select doesn't double as a placement anchor.
                      e.stopPropagation();
                      setSelectedPlacedId(isSelected ? null : inst.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedPlacedId(isSelected ? null : inst.id);
                      }
                    }}
                    style={{
                      ...(isSelected ? placedWidgetSelectedStyle : placedWidgetStyle),
                      gridColumn: `${inst.x + 1} / span ${liveW}`,
                      gridRow: `${inst.y + 1} / span ${liveH}`,
                    }}
                  >
                    <span style={placedLabelStyle}>{label}</span>
                    <span style={placedSizeStyle}>{liveW}×{liveH}</span>
                    {isSelected && (
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
            <button type="button" onClick={handleCancel} style={cancelButtonStyle}>
              Cancel
            </button>
            <button type="button" onClick={handleSave} style={saveButtonStyle}>
              Save layout
            </button>
          </div>
        </footer>
      </div>
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
  width: 'min(720px, 100%)',
  aspectRatio: '1 / 1',
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

const gridCellAnchorStyle: React.CSSProperties = {
  ...gridCellStyle,
  cursor: 'crosshair',
  background: 'color-mix(in srgb, var(--theme-accent, #3b82f6) 18%, var(--theme-bg-surface, #ffffff))',
  borderColor: 'var(--theme-accent, #3b82f6)',
};

const gridContainerPlacingStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: `repeat(${GRID_EDITOR_COLS}, minmax(0, 1fr))`,
  gridTemplateRows: `repeat(${GRID_EDITOR_ROWS}, minmax(0, 1fr))`,
  gap: 6,
  width: 'min(720px, 100%)',
  aspectRatio: '1 / 1',
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
