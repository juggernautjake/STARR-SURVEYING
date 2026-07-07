'use client'
// Streamer event-alert banner (Phase J9) — shows a sub/resub/donation/raid alert that
// slides in and auto-dismisses. Alerts arrive on a per-character broadcast (DM fires
// them from StreamControl); `initialAlert` is for testing. Transition-based (no
// keyframes) so it works in the scoped sheet theme.
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatAlert, type StreamAlert as Alert } from '@/lib/dnd/stream-alerts'

export default function StreamAlert({ characterId, initialAlert }: { characterId: string; initialAlert?: Alert }) {
  const [alert, setAlert] = useState<Alert | null>(initialAlert ?? null)
  const [shown, setShown] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fire = (a: Alert) => {
    setAlert(a)
    setShown(false)
    requestAnimationFrame(() => setShown(true))
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setShown(false), 5000)
  }

  useEffect(() => {
    if (initialAlert) { requestAnimationFrame(() => setShown(true)); return }
    if (!characterId) return
    // Broadcast (other viewers) + a local window event (the DM who fired it, since
    // broadcast self:false excludes the sender).
    const ch = supabase.channel(`dnd:stream:${characterId}:alert`, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'alert' }, (m) => {
      const p = m.payload as Alert
      if (p?.type && p?.username != null) fire(p)
    }).subscribe()
    const onLocal = (e: Event) => {
      const d = (e as CustomEvent).detail as { characterId: string; alert: Alert }
      if (d?.characterId === characterId && d.alert) fire(d.alert)
    }
    window.addEventListener('dnd-stream-alert', onLocal)
    return () => { void supabase.removeChannel(ch); window.removeEventListener('dnd-stream-alert', onLocal) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId, initialAlert])

  if (!alert) return null
  const f = formatAlert(alert)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        margin: '10px 0 0',
        padding: '10px 14px',
        border: `1px solid ${f.color}`,
        borderLeft: `4px solid ${f.color}`,
        background: 'rgba(0,0,0,0.55)',
        boxShadow: `0 0 22px -6px ${f.color}`,
        transform: shown ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
        opacity: shown ? 1 : 0,
        transition: 'opacity 0.4s ease, transform 0.4s cubic-bezier(0.16,0.9,0.3,1)',
      }}
    >
      <span style={{ fontSize: 26 }}>{f.emoji}</span>
      <div>
        <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: f.color, fontWeight: 700 }}>{f.label}</div>
        <div style={{ fontSize: 15, color: 'var(--text, #fff)' }}>{f.text}</div>
      </div>
    </div>
  )
}
