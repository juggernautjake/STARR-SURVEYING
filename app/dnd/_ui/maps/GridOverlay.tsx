// app/dnd/_ui/maps/GridOverlay.tsx — the grid, drawn (M4-1).
//
// A SERVER COMPONENT, deliberately. It has no state and no events: it reads the node's grid and emits
// SVG. Making it a client component would ship the hex maths to the browser to compute the same lines the
// server already knows, on a page whose whole navigation model (M3-2) is server-rendered links.
//
// ── IT LIVES INSIDE THE TRANSFORMED LAYER ────────────────────────────────────────────────────────────
//
// Like the pins and the tokens, so the grid is glued to the map through pan and zoom instead of floating
// over it. That is what makes it a grid ON the map rather than a grid over the window — and it is why the
// SVG's viewBox is the 0–100 world box: one SVG user unit is one world unit, so a cell of `size` world
// units is drawn `size` units wide with no conversion anywhere.
//
// ── BUT THE LINES MUST NOT SCALE ─────────────────────────────────────────────────────────────────────
//
// Zooming 8× would give an 8× thicker line, and a battle grid drawn in ropes is unreadable at exactly the
// zoom a DM uses to place things. So the stroke width is divided by `--map-scale` — the same variable
// MapViewport publishes for the pins' counter-scaling, used here for the one property that must stay
// constant on screen while everything else grows.
//
// **`STROKE` is therefore a width in CSS PIXELS ON SCREEN, not in world units**, and the arithmetic is
// worth writing down because the first version got it backwards. One SVG user unit is one world unit
// (the viewBox is the 0–100 box), the CSS transform then multiplies by `--map-scale`, so a stroke of
// `STROKE / scale` user units lands at exactly `STROKE` pixels however far the reader has zoomed. Setting
// this to a plausible-looking 0.18 produced a 0.18-PIXEL line: drawn, correct, present in the DOM, and in
// the browser a grid you could barely see. `vector-effect="non-scaling-stroke"` reaches the same constant
// width implicitly but pins it to one DEVICE pixel, which is a different and much fainter line on the
// high-DPI phones G5 is about — so the width stays stated rather than inherited from the display.
import { hexCentre, readGrid, WORLD, type MapGrid } from '@/lib/dnd/maps/grid';

/** On-screen line width in CSS pixels, held constant at every zoom by the division below. */
const STROKE = 1;

export default function GridOverlay({ grid: raw, label }: { grid: unknown; label?: string }) {
  const grid = readGrid(raw);
  // No grid is the common, correct state — a space map and a continent have none. Nothing is drawn, and
  // nothing needs to know why.
  if (!grid) return null;

  return (
    <svg
      viewBox={`0 0 ${WORLD} ${WORLD}`}
      // `aria-hidden`: the grid is a drawing aid, and a screen reader announcing "graphic" over every map
      // adds nothing a DM can act on. The map itself carries the accessible name (MapViewport's label).
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: WORLD,
        height: WORLD,
        // The grid is drawn ON the map and UNDER everything placed on it — a pin or a token must never be
        // crossed by a line that is meant to be beneath it.
        pointerEvents: 'none',
        opacity: grid.opacity,
        stroke: grid.colour,
        fill: 'none',
        strokeWidth: `calc(${STROKE} / var(--map-scale, 1))`,
      }}
      data-grid-kind={grid.kind}
      data-grid-cells={Math.round(WORLD / grid.size)}
      data-testid="map-grid"
    >
      {label ? <title>{label}</title> : null}
      {grid.kind === 'hex' ? <HexLines grid={grid} /> : <SquareLines grid={grid} />}
    </svg>
  );
}

/**
 * Square lines.
 *
 * Explicit `<line>` elements rather than a `<pattern>` fill: a pattern tiles from the SVG's own origin, so
 * the DM's offset nudge would have to be applied as a second transform on the pattern — and a nudge that
 * moves the drawn lines but not the snapping is exactly the disagreement `grid.ts` exists to prevent. At
 * the 200-cell ceiling this is 402 elements, which is nothing next to the tokens on the same layer.
 *
 * The loop starts at the first line at or LEFT of zero, so a nudged grid still draws its leftmost line
 * instead of leaving a gap at the edge the DM nudged away from.
 */
function SquareLines({ grid }: { grid: MapGrid }) {
  const lines: React.ReactNode[] = [];
  for (let x = grid.offsetX - grid.size; x <= WORLD; x += grid.size) {
    if (x >= 0) lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={WORLD} />);
  }
  for (let y = grid.offsetY - grid.size; y <= WORLD; y += grid.size) {
    if (y >= 0) lines.push(<line key={`h${y}`} x1={0} y1={y} x2={WORLD} y2={y} />);
  }
  return <>{lines}</>;
}

/**
 * Hex outlines, pointy-top.
 *
 * One closed polygon per hex rather than the three-line-families trick: the polygon is what `hexAt` and
 * `hexCentre` describe, so what is drawn is literally the cell that snapping and distance agree on. The
 * cheaper version draws a correct-looking lattice that is not tied to the coordinate system, and the two
 * drift apart the moment an offset is applied.
 *
 * Ranges are generous by a row and a column each way and the polygons are clipped to the world box, so the
 * half-hexes along every edge are drawn rather than leaving a ragged border.
 */
function HexLines({ grid }: { grid: MapGrid }) {
  const R = grid.size / Math.sqrt(3);
  const rowStep = R * 1.5;
  const rows = Math.ceil(WORLD / rowStep) + 2;
  const cols = Math.ceil(WORLD / grid.size) + 2;

  const hexes: React.ReactNode[] = [];
  for (let r = -1; r <= rows; r += 1) {
    // Each row is shifted half a cell right of the one above, so undo that shift to keep the row spanning
    // the map instead of walking off its right edge as r grows.
    const shift = Math.floor(r / 2);
    for (let q = -1 - shift; q <= cols - shift; q += 1) {
      const c = hexCentre(q, r, grid);
      // Cheap reject: a hex more than a full cell outside the box cannot contribute a visible edge.
      if (c.x < -grid.size || c.x > WORLD + grid.size || c.y < -grid.size || c.y > WORLD + grid.size) continue;
      const pts: string[] = [];
      for (let i = 0; i < 6; i += 1) {
        // Pointy-top: a corner straight up, then every 60°.
        const a = (Math.PI / 180) * (60 * i - 90);
        pts.push(`${(c.x + R * Math.cos(a)).toFixed(3)},${(c.y + R * Math.sin(a)).toFixed(3)}`);
      }
      hexes.push(<polygon key={`${q}:${r}`} points={pts.join(' ')} />);
    }
  }
  // Clipped to the map, so edge hexes are half-drawn rather than hanging past the picture.
  return (
    <>
      <defs>
        <clipPath id="map-grid-clip">
          <rect x={0} y={0} width={WORLD} height={WORLD} />
        </clipPath>
      </defs>
      <g clipPath="url(#map-grid-clip)">{hexes}</g>
    </>
  );
}
