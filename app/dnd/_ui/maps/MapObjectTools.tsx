'use client';
// app/dnd/_ui/maps/MapObjectTools.tsx — change what is already on the board (M4-2).
//
// M4-2 shipped place / move / remove; this is the rest of it — resize, rotate, layer, duplicate,
// multi-select, the snap override, and G7's undo.
//
// ── SELECTION IS CLIENT STATE, UNLIKE `?token=` ─────────────────────────────────────────────────────
//
// Every other selection on this surface is a URL, deliberately: "look at this token's reach" is worth
// sharing, surviving a refresh, and costing no JavaScript. A multi-select is not. It is a transient
// authoring gesture — nobody sends a friend a link meaning "these five props are highlighted" — and
// putting it in the URL would push a history entry per checkbox and make the back button undo
// selections instead of navigation.
//
// ── BOX-SELECT IS A MODE, BECAUSE DRAGGING ALREADY MEANS PAN ────────────────────────────────────────
//
// The map's own drag is pan (M3-1), on every device. A box-select that also lived on drag would have to
// guess which one the DM meant, and it would guess wrong exactly when the map is crowded. So it arms —
// the same "arm, then act" mechanism `PlaceToken` uses, with a visible bar saying what the next gesture
// does, because an invisible mode that swallows the next drag is how a DM ends up somewhere they did not
// ask to be.
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../hextech.module.css';

/** What the tools need to know about one thing on the map. */
export interface EditableObject {
  id: string;
  kind: string;
  label: string | null;
  x: number;
  y: number;
  w: number | null;
  h: number | null;
  rotation: number;
  z: number;
  visibility: string;
}

/** Kinds that own a size. A token's footprint comes from the creature and the grid — see the route. */
const SIZEABLE = new Set(['image', 'prop', 'light', 'area', 'note']);

const nameOf = (o: EditableObject) => o.label?.trim() || `a ${o.kind}`;

