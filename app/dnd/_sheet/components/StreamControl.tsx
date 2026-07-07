import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useChar } from '../state/store'
import type { AlertType, StreamAlert } from '@/lib/dnd/stream-alerts'
import { CHAT_MODES, type ChatMode, type ModActionType } from '@/lib/dnd/stream-mod'
import { viewerDC, MAX_DC, chatRatePerSec } from '@/lib/dnd/stream-influence'

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

// Persistent AI trend presets — one tap sets the ongoing vibe/focus of chat. The note is
// fed to the AI chat director on a loop so the whole room keeps riffing on it.
const TRENDS: { label: string; icon: string; note: string }[] = [
  { label: 'Hype Train', icon: '🚂', note: 'chat is losing it — pure hype, spamming W, POG, LETS GO and emotes, hyping her up' },
  { label: 'Backseat', icon: '🪑', note: 'chat is backseat gaming hard, everyone telling her exactly what to do and second-guessing her' },
  { label: 'Simp Arc', icon: '😍', note: 'chat is down bad, simping and gassing her up with compliments and hearts' },
  { label: 'Clown Roast', icon: '🤡', note: 'chat is playfully roasting her, calling it peak comedy, laughing at her plays (lighthearted, not mean)' },
  { label: 'Boss Panic', icon: '😱', note: 'chat is panicking about the fight, screaming RUN and warning her about danger' },
  { label: 'Donate Beg', icon: '💸', note: 'chat is begging everyone to donate, sub, and raid to save her' },
  { label: 'Ship It', icon: '💍', note: 'chat is shipping her with an NPC — romance arc hype, kiss kiss, they want them together' },
  { label: 'Copium', icon: '🧪', note: 'chat is coping hard, huffing copium, insisting it is fine and she totally meant to do that' },
  { label: 'Conspiracy', icon: '🕵️', note: 'chat has wild conspiracy theories about the plot, calling everything a canon event and foreshadowing' },
  { label: 'Touch Grass', icon: '🌱', note: 'chat is telling everyone (and her) to touch grass, roasting the terminally online energy' },
]

