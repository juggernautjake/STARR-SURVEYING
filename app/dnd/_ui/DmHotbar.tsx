'use client'
// DM hotbar (Phase H4) — a persistent quick-action bar (shown across all console
// tabs, DM only) that fires instantly: one-click reveal a prepared handout to the
// party (H1/H2/H3) or drop a canned message into party chat (F1). Composes the
// pieces already in place. Drag-to-arrange + per-session loadouts + AI shortcuts are
// documented follow-ups.
import { useEffect, useState } from 'react'
import styles from './hextech.module.css'
import { useReveals } from './useReveals'

interface Handout { id?: string; url: string; label?: string | null }

const CANNED = ['Roll initiative!', 'Make a saving throw.', 'What do you do?']

export default function DmHotbar({ campaignId, selfId, initialHandouts }: { campaignId: string; selfId?: string | null; initialHandouts?: Handout[] }) {
  const [handouts, setHandouts] = useState<Handout[]>(initialHandouts ?? [])
  const [flash, setFlash] = useState<string | null>(null)
  const { broadcastReveal } = useReveals(campaignId, selfId ?? null, () => {})

  useEffect(() => {
    if (initialHandouts) return
    fetch(`/api/dnd/handouts?campaignId=${campaignId}`).then((r) => (r.ok ? r.json() : { handouts: [] })).then((j) => setHandouts(j.handouts ?? [])).catch(() => {})
  }, [campaignId, initialHandouts])

  function flashMsg(m: string) {
    setFlash(m)
    setTimeout(() => setFlash(null), 2200)
  }

  function revealHandout(h: Handout) {
    broadcastReveal({ imageUrl: h.url, caption: h.label ?? null, recipientIds: null, fromName: 'DM' })
    fetch('/api/dnd/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId, channel: 'party', body: h.label ?? null, imageUrl: h.url, isReveal: true }),
    }).catch(() => {})
    flashMsg(`Revealed ${h.label ?? 'handout'} to the party.`)
  }

  function sendCanned(text: string) {
    fetch('/api/dnd/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId, channel: 'party', body: text }),
    }).catch(() => {})
    flashMsg(`Sent: “${text}”`)
  }

  return (
    <div style={{ border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.55)', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto' }}>
      <span style={{ fontFamily: 'var(--hx-font-display)', fontSize: 11, letterSpacing: '0.12em', color: 'var(--hx-gold-2)', whiteSpace: 'nowrap' }}>HOTBAR</span>

      {handouts.map((h, i) => (
        <button key={h.id ?? i} className={styles.hexBtn} style={{ padding: 3, flexShrink: 0 }} title={`Reveal ${h.label ?? 'handout'} to the party`} onClick={() => revealHandout(h)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={h.url} alt={h.label ?? ''} style={{ width: 30, height: 30, objectFit: 'cover', display: 'block' }} />
        </button>
      ))}

      <span style={{ width: 1, height: 22, background: 'var(--hx-line)', flexShrink: 0 }} />

      {CANNED.map((c) => (
        <button key={c} className={styles.hexBtn} style={{ padding: '4px 9px', fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => sendCanned(c)}>{c}</button>
      ))}

      {flash && <span style={{ fontSize: 12, color: 'var(--hx-teal-1)', whiteSpace: 'nowrap', marginLeft: 'auto', flexShrink: 0 }}>{flash}</span>}
    </div>
  )
}
