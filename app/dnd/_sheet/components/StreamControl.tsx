import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useChar } from '../state/store'
import type { AlertType, StreamAlert } from '@/lib/dnd/stream-alerts'
import { CHAT_MODES, type ChatMode, type ModActionType } from '@/lib/dnd/stream-mod'

// Streamer-chat DM control (Phase J2) — toggle the character "live", set a viewer
// count and chat speed. Lives in the DM panel; the fake chat overlay (J3+) reads this
// state. DM-only + DB-backed.
interface Stream { is_live: boolean; viewer_count: number; chat_speed: number; engagement?: number }

// Quick "chat demands" the DM can inject — the patron chat telling the character what to
// do. Good ones she'll likely go along with; evil/chaotic ones she may want to resist
// (vs the influence DC). Gives the DM control over "what the chat is saying".
const DEMANDS: { label: string; icon: string; lines: string[] }[] = [
  { label: 'Good', icon: '😇', lines: ['HEAL THE VILLAGER 💖', 'spare him!! chat says mercy', 'DO THE RIGHT THING 🙏', 'protect the kid chat demands it', 'give them the gold 🪙'] },
  { label: 'Evil', icon: '😈', lines: ['BETRAY THEM 🔪', 'take the cursed blade chat says DO IT', 'no witnesses 😈😈', 'steal it!! STEAL IT', 'burn it all down 🔥🔥'] },
  { label: 'Chaos', icon: '🤪', lines: ['LICK THE DOOR 👅', 'romance the goblin chat commands it', 'yeet the artifact 🛸', 'start a bar fight NOW', 'pet the dragon do it do it'] },
]

