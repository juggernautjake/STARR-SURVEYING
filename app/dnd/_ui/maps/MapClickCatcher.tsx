'use client';
// app/dnd/_ui/maps/MapClickCatcher.tsx — turn the next click on the map into a world coordinate.
//
// Extracted from `PlaceToken` when M4-3's asset tray became the second caller. It is one conversion with
// one non-obvious correctness argument (below), and two copies of it would be two answers to "where did
// the DM click" — the version of this repo's duplicate-implementation problem that is hardest to notice,
// because both copies would look right and only one would have the fix.
//
// ── WHY NOT `layerRect.width / 100` ──────────────────────────────────────────────────────────────────
//
// Tempting and WRONG, and the browser caught it: the transformed layer's own element is FRAME-sized, not
// world-sized — its children are absolutely positioned in world units on top of it. At scale 6.06 in a
// 1078px frame its rect measures 6536px wide while the map itself is 606px, so dividing by the rect width
// put every click at a ninth of where it was aimed.
//
// What IS true is that the layer's `transform-origin` is `0 0`, so after `translate(...) scale(s)` its
// rect's top-left is exactly where world (0,0) landed on screen — and `--map-scale`, which MapViewport
// already publishes for the pins' counter-scaling, is `s`. So one subtraction and one divide is the whole
// conversion, and it stays correct through pan and zoom because both terms are read at click time.

/** The map's world box. Every node draws its picture into a 0–100 square; `bounds` on the node agrees. */
export const WORLD = 100;

/** The transformed world layer, found through the DOM so the pages that host it stay server components. */
export function mapLayer(): HTMLElement | null {
  return document.querySelector('[data-lod]') as HTMLElement | null;
}

/** Screen point → world point, or null when the map is not on screen or has not been measured yet. */
export function screenToMapWorld(clientX: number, clientY: number): { x: number; y: number } | null {
  const layer = mapLayer();
  if (!layer) return null;
  const scale = Number(getComputedStyle(layer).getPropertyValue('--map-scale'));
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const origin = layer.getBoundingClientRect();
  return { x: (clientX - origin.left) / scale, y: (clientY - origin.top) / scale };
}

export default function MapClickCatcher({
  onPick,
  onCancel,
  label = 'Click the map to place it, or press Escape to cancel',
}: {
  onPick: (x: number, y: number) => void;
  onCancel: () => void;
  label?: string;
}) {
  return (
    <div
      // A full-window overlay, so the click cannot land on a pin's link or a zoom button first.
      style={{ position: 'fixed', inset: 0, zIndex: 40, cursor: 'crosshair' }}
      onClick={(e) => {
        const p = screenToMapWorld(e.clientX, e.clientY);
        if (!p) { onCancel(); return; }
        // Clicking OFF the map cancels rather than placing at the nearest edge — a thing appearing in a
        // corner because you clicked past the picture is worse than nothing happening. The server clamps
        // too, but clamping is for a near-miss at the border, not for a click on the footer.
        if (p.x < 0 || p.x > WORLD || p.y < 0 || p.y > WORLD) { onCancel(); return; }
        onPick(p.x, p.y);
      }}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
      role="button"
      tabIndex={0}
      aria-label={label}
    />
  );
}
