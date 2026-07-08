import { useState } from 'react'

// NpcFromChatterModal (Phase K) — the DM turns a chat viewer (or an alias) into a real
// NPC. "Generate NPC" asks a few questions (name/age/race/profession/level/class/notes)
// then the AI builds a full sheet; "Generic NPC" makes an ordinary commoner in one click.
export interface NpcSeed { username?: string; message?: string; color?: string; aliasId?: string }

export default function NpcFromChatterModal({
  characterId, seed, onClose, onCreated,
}: {
  characterId: string
  seed?: NpcSeed
  onClose: () => void
  onCreated?: (npc: { id: string; name: string }) => void
}) {
  const [d, setD] = useState({
    name: seed?.username ?? '', age: '', race: '', profession: '', level: '', class: '', notes: '',
  })
  const [busy, setBusy] = useState<'' | 'detailed' | 'generic'>('')
  const [err, setErr] = useState('')

  const set = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement>) => setD((p) => ({ ...p, [k]: e.target.value }))

  const create = async (mode: 'detailed' | 'generic') => {
    if (busy) return
    setBusy(mode); setErr('')
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/stream/npc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          chatterUsername: seed?.username ?? d.name,
          chatterMessage: seed?.message,
          aliasId: seed?.aliasId,
          details: mode === 'detailed' ? d : { name: d.name || seed?.username },
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(j.error || 'Could not create NPC.'); return }
      onCreated?.(j.character)
      onClose()
    } finally { setBusy('') }
  }

  const field = (label: string, k: keyof typeof d, ph = '', w = 0) => (
    <label style={{ fontSize: 11, color: 'var(--muted, #9aa)', display: 'flex', flexDirection: 'column', gap: 3, flex: w || 1, minWidth: 90 }}>
      {label}
      <input value={d[k]} onChange={set(k)} placeholder={ph}
        style={{ padding: '5px 7px', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--line, rgba(255,255,255,0.15))', color: 'inherit', fontSize: 13 }} />
    </label>
  )

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(520px, 96vw)', maxHeight: '90vh', overflow: 'auto', background: 'var(--panel, #16161c)', border: '1px solid var(--gold, #c89b3c)', borderRadius: 10, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <strong style={{ color: 'var(--gold, #c89b3c)', fontSize: 14 }}>Create NPC from {seed?.username ? `@${seed.username}` : 'chatter'}</strong>
          <button className="btn tiny" onClick={onClose}>✕</button>
        </div>
        {seed?.message && <div style={{ fontSize: 12, color: 'var(--muted,#9aa)', margin: '2px 0 8px', fontStyle: 'italic' }}>“{seed.message}”</div>}
        <div style={{ fontSize: 11, color: 'var(--muted,#9aa)', marginBottom: 8 }}>
          Answer what you know, then Generate — the AI builds a full sheet. Or make a plain commoner in one click.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {field('Name', 'name', 'their name')}
          {field('Age', 'age', 'e.g. 34')}
          {field('Race', 'race', 'human, elf…')}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {field('Class', 'class', 'fighter…')}
          {field('Level', 'level', '1–20')}
          {field('Profession', 'profession', 'blacksmith…')}
        </div>
        <div style={{ marginTop: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--muted,#9aa)', display: 'flex', flexDirection: 'column', gap: 3 }}>
            Anything else of interest
            <input value={d.notes} onChange={set('notes')} placeholder="personality, gear, backstory hooks…"
              style={{ padding: '5px 7px', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--line, rgba(255,255,255,0.15))', color: 'inherit', fontSize: 13 }} />
          </label>
        </div>
        {err && <div style={{ color: '#ff6b6b', fontSize: 12, marginTop: 8 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => create('detailed')} disabled={!!busy} style={{ color: 'var(--gold)' }}>
            {busy === 'detailed' ? 'Generating…' : '✨ Generate NPC'}
          </button>
          <button className="btn tiny" onClick={() => create('generic')} disabled={!!busy}>
            {busy === 'generic' ? 'Generating…' : '🧑‍🌾 Generic NPC'}
          </button>
        </div>
      </div>
    </div>
  )
}
