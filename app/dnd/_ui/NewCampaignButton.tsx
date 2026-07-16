'use client'
// NewCampaignButton — create a campaign from the /dnd hub (open-access mode). The header's
// "+ Campaign" links to /dnd?new=campaign; this opens its form on arrival. On success it routes to
// the new campaign's manage page so the DM can immediately invite players — and the campaign then
// shows up under "Campaigns you run" here and in the all-campaigns list.
import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import styles from './hextech.module.css'
import { GAME_SYSTEMS, SYSTEM_AMBIGUOUS } from '@/lib/dnd/systems'

export default function NewCampaignButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [blurb, setBlurb] = useState('')
  const [system, setSystem] = useState<string>(SYSTEM_AMBIGUOUS)
  const [allowCustom, setAllowCustom] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Open straight away when arriving via the header's "+ Campaign" (in an effect, not during
  // render — reading the URL while rendering would hydrate-mismatch).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new') === 'campaign') setOpen(true)
  }, [])

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Give your campaign a name.'); return }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/dnd/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), blurb: blurb.trim() || undefined, system, allowCustom }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.campaign) {
        setError(data.error || 'Could not create the campaign. Are you signed in?')
        return
      }
      // Straight to the manage page — where invites and the roster live.
      router.push(`/dnd/campaigns/${data.campaign.id}/manage`)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} onClick={() => setOpen(true)}>
          ＋ New Campaign
        </button>
      </div>
    )
  }

  return (
    <form className={styles.framedPanel} onSubmit={create}>
      <div className={styles.framedPanelTop} />
      <h2 className={styles.panelTitle}>New Campaign</h2>
      <p style={{ color: 'var(--hx-muted)', fontSize: 12.5, margin: '0 0 6px' }}>
        You&apos;ll be its DM — invite players and build the table from the manage page next.
      </p>
      {error && <div className={styles.error}>{error}</div>}
      <label className={styles.field}>
        <span className={styles.label}>Name</span>
        <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus required />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Description (optional)</span>
        <input className={styles.input} value={blurb} onChange={(e) => setBlurb(e.target.value)} maxLength={200} />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Game system</span>
        <select className={styles.input} value={system} onChange={(e) => setSystem(e.target.value)}>
          <option value={SYSTEM_AMBIGUOUS}>— pick later —</option>
          {GAME_SYSTEMS.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
        </select>
        <span style={{ fontSize: 11.5, color: 'var(--hx-muted)', marginTop: 3 }}>The rulebook your table runs. Characters brought from another system can be translated into it.</span>
      </label>
      <label className={styles.toggleRow}>
        <span className={styles.switch}>
          <input type="checkbox" checked={allowCustom} onChange={(e) => setAllowCustom(e.target.checked)} />
          <span className={styles.switchTrack} aria-hidden />
        </span>
        <span className={styles.toggleText}>
          Allow custom / homebrew builds
          <small>Lets players (and the AI) invent traits and feats — and makes porting a character from another system smoother.</small>
        </span>
      </label>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
        <button type="button" className={styles.hexBtn} onClick={() => setOpen(false)}>Cancel</button>
        <button type="submit" className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} disabled={busy}>
          {busy ? 'Creating…' : 'Create Campaign'}
        </button>
      </div>
    </form>
  )
}
