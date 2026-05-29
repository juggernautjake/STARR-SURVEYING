// lib/hub/use-element-size.ts
//
// Single-source-of-truth element-size hook. Returns the observed
// element's contentRect width + height + the breakpoint that
// corresponds to its width. Uses ONE ResizeObserver, coalesces
// rapid resizes by relying on the browser's natural per-frame
// callback batching, and skips React re-renders when neither
// dimension changed.
//
// Replaces WidgetGrid's previous two effects (`window.innerWidth`
// + a separate ResizeObserver) which would each trigger a state
// update on every resize → two re-renders per resize. Slice 202
// of hub-editor-performance-and-ux-2026-05-29.md.

import { useEffect, useState, type RefObject } from 'react';
import { breakpointForWidth, type GridBreakpoint } from './grid-math';

export interface ElementSize {
  widthPx: number;
  heightPx: number;
  breakpoint: GridBreakpoint;
}

const INITIAL: ElementSize = { widthPx: 0, heightPx: 0, breakpoint: 12 };

/** Track an element's contentRect via a single ResizeObserver.
 *  Returns the current width + height + the breakpoint computed
 *  from the width.
 *
 *  React batches state updates inside ResizeObserver callbacks, so
 *  rapid resize events produce one re-render per frame. The
 *  internal early-exit when the new size equals the previous
 *  prevents redundant setState calls when a resize event doesn't
 *  actually change either dimension (e.g. multiple observer
 *  fires for the same frame). */
export function useElementSize(ref: RefObject<HTMLElement | null>): ElementSize {
  const [size, setSize] = useState<ElementSize>(INITIAL);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const widthPx = Math.round(entry.contentRect.width);
      const heightPx = Math.round(entry.contentRect.height);
      setSize((prev) => {
        if (prev.widthPx === widthPx && prev.heightPx === heightPx) return prev;
        return { widthPx, heightPx, breakpoint: breakpointForWidth(widthPx) };
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return size;
}
