import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useChar } from '../state/store'
import type { AlertType, StreamAlert } from '@/lib/dnd/stream-alerts'
import { CHAT_MODES, type ChatMode, type ModActionType } from '@/lib/dnd/stream-mod'
import { resolveDC, MAX_DC, MIN_DC, chatRatePerSec } from '@/lib/dnd/stream-influence'
import { MOODS } from '@/lib/dnd/stream-moods'
import { GENEROSITY, GENEROSITY_LEVELS, rollDonationAmount, formatNuggets, nuggetsToNotes, type Generosity } from '@/lib/dnd/stream-currency'
import AliasBar from './stream/AliasBar'
import ChatSearchPanel from './stream/ChatSearchPanel'
import ReplyInbox from './stream/ReplyInbox'

// Streamer-chat DM control (Phase K, revamped + decluttered). Exactly the tools the DM
// needs, in one clear stack: go live + viewers + resist-DC (auto/manual), chat moods,
// send-as-alias, one merged AI chat-focus field (type/paste text → chat reacts, with a
// play/stop + aggressiveness + duration), chat search, a reply inbox, and the utilities
// (polls / alerts / mod) tucked behind a "More" toggle. DM-only.
interface Stream {
  is_live: boolean; viewer_count: number; chat_speed: number; engagement: number
  dc_mode: 'auto' | 'manual'; dc_manual: number | null; moods: string[]
  focus_topic: string | null; focus_until: string | null; focus_intensity: number
  ai_mood_lines?: Record<string, string[]>; last_activity_at?: string | null; end_warning_at?: string | null
  donations_enabled?: boolean; generosity?: Generosity; kibbles_earned?: number
}

const FOCUS_RAMP_MS = 90_000
// Idle auto-end: if NObody (DM or player) touches the chat or its functions for an hour,
// the AI stops and the stream ends. A warning shows 10 min before that (at 50 min idle).
const IDLE_END_MS = 60 * 60 * 1000       // end 1h after the last DM/player interaction
const WARN_BEFORE_MS = 10 * 60 * 1000    // warn this long before the auto-end (at 50 min)
const MOOD_REFRESH_MS = 15 * 60 * 1000   // AI freshens mood lines every 15 min while live
// Every 15 min the AI refreshes EVERY mood (not just the selected ones), across all
// aggressiveness levels — so whatever vibe the DM switches to has fresh lines ready.
const ALL_MOOD_IDS = MOODS.map((m) => m.id)
// Focus flood cadence + burst by intensity (1–5).
const FOCUS_GAP = [12000, 9000, 7000, 5000, 3500]
const FOCUS_COUNT = [6, 8, 10, 12, 16]

