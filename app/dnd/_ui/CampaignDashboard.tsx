'use client'
// DM dashboard (Phase E2) — the campaign list + create surface, in the Hextech
// style (§6.19 / E1 primitives). Lists the campaigns you belong to as framed cards
// and creates a new one (making you its DM). Opening a card goes to the campaign
// page (E3).
import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import styles from './hextech.module.css'

export interface CampaignCard {
  id: string
  name: string
  blurb?: string | null
  role: string
}

export default function CampaignDashboard({ displayName, initialCampaigns }: { displayName: string; initialCampaigns?: CampaignCard[] }) {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<CampaignCard[]>(initialCampaigns ?? [])
  const [loaded, setLoaded] = useState(!!initialCampaigns)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [blurb, setBlurb] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialCampaigns) return
    let cancelled = false
    fetch('/api/dnd/campaigns')
      .then((r) => (r.ok ? r.json() : { campaigns: [] }))
      .then((j) => {
        if (!cancelled) setCampaigns(j.campaigns ?? [])
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [initialCampaigns])

  async function create(e: FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/dnd/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, blurb }),
      })
      const j = await res.json()
      if (!res.ok) {
        setError(j.error || 'Could not create campaign.')
        return
      }
      setCampaigns((cs) => [j.campaign, ...cs])
      setName('')
      setBlurb('')
      setShowForm(false)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.screen} style={{ alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 860, display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <p className={styles.brand}>Starr Tabletop</p>
              <h1 className={styles.title} style={{ textAlign: 'left', margin: 0 }}>Campaigns</h1>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} onClick={() => setShowForm((v) => !v)}>
                + New Campaign
              </button>
              <a className={styles.hexBtn} href="/dnd/profile">Profile</a>
              <a className={styles.hexBtn} href="/api/dnd/auth/logout" onClick={(e) => { e.preventDefault(); fetch('/api/dnd/auth/logout', { method: 'POST' }).then(() => router.push('/dnd/login')) }}>
                Sign Out
              </a>
            </div>
          </div>
          <p style={{ color: 'var(--hx-muted)', margin: '-8px 0 0' }}>Welcome, {displayName}.</p>

          {error && <div className={styles.error}>{error}</div>}

          {showForm && (
            <form className={styles.framedPanel} onSubmit={create}>
              <div className={styles.framedPanelTop} />
              <h2 className={styles.panelTitle}>New Campaign</h2>
              <label className={styles.field}>
                <span className={styles.label}>Name</span>
                <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Blurb (optional)</span>
                <input className={styles.input} value={blurb} onChange={(e) => setBlurb(e.target.value)} maxLength={200} />
              </label>
              <button className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} type="submit" disabled={creating}>
                {creating ? 'Creating…' : 'Create Campaign'}
              </button>
            </form>
          )}

          {!loaded ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--hx-muted)' }}>
              <span className={styles.spinner} /> Loading campaigns…
            </div>
          ) : campaigns.length === 0 ? (
            <p style={{ color: 'var(--hx-muted)' }}>No campaigns yet — create your first to start a table.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
              {campaigns.map((c) => (
                <button
                  key={c.id}
                  className={styles.framedPanel}
                  onClick={() => router.push(`/dnd/campaigns/${c.id}`)}
                  style={{ textAlign: 'left', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span className={styles.panelTitle} style={{ margin: 0 }}>{c.name}</span>
                    <span style={{ fontSize: 10, letterSpacing: '0.12em', color: c.role === 'dm' ? 'var(--hx-gold-2)' : 'var(--hx-teal-1)', border: '1px solid currentColor', padding: '2px 6px' }}>
                      {c.role.toUpperCase()}
                    </span>
                  </div>
                  {c.blurb && <p style={{ color: 'var(--hx-muted)', fontSize: 13, margin: '8px 0 0' }}>{c.blurb}</p>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