export default function MapObjectTools({
  campaignId,
  nodeId,
  objects,
  /** One grid cell in world units, or null on a map with no grid — the size of one nudge. */
  cell,
  /** What the next undo would take back, or null when there is nothing. */
  undoLabel,
}: {
  campaignId: string;
  nodeId: string;
  objects: EditableObject[];
  cell: number | null;
  undoLabel: string | null;
}) {
  const router = useRouter();
  const [sel, setSel] = useState<string[]>([]);
  const [freehand, setFreehand] = useState(false);
  const [boxing, setBoxing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const chosen = objects.filter((o) => sel.includes(o.id));
  const step = cell && cell > 0 ? cell : 1;
  const allSizeable = chosen.length > 0 && chosen.every((o) => SIZEABLE.has(o.kind));

  async function send(method: 'POST' | 'PATCH' | 'DELETE', body: unknown, query = '', path = '') {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(
        `/api/dnd/campaigns/${encodeURIComponent(campaignId)}/map-objects${path}${query}`,
        method === 'DELETE'
          ? { method }
          : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j?.error ?? 'That did not work.'); return null; }
      router.refresh();
      return j;
    } catch {
      setMsg('Network error — please try again.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  /** One change to the whole selection. `ids` (plural) is what makes it ONE undo rather than N. */
  const patch = (extra: Record<string, unknown>) => send('PATCH', { ids: sel, freehand, ...extra });

  async function removeSelected() {
    const j = await send('DELETE', null, `?ids=${sel.map(encodeURIComponent).join(',')}`);
    // Cleared only on success: a failed delete that emptied the selection would leave the DM unable to
    // retry without re-picking everything.
    if (j) setSel([]);
  }

  async function undo() {
    const j = await send('POST', { nodeId }, '', '/undo');
    if (j && j.ok === false) setMsg('There is nothing left to undo on this map.');
    else if (j) { setMsg(j.summary ? `Undone: ${j.summary}` : 'Undone.'); setSel([]); }
  }

  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--hx-gold-2)' }}>
          Edit the map
        </span>
        {/* UNDO IS FIRST AND ALWAYS PRESENT, even with nothing selected — it is the control a DM reaches
            for when something has just gone wrong, and hunting for it is the worst moment to hunt. It
            NAMES what it will take back, because "Undo" alone asks them to remember what they last did. */}
        <button
          type="button"
          className={styles.hexBtn}
          // 44px, G5's touch minimum. The shared `hexBtn` is 38 — fine for a desk, six pixels short for
          // a DM tapping mid-session on a tablet, which is exactly who these controls are for. Set here
          // rather than on the shared class, which every other /dnd surface uses at its own size.
          style={{ minHeight: 44 }}
          disabled={busy || !undoLabel}
          onClick={() => void undo()}
          title={undoLabel ? `Undo: ${undoLabel}` : 'Nothing to undo on this map'}
        >
          ⟲ {undoLabel ? `Undo ${undoLabel.toLowerCase()}` : 'Nothing to undo'}
        </button>

        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: 'var(--hx-muted)' }}>
          <input type="checkbox" checked={freehand} onChange={(e) => setFreehand(e.target.checked)} />
          {/* The override, stated as what it is FOR. A grid is a convenience, not a law — a rug across a
              doorway belongs between two cells. */}
          Ignore the grid (place freehand)
        </label>
      </div>

      {objects.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--hx-muted)' }}>
          Nothing on this map yet — place something above and it will appear here.
        </p>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className={styles.hexBtn}
            disabled={busy}
            aria-pressed={boxing}
            onClick={() => setBoxing((b) => !b)}
            style={{ minHeight: 44, ...(boxing ? { borderColor: 'var(--hx-teal-1)', color: 'var(--hx-teal-1)' } : {}) }}
          >
            ▭ Box-select
          </button>
          <button type="button" className={styles.hexBtn} style={{ minHeight: 44 }} disabled={busy} onClick={() => setSel(objects.map((o) => o.id))}>
            Select all ({objects.length})
          </button>
          <button type="button" className={styles.hexBtn} style={{ minHeight: 44 }} disabled={busy || !sel.length} onClick={() => setSel([])}>
            Clear
          </button>
          {objects.map((o) => {
            const on = sel.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                className={styles.hexBtn}
                disabled={busy}
                aria-pressed={on}
                onClick={() => toggle(o.id)}
                title={`${nameOf(o)} — ${o.kind}, layer ${o.z}, ${o.visibility}`}
                style={{ minHeight: 44, ...(on ? { borderColor: 'var(--hx-teal-1)', color: 'var(--hx-teal-1)' } : {}) }}
              >
                {on ? '☑' : '☐'} {nameOf(o)}
              </button>
            );
          })}
        </div>
      )}

      {boxing && <BoxSelect objects={objects} onPick={(ids) => { setSel(ids); setBoxing(false); }} onCancel={() => setBoxing(false)} />}

      {chosen.length > 0 && (
        <div
          style={{
            display: 'grid', gap: 8, border: '1px solid var(--hx-teal-1)', padding: '8px 10px', fontSize: 12.5,
          }}
        >
          <strong style={{ color: 'var(--hx-teal-1)' }}>
            {chosen.length === 1 ? nameOf(chosen[0]) : `${chosen.length} selected`}
          </strong>

          {/* NUDGE — one cell at a time, which is the unit the map is measured in. Arrow buttons rather
              than a coordinate box for the same reason placing is a map click: nobody thinks in x,y. */}
          <Row label="Move">
            {([['←', -1, 0], ['→', 1, 0], ['↑', 0, -1], ['↓', 0, 1]] as const).map(([g, sx, sy]) => (
              <Tool key={g} busy={busy} title={`Move ${g}`} onClick={() => void patch({ dx: sx * step, dy: sy * step })}>{g}</Tool>
            ))}
            <span style={{ color: 'var(--hx-muted)' }}>
              {cell ? `one square (${step} units)` : 'one unit — this map has no grid'}
            </span>
          </Row>

          <Row label="Layer">
            <Tool busy={busy} title="Bring forward" onClick={() => void patch({ dz: 1 })}>▲</Tool>
            <Tool busy={busy} title="Send backward" onClick={() => void patch({ dz: -1 })}>▼</Tool>
            <Tool busy={busy} title="Bring to front" onClick={() => void patch({ z: 999 })}>⤒</Tool>
            <Tool busy={busy} title="Send to back" onClick={() => void patch({ z: -999 })}>⤓</Tool>
          </Row>

          <Row label="Rotate">
            {[-90, -15, 15, 90].map((d) => (
              <Tool
                key={d}
                busy={busy}
                title={`Rotate ${d > 0 ? 'right' : 'left'} ${Math.abs(d)}°`}
                // Read from the FIRST selected object rather than tracked here. The server normalises to
                // [0,360) and the page re-renders from the row, so there is nowhere for a local copy to
                // drift to — and a rotation this component remembered would be wrong the moment two
                // browsers were open on the same map.
                onClick={() => void patch({ rotation: Number(chosen[0].rotation) + d })}
              >
                {d > 0 ? '↻' : '↺'}{Math.abs(d)}
              </Tool>
            ))}
            <span style={{ color: 'var(--hx-muted)' }}>{Math.round(Number(chosen[0].rotation))}°</span>
          </Row>

          {/* Offered ONLY where a size means something. A disabled control the DM can see and not use is
              a question they have to answer; an absent one never gets asked. */}
          {allSizeable && (
            <Row label="Size">
              {([['−', 0.5], ['+', 2]] as const).map(([g, factor]) => (
                <Tool
                  key={g}
                  busy={busy}
                  title={`${g === '+' ? 'Bigger' : 'Smaller'}`}
                  onClick={() => void patch({
                    w: Math.max(0.5, (Number(chosen[0].w) || step) * factor),
                    h: Math.max(0.5, (Number(chosen[0].h) || step) * factor),
                  })}
                >
                  {g}
                </Tool>
              ))}
              <span style={{ color: 'var(--hx-muted)' }}>
                {chosen[0].w ? `${Number(chosen[0].w)} × ${Number(chosen[0].h ?? chosen[0].w)}` : 'default'}
              </span>
            </Row>
          )}

          <Row label="Seen by">
            <Tool busy={busy} title="Only the DM" onClick={() => void patch({ visibility: 'dm' })}>DM only</Tool>
            <Tool busy={busy} title="Everyone at the table" onClick={() => void patch({ visibility: 'players' })}>Players</Tool>
            <span style={{ color: 'var(--hx-muted)' }}>{chosen[0].visibility}</span>
          </Row>

          <Row label="And">
            {/* Duplicate is one request per object rather than a bulk verb: each copy is its own row and
                the route offsets it from its own source, so duplicating a scattered selection keeps the
                scatter instead of piling the copies in one place. */}
            <Tool
              busy={busy}
              title="Duplicate"
              onClick={async () => { for (const o of chosen) await send('POST', { duplicateOf: o.id }); }}
            >
              ⧉ Duplicate
            </Tool>
            <Tool busy={busy} danger title="Take off the map" onClick={() => void removeSelected()}>
              ✕ Remove {chosen.length > 1 ? `all ${chosen.length}` : ''}
            </Tool>
          </Row>
        </div>
      )}

      {msg && <div role="status" style={{ fontSize: 12, color: 'var(--hx-gold-2)' }}>{msg}</div>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ minWidth: 54, color: 'var(--hx-muted)', fontSize: 11.5 }}>{label}</span>
      {children}
    </div>
  );
}

