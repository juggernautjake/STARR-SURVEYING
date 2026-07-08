'use client'
// StreamTip (Phase R) — a fellow player watching the streamer can tip her their own notes.
// The notes come straight out of their inventory (capped at what they have) and land on
// the streamer as NeoNuggets (10,000 each). Rendered in the chat overlay for a watching
// campaign member (not the streamer/DM).
import { useEffect, useState } from 'react'

export default function StreamTip({ characterId }: { characterId: string }) {
  const [canTip, setCanTip] = useState<boolean | null>(null)
  const [notesAvail, setNotesAvail] = useState(0)
  const [amount, setAmount] = useState(1)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    let stop = false
    fetch(`/api/dnd/characters/${characterId}/stream/tip`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!stop && j) { setCanTip(!!j.canTip); setNotesAvail(Number(j.notes ?? 0)) } })
      .catch(() => { if (!stop) setCanTip(false) })
    return () => { stop = true }
  }, [characterId])

  if (canTip === null || !canTip) return null

  const capped = Math.max(1, Math.min(amount, Math.max(1, notesAvail)))
  const tip = async () => {
    const n = Math.floor(capped)
    if (n < 1 || busy || n > notesAvail) return
    setBusy(true); setNote(null)
    try {
      const r = await fetch(`/api/dnd/characters/${characterId}/stream/tip`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: n, message: msg.trim() || undefined }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok) {
        setNotesAvail(Number(j.donorNotesLeft ?? 0))
        setMsg(''); setAmount(1)
        setNote(`Tipped ${n} note${n === 1 ? '' : 's'} 🪙`)
        window.dispatchEvent(new CustomEvent('dnd-stream-poll', { detail: characterId }))
      } else {
        setNote(j.error || 'Could not tip.')
      }
    } finally { setBusy(false) }
  }

  const inp: React.CSSProperties = { padding: '5px 7px', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.18)', color: 'inherit', fontSize: 12.5, borderRadius: 4 }
  return (
    <div style={{ display: 'flex', gap: 6, padding: '6px 8px', borderTop: '1px solid rgba(255,255,255,0.12)', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, color: '#ffd23f', fontWeight: 700 }} title="Tip funded by your character's notes (10,000 NeoNuggets each)">🪙 Tip</span>
      <input type="number" min={1} max={notesAvail} value={amount} onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))} style={{ ...inp, width: 62 }} title={`You have ${notesAvail} notes`} />
      <span style={{ fontSize: 10.5, color: 'var(--muted,#9aa)' }}>/ {notesAvail} notes</span>
      <input value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && tip()} placeholder="message (optional)…" style={{ ...inp, flex: 1, minWidth: 90 }} />
      <button onClick={tip} disabled={busy || notesAvail < 1 || capped > notesAvail} className="sd-pause" title={notesAvail < 1 ? 'You have no notes to tip' : `Tip ${capped} note${capped === 1 ? '' : 's'}`}>{busy ? '…' : 'Send'}</button>
      {note && <span style={{ fontSize: 10.5, color: '#0ac8b9', width: '100%' }}>{note}</span>}
    </div>
  )
}