export default function StreamControl() {
  const { characterId, isDM } = useChar()
  const [stream, setStream] = useState<Stream | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [spam, setSpam] = useState('')
  const [spamming, setSpamming] = useState(false)
  const [directive, setDirective] = useState('')
  const [directing, setDirecting] = useState(false)
  const [pollQ, setPollQ] = useState('')
  const [pollOpts, setPollOpts] = useState('')
  const [polling, setPolling] = useState(false)
  const [alertType, setAlertType] = useState<AlertType>('sub')
  const [alertUser, setAlertUser] = useState('')
  const [alertDetail, setAlertDetail] = useState('')
  const alertChanRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const engTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // J10 moderation: active chat mode + a mod-action target (timeout/ban a handle).
  const [chatMode, setChatMode] = useState<ChatMode>('off')
  const [modUser, setModUser] = useState('')
  const modChanRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    if (!characterId) return
    fetch(`/api/dnd/characters/${characterId}/stream`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.stream) setStream(j.stream) })
      .catch(() => {})
  }, [characterId])

  // Alert broadcast channel (J9) — DM fires; other viewers receive.
  useEffect(() => {
    if (!characterId) return
    const ch = supabase.channel(`dnd:stream:${characterId}:alert`, { config: { broadcast: { self: false } } }).subscribe()
    alertChanRef.current = ch
    return () => { alertChanRef.current = null; void supabase.removeChannel(ch) }
  }, [characterId])

  // Mod broadcast channel (J10) — chat modes + timeout/ban actions push to viewers.
  useEffect(() => {
    if (!characterId) return
    const ch = supabase.channel(`dnd:stream:${characterId}:mod`, { config: { broadcast: { self: false } } }).subscribe()
    modChanRef.current = ch
    return () => { modChanRef.current = null; void supabase.removeChannel(ch) }
  }, [characterId])

  const setMode = (mode: ChatMode) => {
    setChatMode(mode)
    modChanRef.current?.send({ type: 'broadcast', event: 'mode', payload: { mode } })
    window.dispatchEvent(new CustomEvent('dnd-stream-mod', { detail: { characterId, kind: 'mode', mode } }))
  }

  const modAction = (type: ModActionType) => {
    const username = modUser.trim()
    if (!username) return
    modChanRef.current?.send({ type: 'broadcast', event: 'action', payload: { type, username } })
    window.dispatchEvent(new CustomEvent('dnd-stream-mod', { detail: { characterId, kind: 'action', type, username } }))
    if (type !== 'unban') setModUser('')
  }

  if (!isDM || !characterId) return null

  const fireAlert = () => {
    const alert: StreamAlert = { type: alertType, username: alertUser.trim() || 'Someone', detail: alertDetail.trim() || undefined }
    alertChanRef.current?.send({ type: 'broadcast', event: 'alert', payload: alert })
    window.dispatchEvent(new CustomEvent('dnd-stream-alert', { detail: { characterId, alert } }))
    setAlertUser('')
    setAlertDetail('')
  }

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true)
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/stream`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok && j.stream) setStream(j.stream)
    } finally {
      setBusy(false)
    }
  }

  const live = stream?.is_live ?? false
  const viewers = stream?.viewer_count ?? 0
  const engagement = stream?.engagement ?? 50

  // Engagement persists debounced (covers keyboard + drag) without toggling `busy`, so
  // the slider never disables mid-drag and we don't storm the API with per-tick PATCHes.
  const setEngagement = (value: number) => {
    setStream((s) => (s ? { ...s, engagement: value } : s))
    if (engTimerRef.current) clearTimeout(engTimerRef.current)
    engTimerRef.current = setTimeout(() => {
      void fetch(`/api/dnd/characters/${characterId}/stream`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engagement: value }),
      }).catch(() => {})
    }, 300)
  }

  const sendDemand = (lines: string[]) => {
    const body = lines[Math.floor(Math.random() * lines.length)]
    void fetch(`/api/dnd/characters/${characterId}/stream/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    }).catch(() => {})
  }

  const sendFromChat = async () => {
    const body = msg.trim()
    if (!body || sending) return
    setSending(true)
    try {
      await fetch(`/api/dnd/characters/${characterId}/stream/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      setMsg('')
    } finally {
      setSending(false)
    }
  }

  const clearChat = async () => {
    if (busy) return
    setBusy(true)
    try {
      await fetch(`/api/dnd/characters/${characterId}/stream/messages`, { method: 'DELETE' })
      window.dispatchEvent(new CustomEvent('dnd-stream-clear', { detail: characterId }))
    } finally {
      setBusy(false)
    }
  }

  const startPoll = async () => {
    const question = pollQ.trim()
    const options = pollOpts.split(',').map((o) => o.trim()).filter(Boolean)
    if (!question || options.length < 2 || polling) return
    setPolling(true)
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/stream/polls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, options }),
      })
      if (r.ok) { setPollQ(''); setPollOpts('') }
    } finally {
      setPolling(false)
    }
  }

  const spamChat = async () => {
    const phrase = spam.trim()
    if (!phrase || spamming) return
    setSpamming(true)
    try {
      await fetch(`/api/dnd/characters/${characterId}/stream/spam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phrase }),
      })
      setSpam('')
    } finally {
      setSpamming(false)
    }
  }

  const directChat = async () => {
    const note = directive.trim()
    if (!note || directing) return
    setDirecting(true)
    try {
      await fetch(`/api/dnd/characters/${characterId}/stream/direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directive: note, count: 16 }),
      })
      setDirective('')
    } finally {
      setDirecting(false)
    }
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line, rgba(255,255,255,0.12))' }}>
      <span className="sec-num" style={{ color: 'var(--gold)', fontSize: 12 }}>STREAM {'//'} Chat</span>
      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          className={`btn ${live ? 'on' : ''}`}
          onClick={() => patch({ isLive: !live })}
          disabled={busy}
          style={{ color: live ? '#ff4d4d' : undefined }}
        >
          {live ? '● LIVE — end' : '○ Go Live'}
        </button>

        <label style={{ fontSize: 12, color: 'var(--muted, #9aa)', display: 'flex', alignItems: 'center', gap: 4 }}>
          Viewers
          <input
            type="number"
            min={0}
            value={viewers}
            disabled={busy}
            onChange={(e) => setStream((s) => (s ? { ...s, viewer_count: Number(e.target.value) } : s))}
            onBlur={(e) => patch({ viewerCount: Number(e.target.value) })}
            style={{ width: 80, padding: '4px 6px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line, rgba(255,255,255,0.15))', color: 'inherit' }}
          />
        </label>
        <button className="btn tiny" onClick={() => patch({ viewerCount: viewers + 1000 })} disabled={busy}>+1k</button>
        <button className="btn tiny" onClick={() => patch({ viewerCount: viewers + 1e6 })} disabled={busy}>+1M</button>
        <button className="btn tiny" onClick={() => patch({ viewerCount: viewers + 1e9 })} disabled={busy}>+1B</button>
        <button className="btn tiny" onClick={() => patch({ viewerCount: viewers + 1e12 })} disabled={busy}>+1T</button>
        <button className="btn tiny" onClick={() => patch({ viewerCount: 1e15 })} disabled={busy} title="One quadrillion viewers">🪐 1Q</button>
        <button className="btn tiny" onClick={() => patch({ viewerCount: 0 })} disabled={busy} title="Reset viewers">↺ 0</button>
        {live && <button className="btn tiny" onClick={clearChat} disabled={busy} title="Delete all chat lines">🧹 Clear</button>}

        <label style={{ fontSize: 12, color: 'var(--muted, #9aa)', display: 'flex', alignItems: 'center', gap: 4 }}>
          Speed
          <input
            type="range"
            min={1}
            max={10}
            value={stream?.chat_speed ?? 3}
            disabled={busy}
            onChange={(e) => patch({ chatSpeed: Number(e.target.value) })}
          />
        </label>
      </div>

      {/* Engagement dial (J11) — drives the patron-influence meter + the resist DC. */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: 'var(--muted, #9aa)', display: 'flex', alignItems: 'center', gap: 6 }}>
          🌈 Engagement
          <input
            type="range"
            min={0}
            max={100}
            value={engagement}
            onChange={(e) => setEngagement(Number(e.target.value))}
            style={{ width: 140 }}
          />
          <span style={{ width: 28, textAlign: 'right' }}>{engagement}</span>
        </label>
        <button className="btn tiny" onClick={() => patch({ engagement: Math.max(0, engagement - 15) })} disabled={busy}>− Calm</button>
        <button className="btn tiny" onClick={() => patch({ engagement: Math.min(100, engagement + 15) })} disabled={busy}>+ Hype</button>
        <button className="btn tiny" onClick={() => patch({ engagement: 100 })} disabled={busy} style={{ color: '#ff10f0' }} title="Max the influence meter">💥 MAX HYPE</button>
      </div>

      {/* Chat demands (J11) — inject what the patron chat is telling her to do. */}
      {live && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--muted, #9aa)', letterSpacing: '0.08em' }}>DEMAND</span>
          {DEMANDS.map((d) => (
            <button key={d.label} className="btn tiny" onClick={() => sendDemand(d.lines)} title={`Chat demands something ${d.label.toLowerCase()}`}>
              {d.icon} {d.label}
            </button>
          ))}
        </div>
      )}

      {live && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendFromChat()}
            placeholder="Send a message from chat (as a random viewer)…"
            disabled={sending}
            style={{ flex: 1, padding: '6px 8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line, rgba(255,255,255,0.15))', color: 'inherit', fontSize: 13 }}
          />
          <button className="btn tiny" onClick={sendFromChat} disabled={sending || !msg.trim()}>{sending ? '…' : 'Send'}</button>
        </div>
      )}

      {live && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <input
            value={spam}
            onChange={(e) => setSpam(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && spamChat()}
            placeholder="Spam chat with a phrase (AI + emoji/case/repeat variations)…"
            disabled={spamming}
            style={{ flex: 1, padding: '6px 8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line, rgba(255,255,255,0.15))', color: 'inherit', fontSize: 13 }}
          />
          <button className="btn tiny" onClick={spamChat} disabled={spamming || !spam.trim()} style={{ color: '#ff884d' }}>{spamming ? '…' : '💥 Spam'}</button>
        </div>
      )}

      {live && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <input
            value={directive}
            onChange={(e) => setDirective(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && directChat()}
            placeholder='🤖 Tell the AI what chat should say (e.g. "she is pretty but about to get busted up")…'
            disabled={directing}
            style={{ flex: 1, padding: '6px 8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line, rgba(255,255,255,0.15))', color: 'inherit', fontSize: 13 }}
          />
          <button className="btn tiny" onClick={directChat} disabled={directing || !directive.trim()} style={{ color: '#0ac8b9' }}>{directing ? '…' : '🤖 Direct'}</button>
        </div>
      )}

      {live && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          <input
            value={pollQ}
            onChange={(e) => setPollQ(e.target.value)}
            placeholder="Poll question…"
            disabled={polling}
            style={{ flex: 2, minWidth: 140, padding: '6px 8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line, rgba(255,255,255,0.15))', color: 'inherit', fontSize: 13 }}
          />
          <input
            value={pollOpts}
            onChange={(e) => setPollOpts(e.target.value)}
            placeholder="options, comma, separated"
            disabled={polling}
            style={{ flex: 2, minWidth: 140, padding: '6px 8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line, rgba(255,255,255,0.15))', color: 'inherit', fontSize: 13 }}
          />
          <button className="btn tiny" onClick={startPoll} disabled={polling || !pollQ.trim() || pollOpts.split(',').filter((o) => o.trim()).length < 2}>{polling ? '…' : '📊 Poll'}</button>
        </div>
      )}

      {live && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={alertType} onChange={(e) => setAlertType(e.target.value as AlertType)} style={{ padding: '5px 6px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line, rgba(255,255,255,0.15))', color: 'inherit', fontSize: 13 }}>
            <option value="sub">Sub</option>
            <option value="resub">Resub</option>
            <option value="donation">Donation</option>
            <option value="raid">Raid</option>
          </select>
          <input value={alertUser} onChange={(e) => setAlertUser(e.target.value)} placeholder="username" style={{ width: 110, padding: '6px 8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line, rgba(255,255,255,0.15))', color: 'inherit', fontSize: 13 }} />
          <input value={alertDetail} onChange={(e) => setAlertDetail(e.target.value)} placeholder="detail (months/$/viewers)" style={{ width: 150, padding: '6px 8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line, rgba(255,255,255,0.15))', color: 'inherit', fontSize: 13 }} />
          <button className="btn tiny" onClick={fireAlert} style={{ color: '#9147ff' }}>🔔 Alert</button>
        </div>
      )}

      {live && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted, #9aa)', letterSpacing: '0.08em' }}>MOD</span>
          {CHAT_MODES.map((m) => (
            <button
              key={m.id}
              className={`btn tiny ${chatMode === m.id ? 'on' : ''}`}
              onClick={() => setMode(m.id)}
              title={`${m.label} mode`}
              style={{ color: chatMode === m.id ? 'var(--gold)' : undefined }}
            >
              {m.icon} {m.label}
            </button>
          ))}
          <input
            value={modUser}
            onChange={(e) => setModUser(e.target.value)}
            placeholder="username to moderate"
            style={{ width: 150, padding: '6px 8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line, rgba(255,255,255,0.15))', color: 'inherit', fontSize: 13 }}
          />
          <button className="btn tiny" onClick={() => modAction('timeout')} disabled={!modUser.trim()} title="Time out">⛔ Timeout</button>
          <button className="btn tiny" onClick={() => modAction('ban')} disabled={!modUser.trim()} style={{ color: '#ff4d4d' }} title="Ban">🔨 Ban</button>
          <button className="btn tiny" onClick={() => modAction('unban')} disabled={!modUser.trim()} title="Unban">♻️ Unban</button>
        </div>
      )}
    </div>
  )
}
