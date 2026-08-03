'use client';
// app/dnd/_ui/maps/CreatureSearch.tsx — pull a creature onto the board from the catalogue (P13-13b).
//
// THE GAP THIS CLOSES. Everything needed to place a bestiary creature already existed: a token stores
// `{ creatureId }`, `loadTokenSubjects` resolves it straight out of `dnd_creatures` for name, portrait and
// size, and `loadBestiary()` does faceted search in the database. The only route from the catalogue to the
// board was a PUSH — open the creature's page, "send to fight", then come back to the map — so
// `PlaceToken`'s list was "your party, plus creatures already sent", and its empty state told a DM to go
// somewhere else and come back. A DM who wants a wolf mid-session should type "wolf".
//
// ── IT ARMS, IT DOES NOT PLACE ───────────────────────────────────────────────────────────────────────
//
// Picking a result hands the creature to `PlaceToken`'s existing armed state rather than writing anything.
// Placing is still "arm, then click the map", because that is how the rest of this control works and
// because the server still owns the coordinate (it snaps to the grid and clamps to the bounds). A picker
// that placed at a guessed position would be a second answer to "which square is this on".
//
// ── ONE SYSTEM NOTE, STATED RATHER THAN ENGINEERED AROUND ────────────────────────────────────────────
//
// `loadBestiary` reads the canonical view, which shows ONE row per creature — the highest-ranked edition's
// — while filtering by "is this creature in <system> at all". So in a Pathfinder campaign a search may
// return the 5e row of a creature that exists in both. For a TOKEN that is harmless: only name, portrait
// and size are read, and `/dnd/bestiary/<slug>` has the system lens for the statblock. Picking the row
// per campaign system instead would mean a second ranking, disagreeing with the browse page about which
// entry a creature "is".
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from '../hextech.module.css';

export interface FoundCreature {
  id: string;
  name: string;
  cr: string | null;
  type: string | null;
  size: string | null;
  systems: string[];
}

export default function CreatureSearch({
  system,
  onPick,
  disabled = false,
}: {
  /** The campaign's system, so the first thing a DM sees is their own game's creatures. Optional — with
   *  no system the whole catalogue is searched, which is right for a table that mixes them. */
  system?: string | null;
  onPick: (c: FoundCreature) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<FoundCreature[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Every keystroke would be a query against a 5,000-row catalogue, and out-of-order responses would let
  // an older result overwrite a newer one — the classic type-ahead flicker where the list disagrees with
  // the box. The debounce handles the first, the run counter the second.
  const run = useRef(0);

  const search = useCallback(async (query: string) => {
    const mine = ++run.current;
    setBusy(true);
    setErr(null);
    try {
      const u = new URL('/api/dnd/bestiary/search', window.location.origin);
      if (query.trim()) u.searchParams.set('q', query.trim());
      if (system) u.searchParams.set('system', system);
      const r = await fetch(u.toString());
      const j = await r.json().catch(() => ({}));
      if (mine !== run.current) return;              // a newer search already answered
      if (!r.ok) { setErr(j?.error ?? 'Could not search the bestiary.'); return; }
      setRows(j.creatures ?? []);
      setTotal(j.total ?? 0);
    } catch {
      if (mine === run.current) setErr('Could not search the bestiary.');
    } finally {
      if (mine === run.current) setBusy(false);
    }
  }, [system]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void search(q), q ? 220 : 0);
    return () => clearTimeout(t);
  }, [open, q, search]);

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button" className={styles.hexBtn} disabled={disabled}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? '× Close bestiary' : '☠ From the bestiary…'}
        </button>
        {!open && (
          <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>
            Search the catalogue and drop it straight on the board.
          </span>
        )}
      </div>

      {open && (
        <div style={{ display: 'grid', gap: 6, border: '1px solid var(--hx-line)', borderRadius: 10, padding: '9px 11px', background: 'var(--hx-inset-soft)' }}>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            disabled={disabled}
            aria-label="Search the bestiary"
            placeholder="Search creatures — “wolf”, “dragon”, “goblin”…"
            style={{ width: '100%', padding: '6px 9px', borderRadius: 6, border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.5)', color: 'var(--hx-text)', fontSize: 13 }}
          />

          {err && <div style={{ fontSize: 12.5, color: 'var(--hx-bad, #e46)' }} role="alert">{err}</div>}

          <div style={{ display: 'grid', gap: 3, maxHeight: 240, overflowY: 'auto', scrollbarWidth: 'thin' }}>
            {!busy && rows.length === 0 && !err && (
              <div style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>
                {q ? `Nothing in the catalogue matches “${q}”.` : 'Type to search.'}
              </div>
            )}
            {rows.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={disabled}
                onClick={() => { onPick(c); setOpen(false); setQ(''); }}
                style={{
                  textAlign: 'left', padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
                  border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.4)', color: 'var(--hx-text)',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>☠ {c.name}</span>
                <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>
                  {c.cr ? ` · CR ${c.cr}` : ''}{c.type ? ` · ${c.type}` : ''}{c.size ? ` · ${c.size}` : ''}
                </span>
              </button>
            ))}
          </div>

          {/* The TOTAL, so a narrowed list never reads as "that is all there is" — the same rule the
              bestiary page and the walker option lists follow. */}
          {total > rows.length && (
            <div style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>
              Showing {rows.length} of {total} — keep typing to narrow it down.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