function Tool({
  children, onClick, busy, title, danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={title}
      aria-label={title}
      style={{
        // 44px, G5's touch minimum — these are the controls a DM uses on a tablet mid-session.
        minWidth: 44, height: 44, padding: '0 10px', cursor: 'pointer', fontSize: 13,
        border: `1px solid ${danger ? 'var(--hx-danger)' : 'var(--hx-line)'}`,
        background: 'rgba(1,10,19,0.72)',
        color: danger ? 'var(--hx-danger)' : 'var(--hx-text)',
      }}
    >
      {children}
    </button>
  );
}

/** The map's world box. Every node draws its picture into a 0–100 square. */
const WORLD = 100;

/**
 * Drag a rectangle over the map; everything inside it is selected.
 *
 * Reads the transformed layer through the DOM, exactly as `PlaceToken` does and for the same reason: the
 * world page stays a server component, and `--map-scale` plus a `transform-origin: 0 0` rect is the whole
 * conversion from a screen point to a world one.
 */
function BoxSelect({
  objects, onPick, onCancel,
}: {
  objects: EditableObject[];
  onPick: (ids: string[]) => void;
  onCancel: () => void;
}) {
  // THE START POINT IS A REF, NOT STATE, and that is a bug fix rather than a preference.
  //
  // With `useState`, the `pointermove` that arrives in the same tick as `pointerdown` still closes over
  // the OLD value — `start` is null, the move is ignored, and the box stays a dot. A slow drag recovers
  // on the next render and looks fine, so the failure only shows on a quick one: the DM flicks a box
  // over three tokens, nothing is selected, and the "that was a tap, cancel" rule fires because the box
  // never grew. Measured exactly that way — one synthetic move produced a 2×2 pixel box and an empty
  // selection.
  //
  // A ref also means no re-render per pointermove, which is why `MapViewport` keeps its pointers in one.
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [now, setNow] = useState<{ x: number; y: number } | null>(null);
  const start = startRef.current;

  /** Screen point → world point, or null when the map is not on screen. */
  function toWorld(clientX: number, clientY: number) {
    const layer = document.querySelector('[data-lod]') as HTMLElement | null;
    if (!layer) return null;
    const scale = Number(getComputedStyle(layer).getPropertyValue('--map-scale'));
    if (!Number.isFinite(scale) || scale <= 0) return null;
    const origin = layer.getBoundingClientRect();
    return { x: (clientX - origin.left) / scale, y: (clientY - origin.top) / scale };
  }

  const rect = start && now
    ? {
        x0: Math.min(start.x, now.x), y0: Math.min(start.y, now.y),
        x1: Math.max(start.x, now.x), y1: Math.max(start.y, now.y),
      }
    : null;

  return (
    <>
      <div
        // Full-window, so the drag cannot be stolen by a pin's link or the viewport's own pan — which is
        // the whole reason this is a mode rather than a gesture.
        style={{ position: 'fixed', inset: 0, zIndex: 40, cursor: 'crosshair' }}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          const p = toWorld(e.clientX, e.clientY);
          if (p) { startRef.current = p; setNow(p); }
        }}
        onPointerMove={(e) => { if (startRef.current) setNow(toWorld(e.clientX, e.clientY) ?? now); }}
        onPointerUp={() => {
          const box = rect;
          startRef.current = null;
          if (!box) { onCancel(); return; }
          // A tap rather than a drag selects nothing and cancels — safer than selecting whatever single
          // object happened to be under a stray click when the DM meant to leave the mode.
          if (box.x1 - box.x0 < 0.5 && box.y1 - box.y0 < 0.5) { onCancel(); return; }
          onPick(
            objects
              .filter((o) => o.x >= box.x0 && o.x <= box.x1 && o.y >= box.y0 && o.y <= box.y1)
              .map((o) => o.id),
          );
        }}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
        role="button"
        tabIndex={0}
        aria-label="Drag a box over the map to select what is inside it, or press Escape to cancel"
      />
      <div
        style={{
          position: 'fixed', left: 12, bottom: 12, zIndex: 41,
          border: '1px solid var(--hx-teal-1)', background: 'rgba(1,10,19,0.92)',
          padding: '8px 10px', fontSize: 12.5, color: 'var(--hx-teal-1)',
        }}
      >
        Drag a box over the map. Escape to cancel.
      </div>
      {/* The box itself, drawn in SCREEN space over the overlay rather than inside the transformed layer:
          it is a gesture the reader is making, not a thing on the map, so it must not zoom with it. */}
      {rect && (
        <BoxOutline rect={rect} />
      )}
    </>
  );
}

function BoxOutline({ rect }: { rect: { x0: number; y0: number; x1: number; y1: number } }) {
  const layer = typeof document === 'undefined' ? null : (document.querySelector('[data-lod]') as HTMLElement | null);
  if (!layer) return null;
  const scale = Number(getComputedStyle(layer).getPropertyValue('--map-scale')) || 1;
  const origin = layer.getBoundingClientRect();
  const clamp = (n: number) => Math.min(WORLD, Math.max(0, n));
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed', zIndex: 41, pointerEvents: 'none',
        left: origin.left + clamp(rect.x0) * scale,
        top: origin.top + clamp(rect.y0) * scale,
        width: (clamp(rect.x1) - clamp(rect.x0)) * scale,
        height: (clamp(rect.y1) - clamp(rect.y0)) * scale,
        border: '1px dashed var(--hx-teal-1)',
        background: 'rgba(110,224,207,0.12)',
      }}
    />
  );
}
