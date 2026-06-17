'use client';
// app/admin/cad/components/StatusBarCursorPill.tsx
//
// cad-desktop-tauri-and-perf Slice P6 — React boundary audit.
//
// The Status Bar's cursor/coord pill updates every time the mouse
// moves, but the surrounding `StatusBar` parent component reads
// many other slices (drawing settings, selection count, AI mode,
// snap state, tool state, …). Before this extraction, the parent
// re-rendered on every cursor tick because it subscribed to the
// whole viewport store. Now the pill is the ONLY thing that
// re-renders on cursor movement; the rest of the Status Bar stays
// quiet until something it actually depends on changes.
//
// Subscription strategy: each `useXStore((s) => s.field)` call
// participates in zustand's per-selector equality check, so the
// pill itself only re-renders when one of the three slices it
// reads (cursor world position, viewport zoom, the tool-state
// fields used by the live distance/bearing label) actually
// changes.

import { memo } from 'react';
import { useToolStore, useViewportStore } from '@/lib/cad/store';
import { formatCoordinates, formatDistance, formatAngle } from '@/lib/cad/geometry/units';
import type { DisplayPreferences } from '@/lib/cad/types';

interface Props {
  /** Display preferences fed in by the parent — kept as a prop so
   *  this component doesn't re-render when the preferences object
   *  identity changes (the parent's existing memoization wins
   *  that battle). */
  prefs: DisplayPreferences;
}

function StatusBarCursorPillInner({ prefs }: Props) {
  const cursor = useViewportStore((s) => s.cursorWorld);
  const activeTool = useToolStore((s) => s.state.activeTool);
  const drawingPoints = useToolStore((s) => s.state.drawingPoints);
  const basePoint = useToolStore((s) => s.state.basePoint);
  const rotateCenter = useToolStore((s) => s.state.rotateCenter);

  // Live distance/angle when drawing — formatted per display preferences.
  let distanceInfo: { dist: string; bearing: string } | null = null;
  const lastPt = drawingPoints[drawingPoints.length - 1] ?? basePoint ?? rotateCenter;
  if (
    lastPt &&
    (activeTool.startsWith('DRAW_') ||
      activeTool === 'MOVE' ||
      activeTool === 'COPY' ||
      activeTool === 'MIRROR')
  ) {
    const dx = cursor.x - lastPt.x;
    const dy = cursor.y - lastPt.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const mathAngleRad = Math.atan2(dy, dx);
    distanceInfo = {
      dist: formatDistance(dist, prefs),
      bearing: formatAngle(mathAngleRad, prefs, 'BEARING'),
    };
  }

  const coords = formatCoordinates(cursor.x, cursor.y, prefs);

  return (
    <>
      <span className="font-mono shrink-0 text-cyan-300">
        {coords.label1}: {coords.value1} &nbsp; {coords.label2}: {coords.value2}
      </span>
      {distanceInfo && (
        <>
          <span className="text-gray-600">|</span>
          <span className="font-mono shrink-0 text-cyan-400">
            d={distanceInfo.dist} &nbsp; {distanceInfo.bearing}
          </span>
        </>
      )}
    </>
  );
}

const StatusBarCursorPill = memo(StatusBarCursorPillInner);
StatusBarCursorPill.displayName = 'StatusBarCursorPill';
export default StatusBarCursorPill;
