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

import React, { useMemo, useRef } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
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

const DEFAULT_ROW_HEIGHT = 64;
const DEFAULT_GAP = 16;

export default function WidgetGrid({
  widgets,
  editMode = false,
  rowHeight = DEFAULT_ROW_HEIGHT,
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
  const cellDimensions: CellDimensions = { cellW, cellH: rowHeight, gap };

  const dragEnabled = editMode && typeof onReorder === 'function';
  const resizeEnabled = editMode && typeof onResize === 'function' && cellW > 0;

  // Sensors must always be initialized (hook order rule).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sortableIds = useMemo(() => collapsed.map((w) => w.id), [collapsed]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorder) return;
    const oldIndex = widgets.findIndex((w) => w.id === active.id);
    const newIndex = widgets.findIndex((w) => w.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(widgets, oldIndex, newIndex);
    const compacted = compactLayout(reordered, 12);
    onReorder(compacted);
  }

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${bounds.cols}, 1fr)`,
    gridAutoRows: `${rowHeight}px`,
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
    />
  ));

  if (!dragEnabled) {
    return <div ref={gridRef} style={gridStyle}>{cells}</div>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
        <div ref={gridRef} style={gridStyle}>{cells}</div>
      </SortableContext>
    </DndContext>
  );
}

interface WidgetCellProps {
  instance: WidgetInstance;
  editMode: boolean;
  dragEnabled: boolean;
  resizeEnabled: boolean;
  cellDimensions: CellDimensions;
  onResize?: (id: string, next: GridSize) => void;
}

function WidgetCell({ instance, editMode, dragEnabled, resizeEnabled, cellDimensions, onResize }: WidgetCellProps) {
  if (!dragEnabled) {
    return (
      <StaticWidgetCell
        instance={instance}
        editMode={editMode}
        resizeEnabled={resizeEnabled}
        cellDimensions={cellDimensions}
        onResize={onResize}
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
}: StaticWidgetCellProps) {
  const definition = getWidget(instance.type);

  const cellStyle: React.CSSProperties = {
    gridColumn: `${instance.x + 1} / span ${instance.w}`,
    gridRow: `${instance.y + 1} / span ${instance.h}`,
    minHeight: 0,
    overflow: 'hidden',
    position: 'relative',
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
          headerAction={editMode && dragListeners ? <DragHandle {...dragListeners} /> : undefined}
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
            maxSize={{ w: 12, h: 4 }}
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
        headerAction={editMode && dragListeners ? <DragHandle {...dragListeners} /> : undefined}
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
}: {
  instance: WidgetInstance;
  editMode: boolean;
  resizeEnabled: boolean;
  cellDimensions: CellDimensions;
  onResize?: (id: string, next: GridSize) => void;
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
    opacity: isDragging ? 0.6 : 1,
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

function DragHandle(props: React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label="Drag to reorder"
      title="Drag to reorder"
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'grab',
        padding: 4,
        borderRadius: 4,
        color: 'var(--theme-fg-muted)',
        fontSize: '1rem',
        lineHeight: 1,
      }}
      {...props}
    >
      ⋮⋮
    </button>
  );
}
