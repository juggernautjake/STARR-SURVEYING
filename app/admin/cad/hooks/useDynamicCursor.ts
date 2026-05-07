'use client';
// app/admin/cad/hooks/useDynamicCursor.ts
//
// Phase 8 §4.4 — applies the resolved cursor to the canvas
// element on every relevant store change. Reads tool +
// hover state directly via Zustand selectors so the effect
// only re-runs when something the resolver actually depends
// on changes.
//
// Snap-aware variants (DRAW_ENDPOINT, DRAW_MIDPOINT, etc.)
// land once snap state moves out of CanvasViewport's local
// `snapResultRef` into a shared store. Today this hook
// covers tool-driven cursors + the AI-chat-mode + waiting
// overrides, which is most of the daily-feel benefit.

import { useEffect, type RefObject } from 'react';

import {
  CURSOR_CSS,
  resolveCursor,
} from '@/lib/cad/cursors';
import {
  useAIStore,
  useToolStore,
  useUIStore,
} from '@/lib/cad/store';

export function useDynamicCursor(
  canvasRef: RefObject<HTMLElement | null>
): void {
  const tool = useToolStore((s) => s.state.activeTool);
  const aiStatus = useAIStore((s) => s.status);
  const hoveredFeatureId = useUIStore((s) => s.hoveredFeatureId);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const cursor = resolveCursor({
      tool,
      hoverFeature: hoveredFeatureId !== null,
      isWaiting: aiStatus === 'running',
    });
    el.style.cursor = CURSOR_CSS[cursor];
  }, [canvasRef, tool, aiStatus, hoveredFeatureId]);
}
