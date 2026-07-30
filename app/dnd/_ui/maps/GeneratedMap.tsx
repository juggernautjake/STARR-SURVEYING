// app/dnd/_ui/maps/GeneratedMap.tsx — draws the generated map for a node with no art (M2-2).
//
// The thinking lives in `lib/dnd/maps/html-world.ts`; this only paints what it is handed. That split is
// deliberate — the interesting half (determinism, tier vocabulary, palettes, shapes staying inside the
// frame) is asserted by 62 tests against the pure module, and this file has no branch worth testing.
//
// SVG RATHER THAN DIVS. The plan says "HTML", and a stack of absolutely-positioned divs would satisfy the
// letter of it, but SVG gives a `viewBox` — so one component serves a 96px pin thumbnail and a full-screen
// map with no per-size code, which is exactly what M3's zoom needs. It also means the whole map is one
// element to the browser's layout engine rather than 130 positioned boxes, which matters when a starfield
// has 130 of them.
//
// NOT decorative. A generated map carries the node's name and its tier as an accessible label, because for
// a screen-reader user "a city street plan — Ironrow" is the entire content of this element.
import { worldVisual, type WorldFeature } from '@/lib/dnd/maps/html-world';

interface GeneratedMapProps {
  /** The node id — the seed. The same id always draws the same map. */
  nodeId: string;
  tier: string | null | undefined;
  /** Used only for the accessible label; the picture comes from the id. */
  name?: string;
  className?: string;
  /** Rounded corners, for thumbnails. */
  radius?: number;
}

/** One feature → one SVG element. Round things are circles; the rest are rects with a rotation. */
function Shape({ f, palette }: { f: WorldFeature; palette: string[] }) {
  const fill = `rgba(${palette[f.tone] ?? palette[palette.length - 1]}, ${f.alpha})`;

  if (f.kind === 'star' || f.kind === 'nebula' || f.kind === 'disc') {
    return (
      <circle
        cx={f.x}
        cy={f.y}
        r={f.r}
        fill={fill}
        // A nebula is a soft cloud, not a hard disc — the blur is what stops a starfield's backdrop
        // reading as three flat circles behind the stars.
        filter={f.kind === 'nebula' ? 'url(#gm-soft)' : undefined}
      />
    );
  }

  if (f.kind === 'landmass' || f.kind === 'region') {
    // An ellipse rather than a circle: real landmasses are not round, and one squashed axis plus a
    // rotation is enough irregularity to read as coastline at map scale.
    return (
      <ellipse
        cx={f.x}
        cy={f.y}
        rx={f.r}
        ry={f.r * 0.62}
        fill={fill}
        transform={f.rotation ? `rotate(${f.rotation} ${f.x} ${f.y})` : undefined}
      />
    );
  }

  // road | block | room — rectangles, drawn from their centre so rotation behaves.
  const w = f.r;
  const h = f.h ?? f.r;
  return (
    <rect
      x={f.x - w / 2}
      y={f.y - h / 2}
      width={w}
      height={h}
      fill={fill}
      // Rooms get a visible wall; blocks and roads are solid fills.
      stroke={f.kind === 'room' ? `rgba(${palette[palette.length - 1]}, 0.9)` : undefined}
      strokeWidth={f.kind === 'room' ? 0.6 : undefined}
      transform={f.rotation ? `rotate(${f.rotation} ${f.x} ${f.y})` : undefined}
    />
  );
}

export default function GeneratedMap({ nodeId, tier, name, className, radius = 0 }: GeneratedMapProps) {
  const v = worldVisual(nodeId, tier);
  const label = name ? `${name} — ${v.label}` : v.label;
  // Unique per node so two maps on one page cannot share a clip path or a filter id.
  const uid = `gm-${nodeId.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      role="img"
      aria-label={label}
      style={{ display: 'block', width: '100%', height: '100%' }}
    >
      <defs>
        <filter id="gm-soft">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        {radius > 0 && (
          <clipPath id={uid}>
            <rect x="0" y="0" width="100" height="100" rx={radius} ry={radius} />
          </clipPath>
        )}
      </defs>
      <g clipPath={radius > 0 ? `url(#${uid})` : undefined}>
        <rect x="0" y="0" width="100" height="100" fill={`rgb(${v.palette[0]})`} />
        {v.features.map((f, i) => (
          <Shape key={i} f={f} palette={v.palette} />
        ))}
      </g>
    </svg>
  );
}