export default function StreamControl() {
  const { characterId, isDM, canWrite, campaignId } = useChar()
  // Who may DRIVE the stream (owner 2026-07-18): the DM always (inside their campaign), OR the character's own
  // owner when they open the sheet OUTSIDE a campaign — there they get the full director controls just like the
  // DM. INSIDE a campaign the owner gets nothing here; only the DM sees/edits the stream (the gate below).
  const isOwner = canWrite && !isDM
  const canControl = isDM || (isOwner && !campaignId)
  const [stream, setStream] = useState<Stream | null>(null)
  const [busy, setBusy] = useState(false)
  // One merged AI chat-focus field: the DM types/pastes text (a topic, or a transcript of
  // the players' dialogue) and hits ▶ Play; the AI analyses it and floods the chat with
  // reactions across all aggressiveness levels until ■ Stop (or the timer, unless it's set
  // to run indefinitely). Playing unselects the moods; stopping reverts to mood chat.
  const [focusText, setFocusText] = useState('')
  // The text the AI is CURRENTLY generating from (set on Play + Refresh). When the field
  // differs from this, the "Refresh AI" button lights up; matching it again dims it.
  const [activeText, setActiveText] = useState('')
  const [focusIntensity, setFocusIntensity] = useState(3)
  const [focusMin, setFocusMin] = useState(10)
  const [focusIndefinite, setFocusIndefinite] = useState(false)
  const focusTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const focusTextRef = useRef('')
  const focusIntensityRef = useRef(3)
  const focusUntilRef = useRef(0)
  const [more, setMore] = useState(false)
  // Donations / superchats (R).
  const [donateAmt, setDonateAmt] = useState(10000)
  const [donateUser, setDonateUser] = useState('')
  const [donateMsg, setDonateMsg] = useState('')
  const donoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Utilities (polls / alerts / mod).
  const [pollQ, setPollQ] = useState(''); const [pollOpts, setPollOpts] = useState(''); const [polling, setPolling] = useState(false)
  const [alertType, setAlertType] = useState<AlertType>('sub'); const [alertUser, setAlertUser] = useState(''); const [alertDetail, setAlertDetail] = useState('')
  const [chatMode, setChatMode] = useState<ChatMode>('off'); const [modUser, setModUser] = useState('')
  const alertChanRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const modChanRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const patchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPatch = useRef<Record<string, unknown>>({})
  const moodRefreshAt = useRef(0)

  useEffect(() => {
    if (!characterId) return
    fetch(`/api/dnd/characters/${characterId}/stream`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.stream) setStream(j.stream) }).catch(() => {})
  }, [characterId])

  // Broadcast channels for alerts + mod.
  useEffect(() => {
    if (!characterId) return
    alertChanRef.current = supabase.channel(`dnd:stream:${characterId}:alert`, { config: { broadcast: { self: false } } }).subscribe()
    modChanRef.current = supabase.channel(`dnd:stream:${characterId}:mod`, { config: { broadcast: { self: false } } }).subscribe()
    return () => {
      const a = alertChanRef.current, m = modChanRef.current
      alertChanRef.current = null; modChanRef.current = null
      if (a) void supabase.removeChannel(a); if (m) void supabase.removeChannel(m)
    }
  }, [characterId])

  useEffect(() => () => { if (patchTimer.current) clearTimeout(patchTimer.current); if (focusTimer.current) clearInterval(focusTimer.current) }, [])

  // Push every local stream change to this client's overlay immediately.
  useEffect(() => {
    if (!characterId || !stream) return
    window.dispatchEvent(new CustomEvent('dnd-stream-state', { detail: { characterId, stream } }))
  }, [stream, characterId])

  const live = stream?.is_live ?? false

  // Authoritative poll while live: refreshes activity/warning + AI mood lines, and drives
  // the idle auto-end (warn at 2h, auto-close 10 min later). Also fires the 15-min AI
  // mood refresh for the selected moods.
  useEffect(() => {
    if (!characterId || !live) return
    let stop = false
    const tick = async () => {
      try {
        const r = await fetch(`/api/dnd/characters/${characterId}/stream`)
        const j = r.ok ? await r.json() : null
        const s: Stream | undefined = j?.stream
        if (!s || stop) return
        setStream(s)
        const now = Date.now()
        const lastAct = s.last_activity_at ? new Date(s.last_activity_at).getTime() : now
        const warnedAt = s.end_warning_at ? new Date(s.end_warning_at).getTime() : 0
        const idle = now - lastAct
        // Idle handling: end at 1h; warn 10 min before; clear a stale warning if
        // interaction resumed. These automated patches pass touchActivity:false so they
        // don't reset the idle clock they're driving.
        if (idle >= IDLE_END_MS) { await patch({ isLive: false, endWarningAt: null, touchActivity: false }); return }
        else if (idle >= IDLE_END_MS - WARN_BEFORE_MS && !warnedAt) { await patch({ endWarningAt: new Date().toISOString(), touchActivity: false }) }
        else if (warnedAt && idle < IDLE_END_MS - WARN_BEFORE_MS) { await patch({ endWarningAt: null, touchActivity: false }) }
        // 15-min AI refresh — EVERY mood, all aggressiveness levels (keeps generating
        // while anyone's still interacting; stops once the idle auto-end fires above).
        if (now - moodRefreshAt.current >= MOOD_REFRESH_MS) {
          moodRefreshAt.current = now
          void fetch(`/api/dnd/characters/${characterId}/stream/mood-refresh`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ moods: ALL_MOOD_IDS, allLevels: true }),
          }).catch(() => {})
        }
      } catch { /* ignore */ }
    }
    const t = setInterval(tick, 60_000)
    return () => { stop = true; clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId, live])

  // Ambient donations (R): while live + donations ON, fire viewer superchats at the DM's
  // generosity pace (persisted so everyone sees them; they add to the streamer's stash).
  const donationsOn = stream?.donations_enabled ?? false
  const generosity: Generosity = stream?.generosity ?? 'off'
  useEffect(() => {
    if (!characterId || !live || !donationsOn || generosity === 'off') return
    const cfg = GENEROSITY[generosity]
    if (cfg.perMin <= 0) return
    let stop = false
    const fire = () => {
      const amt = rollDonationAmount(generosity, Math.random(), Math.random())
      if (amt > 0) fetch(`/api/dnd/characters/${characterId}/stream/donate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: amt }),
      }).then(() => window.dispatchEvent(new CustomEvent('dnd-stream-poll', { detail: characterId }))).catch(() => {})
    }
    const schedule = () => {
      const gap = (60_000 / cfg.perMin) * (0.5 + Math.random())
      donoTimer.current = setTimeout(() => { if (!stop) { fire(); schedule() } }, gap)
    }
    schedule()
    return () => { stop = true; if (donoTimer.current) clearTimeout(donoTimer.current) }
  }, [characterId, live, donationsOn, generosity])

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true)
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/stream`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      if (r.ok && j.stream) setStream(j.stream)
    } finally { setBusy(false) }
  }

  // Debounced setter for the sliders/number inputs — instant local update, one PATCH after settle.
  const liveSet = (local: Partial<Stream>, body: Record<string, unknown>) => {
    setStream((s) => (s ? { ...s, ...local } : s))
    pendingPatch.current = { ...pendingPatch.current, ...body }
    if (patchTimer.current) clearTimeout(patchTimer.current)
    patchTimer.current = setTimeout(() => {
      const payload = pendingPatch.current; pendingPatch.current = {}
      void fetch(`/api/dnd/characters/${characterId}/stream`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {})
    }, 250)
  }

  const notifyPoll = () => window.dispatchEvent(new CustomEvent('dnd-stream-poll', { detail: characterId }))

  const earned = stream?.kibbles_earned ?? 0
  const fireDonation = (kind: 'superchat' | 'donation') => {
    const amount = Math.max(1, Math.round(donateAmt) || 1)
    fetch(`/api/dnd/characters/${characterId}/stream/donate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, username: donateUser.trim() || undefined, message: donateMsg.trim() || undefined, kind }),
    }).then((r) => r.json()).then((j) => { if (j?.kibblesEarned != null) setStream((s) => (s ? { ...s, kibbles_earned: j.kibblesEarned } : s)); setDonateMsg(''); notifyPoll() }).catch(() => {})
  }
  const convertNuggets = async () => {
    const r = await fetch(`/api/dnd/characters/${characterId}/stream/convert`, { method: 'POST' })
    const j = await r.json().catch(() => ({}))
    if (r.ok) { setStream((s) => (s ? { ...s, kibbles_earned: j.nuggetsLeft } : s)); window.alert(`💰 Converted ${j.notesAdded} notes onto the sheet. ${(j.nuggetsLeft ?? 0).toLocaleString()} NeoNuggets left over.`) }
    else window.alert(j.error || 'Could not convert.')
  }

  const viewers = stream?.viewer_count ?? 0
  const engagement = stream?.engagement ?? 50
  const dcMode = stream?.dc_mode ?? 'auto'
  const dcManual = stream?.dc_manual ?? null
  const moods = stream?.moods ?? []
  const paused = (stream?.chat_speed ?? 3) <= 0
  const dc = resolveDC({ mode: dcMode, manual: dcManual, viewers, engagement })
  const maxed = dc >= MAX_DC
  const warned = !!stream?.end_warning_at

  const setEngagement = (v: number) => liveSet({ engagement: v }, { engagement: v })
  const toggleMood = (id: string) => {
    const next = moods.includes(id) ? moods.filter((m) => m !== id) : [...moods, id]
    setStream((s) => (s ? { ...s, moods: next } : s)); void patch({ moods: next })
  }

  // ── Merged AI chat-focus: play/stop the AI reacting to the DM's text ──────────────
  const INDEF_MS = 365 * 24 * 60 * 60 * 1000 // "indefinite" = a far-future end the Stop button clears
  const focusActive = !!focusTimer.current || !!stream?.focus_topic
  // One burst of AI reactions to the current text (count scales with aggressiveness).
  const fireFocus = () => {
    const text = focusTextRef.current
    if (!text || !characterId) return
    void fetch(`/api/dnd/characters/${characterId}/stream/direct`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directive: text, count: FOCUS_COUNT[focusIntensityRef.current - 1] }),
    }).then(notifyPoll).catch(() => {})
  }
  // (Re)arm the repeating flood at the current aggressiveness pace.
  const armFocusTimer = () => {
    if (focusTimer.current) clearInterval(focusTimer.current)
    focusTimer.current = setInterval(() => {
      if (Date.now() >= focusUntilRef.current) { stopFocus(); return }
      fireFocus()
    }, FOCUS_GAP[focusIntensityRef.current - 1])
  }
  // ▶ Play: analyse the text + flood chat with reactions; unselect all moods.
  const playFocus = () => {
    const text = focusText.trim()
    if (!text || !characterId) return
    const i = Math.max(1, Math.min(5, focusIntensity))
    const until = Date.now() + (focusIndefinite ? INDEF_MS : focusMin * 60_000)
    focusTextRef.current = text; focusIntensityRef.current = i; focusUntilRef.current = until
    setActiveText(text)
    const untilIso = new Date(until).toISOString()
    setStream((s) => (s ? { ...s, moods: [], focus_topic: text, focus_until: untilIso, focus_intensity: i } : s))
    void patch({ moods: [], focusTopic: text, focusUntil: untilIso, focusIntensity: i })
    window.dispatchEvent(new CustomEvent('dnd-stream-focus', { detail: { characterId, suppressUntil: until, rampUntil: until + FOCUS_RAMP_MS } }))
    fireFocus()
    armFocusTimer()
  }
  // ↻ Refresh: the DM edited/appended the text — re-analyse it and switch the flood over
  // to the updated context (keeps everything else running). Enabled only when the field
  // differs from what's currently generating.
  const focusDirty = focusActive && !!focusText.trim() && focusText.trim() !== activeText
  const refreshFocus = () => {
    const text = focusText.trim()
    if (!text || !focusActive) return
    focusTextRef.current = text
    setActiveText(text)
    setStream((s) => (s ? { ...s, focus_topic: text } : s))
    void patch({ focusTopic: text })
    fireFocus()
  }
  // ■ Stop: back to mood-based generic chat.
  const stopFocus = () => {
    if (focusTimer.current) { clearInterval(focusTimer.current); focusTimer.current = null }
    focusUntilRef.current = 0
    setActiveText('')
    const now = Date.now()
    setStream((s) => (s ? { ...s, focus_topic: null, focus_until: null } : s))
    void patch({ focusTopic: null, focusUntil: null })
    window.dispatchEvent(new CustomEvent('dnd-stream-focus', { detail: { characterId, suppressUntil: now, rampUntil: now + FOCUS_RAMP_MS } }))
  }
  // Live aggressiveness change — updates the pace immediately if a focus is running.
  const changeIntensity = (i: number) => {
    const v = Math.max(1, Math.min(5, i))
    setFocusIntensity(v); focusIntensityRef.current = v
    if (focusActive) { void patch({ focusIntensity: v }); armFocusTimer() }
  }

  // On load, if a focus is already running (e.g. the DM reloaded mid-flood, or it's set to
  // run indefinitely), rehydrate the field + refs and re-arm the flood timer so it keeps
  // going on this client.
  const focusHydrated = useRef(false)
  useEffect(() => {
    if (focusHydrated.current || !stream?.focus_topic) return
    const until = stream.focus_until ? new Date(stream.focus_until).getTime() : 0
    if (until <= Date.now()) return // expired — leave it for the poll/stop to clear
    focusHydrated.current = true
    setFocusText(stream.focus_topic)
    setActiveText(stream.focus_topic)
    setFocusIntensity(stream.focus_intensity || 3)
    setFocusIndefinite(until - Date.now() > INDEF_MS - 60_000)
    focusTextRef.current = stream.focus_topic
    focusIntensityRef.current = stream.focus_intensity || 3
    focusUntilRef.current = until
    if (!focusTimer.current) armFocusTimer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream?.focus_topic])

  // All hooks are declared above; bail out unless the viewer may drive this stream (DM, or the owner outside a
  // campaign) and we have a character.
  if (!canControl || !characterId) return null

  const clearChat = async () => {
    if (busy) return
    setBusy(true)
    try { await fetch(`/api/dnd/characters/${characterId}/stream/messages`, { method: 'DELETE' }); window.dispatchEvent(new CustomEvent('dnd-stream-clear', { detail: characterId })) } finally { setBusy(false) }
  }

  const fireAlert = () => {
    const alert: StreamAlert = { type: alertType, username: alertUser.trim() || 'Someone', detail: alertDetail.trim() || undefined }
    alertChanRef.current?.send({ type: 'broadcast', event: 'alert', payload: alert })
    window.dispatchEvent(new CustomEvent('dnd-stream-alert', { detail: { characterId, alert } }))
    setAlertUser(''); setAlertDetail('')
  }
  const startPoll = async () => {
    const question = pollQ.trim(); const options = pollOpts.split(',').map((o) => o.trim()).filter(Boolean)
    if (!question || options.length < 2 || polling) return
    setPolling(true)
    try { const r = await fetch(`/api/dnd/characters/${characterId}/stream/polls`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, options }) }); if (r.ok) { setPollQ(''); setPollOpts('') } } finally { setPolling(false) }
  }
  const setMode = (mode: ChatMode) => { setChatMode(mode); modChanRef.current?.send({ type: 'broadcast', event: 'mode', payload: { mode } }); window.dispatchEvent(new CustomEvent('dnd-stream-mod', { detail: { characterId, kind: 'mode', mode } })) }
  const modAction = (type: ModActionType) => { const u = modUser.trim(); if (!u) return; modChanRef.current?.send({ type: 'broadcast', event: 'action', payload: { type, username: u } }); window.dispatchEvent(new CustomEvent('dnd-stream-mod', { detail: { characterId, kind: 'action', type, username: u } })); if (type !== 'unban') setModUser('') }

  const box: React.CSSProperties = { marginTop: 10, padding: '8px 10px', border: '1px solid var(--line, rgba(255,255,255,0.14))', borderRadius: 8 }
  const inp: React.CSSProperties = { padding: '6px 8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line, rgba(255,255,255,0.15))', color: 'inherit', fontSize: 13 }
  const label = { fontSize: 11, letterSpacing: '0.08em', color: 'var(--muted, #9aa)', fontWeight: 700 as const }

  return (
    <div className="stream-control" style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line, rgba(255,255,255,0.12))' }}>
      <span className="sec-num" style={{ fontSize: 12 }}>STREAM {'//'} Chat controls</span>

      {/* 1 — Live + utilities row */}
      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className={`btn ${live ? 'on' : ''}`} onClick={() => patch({ isLive: !live, ...(live ? {} : { touchActivity: true, endWarningAt: null }) })} disabled={busy} style={{ color: live ? '#ff4d4d' : undefined }}>
          {live ? '● LIVE — end' : '○ Go Live'}
        </button>
        {live && <button className={`btn tiny ${paused ? 'on' : ''}`} onClick={() => patch({ chatSpeed: paused ? 3 : 0 })} disabled={busy} style={{ color: paused ? '#ffb84d' : undefined }}>{paused ? '▶ Resume' : '⏸ Pause'}</button>}
        {live && <button className="btn tiny" onClick={clearChat} disabled={busy}>🧹 Clear</button>}
        {live && <span style={{ fontSize: 11, color: 'var(--muted,#9aa)' }}>pace ~{chatRatePerSec(dc)}/s</span>}
      </div>

      {/* Idle auto-end warning */}
      {live && warned && (
        <div style={{ ...box, borderColor: '#ffb84d', background: 'rgba(255,184,77,0.08)' }}>
          <div style={{ fontSize: 12 }}>⏳ The stream has been idle — it will auto-close soon to stop endless AI chatter.</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button className="btn tiny" onClick={() => patch({ touchActivity: true, endWarningAt: null })} style={{ color: 'var(--gold)' }}>Keep streaming</button>
            <button className="btn tiny" onClick={() => patch({ isLive: false, endWarningAt: null })} style={{ color: '#ff4d4d' }}>End stream</button>
          </div>
        </div>
      )}

      {/* 2 — Viewers */}
      <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 4 }}>VIEWERS
          <input type="number" min={0} value={viewers} onChange={(e) => liveSet({ viewer_count: Math.max(0, Number(e.target.value) || 0) }, { viewerCount: Math.max(0, Number(e.target.value) || 0) })} style={{ ...inp, width: 110 }} />
        </label>
        <button className="btn tiny" onClick={() => liveSet({ viewer_count: viewers + 1000 }, { viewerCount: viewers + 1000 })}>+1k</button>
        <button className="btn tiny" onClick={() => liveSet({ viewer_count: viewers + 1e6 }, { viewerCount: viewers + 1e6 })}>+1M</button>
        <button className="btn tiny" onClick={() => liveSet({ viewer_count: viewers + 1e9 }, { viewerCount: viewers + 1e9 })}>+1B</button>
        <button className="btn tiny" onClick={() => liveSet({ viewer_count: 1e15 }, { viewerCount: 1e15 })} title="One quadrillion">🪐 1Q</button>
        <button className="btn tiny" onClick={() => liveSet({ viewer_count: 0 }, { viewerCount: 0 })}>↺ 0</button>
      </div>

      {/* 3 — Resist DC (auto/manual) */}
      <div style={{ ...box, borderColor: maxed ? '#ff10f0' : undefined, background: maxed ? 'rgba(255,16,240,0.06)' : undefined }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ ...label, color: 'var(--gold,#c89b3c)' }}>RESIST DC</span>
          <strong style={{ color: maxed ? '#ff10f0' : '#7ab8ff', textShadow: `0 0 8px ${maxed ? '#ff10f0' : '#7ab8ff'}` }}>DC {dc}</strong>
          {maxed && <span style={{ fontSize: 10, fontWeight: 800, color: '#ff10f0' }}>MAXED</span>}
          <span style={{ flex: 1 }} />
          <button className={`btn tiny ${dcMode === 'auto' ? 'on' : ''}`} onClick={() => patch({ dcMode: 'auto' })} title="Viewers set the baseline; energy nudges it">Auto</button>
          <button className={`btn tiny ${dcMode === 'manual' ? 'on' : ''}`} onClick={() => patch({ dcMode: 'manual', dcManual: dcManual ?? dc })} title="Pin an exact DC">Manual</button>
        </div>
        {dcMode === 'manual' ? (
          <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>Set DC
            <input type="number" min={MIN_DC} max={MAX_DC} value={dcManual ?? dc} onChange={(e) => liveSet({ dc_manual: Math.max(MIN_DC, Math.min(MAX_DC, Number(e.target.value) || MIN_DC)) }, { dcManual: Math.max(MIN_DC, Math.min(MAX_DC, Number(e.target.value) || MIN_DC)) })} style={{ ...inp, width: 70 }} />
            <span style={{ fontWeight: 400 }}>({MIN_DC}–{MAX_DC})</span>
          </label>
        ) : (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
            <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>🌈 Energy / aggressiveness
              <input type="range" min={0} max={100} value={engagement} onChange={(e) => setEngagement(Number(e.target.value))} style={{ flex: 1, accentColor: maxed ? '#ff10f0' : '#8b5cf6' }} />
              <span style={{ width: 30, textAlign: 'right', color: '#fff', fontWeight: 700 }}>{engagement}</span>
            </label>
          </div>
        )}
      </div>

      {/* 4 — Moods (multi-select; none = default) */}
      <div style={{ ...box }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ ...label, color: 'var(--gold,#c89b3c)' }}>MOODS</span>
          <span style={{ fontSize: 11, color: 'var(--muted,#9aa)' }}>{moods.length ? `${moods.length} active — blended` : 'none → default balanced chat'}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
          {MOODS.map((m) => {
            const on = moods.includes(m.id)
            return <button key={m.id} className={`btn tiny ${on ? 'on' : ''}`} onClick={() => toggleMood(m.id)} style={{ color: on ? 'var(--gold)' : undefined }} title={m.label}>{m.icon} {m.label}</button>
          })}
          {moods.length > 0 && <button className="btn tiny" onClick={() => { setStream((s) => (s ? { ...s, moods: [] } : s)); void patch({ moods: [] }) }} title="Clear moods">✕ clear</button>}
        </div>
      </div>

      {/* 4b — Donations / superchats (off by default) */}
      {live && (
        <div style={{ ...box, borderColor: donationsOn ? '#ffd23f' : undefined, background: donationsOn ? 'rgba(255,210,63,0.06)' : undefined }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ ...label, color: '#ffd23f' }}>🐟 DONATIONS</span>
            <button className={`btn tiny ${donationsOn ? 'on' : ''}`} onClick={() => patch({ donationsEnabled: !donationsOn })} style={{ color: donationsOn ? '#ffd23f' : undefined }}>
              {donationsOn ? 'ON' : 'OFF'}
            </button>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: 'var(--muted,#9aa)' }}>earned {formatNuggets(earned)} → {nuggetsToNotes(earned)} notes</span>
            <button className="btn tiny" onClick={convertNuggets} disabled={nuggetsToNotes(earned) < 1} title="Convert whole notes onto the sheet (10,000 NeoNuggets = 1 note)">💰 Convert</button>
          </div>
          {donationsOn && (
            <>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ ...label, fontWeight: 400 }}>chat is</span>
                {GENEROSITY_LEVELS.map((g) => (
                  <button key={g} className={`btn tiny ${generosity === g ? 'on' : ''}`} onClick={() => patch({ generosity: g })} style={{ color: generosity === g ? '#ffd23f' : undefined }}>
                    {GENEROSITY[g].label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ ...label, fontWeight: 400, display: 'flex', alignItems: 'center', gap: 4 }} title="NeoNuggets in this super chat (10,000 = 1 note)">🪙
                  <input type="number" min={1} step={10000} value={donateAmt} onChange={(e) => setDonateAmt(Math.max(1, Number(e.target.value) || 1))} style={{ ...inp, width: 110 }} />
                </label>
                <span style={{ fontSize: 10.5, color: 'var(--muted,#9aa)' }}>≈ {(donateAmt / 10000).toLocaleString(undefined, { maximumFractionDigits: 2 })} note{donateAmt === 10000 ? '' : 's'}</span>
                <input value={donateUser} onChange={(e) => setDonateUser(e.target.value)} placeholder="from… (blank = random)" style={{ ...inp, width: 130 }} />
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={donateMsg} onChange={(e) => setDonateMsg(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && donateMsg.trim() && fireDonation('superchat')} placeholder="super chat message… (shown in the card)" style={{ ...inp, flex: 1, minWidth: 160 }} />
                <button className="btn tiny" onClick={() => fireDonation('superchat')} style={{ color: '#ffd23f' }}>💬 Superchat</button>
                <button className="btn tiny" onClick={() => fireDonation('donation')} title="A gift with no message">🎁 Donate</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 5 — Send as (alias) */}
      {live && <AliasBar characterId={characterId} onSent={notifyPoll} />}

      {/* 6 — AI chat focus (merged): DM types/pastes text → AI floods chat with reactions
             across all aggressiveness levels; ▶ Play unselects moods, ■ Stop reverts. */}
      {live && (
        <div style={{ ...box, borderColor: focusActive ? '#0ac8b9' : undefined, background: focusActive ? 'rgba(10,200,185,0.07)' : undefined }}>
          <span style={{ ...label, color: '#0ac8b9' }}>🤖 AI CHAT FOCUS</span>
          <span style={{ fontSize: 11, color: 'var(--muted,#9aa)', marginLeft: 8 }}>type or paste text (a topic, or the party’s dialogue) — chat reacts to it</span>
          <textarea
            value={focusText}
            onChange={(e) => { setFocusText(e.target.value); const t = e.target; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 320) + 'px' }}
            placeholder="e.g. paste what the party just said, or “the merchant is definitely the villain and everyone should be suspicious of him”…"
            rows={2}
            style={{ ...inp, width: '100%', marginTop: 7, resize: 'none', minHeight: 54, lineHeight: 1.45, overflowY: 'auto' }}
          />
          <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>Aggressiveness
              <input type="range" min={1} max={5} value={focusIntensity} onChange={(e) => changeIntensity(Number(e.target.value))} style={{ accentColor: '#0ac8b9' }} />
              <strong>{focusIntensity}</strong>
            </label>
            <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, opacity: focusIndefinite ? 0.4 : 1 }}>Minutes
              <input type="number" min={1} max={240} value={focusMin} onChange={(e) => setFocusMin(Math.max(1, Math.min(240, Number(e.target.value) || 1)))} disabled={focusIndefinite || focusActive} style={{ ...inp, width: 64 }} />
            </label>
            <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 400, cursor: 'pointer' }} title="Keep chat on this text until you hit Stop">
              <input type="checkbox" checked={focusIndefinite} onChange={(e) => setFocusIndefinite(e.target.checked)} disabled={focusActive} /> ∞ Indefinite
            </label>
            <span style={{ flex: 1 }} />
            {focusActive ? (
              <>
                <button
                  className="btn tiny"
                  onClick={refreshFocus}
                  disabled={!focusDirty}
                  title={focusDirty ? 'Re-analyze the updated text and refresh the chat with the new info' : 'Edit or append to the text above to enable'}
                  style={focusDirty ? { color: '#0ac8b9', fontWeight: 700, boxShadow: '0 0 10px rgba(10,200,185,0.55)' } : undefined}
                >
                  ↻ Refresh AI
                </button>
                <button className="btn tiny" onClick={stopFocus} style={{ color: '#ff5252' }}>■ Stop</button>
              </>
            ) : (
              <button className="btn tiny" onClick={playFocus} disabled={!focusText.trim()} style={{ color: '#0ac8b9' }}>▶ Play</button>
            )}
          </div>
          {focusActive && stream?.focus_topic && (
            <div style={{ fontSize: 11, color: '#0ac8b9', marginTop: 6 }}>
              ● CHAT IS FOCUSED ON: {stream.focus_topic.length > 90 ? stream.focus_topic.slice(0, 90) + '…' : stream.focus_topic}
              {stream.focus_until && new Date(stream.focus_until).getTime() - Date.now() > INDEF_MS - 60_000 ? ' · indefinitely' : ''}
            </div>
          )}
        </div>
      )}

      {/* 8 — Chat search + 9 — Reply inbox */}
      {live && <ChatSearchPanel characterId={characterId} isDM />}
      {live && <ReplyInbox characterId={characterId} onPosted={notifyPoll} />}

      {/* 10 — Utilities (polls / alerts / mod) behind a toggle */}
      {live && (
        <div style={{ marginTop: 10 }}>
          <button className="btn tiny" onClick={() => setMore((m) => !m)}>{more ? '▾ Hide utilities' : '▸ More utilities (polls · alerts · mod)'}</button>
          {more && (
            <div style={{ ...box }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <input value={pollQ} onChange={(e) => setPollQ(e.target.value)} placeholder="Poll question…" style={{ ...inp, flex: 2, minWidth: 130 }} />
                <input value={pollOpts} onChange={(e) => setPollOpts(e.target.value)} placeholder="options, comma, separated" style={{ ...inp, flex: 2, minWidth: 130 }} />
                <button className="btn tiny" onClick={startPoll} disabled={polling || !pollQ.trim() || pollOpts.split(',').filter((o) => o.trim()).length < 2}>📊 Poll</button>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={alertType} onChange={(e) => setAlertType(e.target.value as AlertType)} style={{ ...inp, padding: '5px 6px' }}>
                  <option value="sub">Sub</option><option value="resub">Resub</option><option value="donation">Donation</option><option value="raid">Raid</option>
                </select>
                <input value={alertUser} onChange={(e) => setAlertUser(e.target.value)} placeholder="username" style={{ ...inp, width: 100 }} />
                <input value={alertDetail} onChange={(e) => setAlertDetail(e.target.value)} placeholder="detail" style={{ ...inp, width: 120 }} />
                <button className="btn tiny" onClick={fireAlert} style={{ color: '#9147ff' }}>🔔 Alert</button>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={label}>MOD</span>
                {CHAT_MODES.map((m) => <button key={m.id} className={`btn tiny ${chatMode === m.id ? 'on' : ''}`} onClick={() => setMode(m.id)} style={{ color: chatMode === m.id ? 'var(--gold)' : undefined }}>{m.icon} {m.label}</button>)}
                <input value={modUser} onChange={(e) => setModUser(e.target.value)} placeholder="username" style={{ ...inp, width: 120 }} />
                <button className="btn tiny" onClick={() => modAction('timeout')} disabled={!modUser.trim()}>⛔</button>
                <button className="btn tiny" onClick={() => modAction('ban')} disabled={!modUser.trim()} style={{ color: '#ff4d4d' }}>🔨</button>
                <button className="btn tiny" onClick={() => modAction('unban')} disabled={!modUser.trim()}>♻️</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
