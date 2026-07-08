'use client'
// StreamOwnerControls (Phase R) — the streamer's OWN stream controls, for a non-DM owner
// (e.g. Susie). Always visible on her sheet (the chat overlay only shows while live, so
// "Go Live" has to live somewhere that's up when she's offline). Gives her:
//   • Go Live / End Stream  (the DM has the same control in his panel)
//   • her running NeoNuggets total + an Exchange button (10,000 NeoNuggets = 1 note),
//     which cashes whole notes onto her sheet and drops the exchanged NeoNuggets.
import { useEffect, useState } from 'react'
import { useChar } from '../state/store'
import { formatNuggets, nuggetsToNotes, NUGGETS_PER_NOTE } from '@/lib/dnd/stream-currency'

interface OwnerStream { is_live: boolean; kibbles_earned: number }

export default function StreamOwnerControls() {
  const { characterId, isDM, canWrite, reloadFromDb } = useChar()
  const isOwner = canWrite && !isDM
  const [stream, setStream] = useState<OwnerStream | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

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

  if (!isOwner || !characterId || !stream) return null

  const live = stream.is_live
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
