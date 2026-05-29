'use client';
// lib/hub/components/WidgetGrid.tsx
//
// Renders an array of WidgetInstances on a 12-column grid (or its
// collapsed breakpoints). When `editMode` is on and `onReorder` is
// provided, widgets become drag-and-drop sortable via @dnd-kit. When
// `onResize` is provided, a bottom-right resize handle snaps each
// widget to grid cells on pointer-up.
//
// Renders widgets via `getWidget(type)` from the registry. Unknown
// widget types render an inline placeholder so a layout with a
// retired widget doesn't blow up.
//
// Slice 92 of customizable-hub-and-work-mode-2026-05-28.md.
// Slice 98 adds drag-and-drop. Slice 99 adds the resize handle.

import React, { useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { getWidget, type WidgetDefinition } from '@/lib/hub/widget-registry';
import type { WidgetCustomization } from '@/lib/hub/types';
import { useElementSize } from '@/lib/hub/use-element-size';
import { useHubActions } from '@/lib/hub/use-hub-actions';
import {
  collapseLayout,
  compactLayout,
  layoutBounds,
} from '@/lib/hub/grid-math';
import type { CellDimensions, GridSize } from '@/lib/hub/grid-resize';
import WidgetFrame from './WidgetFrame';
import WidgetResizeHandle from './WidgetResizeHandle';
import type { WidgetInstance } from '@/lib/hub/types';

export interface WidgetGridProps {
  widgets: WidgetInstance[];
  /** Edit mode flag passed through to each widget's render. */
  editMode?: boolean;
  /** Row height in pixels. Overridable per density. */
  rowHeight?: number;
  /** Gap between widgets, in px. */
  gap?: number;
  /** When provided + editMode is on, widgets become draggable. Called
   *  with the new compacted widget array on every drop. */
  onReorder?: (widgets: WidgetInstance[]) => void;
  /** When provided + editMode is on, each widget gets a resize handle.
   *  Called with the widget id + new size on pointer-up commit. */
  onResize?: (id: string, next: GridSize) => void;
}

const DEFAULT_GAP = 16;
/** Floor used until the ResizeObserver fires so the first paint
 *  doesn't collapse to 0-height rows. Tracks the 8-col layout's
 *  cell width at a roughly 1280px container. Slice 209. */
const INITIAL_ROW_HEIGHT_PX = 140;

export default function WidgetGrid({
  widgets,
  editMode = false,
  /** Slice 209 — `rowHeight` is now optional + ignored when the
   *  container width is known; cells are derived as squares
   *  (`rowHeight = cellW`). Kept in the API so storybook + tests
   *  can pin a deterministic height. */
  rowHeight,
  gap = DEFAULT_GAP,
  onReorder,
  onResize,
}: WidgetGridProps) {
  // Slice 202 — single ResizeObserver. The hook returns the grid
  // container's contentRect width + the breakpoint derived from
  // that width. One observer, one state, one re-render per resize
  // frame (React batches the setState).
  const gridRef = useRef<HTMLDivElement | null>(null);
  const { widthPx: gridWidthPx, breakpoint } = useElementSize(gridRef);

  const collapsed = collapseLayout(widgets, breakpoint);
  const bounds = layoutBounds(collapsed, breakpoint);

  const cellW = gridWidthPx > 0
    ? Math.max(1, (gridWidthPx - (bounds.cols - 1) * gap) / bounds.cols)
    : 0;
  // Slice 209 — square cells. The row height tracks the column
  // width so a 1×1 widget renders as a literal square + a 2×1 is
  // twice the width of its height. When the ResizeObserver hasn't
  // fired yet (initial render), fall back to the explicit
  // `rowHeight` prop or the constant INITIAL_ROW_HEIGHT_PX.
  const effectiveRowHeight = cellW > 0
    ? cellW
    : (rowHeight ?? INITIAL_ROW_HEIGHT_PX);
  const cellDimensions: CellDimensions = { cellW, cellH: effectiveRowHeight, gap };

  const dragEnabled = editMode && typeof onReorder === 'function';
  const resizeEnabled = editMode && typeof onResize === 'function' && cellW > 0;

  // Sensors must always be initialized (hook order rule).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sortableIds = useMemo(() => collapsed.map((w) => w.id), [collapsed]);

  // Slice 203 — track which widget is being dragged + which cell
  // is currently under the cursor so we can paint a ghost via
  // DragOverlay and a 2px accent border on the destination cell.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }
  function handleDragOver(event: DragOverEvent) {
    setOverId(event.over ? String(event.over.id) : null);
  }
  function handleDragCancel() {
    setActiveId(null);
    setOverId(null);
  }
  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    setOverId(null);
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorder) return;
    const oldIndex = widgets.findIndex((w) => w.id === active.id);
    const newIndex = widgets.findIndex((w) => w.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(widgets, oldIndex, newIndex);
    const compacted = compactLayout(reordered, 8);
    onReorder(compacted);
  }

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${bounds.cols}, 1fr)`,
    gridAutoRows: `${effectiveRowHeight}px`,
    gap: `${gap}px`,
    width: '100%',
  };

  const cells = collapsed.map((instance) => (
    <WidgetCell
      key={instance.id}
      instance={instance}
      editMode={editMode}
      dragEnabled={dragEnabled}
      resizeEnabled={resizeEnabled}
      cellDimensions={cellDimensions}
      onResize={onResize}
      // Slice 203 — highlight the destination cell during drag.
      // Don't highlight the dragged cell itself; the DragOverlay
      // ghost is what sits at the cursor in its place.
      isDropTarget={dragEnabled && overId === instance.id && activeId !== instance.id}
    />
  ));

  if (!dragEnabled) {
    return <div ref={gridRef} style={gridStyle}>{cells}</div>;
  }

  const activeInstance = activeId ? collapsed.find((w) => w.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
        <div ref={gridRef} style={gridStyle}>{cells}</div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeInstance ? (
          <DragGhost instance={activeInstance} cellDimensions={cellDimensions} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/** Slice 203 — semi-transparent ghost of the dragged widget pinned
 *  to the cursor via dnd-kit's `DragOverlay`. Renders just the
 *  `WidgetFrame` with the original cell's pixel dimensions so the
 *  drag feels weighty without dragging the real widget body. */
function DragGhost({
  instance,
  cellDimensions,
}: {
  instance: WidgetInstance;
  cellDimensions: CellDimensions;
}) {
  const definition = getWidget(instance.type);
  const widthPx = Math.max(1, instance.w * cellDimensions.cellW + (instance.w - 1) * cellDimensions.gap);
  const heightPx = Math.max(1, instance.h * cellDimensions.cellH + (instance.h - 1) * cellDimensions.gap);
  const title = definition?.label ?? instance.type;
  return (
    <div
      style={{
        width: widthPx,
        height: heightPx,
        opacity: 0.85,
        cursor: 'grabbing',
        boxShadow: '0 12px 28px rgba(0,0,0,0.28)',
        border: '1px solid var(--theme-accent, #3b82f6)',
        borderRadius: 8,
        background: 'var(--theme-bg-surface, #fff)',
        pointerEvents: 'none',
      }}
      data-testid="widget-drag-ghost"
    >
      <WidgetFrame title={title} editMode={true}>
        <div style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-muted)' }}>
          Drop to place this widget
        </div>
      </WidgetFrame>
    </div>
  );
}

interface WidgetCellProps {
  instance: WidgetInstance;
  editMode: boolean;
  dragEnabled: boolean;
  resizeEnabled: boolean;
  cellDimensions: CellDimensions;
  onResize?: (id: string, next: GridSize) => void;
  /** Slice 203 — true when this cell is the current dnd-kit drag
   *  destination. Paints a 2px accent border so the surveyor sees
   *  where the dragged widget will land. */
  isDropTarget?: boolean;
}

function WidgetCell({ instance, editMode, dragEnabled, resizeEnabled, cellDimensions, onResize, isDropTarget = false }: WidgetCellProps) {
  if (!dragEnabled) {
    return (
      <StaticWidgetCell
        instance={instance}
        editMode={editMode}
        resizeEnabled={resizeEnabled}
        cellDimensions={cellDimensions}
        onResize={onResize}
        isDropTarget={isDropTarget}
      />
    );
  }
  return (
    <SortableWidgetCell
      instance={instance}
      editMode={editMode}
      resizeEnabled={resizeEnabled}
      cellDimensions={cellDimensions}
      onResize={onResize}
      isDropTarget={isDropTarget}
    />
  );
}

interface StaticWidgetCellProps {
  instance: WidgetInstance;
  editMode: boolean;
  resizeEnabled: boolean;
  cellDimensions: CellDimensions;
  onResize?: (id: string, next: GridSize) => void;
  style?: React.CSSProperties;
  setNodeRef?: (node: HTMLDivElement | null) => void;
  dragListeners?: React.HTMLAttributes<HTMLButtonElement>;
  /** Slice 203 — current dnd-kit drop target. Paints a 2px accent
   *  outline. */
  isDropTarget?: boolean;
}

function StaticWidgetCell({
  instance,
  editMode,
  resizeEnabled,
  cellDimensions,
  onResize,
  style,
  setNodeRef,
  dragListeners,
  isDropTarget = false,
}: StaticWidgetCellProps) {
  const definition = getWidget(instance.type);

  const cellStyle: React.CSSProperties = {
    gridColumn: `${instance.x + 1} / span ${instance.w}`,
    gridRow: `${instance.y + 1} / span ${instance.h}`,
    minHeight: 0,
    // Slice 219 — the cell needs `visible` overflow in edit mode so
    // the resize grip + the drop-target outline aren't clipped at
    // the cell boundary.
    overflow: editMode ? 'visible' : 'hidden',
    position: 'relative',
    // Slice 203 + Slice 219 — drop-target → solid 2px accent ring;
    // edit-mode (not the target) → dashed 2px accent ring so every
    // cell reads as "I can be dragged + resized" instead of being a
    // static tile. `outline` (not border) keeps the box-model stable
    // so drag ticks don't reflow neighbours.
    outline: isDropTarget
      ? '2px solid var(--theme-accent, #3b82f6)'
      : editMode
        ? '2px dashed var(--theme-accent, #3b82f6)'
        : undefined,
    outlineOffset: isDropTarget ? '-2px' : editMode ? '-2px' : undefined,
    borderRadius: isDropTarget || editMode ? 8 : undefined,
    transition: 'outline-color 80ms ease-out',
    ...style,
  };

  function commitResize(next: GridSize) {
    if (onResize) onResize(instance.id, next);
  }

  // data-widget-id lets a parent canvas capture clicks via event
  // delegation (Slice 185 — HubCanvas reads closest('[data-widget-id]')
  // on click to open the SettingsPanel against that instance in edit
  // mode).
  if (!definition) {
    return (
      <div ref={setNodeRef} style={cellStyle} data-widget-id={instance.id}>
        <WidgetFrame
          title={`Unknown widget: ${instance.type}`}
          colorMode="status"
          statusTint="warning"
          editMode={editMode}
          headerAction={
          editMode ? (
            <CellEditActions
              instanceId={instance.id}
              dragListeners={dragListeners}
            />
          ) : undefined
        }
        >
          <div style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>
            This widget is no longer in the catalog. Remove it from your
            layout or pick a replacement.
          </div>
        </WidgetFrame>
        {resizeEnabled && onResize && (
          <WidgetResizeHandle
            currentSize={{ w: instance.w, h: instance.h }}
            minSize={{ w: 1, h: 1 }}
            maxSize={{ w: 8, h: 8 }}
            cell={cellDimensions}
            onCommit={commitResize}
          />
        )}
      </div>
    );
  }

  const { Widget, defaultContent } = definition;
  const customization = instance.customization ?? EMPTY_CUSTOMIZATION;
  const content = (customization.content ?? defaultContent) as Record<string, unknown>;
  const showTitle = customization.layout?.showTitle ?? true;
  const titleOverride = customization.layout?.titleOverride;
  const title = titleOverride && titleOverride.trim().length > 0 ? titleOverride : definition.label;

  return (
    <div ref={setNodeRef} style={cellStyle} data-widget-id={instance.id}>
      <WidgetFrame
        title={title}
        showTitle={showTitle}
        colorMode={customization.style?.colorMode}
        statusTint={customization.style?.statusTint}
        customBg={customization.style?.customBg}
        customFg={customization.style?.customFg}
        borderRadius={customization.style?.borderRadius}
        shadowDepth={customization.style?.shadowDepth}
        editMode={editMode}
        headerAction={
          editMode ? (
            <CellEditActions
              instanceId={instance.id}
              dragListeners={dragListeners}
            />
          ) : undefined
        }
      >
        {/* Slice 199 — MemoWidgetRender's equality compares
            size.w + size.h as primitives, so a fresh { w, h } each
            drag tick still skips when the values didn't change. */}
        <MemoWidgetRender
          Widget={Widget}
          customization={customization}
          size={{ w: instance.w, h: instance.h }}
          editMode={editMode}
          content={content}
        />
      </WidgetFrame>
      {resizeEnabled && onResize && (
        <WidgetResizeHandle
          currentSize={{ w: instance.w, h: instance.h }}
          minSize={definition.minSize}
          maxSize={definition.maxSize}
          cell={cellDimensions}
          onCommit={commitResize}
        />
      )}
    </div>
  );
}

function SortableWidgetCell({
  instance,
  editMode,
  resizeEnabled,
  cellDimensions,
  onResize,
  isDropTarget = false,
}: {
  instance: WidgetInstance;
  editMode: boolean;
  resizeEnabled: boolean;
  cellDimensions: CellDimensions;
  onResize?: (id: string, next: GridSize) => void;
  isDropTarget?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: instance.id });

  const dynamicStyle: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    // Slice 203 — fade the original cell while it's being dragged
    // so the DragOverlay ghost reads as the active surface.
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 5 : 'auto',
  };

  return (
    <StaticWidgetCell
      instance={instance}
      editMode={editMode}
      resizeEnabled={resizeEnabled}
      cellDimensions={cellDimensions}
      onResize={onResize}
      style={dynamicStyle}
      setNodeRef={setNodeRef as (node: HTMLDivElement | null) => void}
      dragListeners={{ ...attributes, ...listeners }}
      isDropTarget={isDropTarget}
    />
  );
}

// Slice 199 — memoize the heavy `<Widget>` body. The `<WidgetFrame>`
// wrapper + the drag handle stay outside the memo because their
// props change every dnd-kit transform tick during a drag; the
// frame is cheap to re-render but the widget body (often runs its
// own fetch + renders rows) is not. With this memo the widget
// body of widget B skips when widget A is being dragged. Render-
// count tests in __tests__/hub/widget-grid-memo.test.ts lock the
// skip.
export const EMPTY_CUSTOMIZATION: WidgetCustomization = Object.freeze({});

interface MemoWidgetRenderProps {
  Widget: WidgetDefinition<Record<string, unknown>>['Widget'];
  customization: WidgetCustomization;
  size: { w: number; h: number };
  editMode: boolean;
  content: Record<string, unknown>;
}

function MemoWidgetRenderImpl({ Widget, customization, size, editMode, content }: MemoWidgetRenderProps) {
  return (
    <Widget
      customization={customization}
      size={size}
      editMode={editMode}
      content={content}
    />
  );
}

const MemoWidgetRender = React.memo(MemoWidgetRenderImpl, (prev, next) => {
  return (
    prev.Widget === next.Widget &&
    prev.customization === next.customization &&
    prev.size.w === next.size.w &&
    prev.size.h === next.size.h &&
    prev.editMode === next.editMode &&
    prev.content === next.content
  );
});

/** Test-only export so render-count specs can spy without poking
 *  React internals. */
export { MemoWidgetRender as __MemoWidgetRender };

/** Slice 219 — Drag handle. Bigger + accent-colored so the surveyor
 *  immediately reads "I can drag this." */
function DragHandle(props: React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label="Drag to reorder"
      title="Drag to reorder"
      style={dragHandleStyle}
      {...props}
    >
      ⋮⋮
    </button>
  );
}

const dragHandleStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  padding: 0,
  borderRadius: 6,
  background: 'var(--theme-accent, #3b82f6)',
  color: 'var(--theme-accent-fg, #fff)',
  border: 'none',
  cursor: 'grab',
  fontSize: '1rem',
  fontWeight: 700,
  lineHeight: 1,
  boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
  flexShrink: 0,
};

/** Slice 219 — Remove button. Surfaces the `removeWidget` action in
 *  the cell's header strip so the surveyor doesn't have to open the
 *  settings panel + scroll to find the delete control. */
function RemoveButton({ onRemove }: { onRemove: () => void }) {
  return (
    <button
      type="button"
      aria-label="Remove widget"
      title="Remove widget"
      onClick={(e) => { e.stopPropagation(); onRemove(); }}
      onPointerDown={(e) => { e.stopPropagation(); }}
      style={removeButtonStyle}
    >
      ✕
    </button>
  );
}

const removeButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  padding: 0,
  borderRadius: 6,
  background: 'transparent',
  color: 'var(--theme-danger, #ef4444)',
  border: '1px solid var(--theme-danger, #ef4444)',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: 700,
  lineHeight: 1,
  flexShrink: 0,
};

/** Slice 219 — Compound edit-mode header strip. Wraps the drag
 *  handle + the remove button so they sit together in `WidgetFrame`'s
 *  `headerAction` slot. */
function CellEditActions({
  instanceId,
  dragListeners,
}: {
  instanceId: string;
  dragListeners?: React.HTMLAttributes<HTMLButtonElement>;
}) {
  const { removeWidget } = useHubActions();
  return (
    <div style={cellEditActionsStyle}>
      {dragListeners && <DragHandle {...dragListeners} />}
      <RemoveButton onRemove={() => removeWidget(instanceId)} />
    </div>
  );
}

const cellEditActionsStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};
