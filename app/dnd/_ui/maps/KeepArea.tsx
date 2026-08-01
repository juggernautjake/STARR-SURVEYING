'use client';
// app/dnd/_ui/maps/KeepArea.tsx — leave a spell area on the map (M5-4).
//
// M5-4's open half: *"area effects persist on the map with their own duration."* Until now a template
// was drawn from a URL and vanished the moment anyone navigated — fine for aiming, useless for a Wall of
// Fire that is going to matter for the next four rounds.
//
// ── IT SAVES THE SHAPE, NOT THE CELLS ──────────────────────────────────────────────────────────────
//
// The object records `{ shape, sizeFt, directionDeg }` and the map recomputes the cells at read time,
// exactly as the live template does. Saving the cell list instead would be a copy — and it would be a
// copy that silently disagrees with the grid the moment a DM changes the squares-across, which is
// precisely the class of defect this directory keeps refusing (a token's HP, a portrait, a spell's size).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../hextech.module.css';

export default function KeepArea({
  campaignId,
  nodeId,
  label,
  shape,
  sizeFt,
  directionDeg,
  x,
  y,
  /** The encounter's current round, or null when no fight is running. */
  currentRound,
}: {
  campaignId: string;
  nodeId: string;
  label: string;
  shape: string;
  sizeFt: number;
  directionDeg: number;
  x: number;
  y: number;
  currentRound: number | null;
}) {
  const router = useRouter();
  const [rounds, setRounds] = useState(3);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function keep() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/dnd/campaigns/${encodeURIComponent(campaignId)}/map-objects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId, kind: 'area', x, y, label,
          // FREEHAND. The template was aimed from the token's own square, which is already snapped; a
          // second snap here would move the area's origin off the caster.
          freehand: true,
          // Players see it. A wall of fire the party cannot see is a wall of fire they walk into.
          visibility: 'players',
          data: {
            template: { shape, sizeFt, directionDeg },
            durationRounds: rounds,
            // The round it BEGAN on, not a countdown — see `durations.ts`. Outside a fight this is 0,
            // which combined with a null current round means the area simply shows its full duration
            // until initiative starts.
            startRound: currentRound ?? 0,
          },
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
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 11.5, color: 'var(--hx-muted)' }}>
        for
        <select
          value={rounds}
          onChange={(e) => setRounds(Number(e.target.value))}
          style={{
            minHeight: 44, background: 'rgba(1,10,19,0.72)', border: '1px solid var(--hx-line)',
            color: 'var(--hx-text)', padding: '0 6px',
          }}
        >
          {[1, 2, 3, 4, 5, 10].map((n) => <option key={n} value={n}>{n} round{n === 1 ? '' : 's'}</option>)}
        </select>
      </label>
      <button
        type="button"
        className={styles.hexBtn}
        disabled={busy}
        onClick={() => void keep()}
        style={{ minHeight: 44, fontSize: 11.5 }}
        title={`Leave ${label} on the map for ${rounds} round${rounds === 1 ? '' : 's'}`}
      >
        ⊕ Leave it on the map
      </button>
      {msg && <span role="status" style={{ fontSize: 11.5, color: 'var(--hx-gold-2)' }}>{msg}</span>}
    </span>
  );
}
