'use client';
// app/admin/cad/hooks/useIsNarrow.ts
//
// admin-ui-alignment-2026-08-14 A14 — "is there enough width to dock a side panel?"
//
// ── WHY A BREAKPOINT AT ALL, IN AN APP THAT OTHERWISE MEASURES ──────────────────────────────────
//
// The rest of the editor sizes itself from what it is given. The side docks cannot: they are fixed
// pixel widths the user drags, and the canvas takes what is left. At 390px that arithmetic is
// 52 (tool rail) + 192 (layers) + 192 (properties) + two drag handles = more than the screen, so
// the canvas is allotted ZERO width and the drawing — the entire point of the page — disappears.
// The audit only saw the 3px that spilled past the edge; the real defect is the 0px canvas.
//
// Below the threshold the docks stop being columns and become overlays: the canvas keeps the full
// width, and a panel floats above it until it is dismissed. That is the same trade every desktop
// editor makes on a small screen, and it is a layout decision, so it belongs to a breakpoint.
//
// 900px is the width at which rail + both docks + a canvas wide enough to draw in stop coexisting
// (52 + 192 + 192 = 436 of chrome; under ~900 the canvas is more panel than drawing).

import { useEffect, useState } from 'react';

export const CAD_NARROW_BREAKPOINT = 900;

/**
 * True when the viewport is too narrow to dock the side panels beside the canvas.
 *
 * Starts `false` on the server and on the first client paint, so the desktop layout is what
 * renders before hydration — the narrow layout then applies in the same tick `matchMedia` reports
 * it. Getting this backwards would flash a phone layout onto every desktop load.
 */
export function useIsNarrow(breakpoint: number = CAD_NARROW_BREAKPOINT): boolean {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const apply = () => setNarrow(mq.matches);
    apply();
    // `change` is the modern listener; Safari <14 only had addListener, and the editor is used on
    // iPads in the field, so both are wired.
    if (mq.addEventListener) {
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
    mq.addListener(apply);
    return () => mq.removeListener(apply);
  }, [breakpoint]);

  return narrow;
}

export default useIsNarrow;
