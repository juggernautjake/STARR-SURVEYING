'use client';
// app/dnd/_ui/maps/GridDesigner.tsx — the DM lays a grid over a map (M4-1).
//
// The plan: *"Square or hex, size in pixels, feet per square, offset nudge, colour and opacity, snap
// on/off. Feeds G4: the grid is what converts a sheet's speed in feet into squares."*
//
// ── THE DM SETS CELLS ACROSS, NOT A CELL SIZE ────────────────────────────────────────────────────────
//
// Storage is a cell size in world units, because that is what the drawing and the snapping need. But a
// world unit is a hundredth of the map, and no DM has ever thought "I would like a 3.3333-unit cell". They
// think *"this room is twenty squares wide"*. So the control is a count and the size is derived — the same
// reasoning as the tier tables reporting a sample size: show the number the reader can actually judge.
//
// ── AND FEET PER CELL IS THE POINT OF THE WHOLE SLICE ────────────────────────────────────────────────
//
// G4 says *"the map never hardcodes 30ft or 5ft squares; it asks"*. This field is what it asks. 5 ft is
// the default because it is 5e's square and PF2's and IG's — but a ship's deck at 10 ft to the square, or
// a hex crawl at a mile a hex, is one field away, and every distance the map computes reads it.
//
// A FORM WITH AN APPLY, not a live-editing canvas. The page is server-rendered and the grid is drawn by a
// server component, so applying is a PATCH plus `router.refresh()` — the same write-then-refresh path as
// every other DM control here. The derived summary ("20 × 20 cells · 5 ft each · 100 ft across") is what
// makes the form legible without a preview.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MAX_CELLS, MIN_CELLS, WORLD, readGrid, sizeForCells } from '@/lib/dnd/maps/grid';

const API = (campaignId: string) => `/api/dnd/campaigns/${encodeURIComponent(campaignId)}/world`;

const field: React.CSSProperties = {
  width: '100%', padding: '8px 10px', minHeight: 40, fontSize: 13,
  background: 'rgba(1,10,19,0.5)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)',
};
const btn: React.CSSProperties = {
  minHeight: 40, padding: '8px 14px', fontSize: 13, cursor: 'pointer', borderRadius: 6,
  border: '1px solid var(--hx-line)', background: 'rgba(10,200,185,0.12)', color: 'var(--hx-teal-1)',
};
const labelStyle: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 11, color: 'var(--hx-muted)' };

/** Colours that read on a dark map without fighting the art. Free entry too — this is a shortcut, not a cage. */
const SWATCHES = ['#7fdbd4', '#e8c37a', '#c9d5e3', '#e0806f', '#8fd18a'];

