'use client';
// lib/hub/components/PerfOverlay.tsx
//
// Tiny floating overlay that surfaces render counts + store
// state for hub-perf debugging. Off in production unless the URL
// carries `?debug=hub-perf`. The overlay reports just enough to
// let a surveyor confirm the perf claims from Slices 198–206 hold
// on their actual hardware:
//   - Canvas render count (ticks once per HubCanvas re-render)
//   - Active widget instance count
//   - Edit mode flag
//   - Aggregator status (idle / loading / ok / error)
//
// Slice 207 of hub-editor-performance-and-ux-2026-05-29.md.

import React from 'react';
import { useHubStore } from '@/lib/hub/hub-store';
import { useHubDataStore } from '@/lib/hub/hub-data-store';

/** Reads the URL's search string + decides whether the overlay
 *  should mount. Exported so the test suite can lock the gate
 *  without touching `window.location`. */
export function shouldEnablePerfOverlay(search: string | undefined | null): boolean {
  if (!search) return false;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return params.get('debug') === 'hub-perf';
}

/** Same gate but checks the live window location. Returns false
 *  during SSR (no window). */
export function isPerfOverlayActive(): boolean {
  if (typeof window === 'undefined') return false;
  return shouldEnablePerfOverlay(window.location.search);
}

export interface PerfOverlayProps {
  /** Canvas render count — incremented from a `useRef` tick inside
   *  HubCanvas so the overlay doesn't have to know how to count
   *  its own parent's renders. */
  canvasRenderCount: number;
}

export default function PerfOverlay({ canvasRenderCount }: PerfOverlayProps) {
  const widgetCount = useHubStore((s) => s.widgets.length);
  const draftCount = useHubStore((s) => s.draftWidgets?.length ?? 0);
  const isEditMode = useHubStore((s) => s.isEditMode);
  const aggregatorStatus = useHubDataStore((s) => s.aggregatorStatus);
  const aggregatorError = useHubDataStore((s) => s.aggregatorError);

  return (
    <div
      role="status"
      aria-label="Hub performance overlay"
      data-testid="hub-perf-overlay"
      style={overlayStyle}
    >
      <div style={titleStyle}>hub-perf</div>
      <Row label="Canvas renders" value={String(canvasRenderCount)} />
      <Row label="Widgets" value={String(widgetCount)} />
      {isEditMode && <Row label="Draft" value={String(draftCount)} />}
      <Row label="Mode" value={isEditMode ? 'edit' : 'view'} />
      <Row label="Aggregator" value={aggregatorStatus} />
      {aggregatorError && <Row label="Error" value={aggregatorError} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <span style={valueStyle}>{value}</span>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  right: 8,
  bottom: 8,
  zIndex: 90,
  padding: '6px 10px',
  background: 'rgba(0,0,0,0.78)',
  color: '#fff',
  borderRadius: 6,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 10,
  lineHeight: 1.4,
  pointerEvents: 'none',
  minWidth: 160,
  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
};

const titleStyle: React.CSSProperties = {
  fontWeight: 700,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  fontSize: 9,
  color: '#9ca3af',
  marginBottom: 2,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
};

const labelStyle: React.CSSProperties = {
  color: '#9ca3af',
};

const valueStyle: React.CSSProperties = {
  color: '#fff',
  fontWeight: 600,
};
