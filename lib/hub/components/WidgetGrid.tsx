'use client';
// lib/hub/components/WidgetGrid.tsx
//
// Renders an array of WidgetInstances on a 12-column grid (or its
// collapsed breakpoints). No drag, no resize — that lands in Slices
// 98 + 99. Slice 92 ships the static renderer so we can validate a
// saved layout round-trips correctly before adding interactivity.
//
// Renders widgets via `getWidget(type)` from the registry. Unknown
// widget types render an inline placeholder so a layout with a
// retired widget doesn't blow up.
//
// Slice 92 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useEffect, useState } from 'react';
import { getWidget } from '@/lib/hub/widget-registry';
import { breakpointForWidth, collapseLayout, layoutBounds } from '@/lib/hub/grid-math';
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
}

const DEFAULT_ROW_HEIGHT = 64;
const DEFAULT_GAP = 16;

export default function WidgetGrid({
  widgets,
  editMode = false,
  rowHeight = DEFAULT_ROW_HEIGHT,
  gap = DEFAULT_GAP,
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

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${bounds.cols}, 1fr)`,
        gridAutoRows: `${rowHeight}px`,
        gap: `${gap}px`,
        width: '100%',
      }}
    >
      {collapsed.map((instance) => (
        <WidgetCell
          key={instance.id}
          instance={instance}
          editMode={editMode}
        />
      ))}
    </div>
  );
}

interface WidgetCellProps {
  instance: WidgetInstance;
  editMode: boolean;
}

function WidgetCell({ instance, editMode }: WidgetCellProps) {
  const definition = getWidget(instance.type);

  const cellStyle: React.CSSProperties = {
    gridColumn: `${instance.x + 1} / span ${instance.w}`,
    gridRow: `${instance.y + 1} / span ${instance.h}`,
    minHeight: 0,
    overflow: 'hidden',
  };

  if (!definition) {
    // Unknown widget — render a placeholder so a retired widget id
    // doesn't crash the grid.
    return (
      <div style={cellStyle}>
        <WidgetFrame
          title={`Unknown widget: ${instance.type}`}
          colorMode="status"
          statusTint="warning"
          editMode={editMode}
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
    <div style={cellStyle}>
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
