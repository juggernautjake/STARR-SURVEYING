'use client'
// DM invite UI (Phase B5b) — generate / copy / revoke invite links, on the campaign
// page. DM-only (mounted only when the caller is the campaign DM). Uses the B5a
// invite API. Each invite's link is /dnd/join/<code> (the B4 acceptance flow).
import { useEffect, useState } from 'react'
import styles from './hextech.module.css'

export interface Invite {
  id: string
  code: string
  role: string
  used_by?: string | null
  expires_at?: string | null
  created_at?: string
}

function statusOf(iv: Invite): { label: string; color: string } {
  if (iv.used_by) return { label: 'Used', color: 'var(--hx-muted)' }
  if (iv.expires_at && new Date(iv.expires_at).getTime() < Date.now()) return { label: 'Expired', color: 'var(--hx-danger)' }
  return { label: 'Active', color: 'var(--hx-teal-1)' }
}

export default function InvitesPanel({ campaignId, initialInvites }: { campaignId: string; initialInvites?: Invite[] }) {
  const [invites, setInvites] = useState<Invite[]>(initialInvites ?? [])
  const [role, setRole] = useState<'player' | 'dm'>('player')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (initialInvites) return
    let cancelled = false
    fetch(`/api/dnd/invites?campaignId=${campaignId}`)
      .then((r) => (r.ok ? r.json() : { invites: [] }))
      .then((j) => {
        if (!cancelled) setInvites(j.invites ?? [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [campaignId, initialInvites])

  // The relative path is stable across server + client render (no hydration
  // mismatch); the absolute URL is only needed for the client-only copy handler.
  const joinPath = (code: string) => `/dnd/join/${code}`

  async function generate() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/dnd/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, role }),
      })
      const j = await res.json()
      if (!res.ok) {
        setError(j.error || 'Could not create invite.')
        return
      }
      setInvites((iv) => [j.invite, ...iv])
    } catch {
      setError('Network error — please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${joinPath(code)}`)
      setCopied(code)
      window.setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500)
    } catch {
      /* clipboard blocked — the link is still visible to copy manually */
    }
  }

  async function revoke(id: string) {
    setInvites((iv) => iv.filter((x) => x.id !== id)) // optimistic
    try {
      await fetch(`/api/dnd/invites/${id}`, { method: 'DELETE' })
    } catch {
      /* best-effort */
    }
  }

  return (
    <section className={styles.framedPanel}>
      <div className={styles.framedPanelTop} />
      <h2 className={styles.panelTitle}>Invites</h2>

      {error && <div className={styles.error}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'player' | 'dm')}
          className={styles.input}
          style={{ width: 'auto', padding: '8px 10px' }}
        >
          <option value="player">Player</option>
          <option value="dm">Co-DM</option>
        </select>
        <button className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} onClick={generate} disabled={busy}>
          {busy ? 'Generating…' : '+ Generate Invite'}
        </button>
      </div>

      {invites.length === 0 ? (
        <p style={{ color: 'var(--hx-muted)', fontSize: 14 }}>No invites yet — generate one to invite a player.</p>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {invites.map((iv) => {
            const st = statusOf(iv)
            return (
              <div
                key={iv.id}
                style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', background: 'rgba(1,10,19,0.4)', border: '1px solid var(--hx-line)', flexWrap: 'wrap' }}
              >
                <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: iv.role === 'dm' ? 'var(--hx-gold-2)' : 'var(--hx-teal-1)' }}>{iv.role}</span>
                <code style={{ color: 'var(--hx-text)', fontSize: 12.5, flex: 1, minWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{joinPath(iv.code)}</code>
                <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: st.color }}>{st.label}</span>
                {!iv.used_by && (
                  <button className={styles.hexBtn} style={{ padding: '6px 11px' }} onClick={() => copy(iv.code)}>
                    {copied === iv.code ? 'Copied!' : 'Copy'}
                  </button>
                )}
                <button className={styles.hexBtn} style={{ padding: '6px 11px', borderColor: 'var(--hx-danger)', color: 'var(--hx-danger)' }} onClick={() => revoke(iv.id)}>
                  Revoke
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