export default function GridDesigner({
  campaignId,
  nodeId,
  nodeName,
  grid: raw,
}: {
  campaignId: string;
  nodeId: string;
  nodeName: string;
  grid: unknown;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The node's current grid, or the sensible starting grid for a node that has none. 20 cells across at
  // 5 ft is a 100-foot map, which is a room or a courtyard — the scale a DM adds a grid FOR.
  const existing = readGrid(raw);
  const [kind, setKind] = useState<'square' | 'hex'>(existing?.kind ?? 'square');
  const [cells, setCells] = useState<number>(existing ? Math.round(WORLD / existing.size) : 20);
  const [unitFt, setUnitFt] = useState<number>(existing?.unitFt ?? 5);
  const [offsetX, setOffsetX] = useState<number>(existing?.offsetX ?? 0);
  const [offsetY, setOffsetY] = useState<number>(existing?.offsetY ?? 0);
  const [colour, setColour] = useState<string>(existing?.colour ?? '#7fdbd4');
  const [opacity, setOpacity] = useState<number>(existing?.opacity ?? 0.35);
  const [snap, setSnap] = useState<boolean>(existing?.snap ?? true);

  const size = sizeForCells(cells);
  const across = Math.round(cells * unitFt);

  async function save(grid: unknown) {
    setError(null);
    try {
      const res = await fetch(API(campaignId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, grid }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json?.error || `Failed (${res.status})`); return false; }
      startTransition(() => router.refresh());
      return true;
    } catch {
      setError('Could not reach the server.');
      return false;
    }
  }

  /** One nudge = one twentieth of a cell, so the control is useful at every cell size rather than being a
   *  whole square at 20 cells and imperceptible at 200. */
  const nudge = (dx: number, dy: number) => {
    setOffsetX((v) => v + dx * (size / 20));
    setOffsetY((v) => v + dy * (size / 20));
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--hx-teal-1)' }}>
          Grid
        </span>
        <button type="button" style={btn} onClick={() => { setOpen(!open); setError(null); }} aria-expanded={open}>
          {existing ? `▦ ${Math.round(WORLD / existing.size)} ${existing.kind === 'hex' ? 'hexes' : 'squares'} · ${existing.unitFt} ft` : '▦ Add a grid'}
        </button>
        {/* WHAT THE GRID MEANS, not just that there is one. A DM reading "20 squares · 5 ft" knows whether
            this map is a room or a battlefield; "grid: on" tells them nothing. */}
        {existing && (
          <span style={{ fontSize: 12, color: 'var(--hx-muted)' }}>
            {Math.round(WORLD / existing.size)} across · {Math.round((WORLD / existing.size) * existing.unitFt)} ft wide
            {existing.snap ? '' : ' · snap off'}
          </span>
        )}
      </div>

      {error && <p role="alert" style={{ color: 'var(--hx-danger-2)', fontSize: 12.5, margin: 0 }}>{error}</p>}

      {open && (
        <form
          style={{ display: 'grid', gap: 10, border: '1px solid var(--hx-line)', padding: '10px 12px' }}
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await save({ kind, size, unitFt, offsetX, offsetY, colour, opacity, snap });
            if (ok) setOpen(false);
          }}
        >
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
            <label style={labelStyle}>
              Shape
              <select style={field} value={kind} onChange={(e) => setKind(e.target.value === 'hex' ? 'hex' : 'square')}>
                <option value="square">Square</option>
                <option value="hex">Hex</option>
              </select>
            </label>
            <label style={labelStyle}>
              {kind === 'hex' ? 'Hexes' : 'Squares'} across
              <input
                style={field}
                type="number"
                inputMode="numeric"
                min={MIN_CELLS}
                max={MAX_CELLS}
                value={cells}
                onChange={(e) => setCells(Number(e.target.value) || MIN_CELLS)}
              />
            </label>
            <label style={labelStyle}>
              Feet per {kind === 'hex' ? 'hex' : 'square'}
              <input
                style={field}
                type="number"
                inputMode="decimal"
                min={0.1}
                step={0.5}
                value={unitFt}
                onChange={(e) => setUnitFt(Number(e.target.value) || 5)}
              />
            </label>
            <label style={labelStyle}>
              Opacity
              <input
                style={{ ...field, padding: 0, minHeight: 40 }}
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
              />
            </label>
          </div>

          {/* THE DERIVED SENTENCE. Two of these three numbers are set above and the third follows; showing
              it is what stops a DM discovering at the table that their dungeon is four miles wide. */}
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--hx-gold-2)' }}>
            {cells} × {cells} {kind === 'hex' ? 'hexes' : 'squares'} · {unitFt} ft each ·{' '}
            <strong>{across} ft across</strong>
          </p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--hx-muted)' }}>Nudge</span>
            {/* ALIGNING TO ART. A battle map that already has squares printed on it needs the lines moved
                a fraction of a cell, not a redraw — without this, an uploaded map and its grid are simply
                never going to line up. */}
            {([['←', -1, 0], ['→', 1, 0], ['↑', 0, -1], ['↓', 0, 1]] as const).map(([glyph, dx, dy]) => (
              <button
                key={glyph}
                type="button"
                aria-label={`Nudge the grid ${({ '←': 'left', '→': 'right', '↑': 'up', '↓': 'down' } as const)[glyph]}`}
                onClick={() => nudge(dx, dy)}
                // 44px, G5's touch minimum — these are the controls most likely to be used on a tablet.
                style={{ ...btn, width: 44, minWidth: 44, padding: 0 }}
              >
                {glyph}
              </button>
            ))}
            <button
              type="button"
              style={{ ...btn, background: 'transparent' }}
              onClick={() => { setOffsetX(0); setOffsetY(0); }}
            >
              Centre
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--hx-muted)' }}>Colour</span>
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Grid colour ${c}`}
                aria-pressed={colour === c}
                onClick={() => setColour(c)}
                style={{
                  width: 32, height: 32, cursor: 'pointer', background: c, borderRadius: 4,
                  border: colour === c ? '2px solid var(--hx-text)' : '1px solid var(--hx-line)',
                }}
              />
            ))}
            <label style={{ ...labelStyle, minWidth: 120 }}>
              Custom
              <input style={field} value={colour} onChange={(e) => setColour(e.target.value)} placeholder="#7fdbd4" />
            </label>
          </div>

          {/* THE COLOUR IS NOT DECORATION HERE. Left to inherit, this label resolved to rgb(15,20,25) —
              near-black on a near-black panel, i.e. an invisible control — because a `label` inside the
              hextech shell picks up a form colour meant for a light surface. Every OTHER label in this
              form happens to set `var(--hx-muted)` as part of its grid style and so escaped it. The
              browser is the only thing that catches this: the checkbox is present, labelled, focusable
              and correct in the accessibility tree, so no test can tell it apart from a visible one. */}
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, minHeight: 40, color: 'var(--hx-text)' }}>
            <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} style={{ width: 20, height: 20 }} />
            {/* SNAP OFF IS A REAL SETTING, not a debug switch — a rug across a doorway, a body slumped in a
                corner and a door in a wall all sit BETWEEN squares. */}
            Snap things to this grid when they are placed
          </label>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="submit" style={btn} disabled={pending}>Apply to {nodeName}</button>
            <button type="button" style={{ ...btn, background: 'transparent' }} onClick={() => setOpen(false)}>Cancel</button>
            {existing && (
              <button
                type="button"
                style={{ ...btn, background: 'rgba(198,64,59,0.14)', color: 'var(--hx-danger-2)', borderColor: 'var(--hx-danger-line)' }}
                disabled={pending}
                onClick={async () => {
                  // Clearing the grid is a normal edit, not a destruction — a DM who added one to a city map
                  // is undoing a mistake, and nothing placed is lost by it. So no confirm.
                  const ok = await save(null);
                  if (ok) setOpen(false);
                }}
              >
                Remove grid
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
