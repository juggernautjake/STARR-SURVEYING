// app/dnd/_ui/maps/MapObjectView.tsx — everything on the map that is not a token (M4-2).
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────────
//
// `dnd_map_objects` has carried seven kinds since M1-3, and the world page drew exactly two of them:
// tokens, and hidden objects that had been found. So a DM could place a prop, a light or an area and see
// **nothing at all** — the row existed, the tools could move it, and the map was silent about it.
//
// That was survivable while nothing could create one. M4-2's editing tools change that: they offer
// resize, rotate and layer controls for kinds the map does not draw, which would make this the worst
// version of the repo's signature defect — not an unwired feature, but a control that appears to work
// and produces something invisible.
//
// ── ONE COMPONENT, DISCRIMINATED BY KIND — FOR THE SAME REASON THERE IS ONE TABLE ──────────────────
//
// M1-3's argument was that the DM's manipulations (move, resize, rotate, layer, delete, undo) are
// identical for all of them, so they should be one code path. The same holds for drawing: position,
// footprint, rotation and layer are shared, and only the fill differs. Seven components would be seven
// places to forget the rotation transform.
import styles from '../hextech.module.css';
import { TERRAIN_LABEL, type TerrainKind } from '@/lib/dnd/maps/terrain';

export interface DrawableObject {
  id: string;
  kind: string;
  x: number;
  y: number;
  w: number | null;
  h: number | null;
  rotation: number;
  z: number;
  asset_url: string | null;
  label: string | null;
  visibility: string;
  /**
   * M5-2 — difficult ground and blockers are `area` objects, and they must not look like every other
   * area. A DM cannot plan an encounter around terrain they have to hover over to identify, and a player
   * who cannot see the mud walks into it and is told afterwards they are out of movement.
   */
  terrain?: TerrainKind | null;
}

/** Kinds this draws. Tokens and found secrets have their own renderers on the page. */
export const DRAWN_KINDS = new Set(['image', 'prop', 'light', 'area', 'note']);

/** World units. A thing with no size of its own still has to be big enough to see and to hit. */
const DEFAULT_SIZE = 5;

export default function MapObjectView({ o, isDm }: { o: DrawableObject; isDm: boolean }) {
  if (!DRAWN_KINDS.has(o.kind)) return null;

  const w = Number(o.w) > 0 ? Number(o.w) : DEFAULT_SIZE;
  const h = Number(o.h) > 0 ? Number(o.h) : w;
  const name = o.label?.trim() || (o.terrain ? TERRAIN_LABEL[o.terrain] : o.kind);
  // A DM-only object is marked as such ON THE MAP, not merely in a list. Without it a DM cannot tell,
  // while looking at their own board, which of these the party can see — and "I thought they could see
  // the brazier" is a mistake you only find out about mid-session.
  const secret = isDm && o.visibility === 'dm';

  return (
    <div
      data-testid={`map-object-${o.kind}`}
      title={secret ? `${name} — only you can see this` : name}
      style={{
        position: 'absolute',
        // WORLD UNITS. Inside the transformed layer one CSS pixel is one world unit, so these are the
        // same numbers the database stores and the same ones the tools change.
        left: o.x,
        top: o.y,
        width: w,
        height: h,
        // Centred on its own point, like a token — so "move one square" moves it one square rather than
        // moving its top-left corner one square, which is a different distance for a 4×4.
        //
        // Rotation composes INSIDE the centring translate, not outside it: rotating about the top-left
        // would swing a large prop across the map instead of turning it on the spot.
        transform: `translate(-50%, -50%) rotate(${Number(o.rotation) || 0}deg)`,
        transformOrigin: 'center',
        // The DM's own layer order. Tokens sit above all of this on the page, deliberately: a prop that
        // covered a creature would hide the one thing a battle map exists to show.
        zIndex: Math.max(0, Number(o.z) + 100),
        // Terrain outranks the kind's own fill: an `area` carrying `data.terrain` is terrain first.
        ...(o.terrain ? TERRAIN_FILL[o.terrain] : FILL[o.kind]),
        ...(secret ? { outline: '1px dashed var(--hx-gold-2)', outlineOffset: 1 } : {}),
      }}
    >
      {o.asset_url ? (
        // An <img>, never `background: url(${asset_url})` — that builds CSS from a DM-supplied string,
        // where an unescaped `)` ends the url() and whatever follows is parsed as more CSS. Same rule
        // the token art follows.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={o.asset_url}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />
      ) : null}
      {/* The name is in the accessible tree at every zoom, and drawn only where there is room for it —
          the same rule as a pin's label, and the reason `data-lod` is published at all. */}
      <span className={styles.srOnly}>
        {name}{secret ? ' (only the DM can see this)' : ''}
      </span>
    </div>
  );
}

/**
 * Terrain reads at a glance, and the two kinds are deliberately not variations of one another.
 *
 * Difficult ground is a WASH you can see the map through — you may cross it, it just costs. A blocker is
 * OPAQUE with a hard edge, because the one thing it must never look like is somewhere you could walk.
 * Colour alone would not carry that: on a dark map at play zoom, two translucent tints are the same
 * thing, so the difference is opacity and edge rather than hue.
 */
const TERRAIN_FILL: Record<TerrainKind, React.CSSProperties> = {
  difficult: {
    background: 'repeating-linear-gradient(45deg, rgba(214,178,105,0.30) 0 0.6px, rgba(214,178,105,0.06) 0.6px 1.4px)',
    border: '0.15px dashed var(--hx-gold-2)',
  },
  blocked: {
    background: 'rgba(1,10,19,0.92)',
    border: '0.25px solid var(--hx-gold-1)',
  },
};

/**
 * What each kind looks like when it has no art.
 *
 * Deliberately plain and deliberately DIFFERENT from each other: a DM glancing at a board needs to tell
 * a light from an area of difficult ground without reading a label, and four identical grey rectangles
 * would make the kind field decorative.
 */
const FILL: Record<string, React.CSSProperties> = {
  image: { background: 'rgba(110,224,207,0.10)', border: '0.15px solid var(--hx-teal-1)' },
  prop: { background: 'rgba(214,178,105,0.22)', border: '0.15px solid var(--hx-gold-2)', borderRadius: '10%' },
  // A light reads as a glow rather than a shape, because it describes an area of effect and not an
  // object standing in the way.
  light: {
    background: 'radial-gradient(circle, rgba(255,224,150,0.45) 0%, rgba(255,224,150,0.06) 70%, transparent 100%)',
    borderRadius: '50%',
  },
  area: { background: 'rgba(110,224,207,0.18)', border: '0.15px dashed var(--hx-teal-1)' },
  // A note is a marker, not a region: it is something the DM wrote, so it stays small and legible rather
  // than covering the ground it refers to.
  note: {
    background: 'rgba(1,10,19,0.78)', border: '0.15px solid var(--hx-gold-2)', borderRadius: '20%',
    display: 'grid', placeItems: 'center', color: 'var(--hx-gold-2)', fontSize: 2.6, lineHeight: 1,
  },
};
