// app/dnd/_ui/maps/FogOverlay.tsx — the dark, and the holes in it (M7-2).
//
// ONE rectangle with an SVG mask, not a grid of dark cells. A per-cell fog is 1,600 elements on a 40×40
// map to draw a shape that is mostly one colour, and it looks blocky in a way nothing else here does.
//
// ── THE DM'S FOG IS TRANSLUCENT; A PLAYER'S IS NOT ─────────────────────────────────────────────────
//
// A DM needs to see the whole map AND know what the party cannot see, so their fog is a wash. A player's
// is opaque, and the things inside it are not rendered at all — see the page, which filters them out of
// the payload rather than covering them up. A token hidden under a translucent overlay is a token
// anybody can find by turning up their screen brightness, which is the same mistake as filtering a
// secret in React instead of in the query (G3).
import { FOG_RECT, type FogHole } from '@/lib/dnd/maps/fog';

export default function FogOverlay({
  holes,
  isDm,
  id,
}: {
  holes: FogHole[];
  isDm: boolean;
  /** Unique per node, because two masks with one id on a page is one mask. */
  id: string;
}) {
  const maskId = `fog-mask-${id}`;
  return (
    <svg
      viewBox={`0 0 ${FOG_RECT.w} ${FOG_RECT.h}`}
      aria-hidden="true"
      data-testid="fog-overlay"
      data-fog-holes={holes.length}
      style={{
        position: 'absolute', left: 0, top: 0, width: FOG_RECT.w, height: FOG_RECT.h,
        pointerEvents: 'none',
        // Above the map and its scenery, below the tokens — a piece the party CAN see must not be dimmed
        // by the fog around it, and a DM moving a token needs to see the token they are moving.
        zIndex: 1,
      }}
    >
      <defs>
        <mask id={maskId}>
          {/* White is drawn, black is cut away. The whole map is drawn, then each hole is punched. */}
          <rect x={0} y={0} width={FOG_RECT.w} height={FOG_RECT.h} fill="#fff" />
          {holes.map((h, i) =>
            h.r !== undefined ? (
              <circle key={i} cx={h.x} cy={h.y} r={h.r} fill="#000" />
            ) : (
              <rect
                key={i}
                x={h.x - (h.w ?? 0) / 2}
                y={h.y - (h.h ?? h.w ?? 0) / 2}
                width={h.w ?? 0}
                height={h.h ?? h.w ?? 0}
                fill="#000"
              />
            ),
          )}
        </mask>
      </defs>
      <rect
        x={0} y={0} width={FOG_RECT.w} height={FOG_RECT.h}
        // A DM's fog says "the party cannot see here"; a player's fog IS not seeing. Two different jobs,
        // so two different opacities rather than one compromise that is too dark to author through and
        // too light to hide behind.
        fill="var(--hx-navy-0, #010a13)"
        fillOpacity={isDm ? 0.55 : 1}
        mask={`url(#${maskId})`}
      />
    </svg>
  );
}
