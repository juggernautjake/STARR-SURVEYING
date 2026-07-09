'use client'
// StreamOwnerControls (Phase R) — the streamer's OWN stream controls, for a non-DM owner
// (e.g. Susie). Always visible on her sheet (the chat overlay only shows while live, so
// "Go Live" has to live somewhere that's up when she's offline). Gives her:
//   • Go Live / End Stream  (the DM has the same control in his panel)
//   • her running NeoNuggets total + an Exchange button (10,000 NeoNuggets = 1 note),
//     which cashes whole notes onto her sheet and drops the exchanged NeoNuggets.
import { useEffect, useRef, useState } from 'react'
import { useChar } from '../state/store'
import { formatNuggets, nuggetsToNotes, NUGGETS_PER_NOTE } from '@/lib/dnd/stream-currency'
import { MOODS } from '@/lib/dnd/stream-moods'

interface OwnerStream { is_live: boolean; kibbles_earned: number }

// Idle auto-end + AI refresh cadence (mirrors the DM panel so the stream keeps ticking
// even when only the streamer — not the DM — has the sheet open).
const IDLE_END_MS = 60 * 60 * 1000     // end 1h after the last DM/player interaction
const WARN_BEFORE_MS = 10 * 60 * 1000  // warn 10 min before the auto-end
const MOOD_REFRESH_MS = 15 * 60 * 1000 // AI refresh cadence
const ALL_MOOD_IDS = MOODS.map((m) => m.id)

