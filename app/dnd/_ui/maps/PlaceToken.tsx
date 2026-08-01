'use client';
// app/dnd/_ui/maps/PlaceToken.tsx — the DM puts a piece on the board (M4-2).
//
// Owner, 2026-07-30: *"Make sure we can actually run sessions with it."* M5-1 made tokens READ and RENDER;
// until something can write one, the only way to get a token onto a map was an INSERT by hand.
//
// ── CLICK THE MAP, NOT A FORM ────────────────────────────────────────────────────────────────────────
//
// Placing is "arm, then click where it goes", because a coordinate pair typed into two number boxes is not
// how anyone thinks about a map. The armed state is deliberately visible and cancellable — an invisible
// mode that swallows the next click is how a DM ends up with a goblin where they meant to pan.
//
// ── THE SERVER OWNS THE POSITION ─────────────────────────────────────────────────────────────────────
//
// This sends the raw world coordinate and lets the route snap it to the node's grid and clamp it to the
// map's bounds. Doing it here would be a second implementation of snapping — a second answer to "which
// square is this on" — and a client that computes its own position is one that can place a token outside
// the map, where the viewport's own pan clamp means nothing could ever scroll to it.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../hextech.module.css';
// M4-3 — the click-to-world conversion is SHARED with the asset tray. Two copies would be two answers
// to "where did the DM click", and the argument for why it is not `rect.width / 100` lives in one place.
import MapClickCatcher from './MapClickCatcher';

export interface PlaceableSubject {
  /** `character` | `creature` — which id field the token's data carries. */
  kind: 'character' | 'creature';
  id: string;
  name: string;
}

/** A token already on this map — what the DM can move or take off. */
export interface PlacedToken {
  id: string;
  label: string;
}

/** What the next map-click will do. `place` creates; `move` repositions the token it names. */
type Armed =
  | { mode: 'place'; subject: PlaceableSubject }
  | { mode: 'move'; token: PlacedToken };

export default function PlaceToken({
  campaignId,
  nodeId,
  subjects,
  placed = [],
}: {
  campaignId: string;
  nodeId: string;
  /** What this campaign can put on a map: its party, plus creatures sent to the fight. */
  subjects: PlaceableSubject[];
  /** What is already standing on this node. */
  placed?: PlacedToken[];
}) {
  const router = useRouter();
  const [armed, setArmed] = useState<Armed | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  /** One request path for all three verbs, so the busy/error/refresh handling cannot diverge between them. */
  async function send(method: 'POST' | 'PATCH' | 'DELETE', body: unknown, query = '') {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(
        `/api/dnd/campaigns/${encodeURIComponent(campaignId)}/map-objects${query}`,
        method === 'DELETE'
          ? { method }
          : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j?.error ?? 'That did not work.'); return false; }
      setArmed(null);
      // Server-rendered map, so a refresh is what redraws the board.
      router.refresh();
      return true;
    } catch {
      setMsg('Network error — please try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  function pickedAt(x: number, y: number) {
    if (!armed) return;
    if (armed.mode === 'move') {
      // PATCH, not delete-and-recreate: the object keeps its id, so its notes, layer and visibility survive
      // the move. Recreating would silently reset all three to the defaults.
      void send('PATCH', { id: armed.token.id, x, y });
      return;
    }
    const s = armed.subject;
    void send('POST', {
      nodeId,
      kind: 'token',
      x,
      y,
      label: s.name,
      data: {
        [s.kind === 'character' ? 'characterId' : 'creatureId']: s.id,
        // NO `size` — deliberately. This used to write `size: 'medium'` for everything, so an Ogre stood
        // on one square while its own stat block said Large. A creature knows how big it is; the renderer
        // asks its sheet (M5-1b). The field stays available as the DM's explicit override, which is what
        // it was always meant to be — writing a default into it made every token an override of nothing.
        nickname: s.name,
      },
      // Visible to the party on placement. A token is the one object kind whose whole purpose is to be
      // seen — unlike a trap or a secret door, which the route defaults to DM-only.
      visibility: 'players',
    });
  }

  const armedName = armed ? (armed.mode === 'place' ? armed.subject.name : armed.token.label) : null;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--hx-teal-1)' }}>
          Place a token
        </span>
        {subjects.length === 0 && (
          <span style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>
            Nothing to place yet — add a character to the campaign, or send a creature from the bestiary to a fight.
          </span>
        )}
        {subjects.map((s) => {
          const on = armed?.mode === 'place' && armed.subject.id === s.id;
          return (
            <button
              key={`${s.kind}:${s.id}`}
              type="button"
              className={styles.hexBtn}
              disabled={busy}
              aria-pressed={on}
              onClick={() => setArmed(on ? null : { mode: 'place', subject: s })}
              style={on ? { borderColor: 'var(--hx-teal-1)', color: 'var(--hx-teal-1)' } : undefined}
            >
              {s.kind === 'character' ? '🧙' : '☠'} {s.name}
            </button>
          );
        })}
      </div>

      {/* ON THE BOARD — move and remove. Without these a misplaced token is permanent, which makes placing
          one a decision a DM hesitates over rather than a thing they do mid-session. */}
      {placed.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--hx-gold-2)' }}>
            On the board
          </span>
          {placed.map((t) => {
            const on = armed?.mode === 'move' && armed.token.id === t.id;
            return (
              <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <button
                  type="button"
                  className={styles.hexBtn}
                  disabled={busy}
                  aria-pressed={on}
                  onClick={() => setArmed(on ? null : { mode: 'move', token: t })}
                  style={on ? { borderColor: 'var(--hx-gold-2)', color: 'var(--hx-gold-2)' } : undefined}
                >
                  ✥ {t.label}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Take ${t.label} off the map`}
                  title={`Take ${t.label} off the map`}
                  onClick={() => void send('DELETE', null, `?id=${encodeURIComponent(t.id)}`)}
                  style={{
                    background: 'none', border: '1px solid var(--hx-line)', color: 'var(--hx-muted)',
                    // 30px rather than 44: this is a destructive control sitting beside the one you actually
                    // want, and a big easy target next to "move" is a token deleted by a fat finger.
                    width: 30, height: 30, cursor: 'pointer', lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}

      {armed && (
        // The armed state says what will happen and how to stop it. A mode that only shows as a pressed
        // button is a mode a DM forgets they are in.
        <div
          style={{
            display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
            border: '1px solid var(--hx-teal-1)', padding: '8px 10px', fontSize: 12.5,
          }}
        >
          <strong style={{ color: 'var(--hx-teal-1)' }}>
            Click the map to {armed.mode === 'move' ? 'move' : 'place'} {armedName}.
          </strong>
          <button
            type="button"
            onClick={() => setArmed(null)}
            style={{ background: 'none', border: 'none', color: 'var(--hx-muted)', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* The click target is the map itself, reached through the DOM rather than through a prop, so the
          world page stays a server component. The viewport publishes `--map-scale` and `data-lod` for the
          same reason — this is the third consumer of that pattern. */}
      {armed && (
        <MapClickCatcher
          onPick={pickedAt}
          onCancel={() => setArmed(null)}
          label={`Click the map to ${armed.mode === 'move' ? 'move' : 'place'} ${armedName}, or press Escape to cancel`}
        />
      )}

      {msg && <div role="status" style={{ fontSize: 12, color: 'var(--hx-gold-2)' }}>{msg}</div>}
    </div>
  );
}
