'use client'
// NeoNuggetsBalance (Phase R) — every character can see how many NeoNuggets 🪙 they have
// (earned from stream super chats; 10,000 = 1 note). Rendered as an extra currency cell.
// The balance lives in the character's stream state; non-streamers simply show 0.
import { useEffect, useState } from 'react'
import { useChar } from '../state/store'
import { formatNuggets } from '@/lib/dnd/stream-currency'

export default function NeoNuggetsBalance() {
  const { characterId } = useChar()
  const [n, setN] = useState<number | null>(null)

  useEffect(() => {
    if (!characterId) return
    let stop = false
    const load = () =>
      fetch(`/api/dnd/characters/${characterId}/stream`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (!stop && j?.stream) setN(Number(j.stream.kibbles_earned ?? 0)) })
        .catch(() => {})
    load()
    // Refresh periodically + when the stream state changes (donations / exchange).
    const onState = (e: Event) => {
      const d = (e as CustomEvent).detail as { characterId?: string; stream?: { kibbles_earned?: number } }
      if (d?.characterId === characterId && d.stream?.kibbles_earned != null) setN(Number(d.stream.kibbles_earned))
    }
    window.addEventListener('dnd-stream-state', onState)
    const t = setInterval(load, 8000)
    return () => { stop = true; clearInterval(t); window.removeEventListener('dnd-stream-state', onState) }
  }, [characterId])

  if (n === null) return null
  return (
    <div className="cur" title="NeoNuggets from stream super chats — 10,000 = 1 note">
      <div className="cl">NeoNuggets 🪙</div>
      <div className="cv">{n.toLocaleString()}</div>
    </div>
  )
}
