'use client';
// lib/hub/components/WidgetGrid.tsx
//
// Renders an array of WidgetInstances on the 12-column (or
// breakpoint-collapsed) hub grid. View-only renderer — all authoring
// (drag, drop, resize, options) happens inside the GridEditor modal.
//
// Slice 3 of employee-hub-overhaul-2026-05-30.md collapsed the two
// editing surfaces down to the modal; this file no longer carries
// the @dnd-kit drag, the WidgetResizeHandle wiring, or the in-cell
// edit chrome (drag handle, remove button, edit-mode outline). Earlier
// slices that referenced editMode here:
//   - Slice 92  (initial grid)
//   - Slice 98  (dnd-kit drag)   — removed
//   - Slice 99  (resize handle)  — removed
//   - Slice 203 (drop-target outline, DragGhost) — removed
//   - Slice 219 (edit-mode outline, DragHandle, RemoveButton) — removed
// History preserved in git; the modal owns the equivalent flows now.
//
// Slice 199 of hub-editor-performance-and-ux-2026-05-29.md — the
// MemoWidgetRender wrapper stays so a single re-render doesn't bubble
// into every widget body.

import React, { useRef } from 'react';

import { getWidget, type WidgetDefinition } from '@/lib/hub/widget-registry';
import type { WidgetCustomization, WidgetInstance } from '@/lib/hub/types';
import { useElementSize } from '@/lib/hub/use-element-size';
import { collapseLayout, layoutBounds } from '@/lib/hub/grid-math';
import WidgetFrame from './WidgetFrame';

export interface WidgetGridProps {
  widgets: WidgetInstance[];
  /** Row height in pixels. Overridable per density. Slice 209 made
   *  cells square (`rowHeight = cellW` from the ResizeObserver) so
   *  this prop is only consulted before the first observer tick. */
  rowHeight?: number;
  /** Gap between widgets, in px. */
  gap?: number;
}

const DEFAULT_GAP = 16;
/** Floor used until the ResizeObserver fires so the first paint
 *  doesn't collapse to 0-height rows. Tracks the 8-col layout's
 *  cell width at a roughly 1280px container. Slice 209. */
const INITIAL_ROW_HEIGHT_PX = 140;

export default function WidgetGrid({
  widgets,
  rowHeight,
  gap = DEFAULT_GAP,
}: WidgetGridProps) {
  // Slice 202 — single ResizeObserver. The hook returns the grid
  // container's contentRect width + the breakpoint derived from
  // that width.
  const gridRef = useRef<HTMLDivElement | null>(null);
  const { widthPx: gridWidthPx, breakpoint } = useElementSize(gridRef);

  const collapsed = collapseLayout(widgets, breakpoint);
  const bounds = layoutBounds(collapsed, breakpoint);

  const cellW = gridWidthPx > 0
    ? Math.max(1, (gridWidthPx - (bounds.cols - 1) * gap) / bounds.cols)
    : 0;
  // Slice 209 — square cells. Row height tracks column width so a 1×1
  // widget renders as a literal square + a 2×1 is twice the width of
  // its height. Falls back to the explicit `rowHeight` prop or the
  // INITIAL_ROW_HEIGHT_PX constant before the observer fires.
  const effectiveRowHeight = cellW > 0
    ? cellW
    : (rowHeight ?? INITIAL_ROW_HEIGHT_PX);

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${bounds.cols}, 1fr)`,
    gridAutoRows: `${effectiveRowHeight}px`,
    gap: `${gap}px`,
    width: '100%',
  };

  return (
    <div ref={gridRef} style={gridStyle}>
      {collapsed.map((instance) => (
        <WidgetCell key={instance.id} instance={instance} />
      ))}
    </div>
  );
}

interface WidgetCellProps {
  instance: WidgetInstance;
}

function WidgetCell({ instance }: WidgetCellProps) {
  const definition = getWidget(instance.type);

  const cellStyle: React.CSSProperties = {
    gridColumn: `${instance.x + 1} / span ${instance.w}`,
    gridRow: `${instance.y + 1} / span ${instance.h}`,
    minHeight: 0,
    overflow: 'hidden',
    position: 'relative',
  };

  // data-widget-id is kept for parent-level event delegation (the
  // canvas no longer reads it post-Slice-3, but other future hooks
  // — analytics, deep-link → scroll, etc. — can rely on the
  // contract).
  if (!definition) {
    return (
      <div style={cellStyle} data-widget-id={instance.id}>
        <WidgetFrame
          title={`Unknown widget: ${instance.type}`}
          colorMode="status"
          statusTint="warning"
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
  const customization = instance.customization ?? EMPTY_CUSTOMIZATION;
  const content = (customization.content ?? defaultContent) as Record<string, unknown>;
  const showTitle = customization.layout?.showTitle ?? true;
  const titleOverride = customization.layout?.titleOverride;
  const title = titleOverride && titleOverride.trim().length > 0 ? titleOverride : definition.label;

  return (
    <div style={cellStyle} data-widget-id={instance.id}>
      <WidgetFrame
        title={title}
        showTitle={showTitle}
        colorMode={customization.style?.colorMode}
        statusTint={customization.style?.statusTint}
        customBg={customization.style?.customBg}
        customFg={customization.style?.customFg}
        borderRadius={customization.style?.borderRadius}
        shadowDepth={customization.style?.shadowDepth}
      >
        <MemoWidgetRender
          Widget={Widget}
          customization={customization}
          size={{ w: instance.w, h: instance.h }}
          content={content}
        />
      </WidgetFrame>
    </div>
  );
}

// Slice 199 — memoize the heavy `<Widget>` body. The `<WidgetFrame>`
// wrapper stays outside the memo because its props are cheap to
// re-render; the widget body (often runs its own fetch + renders rows)
// is not. Render-count tests in __tests__/hub/widget-grid-memo.test.ts
// lock the skip.
export const EMPTY_CUSTOMIZATION: WidgetCustomization = Object.freeze({});

interface MemoWidgetRenderProps {
  Widget: WidgetDefinition<Record<string, unknown>>['Widget'];
  customization: WidgetCustomization;
  size: { w: number; h: number };
  /** Slice 3 — the grid is view-only, but widget bodies still accept
   *  an `editMode` prop in their signature so the modal's preview
   *  surface can opt them into the editing chrome. Defaults false. */
  editMode?: boolean;
  content: Record<string, unknown>;
}

function MemoWidgetRenderImpl({ Widget, customization, size, editMode = false, content }: MemoWidgetRenderProps) {
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
    (prev.editMode ?? false) === (next.editMode ?? false) &&
    prev.content === next.content
  );
});

/** Test-only export so render-count specs can spy without poking
 *  React internals. */
export { MemoWidgetRender as __MemoWidgetRender };
