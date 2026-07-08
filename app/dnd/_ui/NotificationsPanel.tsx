'use client'
// NotificationsPanel (Phase P) — the signed-in user's in-app notifications on the /dnd
// hub. Today that's pending campaign invites: a DM invited them by name, and they can
// Accept (→ join + jump to the campaign hub) or Decline. Polls once on mount; also
// refreshes after acting.
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './hextech.module.css'

interface InviteNotification {
  id: string
  type: 'invite'
  campaignId: string
  campaignName: string
  campaignBlurb: string | null
  role: string
  inviterName: string
}

export default function NotificationsPanel() {
  const router = useRouter()
  const [items, setItems] = useState<InviteNotification[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/dnd/notifications')
      .then((r) => (r.ok ? r.json() : { notifications: [] }))
      .then((j) => setItems(j.notifications ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  async function respond(id: string, accept: boolean, campaignId: string) {
    setBusy(id)
    try {
      const r = await fetch(`/api/dnd/invites/${id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept }),
      })
      setItems((xs) => xs.filter((x) => x.id !== id))
      if (r.ok && accept) {
        router.push(`/dnd/campaigns/${campaignId}`)
        router.refresh()
      } else {
        router.refresh()
      }
    } finally {
      setBusy(null)
    }
  }

  if (items.length === 0) return null

  return (
    <section style={{ display: 'grid', gap: 8 }}>
      <h2 className={styles.panelTitle} style={{ margin: 0, fontSize: 13 }}>🔔 Invitations</h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((n) => (
          <div key={n.id} className={styles.framedPanel} style={{ display: 'grid', gap: 8, padding: '14px 16px', borderColor: 'var(--hx-teal-1)' }}>
            <div>
              <strong style={{ color: 'var(--hx-gold-2)', fontFamily: 'var(--hx-font-display)', fontSize: 15 }}>{n.inviterName}</strong>
              <span style={{ color: 'var(--hx-muted)', fontSize: 13 }}> invited you to join </span>
              <strong style={{ color: 'var(--hx-text)', fontSize: 14 }}>{n.campaignName}</strong>
              <span style={{ color: 'var(--hx-muted)', fontSize: 13 }}> as {n.role === 'dm' ? 'a co-DM' : 'a player'}.</span>
            </div>
            {n.campaignBlurb && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--hx-muted)', lineHeight: 1.5 }}>{n.campaignBlurb}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} onClick={() => respond(n.id, true, n.campaignId)} disabled={busy === n.id}>
                {busy === n.id ? '…' : '✓ Accept'}
              </button>
              <button className={styles.hexBtn} onClick={() => respond(n.id, false, n.campaignId)} disabled={busy === n.id} style={{ borderColor: 'var(--hx-danger)', color: 'var(--hx-danger)' }}>
                Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
