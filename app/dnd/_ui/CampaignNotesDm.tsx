'use client'
// CampaignNotesDm (Phase P) — the DM's campaign notes. "Player notes" are the setting
// info/summaries players see on their hub; "DM prep" is private and never sent to players.
// Both persist to the campaign's theme jsonb via PATCH /api/dnd/campaigns/[id].
import { useState } from 'react'
import styles from './hextech.module.css'

export default function CampaignNotesDm({ campaignId, initialNotes, initialDmNotes }: { campaignId: string; initialNotes: string; initialDmNotes: string }) {
  const [notes, setNotes] = useState(initialNotes)
  const [dmNotes, setDmNotes] = useState(initialDmNotes)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setErr(null)
    setSaved(false)
    try {
      const r = await fetch(`/api/dnd/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes, dmNotes }),
      })
      if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error ?? 'Save failed.'); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } catch {
      setErr('Request failed.')
    } finally {
      setBusy(false)
    }
  }

  const ta: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'rgba(1,10,19,0.5)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', fontSize: 14, lineHeight: 1.5, padding: '10px 12px', resize: 'vertical' }

  return (
    <section className={styles.framedPanel}>
      <div className={styles.framedPanelTop} />
      <h2 className={styles.panelTitle}>Notes &amp; Summaries</h2>
      {err && <p style={{ color: 'var(--hx-danger)', fontSize: 13, margin: '0 0 8px' }}>✕ {err}</p>}

      <label style={{ display: 'block', marginBottom: 12 }}>
        <span style={{ display: 'block', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--hx-teal-1)', marginBottom: 4 }}>Player notes — visible on the campaign hub</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} style={ta} placeholder="Setting, house rules, what's happened so far…" />
      </label>

      <label style={{ display: 'block', marginBottom: 12 }}>
        <span style={{ display: 'block', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--hx-danger)', marginBottom: 4 }}>DM prep — private, players never see this</span>
        <textarea value={dmNotes} onChange={(e) => setDmNotes(e.target.value)} rows={6} style={ta} placeholder="Secret plans, twists, stat blocks…" />
      </label>

      <button className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} onClick={save} disabled={busy}>
        {busy ? 'Saving…' : saved ? '✓ Saved' : 'Save notes'}
      </button>
    </section>
  )
}
