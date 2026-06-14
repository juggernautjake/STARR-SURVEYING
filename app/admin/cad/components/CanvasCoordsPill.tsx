'use client';
// app/admin/cad/components/CanvasCoordsPill.tsx
//
// cad-desktop-tauri-and-perf Slice P6f — React boundary audit.
//
// The CanvasViewport renders a permanent N/E coordinate tracker
// in the bottom-left of the canvas, fed by `viewportStore.cursorWorld`.
// Before this extraction, that single line forced the entire
// 14k-line CanvasViewport to subscribe to the viewport store
// (and re-render on every mousemove tick). Now the pill is the
// ONLY thing that reacts to cursor moves; everything else in
// `CanvasViewport` stays quiet until something it actually
// renders changes.
//
// Subscription strategy: per-field selectors with React.memo.
// `cursorWorld` ticks ~60 Hz while the mouse is over the canvas;
// `displayPreferences` changes only when the surveyor opens a
// settings dialog, so the formatting branch never re-runs unless
// the cursor or the prefs actually changed.

import { memo } from 'react';
import { useDrawingStore, useViewportStore } from '@/lib/cad/store';
import { formatCoordinates } from '@/lib/cad/geometry/units';
import { DEFAULT_DISPLAY_PREFERENCES } from '@/lib/cad/constants';

function CanvasCoordsPillInner() {
  const cursorWorld = useViewportStore((s) => s.cursorWorld);
  const dispPrefs =
    useDrawingStore((s) => s.document.settings.displayPreferences) ??
    DEFAULT_DISPLAY_PREFERENCES;

  const c = formatCoordinates(cursorWorld.x, cursorWorld.y, dispPrefs);

  return (
    <div
      className="absolute bottom-1 left-1 pointer-events-none z-20 flex items-center gap-2 px-2 py-0.5 rounded text-[10px] font-mono"
      style={{
        background: 'rgba(0,0,0,0.55)',
        color: '#c8d8ff',
        border: '1px solid rgba(120,150,220,0.35)',
      }}
    >
      <span>
        {c.label1}: {c.value1}
      </span>
      <span className="text-gray-500">|</span>
      <span>
        {c.label2}: {c.value2}
      </span>
    </div>
  );
}

const CanvasCoordsPill = memo(CanvasCoordsPillInner);
CanvasCoordsPill.displayName = 'CanvasCoordsPill';
export default CanvasCoordsPill;
