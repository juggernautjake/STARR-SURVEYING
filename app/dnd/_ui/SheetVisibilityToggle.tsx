'use client';
// app/dnd/_ui/SheetVisibilityToggle.tsx — the creator's Private/Public control for their character (owner
// 2026-07-18: "characters should be able to be made private or public … if private, other players can't see
// the info; if public, everyone can review it"). Only the OWNER sees this (visibility is a property of the
// original character). PATCHes /api/dnd/characters/[id] { visibility }. The DM always sees everything and other
// players' view is governed by this flag (see lib/dnd/character-visibility.ts).
import { useState } from 'react';

export default function SheetVisibilityToggle({ characterId, current }: { characterId: string; current: 'private' | 'campaign' | 'public' }) {
  // 'campaign' is a legacy middle value; present it as public (visible to the table) for this two-way control.
  const [vis, setVis] = useState<'private' | 'public'>(current === 'private' ? 'private' : 'public');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function set(next: 'private' | 'public') {
    if (next === vis || busy) return;
    const prev = vis;
    setVis(next); setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/dnd/characters/${characterId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visibility: next }),
      });
      if (!res.ok) { setVis(prev); const j = await res.json().catch(() => ({})); setMsg(j.error ?? 'Could not update.'); return; }
      setMsg(next === 'private' ? 'Private — only you and the DM can see this.' : 'Public — anyone at the table can view it.');
    } catch {
      setVis(prev); setMsg('Network error.');
    } finally {
      setBusy(false);
    }
  }

  const seg: React.CSSProperties = { padding: '5px 12px', fontSize: 12, cursor: busy ? 'wait' : 'pointer', border: '1px solid var(--hx-line, #2a3b47)', background: 'none', color: 'var(--hx-muted, #8aa0ab)' };
  const on: React.CSSProperties = { ...seg, color: 'var(--hx-gold-3, #f0e6d2)', background: 'rgba(200,170,110,0.12)', borderColor: 'var(--hx-gold-1, #c89b3c)' };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '10px 0' }}>
      <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--hx-muted, #8aa0ab)' }}>Visibility</span>
      <div role="group" aria-label="character visibility" style={{ display: 'inline-flex', borderRadius: 6, overflow: 'hidden' }}>
        <button type="button" disabled={busy} onClick={() => set('private')} style={vis === 'private' ? on : seg} title="Only you and your DM can see this character.">🔒 Private</button>
        <button type="button" disabled={busy} onClick={() => set('public')} style={vis === 'public' ? on : seg} title="Anyone at your table can review this character (they still can’t change it).">🌐 Public</button>
      </div>
      {msg && <span style={{ fontSize: 11, color: 'var(--hx-muted, #8aa0ab)' }}>{msg}</span>}
    </div>
  );
}
