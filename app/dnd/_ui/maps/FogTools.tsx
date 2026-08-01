'use client';
// app/dnd/_ui/maps/FogTools.tsx — darken a map, and brush the light back in (M7-2).
//
// Two controls that belong together because one is meaningless without the other: turning fog ON with no
// way to reveal anything gives a DM a black rectangle and no exit.
//
// ── REVEALING IS PAINTING, NOT A LIST ──────────────────────────────────────────────────────────────
//
// A revealed region is an ordinary `area` object carrying `data.fog = 'revealed'`, so every tool M4-2
// already built reaches it: move the patch, resize it, delete it, and — the one that matters at a table
// — UNDO it. A DM who reveals the wrong room mid-session presses ⟲ Undo, which is not something a
// bespoke fog table would have given them.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../hextech.module.css';
import MapClickCatcher from './MapClickCatcher';

const SIZES = [1, 2, 3, 5] as const;

export default function FogTools({
  campaignId,
  nodeId,
  fog,
  cell,
}: {
  campaignId: string;
  nodeId: string;
  fog: boolean;
  /** One grid cell in world units, or null on a map with no grid. */
  cell: number | null;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [cells, setCells] = useState<number>(2);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // A brush is measured in squares where there are squares, and in world units where there are not —
  // fog on a continent is a legitimate thing to want, and refusing it because there is no grid would be
  // the map deciding what a DM may hide.
  const step = cell && cell > 0 ? cell : 5;

  async function send(url: string, body: unknown, method: 'POST' | 'PATCH') {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j?.error ?? 'That did not work.'); return false; }
      router.refresh();
      return true;
    } catch {
      setMsg('Network error — please try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const toggleFog = () =>
    send(`/api/dnd/campaigns/${encodeURIComponent(campaignId)}/world`, { id: nodeId, fog: !fog }, 'PATCH');

  const revealAt = (x: number, y: number) =>
    send(`/api/dnd/campaigns/${encodeURIComponent(campaignId)}/map-objects`, {
      nodeId, kind: 'area', x, y, w: step * cells, h: step * cells,
      label: 'Revealed', freehand: true,
      // The PLAYERS' visibility, which reads oddly for a fog patch and is right: this object's job is to
      // let a player see, so a DM-only one would be a hole only the DM could look through.
      visibility: 'players',
      data: { fog: 'revealed' },
    }, 'POST');

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--hx-teal-1)' }}>
          Fog of war
        </span>
        <button
          type="button"
          className={styles.hexBtn}
          disabled={busy}
          aria-pressed={fog}
          onClick={() => void toggleFog()}
          style={{ minHeight: 44, ...(fog ? { borderColor: 'var(--hx-teal-1)', color: 'var(--hx-teal-1)' } : {}) }}
          title={fog
            ? 'Players currently see only what you have revealed and what their own tokens can see.'
            : 'Darken this map for the players. You will still see all of it.'}
        >
          {fog ? '◑ Fog is on' : '◯ Fog is off'}
        </button>

        {fog && (
          <>
            <button
              type="button"
              className={styles.hexBtn}
              disabled={busy}
              aria-pressed={armed}
              onClick={() => setArmed((a) => !a)}
              style={{ minHeight: 44, ...(armed ? { borderColor: 'var(--hx-gold-2)', color: 'var(--hx-gold-2)' } : {}) }}
            >
              ✦ Reveal brush
            </button>
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
                {SIZES.map((n) => (
                  <option key={n} value={n}>{n} × {n} {cell ? 'squares' : 'units'}</option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      {fog && (
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--hx-muted)' }}>
          {/* Said out loud, because a DM cannot see the difference on their own screen: their fog is a
              wash over a map they can still read, and a player's is opaque with the things inside it not
              sent at all. */}
          Your fog is a wash — you see the whole map. A player sees only the revealed patches and what
          their own tokens can see; anything else is not sent to them at all.
        </p>
      )}

      {armed && fog && (
        <>
          <div
            style={{
              display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
              border: '1px solid var(--hx-gold-2)', padding: '8px 10px', fontSize: 12.5,
            }}
          >
            <strong style={{ color: 'var(--hx-gold-2)' }}>
              Click the map to reveal a {cells} × {cells} patch. It stays armed, so you can brush a room.
            </strong>
            <button
              type="button"
              onClick={() => setArmed(false)}
              style={{ background: 'none', border: 'none', color: 'var(--hx-muted)', cursor: 'pointer', textDecoration: 'underline', minHeight: 44 }}
            >
              Done
            </button>
          </div>
          <MapClickCatcher
            onPick={(x, y) => void revealAt(x, y)}
            onCancel={() => setArmed(false)}
            label="Click the map to reveal a patch, or press Escape to stop"
          />
        </>
      )}

      {msg && <div role="status" style={{ fontSize: 12, color: 'var(--hx-gold-2)' }}>{msg}</div>}
    </div>
  );
}
