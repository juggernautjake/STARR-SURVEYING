import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { ModActionType } from '@/lib/dnd/stream-mod'
import NpcFromChatterModal, { type NpcSeed } from './NpcFromChatterModal'

// ChatSearchPanel (Phase K) — the DM OR the streamer (owner) searches the live chat by
// username or keyword and acts on a hit: reply (filed to the DM's inbox, optionally echoed
// to chat), time out / ban the handle, or (DM) spin the viewer into a full NPC.
interface Hit { id: string; username: string; body: string; color: string | null }

export default function ChatSearchPanel({ characterId, isDM }: { characterId: string; isDM: boolean }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [replyTo, setReplyTo] = useState<Hit | null>(null)
  const [replyText, setReplyText] = useState('')
  const [npcSeed, setNpcSeed] = useState<NpcSeed | null>(null)
  const [note, setNote] = useState('')
  const modChan = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Own mod-broadcast channel so timeout/ban works standalone (owner has no DM panel).
  useEffect(() => {
    const ch = supabase.channel(`dnd:stream:${characterId}:mod`, { config: { broadcast: { self: false } } }).subscribe()
    modChan.current = ch
    return () => { modChan.current = null; void supabase.removeChannel(ch) }
  }, [characterId])

  const search = async () => {
    const term = q.trim()
    setBusy(true); setNote('')
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/stream/messages?limit=60${term ? `&q=${encodeURIComponent(term)}` : ''}`)
      const j = await r.json().catch(() => ({}))
      setHits(r.ok ? (j.messages ?? []).slice().reverse() : [])
    } finally { setBusy(false) }
  }

  const mod = (type: ModActionType, username: string) => {
    modChan.current?.send({ type: 'broadcast', event: 'action', payload: { type, username } })
    window.dispatchEvent(new CustomEvent('dnd-stream-mod', { detail: { characterId, kind: 'action', type, username } }))
    setNote(`${type === 'ban' ? 'Banned' : type === 'timeout' ? 'Timed out' : 'Unbanned'} ${username}`)
  }

  const sendReply = async () => {
    if (!replyTo || !replyText.trim()) return
    await fetch(`/api/dnd/characters/${characterId}/stream/replies`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatterUsername: replyTo.username, chatterMessage: replyTo.body, chatterColor: replyTo.color, replyBody: replyText.trim(), postToChat: true }),
    })
    setNote(`Reply to ${replyTo.username} sent to the DM`)
    setReplyTo(null); setReplyText('')
  }

  return (
    <div style={{ marginTop: 10, padding: '8px 10px', border: '1px solid var(--line, rgba(255,255,255,0.14))', borderRadius: 8 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--gold,#c89b3c)', fontWeight: 700 }}>🔍 CHAT SEARCH</span>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="username or keyword…" style={{ flex: 1, padding: '6px 8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line, rgba(255,255,255,0.15))', color: 'inherit', fontSize: 13 }} />
        <button className="btn tiny" onClick={search} disabled={busy}>{busy ? '…' : 'Search'}</button>
      </div>
      {note && <div style={{ fontSize: 11, color: '#0ac8b9', marginTop: 6 }}>{note}</div>}

      {hits && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflow: 'auto' }}>
          {hits.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted,#9aa)' }}>No matching chat lines.</div>}
          {hits.map((h) => (
            <div key={h.id} style={{ padding: '5px 7px', border: '1px solid var(--line, rgba(255,255,255,0.1))', borderRadius: 6 }}>
              <div style={{ fontSize: 13 }}><strong style={{ color: h.color ?? '#7ab8ff' }}>{h.username}</strong>: {h.body}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                <button className="btn tiny" onClick={() => { setReplyTo(h); setReplyText('') }}>↩ Reply</button>
                <button className="btn tiny" onClick={() => mod('timeout', h.username)} title="Time out this handle">⛔ Timeout</button>
                <button className="btn tiny" onClick={() => mod('ban', h.username)} style={{ color: '#ff6b6b' }} title="Ban this handle">🔨 Ban</button>
                {isDM && <button className="btn tiny" onClick={() => setNpcSeed({ username: h.username, message: h.body, color: h.color ?? undefined })} title="Turn this viewer into an NPC">✨ NPC</button>}
              </div>
              {replyTo?.id === h.id && (
                <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                  <input value={replyText} onChange={(e) => setReplyText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendReply()}
                    placeholder={`reply to ${h.username}…`} autoFocus
                    style={{ flex: 1, padding: '5px 7px', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--line, rgba(255,255,255,0.15))', color: 'inherit', fontSize: 13 }} />
                  <button className="btn tiny" onClick={sendReply} disabled={!replyText.trim()}>Send</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {npcSeed && <NpcFromChatterModal characterId={characterId} seed={npcSeed} onClose={() => setNpcSeed(null)} />}
    </div>
  )
}