export default function StreamControl() {
  const { characterId, isDM } = useChar()
  const [stream, setStream] = useState<Stream | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [sendAs, setSendAs] = useState('')
  const [sending, setSending] = useState(false)
  const [spam, setSpam] = useState('')
  const [spamming, setSpamming] = useState(false)
  const [directive, setDirective] = useState('')
  const [directing, setDirecting] = useState(false)
  // Persistent AI "trend/vibe" — while set, chat keeps riffing on this focus (J12+).
  const [trend, setTrend] = useState('')
  const [trendInput, setTrendInput] = useState('')
  const trendTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const [pollQ, setPollQ] = useState('')
  const [pollOpts, setPollOpts] = useState('')
  const [polling, setPolling] = useState(false)
  const [alertType, setAlertType] = useState<AlertType>('sub')
  const [alertUser, setAlertUser] = useState('')
  const [alertDetail, setAlertDetail] = useState('')
  const alertChanRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  // Smooth-slider plumbing: one debounce timer + an accumulating patch body, so
  // dragging updates local state instantly and only fires one PATCH after you settle.
  const patchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPatch = useRef<Record<string, unknown>>({})
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

  // Flush any pending slider PATCH on unmount so a value you just dragged isn't lost.
  useEffect(() => () => { if (patchTimer.current) clearTimeout(patchTimer.current) }, [])

  // Immediate sync: push every stream-state change to the chat overlay on this client so
  // viewer/pause edits take effect instantly (the overlay also polls as a remote fallback).
  useEffect(() => {
    if (!characterId || !stream) return
    window.dispatchEvent(new CustomEvent('dnd-stream-state', { detail: { characterId, stream } }))
  }, [stream, characterId])

  // AI FOCUS session. When the DM aims the AI at a topic, the chat becomes almost entirely
  // about THAT: premade chatter is nearly silenced (overlay honors the focus window) while
  // the AI floods on-topic lines every ~8s for ~4 minutes, then premade fades back over the
  // next ~90s until the chat looks normal again. Setting a new topic restarts the session.
  const FOCUS_SUPPRESS_MS = 240_000
  const FOCUS_RAMP_MS = 90_000
  useEffect(() => {
    const live = stream?.is_live ?? false
    if (!trend || !live || !characterId) return
    const startedAt = Date.now()
    // Tell overlays: kill premade chat now, start fading it back after SUPPRESS.
    window.dispatchEvent(new CustomEvent('dnd-stream-focus', {
      detail: { characterId, suppressUntil: startedAt + FOCUS_SUPPRESS_MS, rampUntil: startedAt + FOCUS_SUPPRESS_MS + FOCUS_RAMP_MS },
    }))
    const fire = () =>
      fetch(`/api/dnd/characters/${characterId}/stream/direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directive: trend, count: 12 }),
      })
        .then(() => window.dispatchEvent(new CustomEvent('dnd-stream-poll', { detail: characterId })))
        .catch(() => {})
    fire()
    trendTimer.current = setInterval(() => {
      if (Date.now() - startedAt >= FOCUS_SUPPRESS_MS) { if (trendTimer.current) clearInterval(trendTimer.current); setTrend(''); return }
      fire()
    }, 8000)
    return () => { if (trendTimer.current) clearInterval(trendTimer.current) }
  }, [trend, stream?.is_live, characterId])

  // Stop the focus early: clear the topic and tell overlays to start fading premade back now.
  const stopFocus = () => {
    setTrend('')
    const now = Date.now()
    window.dispatchEvent(new CustomEvent('dnd-stream-focus', { detail: { characterId, suppressUntil: now, rampUntil: now + FOCUS_RAMP_MS } }))
  }

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
  // Ambient chat is globally paused when chat_speed is 0 (the pace itself is viewer-driven).
  const paused = (stream?.chat_speed ?? 3) <= 0

  // The resist DC is set purely by the live viewer count (the tier table); the engagement
  // dial below only drives the meter's visual energy. Shown live so the DM sees the DC as
  // he bumps viewers — no need to open the sheet to check.
  const dc = viewerDC(viewers)
  const maxed = dc >= MAX_DC

  // Smooth setter for the sliders: update local state instantly (so the thumb tracks
  // the cursor 1:1) and debounce a single fire-and-forget PATCH. Crucially it does NOT
  // toggle `busy` (which used to disable the slider mid-drag) and does NOT overwrite
  // local state from the response (which used to make the thumb jump). Patches
  // accumulate so dragging speed then engagement still persists both.
  const liveSet = (local: Partial<Stream>, body: Record<string, unknown>) => {
    setStream((s) => (s ? { ...s, ...local } : s))
    pendingPatch.current = { ...pendingPatch.current, ...body }
    if (patchTimer.current) clearTimeout(patchTimer.current)
    patchTimer.current = setTimeout(() => {
      const payload = pendingPatch.current
      pendingPatch.current = {}
      void fetch(`/api/dnd/characters/${characterId}/stream`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {})
    }, 250)
  }
  const setEngagement = (value: number) => liveSet({ engagement: value }, { engagement: value })

  // Engagement presets — named "how hyped is chat" steps so the DM can dial the vibe
  // in one click instead of hunting for a number.
  const ENGAGEMENT_PRESETS: { label: string; icon: string; value: number }[] = [
    { label: 'Dead', icon: '💤', value: 0 },
    { label: 'Chill', icon: '😌', value: 30 },
    { label: 'Rowdy', icon: '🎉', value: 60 },
    { label: 'Hyped', icon: '🔥', value: 85 },
    { label: 'Feral', icon: '💥', value: 100 },
  ]

  // Tell the chat overlay on this client to fetch RIGHT NOW, so DM/AI-injected lines show
  // the instant the request returns instead of waiting for the next poll tick.
  const notifyPoll = () => window.dispatchEvent(new CustomEvent('dnd-stream-poll', { detail: characterId }))

  const sendDemand = (lines: string[]) => {
    const body = lines[Math.floor(Math.random() * lines.length)]
    void fetch(`/api/dnd/characters/${characterId}/stream/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    }).then(notifyPoll).catch(() => {})
  }

  const sendFromChat = async () => {
    const body = msg.trim()
    if (!body || sending) return
    setSending(true)
    try {
      // A chosen sender name (optional) posts the line as that exact handle; blank = a
      // random viewer. The message endpoint derives a stable color/badges from the name.
      const name = sendAs.trim()
      await fetch(`/api/dnd/characters/${characterId}/stream/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(name ? { body, username: name } : { body }),
      })
      setMsg('')
      notifyPoll()
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
      notifyPoll()
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
      notifyPoll()
    } finally {
      setDirecting(false)
    }
  }

  return (
    <div className="stream-control" style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line, rgba(255,255,255,0.12))' }}>
      <span className="sec-num" style={{ color: 'var(--gold)', fontSize: 12 }}>STREAM {'//'} Chat</span>
      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          className={`btn ${live ? 'on' : ''}`}
          onClick={() => patch({ isLive: !live })}
          disabled={busy}
          style={{ color: live ? '#ff4d4d' : undefined }}
          title={live ? 'End the stream — hides the chat + influence meter for everyone' : 'Go live — shows the streamer chat, influence meter, and these controls'}
        >
          {live ? '● LIVE — end' : '○ Go Live'}
        </button>

        <label style={{ fontSize: 12, color: 'var(--muted, #9aa)', display: 'flex', alignItems: 'center', gap: 4 }} title="Live viewer count. This ALONE sets the chat pace and the resist DC — type an exact number or use the quick-add buttons. Takes effect instantly.">
          Viewers
          <input
            type="number"
            min={0}
            value={viewers}
            onChange={(e) => liveSet({ viewer_count: Math.max(0, Number(e.target.value) || 0) }, { viewerCount: Math.max(0, Number(e.target.value) || 0) })}
            style={{ width: 90, padding: '4px 6px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line, rgba(255,255,255,0.15))', color: 'inherit' }}
          />
        </label>
        <button className="btn tiny" onClick={() => liveSet({ viewer_count: viewers + 1000 }, { viewerCount: viewers + 1000 })} title="Add 1,000 viewers">+1k</button>
        <button className="btn tiny" onClick={() => liveSet({ viewer_count: viewers + 1e6 }, { viewerCount: viewers + 1e6 })} title="Add 1 million viewers">+1M</button>
        <button className="btn tiny" onClick={() => liveSet({ viewer_count: viewers + 1e9 }, { viewerCount: viewers + 1e9 })} title="Add 1 billion viewers (DC 24–25 territory)">+1B</button>
        <button className="btn tiny" onClick={() => liveSet({ viewer_count: viewers + 1e12 }, { viewerCount: viewers + 1e12 })} title="Add 1 trillion viewers">+1T</button>
        <button className="btn tiny" onClick={() => liveSet({ viewer_count: 1e15 }, { viewerCount: 1e15 })} title="One quadrillion viewers — maxes the DC at 25">🪐 1Q</button>
        <button className="btn tiny" onClick={() => liveSet({ viewer_count: 0 }, { viewerCount: 0 })} title="Reset to 0 viewers — chat goes completely silent">↺ 0</button>

        {live && (
          <button
            className={`btn tiny ${paused ? 'on' : ''}`}
            onClick={() => patch({ chatSpeed: paused ? 3 : 0 })}
            disabled={busy}
            style={{ color: paused ? '#ffb84d' : undefined }}
            title={paused ? 'Resume ambient chat for everyone' : 'Pause ambient chat for EVERYONE (you can still send individual messages while paused)'}
          >
            {paused ? '▶ Resume chat' : '⏸ Pause chat'}
          </button>
        )}
        {live && <button className="btn tiny" onClick={clearChat} disabled={busy} title="Delete every chat line for everyone (wipes the feed)">🧹 Clear</button>}
        {live && (
          <span style={{ fontSize: 11, color: 'var(--muted, #9aa)' }} title="Current ambient pace, derived from the viewer count (DC). Deliberately bursty around this average.">
            pace ~{chatRatePerSec(dc)}/s
          </span>
        )}
      </div>

      {/* Patron-influence block (J11). The resist DC is set purely by the VIEWER COUNT
          (raise viewers above to raise the DC); the 🌈 dial only sets the meter's visual
          energy. Live DC readout so it's easy to see without opening the sheet. */}
      <div style={{ marginTop: 10, padding: '8px 10px', border: `1px solid ${maxed ? '#ff10f0' : 'var(--line, rgba(255,255,255,0.14))'}`, borderRadius: 8, background: maxed ? 'rgba(255,16,240,0.08)' : 'rgba(255,255,255,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.1em', color: 'var(--gold, #c89b3c)', fontWeight: 700 }}>PATRON INFLUENCE</span>
          <span style={{ fontSize: 12, color: 'var(--muted, #9aa)' }}>
            she must beat{' '}
            <strong style={{ color: maxed ? '#ff10f0' : '#7ab8ff', textShadow: `0 0 8px ${maxed ? '#ff10f0' : '#7ab8ff'}` }}>DC {dc}</strong>
            {' '}to resist chat · set by {viewers.toLocaleString()} viewers
          </span>
          {maxed && <span style={{ fontSize: 10, fontWeight: 800, color: '#ff10f0', letterSpacing: '0.06em' }}>MAXED — IRRESISTIBLE</span>}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: 'var(--muted, #9aa)', display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200 }} title="Chat energy — how hard the meter bobs. Visual only; the DC is set by viewer count.">
            🌈 Energy
            <input
              type="range"
              min={0}
              max={100}
              value={engagement}
              onChange={(e) => setEngagement(Number(e.target.value))}
              style={{ flex: 1, minWidth: 120, accentColor: maxed ? '#ff10f0' : '#8b5cf6' }}
            />
            <span style={{ width: 32, textAlign: 'right', fontWeight: 700, color: '#fff' }}>{engagement}</span>
          </label>
          <button className="btn tiny" onClick={() => setEngagement(Math.max(0, engagement - 10))} title="Cool the room by 10">−10</button>
          <button className="btn tiny" onClick={() => setEngagement(Math.min(100, engagement + 10))} title="Hype the room by 10">+10</button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--muted, #9aa)' }}>VIBE</span>
          {ENGAGEMENT_PRESETS.map((p) => {
            const on = engagement === p.value
            return (
              <button
                key={p.label}
                className={`btn tiny ${on ? 'on' : ''}`}
                onClick={() => setEngagement(p.value)}
                title={`Set engagement to ${p.value}`}
                style={{ color: on ? (p.value === 100 ? '#ff10f0' : 'var(--gold)') : undefined }}
              >
                {p.icon} {p.label}
              </button>
            )
          })}
        </div>
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
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <input
            value={sendAs}
            onChange={(e) => setSendAs(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendFromChat()}
            placeholder="from… (name)"
            disabled={sending}
            title="Optional: the exact username this message posts as. Leave blank to post as a random viewer. Reuse the same name to make a recurring 'regular'."
            style={{ width: 130, padding: '6px 8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line, rgba(255,255,255,0.15))', color: 'inherit', fontSize: 13 }}
          />
          <input
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendFromChat()}
            placeholder={sendAs.trim() ? `Send one message as ${sendAs.trim()}…` : 'Send one message from chat (as a random viewer)…'}
            disabled={sending}
            title="Type a single chat line and hit Send (or Enter) to drop it into the live chat."
            style={{ flex: 1, minWidth: 160, padding: '6px 8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line, rgba(255,255,255,0.15))', color: 'inherit', fontSize: 13 }}
          />
          <button className="btn tiny" onClick={sendFromChat} disabled={sending || !msg.trim()} title="Post this one message to the live chat">{sending ? '…' : 'Send'}</button>
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
            placeholder='🤖 One-off: tell the AI what chat should say right now (e.g. "she is pretty but about to get busted up")…'
            disabled={directing}
            style={{ flex: 1, padding: '6px 8px', fontSize: 13 }}
          />
          <button className="btn tiny" onClick={directChat} disabled={directing || !directive.trim()} style={{ color: '#0ac8b9' }}>{directing ? '…' : '🤖 Direct'}</button>
        </div>
      )}

      {/* AI FOCUS — the DM aims the AI at a topic and the chat becomes almost entirely about
          it for a few minutes, then premade chatter fades back in. Full sway over the chat. */}
      {live && (
        <div style={{ marginTop: 8, padding: '8px 10px', border: `1px solid ${trend ? '#0ac8b9' : 'var(--line, rgba(255,255,255,0.14))'}`, borderRadius: 8, background: trend ? 'rgba(10,200,185,0.08)' : 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }} title="Aim the AI at a topic. Premade chatter goes nearly silent and the AI floods on-topic lines for ~4 minutes, then normal chat fades back in. Pick a new topic to restart.">
            <span style={{ fontSize: 11, letterSpacing: '0.1em', color: '#0ac8b9', fontWeight: 700 }}>🤖 AI CHAT FOCUS</span>
            <span style={{ fontSize: 11, color: 'var(--muted, #9aa)' }}>make chat obsess over a topic — premade chats vanish for ~4 min, then fade back</span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
            {TRENDS.map((t) => {
              const on = trend === t.note
              return (
                <button
                  key={t.label}
                  className={`btn tiny ${on ? 'on' : ''}`}
                  onClick={() => (on ? stopFocus() : (setTrend(t.note), setTrendInput(t.note)))}
                  title={on ? 'Stop this focus (premade chat fades back in)' : `Make the whole chat focus on: ${t.note}`}
                  style={{ color: on ? '#0ac8b9' : undefined }}
                >
                  {t.icon} {t.label}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
            <input
              value={trendInput}
              onChange={(e) => setTrendInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && trendInput.trim()) setTrend(trendInput.trim()) }}
              placeholder="Custom focus… (e.g. everyone is convinced the merchant is the villain)"
              title="Type any topic and hit Focus. Chat will flood with clean, in-world lines about it."
              style={{ flex: 1, padding: '6px 8px', fontSize: 13 }}
            />
            {trend ? (
              <button className="btn tiny" onClick={stopFocus} style={{ color: '#ff5252' }} title="Stop the focus now — premade chatter fades back in over ~90s">■ Stop</button>
            ) : (
              <button className="btn tiny" onClick={() => trendInput.trim() && setTrend(trendInput.trim())} disabled={!trendInput.trim()} style={{ color: '#0ac8b9' }} title="Aim the AI at this topic">▶ Focus</button>
            )}
          </div>
          {trend && (
            <div style={{ fontSize: 11, color: 'var(--muted, #9aa)', marginTop: 6 }}>
              <span style={{ color: '#0ac8b9', fontWeight: 700 }}>● CHAT IS OBSESSED WITH:</span> {trend}
            </div>
          )}
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
