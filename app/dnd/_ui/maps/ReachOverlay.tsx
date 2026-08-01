// app/dnd/_ui/maps/ReachOverlay.tsx — the squares a selected token can actually reach. M5-2.
//
// A SERVER COMPONENT, like `GridOverlay` and for the same reason: it has no state and no events. The
// selection is a URL parameter (`?token=`), which is how every other navigation on this surface already
// works (M3-2), so the reachable set is computed once on the server rather than shipping a Dijkstra and a
// character sheet to the browser to recompute what the server already knew.
//
// ── IT SITS BETWEEN THE GRID AND THE TOKENS ────────────────────────────────────────────────────────
//
// Under the tokens, so a figure is never tinted by its own overlay; over the grid, so the lines read
// through the fill rather than being buried by it. Inside the transformed layer, so it is glued to the
// map through pan and zoom — the same rule the grid and the pins follow.
//
// ── ONE FILL, NOT A HEAT MAP ───────────────────────────────────────────────────────────────────────
//
// Every reachable cell gets the same wash. Shading by cost was the first instinct and it is wrong here: a
// DM is asking "can I get there", a yes/no question, and a gradient turns that into a judgement about
// which shade means yes. The exact cost is available per cell as a `title`, for the one time in a session
// somebody wants the number.
import { WORLD, squareCentre, hexCentre, type MapGrid } from '@/lib/dnd/maps/grid';
import type { HexCell, Reachable } from '@/lib/dnd/maps/movement';
import type { Cell } from '@/lib/dnd/maps/grid';

/** On-screen outline width in CSS pixels, held constant at every zoom — see GridOverlay's note. */
const STROKE = 1.5;

export default function ReachOverlay({
  grid, squares, hexes, origin, label,
}: {
  grid: MapGrid | null;
  squares: Array<Reachable<Cell>>;
  hexes: Array<Reachable<HexCell>>;
  origin: Cell | HexCell | null;
  label?: string;
}) {
  if (!grid) return null;
  if (!squares.length && !hexes.length) return null;

  const R = grid.size / Math.sqrt(3);
  const hexPoints = (cx: number, cy: number) => Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90);
    return `${(cx + R * Math.cos(a)).toFixed(3)},${(cy + R * Math.sin(a)).toFixed(3)}`;
  }).join(' ');

  return (
    <svg
      viewBox={`0 0 ${WORLD} ${WORLD}`}
      // The overlay is a drawing aid; the readout beside the map carries the accessible description, so a
      // screen reader is told the numbers rather than "graphic" 130 times.
      aria-hidden="true"
      data-testid="reach-overlay"
      data-reach-cells={squares.length + hexes.length}
      style={{
        position: 'absolute', left: 0, top: 0, width: WORLD, height: WORLD,
        pointerEvents: 'none',
        // Under the tokens (which have no z-index and come later in the DOM) and over the grid.
        zIndex: 0,
      }}
    >
      <title>{label ?? 'Reachable squares'}</title>
      <g
        fill="var(--hx-teal-1, #37d0c0)"
        fillOpacity={0.17}
        stroke="var(--hx-teal-1, #37d0c0)"
        strokeOpacity={0.5}
        strokeWidth={`calc(${STROKE} / var(--map-scale, 1))`}
      >
        {grid.kind === 'square'
          ? squares.map(({ cell, costFt }) => {
              const c = squareCentre(cell, grid);
              return (
                <rect
                  key={`${cell.col},${cell.row}`}
                  x={c.x - grid.size / 2}
                  y={c.y - grid.size / 2}
                  width={grid.size}
                  height={grid.size}
                >
                  {/* ONE expression, not `{costFt} ft`. Adjacent JSX children serialise as a single text
                      node on the server and hydrate as two on the client, which React reports as a
                      hydration mismatch — 13 of them, once per cell, found in the browser. */}
                  <title>{`${costFt} ft`}</title>
                </rect>
              );
            })
          : hexes.map(({ cell, costFt }) => {
              const c = hexCentre(cell.q, cell.r, grid);
              return (
                <polygon key={`${cell.q},${cell.r}`} points={hexPoints(c.x, c.y)}>
                  {/* ONE expression, not `{costFt} ft`. Adjacent JSX children serialise as a single text
                      node on the server and hydrate as two on the client, which React reports as a
                      hydration mismatch — 13 of them, once per cell, found in the browser. */}
                  <title>{`${costFt} ft`}</title>
                </polygon>
              );
            })}
      </g>

      {/* The origin, outlined rather than filled — it is where the token already IS, not somewhere it can
          move to, and filling it would make the token look like a destination. */}
      {origin && (
        <g fill="none" stroke="var(--hx-gold-2, #d8b56b)" strokeOpacity={0.9} strokeWidth={`calc(${STROKE * 1.4} / var(--map-scale, 1))`}>
          {grid.kind === 'square' && 'col' in origin ? (() => {
            const c = squareCentre(origin, grid);
            return <rect x={c.x - grid.size / 2} y={c.y - grid.size / 2} width={grid.size} height={grid.size} />;
          })() : 'q' in origin ? (() => {
            const c = hexCentre(origin.q, origin.r, grid);
            return <polygon points={hexPoints(c.x, c.y)} />;
          })() : null}
        </g>
      )}
    </svg>
  );
}
