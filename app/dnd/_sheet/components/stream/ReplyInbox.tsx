import { useEffect, useState } from 'react'
import NpcFromChatterModal, { type NpcSeed } from './NpcFromChatterModal'

// ReplyInbox (Phase K) — the DM's inbox of viewer replies filed from the chat-search
// panel. Each shows the original handle + line; the DM can respond back AS that viewer
// (puppeting the handle in chat), spin them into an NPC, or dismiss it.
interface Reply { id: string; chatter_username: string; chatter_message: string | null; chatter_color: string | null; reply_body: string; created_at: string }

export default function ReplyInbox({ characterId, onPosted }: { characterId: string; onPosted?: () => void }) {
  const [replies, setReplies] = useState<Reply[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [npcSeed, setNpcSeed] = useState<NpcSeed | null>(null)

  const load = () => fetch(`/api/dnd/characters/${characterId}/stream/replies`).then((r) => (r.ok ? r.json() : null)).then((j) => j && setReplies(j.replies)).catch(() => {})
  useEffect(() => {
    load()
    const t = setInterval(load, 15000) // poll so replies from the streamer show up
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId])

  const dismiss = async (id: string) => {
    await fetch(`/api/dnd/characters/${characterId}/stream/replies/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handled: true }) })
    setReplies((r) => r.filter((x) => x.id !== id))
  }

  const respondAs = async (rep: Reply) => {
    if (!text.trim()) return
    await fetch(`/api/dnd/characters/${characterId}/stream/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text.trim(), username: rep.chatter_username, color: rep.chatter_color ?? undefined }),
    })
    setText(''); setOpenId(null); onPosted?.()
    await dismiss(rep.id)
  }

  if (replies.length === 0) return null

  return (
    <div style={{ marginTop: 10, padding: '8px 10px', border: '1px solid #0ac8b9', borderRadius: 8, background: 'rgba(10,200,185,0.06)' }}>
      <div style={{ fontSize: 11, letterSpacing: '0.08em', color: '#0ac8b9', fontWeight: 700 }}>↩ REPLIES TO CHAT ({replies.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 6 }}>
        {replies.map((rep) => (
          <div key={rep.id} style={{ padding: '5px 7px', border: '1px solid var(--line, rgba(255,255,255,0.1))', borderRadius: 6 }}>
            <div style={{ fontSize: 12 }}>
              <strong style={{ color: rep.chatter_color ?? '#7ab8ff' }}>{rep.chatter_username}</strong>
              {rep.chatter_message ? <span style={{ color: 'var(--muted,#9aa)' }}> said “{rep.chatter_message}”</span> : null}
            </div>
            <div style={{ fontSize: 12, marginTop: 2 }}>↳ reply: {rep.reply_body}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
              <button className="btn tiny" onClick={() => { setOpenId(openId === rep.id ? null : rep.id); setText('') }}>💬 Respond as {rep.chatter_username}</button>
              <button className="btn tiny" onClick={() => setNpcSeed({ username: rep.chatter_username, message: rep.chatter_message ?? undefined, color: rep.chatter_color ?? undefined })}>✨ NPC</button>
              <button className="btn tiny" onClick={() => dismiss(rep.id)} title="Mark handled">✓ Dismiss</button>
            </div>
            {openId === rep.id && (
              <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && respondAs(rep)}
                  placeholder={`chat as ${rep.chatter_username}…`} autoFocus
                  style={{ flex: 1, padding: '5px 7px', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--line, rgba(255,255,255,0.15))', color: 'inherit', fontSize: 13 }} />
                <button className="btn tiny" onClick={() => respondAs(rep)} disabled={!text.trim()}>Send</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {npcSeed && <NpcFromChatterModal characterId={characterId} seed={npcSeed} onClose={() => setNpcSeed(null)} />}
    </div>
  )
}
