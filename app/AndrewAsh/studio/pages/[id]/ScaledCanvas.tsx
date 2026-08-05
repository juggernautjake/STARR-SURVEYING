'use client';

// app/AndrewAsh/studio/pages/[id]/ScaledCanvas.tsx
//
// WHAT A VISITOR ACTUALLY SEES, SHRUNK TO FIT (owner request, 2026-08-05)
// ══════════════════════════════════════════════════════════════════════
//
// *"The editor view of the elements looks completely different… please make it more correctly
// representative. This might require shrinking all of the elements down or zooming out in the
// viewer so that we can see everything in a proportional way."*
//
// ── WHY THE OLD PREVIEW LIED ────────────────────────────────────────────────────────────────────
//
// The blocks re-lay-out on the CANVAS width, because the canvas is `container-type: inline-size` and
// every block's responsive rules are container queries against it (the site's own wide measure is
// 1160px, its layout breakpoint 700px). The desktop preview set no width, so it filled the middle
// pane — roughly 850px between the block list and the inspector. 850px is past the 700px breakpoint
// but well short of 1160px, so two-column sections, hero sizing and spacing all reflowed into an
// arrangement **no visitor ever gets**. The preview was truthful about the blocks and wrong about
// the width, which is the most misleading combination: it looks real.
//
// ── THE FIX ─────────────────────────────────────────────────────────────────────────────────────
//
// Render the canvas at the TRUE design width — 1200px for desktop, 390px for a phone — so the
// container queries fire exactly as they do on the live site, then scale the whole thing down with a
// transform to fit whatever space the pane has. The result is a faithful miniature: the layout is
// the real one, only smaller. A "42%" readout tells the editor it is zoomed, so nothing about the
// small size reads as a rendering bug.
//
// A transform does not change layout box height, so a naked `scale()` would leave a tall column of
// whitespace below the shrunk canvas. The natural height is measured and the wrapper reserves
// `height × scale`, collapsing that gap.

import React, { useLayoutEffect, useRef, useState } from 'react';

/** The width each device's layout is authored for. Desktop is comfortably past the site's 1160px
 *  wide measure so the full desktop arrangement renders; mobile is a real phone width. */
export const DESIGN_WIDTH = { desktop: 1200, mobile: 390 } as const;

/** Horizontal breathing room inside the dark canvas frame, per side. */
const FRAME_PAD = 16;

export interface ScaledCanvasProps {
  device: 'desktop' | 'mobile';
  children: React.ReactNode;
  /** Surfaced so the header can show the zoom level rather than leaving "why is it small?" unanswered. */
  onScaleChange?: (scale: number) => void;
}

export default function ScaledCanvas({ device, children, onScaleChange }: ScaledCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [naturalHeight, setNaturalHeight] = useState(0);

  const designWidth = DESIGN_WIDTH[device];

  // Width drives the scale. Measured off the wrapper so it tracks the pane resizing, the window
  // resizing, and the device toggle changing the target width — all through one observer.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const recompute = () => {
      const avail = wrap.clientWidth - FRAME_PAD * 2;
      // Never scale ABOVE 1: a phone at 390px in a 900px pane should sit at real size, not be
      // blown up into a blurry giant.
      const next = Math.max(0.1, Math.min(1, avail / designWidth));
      setScale(next);
      onScaleChange?.(next);
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [designWidth, onScaleChange]);

  // Height is measured off the canvas's own layout box, which a transform does NOT shrink — so
  // `offsetHeight` here is the true unscaled height, and the reserved space below is exactly right.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => setNaturalHeight(canvas.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="vaBuilderCanvasWrap">
      {/* The sizer reserves the SCALED footprint and centres it, so there is no dead whitespace
          below the miniature and it sits in the middle of the pane. */}
      <div
        className="vaBuilderCanvasSizer"
        style={{ width: designWidth * scale, height: naturalHeight * scale }}
      >
        <div
          ref={canvasRef}
          className={`vaBuilderCanvas${device === 'mobile' ? ' vaBuilderCanvasPhone' : ''}`}
          style={{
            width: designWidth,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
