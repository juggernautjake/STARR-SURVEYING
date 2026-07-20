'use client';
// GiveToCharacter — hand a library entry to one of your characters.
//
// One dialog for every content type (owner 2026-07-19). It lists the characters you may
// actually EDIT — owned, played, or DM'd, via ?writable=1 — collects the few parameters the
// type needs, and posts a REFERENCE to the grant route. It never builds sheet edits itself:
// the server resolves the entry against the real catalogs, so the client cannot invent
// mechanics or reach ops it has no business touching.
import { useCallback, useEffect, useState } from 'react';

export type GiveKind = 'spell' | 'weapon' | 'armor' | 'item' | 'feature' | 'condition';

interface CharRow { id: string; name: string; campaign_id: string | null; is_npc?: boolean }

export default function GiveToCharacter({
  kind, name, system, defaultNote, onClose,
}: {
  kind: GiveKind;
  name: string;
  system: string;
  /** Pre-fills the note with the entry's library text, so a granted feature arrives with its
   *  actual rules rather than a bare name the player has to look up again. */
  defaultNote?: string;
  onClose: () => void;
}) {
  const [chars, setChars] = useState<CharRow[] | null>(null);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Per-kind parameters.
  const [prepared, setPrepared] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [equipped, setEquipped] = useState(false);
  const [note, setNote] = useState(defaultNote ?? '');

  useEffect(() => {
    fetch('/api/dnd/characters?writable=1')
      .then((r) => (r.ok ? r.json() : { characters: [] }))
      .then((j) => {
        const list = (j.characters ?? []) as CharRow[];
        setChars(list);
        if (list.length === 1) setTarget(list[0].id);
      })
      .catch(() => setChars([]));
  }, []);

  const give = useCallback(async () => {
    if (!target || busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/dnd/characters/${target}/grant-content`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind, name, system,
          options: { prepared, quantity, equipped, note: note.trim() || undefined },
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ ok: false, text: j.error ?? `Could not grant (${r.status}).` }); return; }
      const who = chars?.find((c) => c.id === target)?.name ?? 'the character';
      setMsg({
        ok: true,
        text: `${j.summary ?? 'Granted.'} It's on ${who}'s sheet now — open it to use or edit it.`,
      });
    } catch {
      setMsg({ ok: false, text: 'Network error — nothing was granted.' });
    } finally { setBusy(false); }
  }, [target, busy, kind, name, system, prepared, quantity, equipped, note, chars]);

  const isItem = kind === 'weapon' || kind === 'armor' || kind === 'item';

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(2,4,10,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(480px, 100%)', background: 'var(--hx-panel, #0d1b2a)', border: '1px solid var(--hx-gold, #785a28)', borderRadius: 10, padding: '16px 18px', color: 'var(--hx-ink, #e8e3f5)' }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <strong style={{ flex: 1, fontSize: 15 }}>Give “{name}” to a character</strong>
          <button className="btn tiny" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {chars === null ? (
          <p style={{ fontSize: 13, opacity: 0.75, marginTop: 12 }}>Loading your characters…</p>
        ) : chars.length === 0 ? (
          // Also what a SIGNED-OUT reader sees: the library is public, so someone with the link
          // can open this dialog without an account. Say what to do rather than showing an empty
          // list that looks broken (owner 2026-07-20).
          <p style={{ fontSize: 13, opacity: 0.8, marginTop: 12 }}>
            No characters you can edit. If you’re not signed in, the library is open to read but
            you’ll need an account to add anything to a sheet —{' '}
            <a href="/dnd" style={{ color: 'var(--hx-teal, #0ac8b9)' }}>log in or create one</a>.
            Otherwise, create a character or ask your DM to assign you one.
          </p>
        ) : (
          <>
            <label style={{ display: 'block', fontSize: 11.5, opacity: 0.75, marginTop: 12 }}>Character</label>
            <select
              value={target} onChange={(e) => setTarget(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', fontSize: 13, marginTop: 4, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.18)', color: 'inherit', borderRadius: 6 }}
            >
              <option value="">Choose a character…</option>
              {chars.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.is_npc ? ' (NPC)' : ''}</option>
              ))}
            </select>

            {/* Only the parameters this kind actually needs. */}
            {kind === 'spell' && (
              <label className="flex" style={{ gap: 6, alignItems: 'center', fontSize: 13, marginTop: 10 }}>
                <input type="checkbox" checked={prepared} onChange={(e) => setPrepared(e.target.checked)} />
                Arrives prepared
              </label>
            )}

            {isItem && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 13 }}>
                  Quantity{' '}
                  <input
                    type="number" min={1} value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                    style={{ width: 70, padding: '4px 6px', fontSize: 13, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.18)', color: 'inherit', borderRadius: 6 }}
                  />
                </label>
                <label className="flex" style={{ gap: 6, alignItems: 'center', fontSize: 13 }}>
                  <input type="checkbox" checked={equipped} onChange={(e) => setEquipped(e.target.checked)} />
                  Equipped on arrival
                </label>
              </div>
            )}

            {(kind === 'feature' || isItem) && (
              <>
                <label style={{ display: 'block', fontSize: 11.5, opacity: 0.75, marginTop: 10 }}>
                  Note {kind === 'feature' ? '(what it does — this becomes the feature’s text)' : '(optional description)'}
                </label>
                <textarea
                  value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                  style={{ width: '100%', padding: '6px 8px', fontSize: 13, marginTop: 4, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.18)', color: 'inherit', borderRadius: 6, resize: 'vertical' }}
                />
              </>
            )}

            <button
              className="btn tiny solid" disabled={!target || busy}
              onClick={() => void give()}
              style={{ marginTop: 12, width: '100%', padding: '8px 0' }}
            >
              {busy ? 'Giving…' : `Give ${kind}`}
            </button>
          </>
        )}

        {msg && (
          <p style={{ fontSize: 12.5, marginTop: 10, color: msg.ok ? 'var(--hx-teal, #0ac8b9)' : '#ff6b6b' }}>{msg.text}</p>
        )}
      </div>
    </div>
  );
}