export default function StreamOwnerControls() {
  const { characterId, isDM, canWrite, reloadFromDb } = useChar()
  const isOwner = canWrite && !isDM
  const [stream, setStream] = useState<OwnerStream | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const heartbeatMoodAt = useRef(0)

  useEffect(() => {
    if (!characterId || !isOwner) return
    let stop = false
    const load = () =>
      fetch(`/api/dnd/characters/${characterId}/stream`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (!stop && j?.stream) setStream({ is_live: !!j.stream.is_live, kibbles_earned: Number(j.stream.kibbles_earned ?? 0) }) })
        .catch(() => {})
    load()
    // Reflect changes the DM (or a donation) makes without a full reload.
    const onState = (e: Event) => {
      const d = (e as CustomEvent).detail as { characterId?: string; stream?: { is_live?: boolean; kibbles_earned?: number } }
      if (d?.characterId !== characterId || !d.stream) return
      setStream((s) => ({ is_live: d.stream!.is_live ?? s?.is_live ?? false, kibbles_earned: d.stream!.kibbles_earned ?? s?.kibbles_earned ?? 0 }))
    }
    window.addEventListener('dnd-stream-state', onState)
    // A light poll keeps the NeoNugget total fresh as donations land.
    const t = setInterval(load, 5000)
    return () => { stop = true; clearInterval(t); window.removeEventListener('dnd-stream-state', onState) }
  }, [characterId, isOwner])

  // Heartbeat (owner side): while she's live, drive the 15-min AI refresh (every mood, all
  // aggressiveness levels) and the 1h idle auto-end — so the stream keeps generating and
  // eventually ends even if the DM isn't on the page. The server dedupes the AI refresh so
  // the DM's identical heartbeat doesn't double-generate; the idle patches pass
  // touchActivity:false so they don't reset the clock they're driving.
  const live = stream?.is_live ?? false
  useEffect(() => {
    if (!characterId || !isOwner || !live) return
    let stop = false
    const patchState = (b: Record<string, unknown>) =>
      fetch(`/api/dnd/characters/${characterId}/stream`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).catch(() => {})
    const beat = async () => {
      try {
        const r = await fetch(`/api/dnd/characters/${characterId}/stream`)
        const s = r.ok ? (await r.json())?.stream : null
        if (!s || stop || !s.is_live) return
        const now = Date.now()
        const lastAct = s.last_activity_at ? new Date(s.last_activity_at).getTime() : now
        const warnedAt = s.end_warning_at ? new Date(s.end_warning_at).getTime() : 0
        const idle = now - lastAct
        if (idle >= IDLE_END_MS) {
          await patchState({ isLive: false, endWarningAt: null, touchActivity: false })
          setStream((st) => (st ? { ...st, is_live: false } : st))
          window.dispatchEvent(new CustomEvent('dnd-stream-state', { detail: { characterId, stream: { is_live: false } } }))
          return
        } else if (idle >= IDLE_END_MS - WARN_BEFORE_MS && !warnedAt) {
          await patchState({ endWarningAt: new Date().toISOString(), touchActivity: false })
        } else if (warnedAt && idle < IDLE_END_MS - WARN_BEFORE_MS) {
          await patchState({ endWarningAt: null, touchActivity: false })
        }
        if (now - heartbeatMoodAt.current >= MOOD_REFRESH_MS) {
          heartbeatMoodAt.current = now
          void fetch(`/api/dnd/characters/${characterId}/stream/mood-refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ moods: ALL_MOOD_IDS, allLevels: true }) }).catch(() => {})
        }
      } catch { /* ignore */ }
    }
    const t = setInterval(beat, 60_000)
    beat()
    return () => { stop = true; clearInterval(t) }
  }, [characterId, isOwner, live])

  if (!isOwner || !characterId || !stream) return null

  const nuggets = stream.kibbles_earned
  const notes = nuggetsToNotes(nuggets)

  const toggleLive = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/stream`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isLive: !live }),
      })
      if (r.ok) {
        const next = { ...stream, is_live: !live }
        setStream(next)
        // Sync the overlay instantly (it also polls as a fallback).
        window.dispatchEvent(new CustomEvent('dnd-stream-state', { detail: { characterId, stream: { is_live: !live } } }))
      }
    } finally { setBusy(false) }
  }

  const exchange = async () => {
    if (busy || notes < 1) return
    setBusy(true); setNote(null)
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/stream/convert`, { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (r.ok) {
        setStream((s) => (s ? { ...s, kibbles_earned: Number(j.nuggetsLeft ?? 0) } : s))
        setNote(`💰 Exchanged for ${j.notesAdded} note${j.notesAdded === 1 ? '' : 's'} — added to your inventory.`)
        // Managing her stream counts as interaction (holds off the idle auto-end).
        void fetch(`/api/dnd/characters/${characterId}/stream`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ touchActivity: true }) }).catch(() => {})
        await reloadFromDb() // pull the updated notes onto the sheet
      } else {
        setNote(j.error || 'Could not exchange.')
      }
    } finally { setBusy(false) }
  }

  const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--panel-2)', fontSize: 13 }

  return (
    <section className="card" style={{ marginBottom: 14, borderColor: live ? '#ff5252' : 'var(--line-strong)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="sec-num" style={{ color: 'var(--hotpink, #ff2d8b)', fontSize: 12 }}>MY STREAM {'//'}</span>
        <button className={`btn ${live ? 'danger' : 'solid'}`} onClick={toggleLive} disabled={busy}
          title={live ? 'End your stream (hides the chat + meter for everyone)' : 'Go live — starts your streamer chat, influence meter, and viewers'}>
          {live ? '⏹ End Stream' : '🔴 Go Live'}
        </button>
        <span style={{ flex: 1 }} />
        <span style={chip} title="Your running NeoNuggets from super chats (10,000 = 1 note)">
          {formatNuggets(nuggets)} <span style={{ color: 'var(--muted)', fontSize: 11 }}>NeoNuggets</span>
        </span>
        <button className="btn gold" onClick={exchange} disabled={busy || notes < 1}
          title={notes < 1 ? `Need ${NUGGETS_PER_NOTE.toLocaleString()} NeoNuggets for 1 note` : `Exchange ${formatNuggets(nuggets)} for ${notes} note${notes === 1 ? '' : 's'}`}>
          💱 Exchange → {notes} note{notes === 1 ? '' : 's'}
        </button>
      </div>
      {note && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--tealbright)' }}>{note}</p>}
    </section>
  )
}
