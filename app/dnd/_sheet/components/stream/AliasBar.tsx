import { useEffect, useState } from 'react'
import NpcFromChatterModal from './NpcFromChatterModal'

// AliasBar (Phase K) — the DM sends a single message into the streamer's chat, optionally
// AS a saved alias. Aliases persist (create/delete), quick-switch via chips, and can be
// turned into a real NPC. No alias selected → the line posts as a random viewer handle
// (the DM's aliases are NEVER used automatically — only when explicitly picked here).
export interface Alias { id: string; name: string; color: string | null; badges: string[]; npc_character_id: string | null }

export default function AliasBar({ characterId, onSent }: { characterId: string; onSent?: () => void }) {
  const [aliases, setAliases] = useState<Alias[]>([])
  const [activeId, setActiveId] = useState<string | null>(null) // null = random viewer
  const [msg, setMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [manage, setManage] = useState(false)
  const [newName, setNewName] = useState('')
  const [npcSeed, setNpcSeed] = useState<{ username: string; aliasId: string } | null>(null)

  const load = () => fetch('/api/dnd/stream/aliases').then((r) => (r.ok ? r.json() : null)).then((j) => j && setAliases(j.aliases)).catch(() => {})
  useEffect(() => { load() }, [])

  const active = aliases.find((a) => a.id === activeId) ?? null

  const send = async () => {
    const body = msg.trim()
    if (!body || sending) return
    setSending(true)
    try {
      await fetch(`/api/dnd/characters/${characterId}/stream/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(active ? { body, username: active.name, color: active.color, badges: active.badges } : { body }),
      })
      setMsg('')
      onSent?.()
    } finally { setSending(false) }
  }

  const addAlias = async () => {
    const name = newName.trim()
    if (!name) return
    const r = await fetch('/api/dnd/stream/aliases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    const j = await r.json().catch(() => ({}))
    if (r.ok && j.alias) { setAliases((a) => [...a, j.alias]); setActiveId(j.alias.id); setNewName('') }
  }
  const delAlias = async (id: string) => {
    await fetch(`/api/dnd/stream/aliases/${id}`, { method: 'DELETE' })
    setAliases((a) => a.filter((x) => x.id !== id))
    if (activeId === id) setActiveId(null)
  }

  return (
    <div style={{ marginTop: 6 }}>
      {/* Alias chips: pick who the next message posts as. */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--muted,#9aa)' }}>AS</span>
        <button className={`btn tiny ${!activeId ? 'on' : ''}`} onClick={() => setActiveId(null)} title="Post as a random viewer handle">🎲 Random</button>
        {aliases.map((a) => (
          <button key={a.id} className={`btn tiny ${activeId === a.id ? 'on' : ''}`} onClick={() => setActiveId(a.id)}
            title={`Post as ${a.name}`} style={{ color: activeId === a.id ? 'var(--gold)' : (a.color ?? undefined) }}>
            {a.name}
          </button>
        ))}
        <button className="btn tiny" onClick={() => setManage((m) => !m)} title="Manage aliases">{manage ? '✕ done' : '⚙ aliases'}</button>
      </div>

      {/* Manager: add / delete / turn into NPC. */}
      {manage && (
        <div style={{ margin: '6px 0', padding: '6px 8px', border: '1px solid var(--line, rgba(255,255,255,0.12))', borderRadius: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addAlias()}
              placeholder="new alias name…" style={{ flex: 1, padding: '5px 7px', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--line, rgba(255,255,255,0.15))', color: 'inherit', fontSize: 13 }} />
            <button className="btn tiny" onClick={addAlias} disabled={!newName.trim()}>+ Add</button>
          </div>
          {aliases.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
              {aliases.map((a) => (
                <div key={a.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                  <span style={{ flex: 1, color: a.color ?? 'inherit' }}>{a.name}{a.npc_character_id ? ' 🪪' : ''}</span>
                  <button className="btn tiny" onClick={() => setNpcSeed({ username: a.name, aliasId: a.id })} title="Generate an NPC sheet for this alias">✨ NPC</button>
                  <button className="btn tiny" onClick={() => delAlias(a.id)} style={{ color: '#ff6b6b' }} title="Delete alias">🗑</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* The message line. */}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <input value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={active ? `Send as ${active.name}…` : 'Send a message as a random viewer…'} disabled={sending}
          style={{ flex: 1, padding: '6px 8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line, rgba(255,255,255,0.15))', color: 'inherit', fontSize: 13 }} />
        <button className="btn tiny" onClick={send} disabled={sending || !msg.trim()}>{sending ? '…' : 'Send'}</button>
      </div>

      {npcSeed && (
        <NpcFromChatterModal characterId={characterId} seed={npcSeed} onClose={() => setNpcSeed(null)}
          onCreated={() => load()} />
      )}
    </div>
  )
}
