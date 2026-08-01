'use client';
// app/dnd/_ui/maps/TerrainBrush.tsx — paint difficult ground and blockers onto a map (M5-2).
//
// The writer M5-2's own note demanded: *"M5-2 must either add [an authoring surface] or state plainly
// that the overlay ignores terrain. Building the reader without the writer would be the same defect this
// slice just found twice."* It stated it plainly, and this closes it.
//
// ── IT PAINTS `area` OBJECTS, NOT A NEW KIND OF THING ───────────────────────────────────────────────
//
// A patch of mud needs placing, moving, resizing, rotating, layering, hiding from players, deleting and
// undoing, and every one of those already works for an `area` object. So terrain is `data.terrain` on
// one, and the whole of M4-2's toolbox reaches it for free. A dedicated table or kind would have been a
// second set of all nine.
//
// ── IT STAYS ARMED, LIKE THE ASSET TRAY ────────────────────────────────────────────────────────────
//
// Terrain comes in patches, not in single squares: a bog is eight clicks. Disarming after each one would
// make painting a river a trip through the toolbar per cell.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../hextech.module.css';
import { TERRAIN_LABEL, type TerrainKind } from '@/lib/dnd/maps/terrain';
import MapClickCatcher from './MapClickCatcher';

/** Brush sizes in CELLS, because a DM thinks "three squares wide", never "fifteen world units". */
const SIZES = [1, 2, 3] as const;

export default function TerrainBrush({
  campaignId,
  nodeId,
  cell,
}: {
  campaignId: string;
  nodeId: string;
  /** One grid cell in world units, or null on a map with no grid. */
  cell: number | null;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState<TerrainKind | null>(null);
  const [cells, setCells] = useState<number>(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Terrain on a map with no grid is meaningless — there are no squares to cost — so the control says so
  // rather than letting a DM paint mud onto a continent and wonder why nothing counts it.
  if (!cell || cell <= 0) {
    return (
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--hx-muted)' }}>
        <strong style={{ color: 'var(--hx-gold-2)' }}>Terrain</strong> — set a grid above first. Difficult
        ground and blockers are counted in squares, so a map without a grid has nothing to count.
      </p>
    );
  }

  const side = cell * cells;

  async function paintAt(x: number, y: number) {
    if (!armed) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/dnd/campaigns/${encodeURIComponent(campaignId)}/map-objects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId, kind: 'area', x, y, w: side, h: side,
          label: TERRAIN_LABEL[armed],
          // PLAYERS SEE IT. Difficult ground a party cannot see is a party that walks into it and is told
          // afterwards that they are out of movement — which is the DM having a private rule rather than
          // a map. A DM who wants hidden terrain flips this object's visibility with the object tools;
          // the default is the honest one.
          visibility: 'players',
          data: { terrain: armed },
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j?.error ?? 'That did not work.'); return; }
      router.refresh();
    } catch {
      setMsg('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--hx-gold-2)' }}>
          Terrain
        </span>
        {(['difficult', 'blocked'] as const).map((k) => {
          const on = armed === k;
          return (
            <button
              key={k}
              type="button"
              className={styles.hexBtn}
              disabled={busy}
              aria-pressed={on}
              onClick={() => setArmed(on ? null : k)}
              style={{ minHeight: 44, ...(on ? { borderColor: 'var(--hx-teal-1)', color: 'var(--hx-teal-1)' } : {}) }}
              title={k === 'difficult'
                ? 'Costs double to enter — the movement overlay routes around it when that is cheaper'
                : 'Cannot be entered at all — the overlay goes around it'}
            >
              {k === 'difficult' ? '≈' : '▮'} {TERRAIN_LABEL[k]}
            </button>
          );
        })}
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: 'var(--hx-muted)' }}>
          Brush
          <select
            value={cells}
            onChange={(e) => setCells(Number(e.target.value))}
            style={{
              minHeight: 44, background: 'rgba(1,10,19,0.72)', border: '1px solid var(--hx-line)',
              color: 'var(--hx-text)', padding: '0 8px',
            }}
          >
            {SIZES.map((n) => <option key={n} value={n}>{n} × {n} squares</option>)}
          </select>
        </label>
      </div>

      {armed && (
        <div
          style={{
            display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
            border: '1px solid var(--hx-teal-1)', padding: '8px 10px', fontSize: 12.5,
          }}
        >
          <strong style={{ color: 'var(--hx-teal-1)' }}>
            Click the map to paint {TERRAIN_LABEL[armed].toLowerCase()} ({cells} × {cells}). It stays
            armed, so you can paint a patch.
          </strong>
          <button
            type="button"
            onClick={() => setArmed(null)}
            style={{ background: 'none', border: 'none', color: 'var(--hx-muted)', cursor: 'pointer', textDecoration: 'underline', minHeight: 44 }}
          >
            Done
          </button>
        </div>
      )}

      {armed && (
        <MapClickCatcher
          onPick={paintAt}
          onCancel={() => setArmed(null)}
          label={`Click the map to paint ${TERRAIN_LABEL[armed].toLowerCase()}, or press Escape to stop`}
        />
      )}

      {msg && <div role="status" style={{ fontSize: 12, color: 'var(--hx-gold-2)' }}>{msg}</div>}
    </div>
  );
}
