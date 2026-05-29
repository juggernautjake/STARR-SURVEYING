'use client';
// lib/hub/components/WidgetGrid.tsx
//
// Renders an array of WidgetInstances on a 12-column grid (or its
// collapsed breakpoints). When `editMode` is on and `onReorder` is
// provided, widgets become drag-and-drop sortable via @dnd-kit. Drop
// ends trigger a greedy compaction so the new sequence flows top-to-
// bottom without overlap.
//
// Renders widgets via `getWidget(type)` from the registry. Unknown
// widget types render an inline placeholder so a layout with a
// retired widget doesn't blow up.
//
// Slice 92 of customizable-hub-and-work-mode-2026-05-28.md.
// Slice 98 adds the drag-and-drop wiring.

import React, { useEffect, useMemo, useState } from 'react';
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

import { getWidget } from '@/lib/hub/widget-registry';
import {
  breakpointForWidth,
  collapseLayout,
  compactLayout,
  layoutBounds,
} from '@/lib/hub/grid-math';
import WidgetFrame from './WidgetFrame';
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
}

const DEFAULT_ROW_HEIGHT = 64;
const DEFAULT_GAP = 16;

export default function WidgetGrid({
  widgets,
  editMode = false,
  rowHeight = DEFAULT_ROW_HEIGHT,
  gap = DEFAULT_GAP,
  onReorder,
}: WidgetGridProps) {
  // Track viewport width client-side so we collapse responsively. SSR
  // renders at the 12-col breakpoint; the first effect ticks the real
  // value.
  const [viewportPx, setViewportPx] = useState<number>(1280);
  useEffect(() => {
    function update() { setViewportPx(window.innerWidth); }
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const breakpoint = breakpointForWidth(viewportPx);
  const collapsed = collapseLayout(widgets, breakpoint);
  const bounds = layoutBounds(collapsed, breakpoint);

  const dragEnabled = editMode && typeof onReorder === 'function';

  // Sensors must always be initialized (hook order rule) — they just
  // sit idle when drag isn't enabled because the DndContext isn't
  // rendered.
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
    // Compact in 12-col space — the saved layout is always stored
    // 12-col regardless of the active breakpoint.
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

  if (!dragEnabled) {
    return (
      <div style={gridStyle}>
        {collapsed.map((instance) => (
          <WidgetCell
            key={instance.id}
            instance={instance}
            editMode={editMode}
            dragEnabled={false}
          />
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
        <div style={gridStyle}>
          {collapsed.map((instance) => (
            <WidgetCell
              key={instance.id}
              instance={instance}
              editMode={editMode}
              dragEnabled
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

interface WidgetCellProps {
  instance: WidgetInstance;
  editMode: boolean;
  dragEnabled: boolean;
}

function WidgetCell({ instance, editMode, dragEnabled }: WidgetCellProps) {
  // useSortable returns no-op refs/listeners when used inside a sortable
  // context that doesn't include this id — but here we conditionally
  // render the sortable wrapper instead.
  if (!dragEnabled) {
    return <StaticWidgetCell instance={instance} editMode={editMode} />;
  }
  return <SortableWidgetCell instance={instance} editMode={editMode} />;
}

function StaticWidgetCell({
  instance,
  editMode,
  style,
  setNodeRef,
  dragListeners,
}: {
  instance: WidgetInstance;
  editMode: boolean;
  style?: React.CSSProperties;
  setNodeRef?: (node: HTMLDivElement | null) => void;
  dragListeners?: React.HTMLAttributes<HTMLButtonElement>;
}) {
  const definition = getWidget(instance.type);

  const cellStyle: React.CSSProperties = {
    gridColumn: `${instance.x + 1} / span ${instance.w}`,
    gridRow: `${instance.y + 1} / span ${instance.h}`,
    minHeight: 0,
    overflow: 'hidden',
    ...style,
  };

  if (!definition) {
    return (
      <div ref={setNodeRef} style={cellStyle}>
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
      </div>
    );
  }

  const { Widget, defaultContent } = definition;
  const content = (instance.customization?.content ?? defaultContent) as Record<string, unknown>;
  const customization = instance.customization ?? {};
  const showTitle = customization.layout?.showTitle ?? true;
  const titleOverride = customization.layout?.titleOverride;
  const title = titleOverride && titleOverride.trim().length > 0 ? titleOverride : definition.label;

  return (
    <div ref={setNodeRef} style={cellStyle}>
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
        <Widget
          customization={customization}
          size={{ w: instance.w, h: instance.h }}
          editMode={editMode}
          content={content}
        />
      </WidgetFrame>
    </div>
  );
}

function SortableWidgetCell({ instance, editMode }: { instance: WidgetInstance; editMode: boolean }) {
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
      style={dynamicStyle}
      setNodeRef={setNodeRef as (node: HTMLDivElement | null) => void}
      dragListeners={{ ...attributes, ...listeners }}
    />
  );
}

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
