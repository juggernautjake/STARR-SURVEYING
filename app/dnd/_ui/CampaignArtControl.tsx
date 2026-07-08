'use client'
// CampaignArtControl (Phase P) — DM-only. Sets the campaign art banner that players see
// on their campaign hub. Uploads an image (reusing the F5 campaign image upload) and
// saves the URL to the campaign's theme.artUrl via PATCH /api/dnd/campaigns/[id].
import { useRef, useState } from 'react'
import styles from './hextech.module.css'

export default function CampaignArtControl({ campaignId, initialArtUrl }: { campaignId: string; initialArtUrl: string | null }) {
  const [artUrl, setArtUrl] = useState<string | null>(initialArtUrl)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function saveArt(url: string | null) {
    setBusy(true)
    setErr(null)
    try {
      const r = await fetch(`/api/dnd/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artUrl: url }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) return setErr(j.error ?? 'Save failed.')
      setArtUrl((j.campaign?.theme?.artUrl as string | null) ?? null)
    } catch {
      setErr('Request failed.')
    } finally {
      setBusy(false)
    }
  }

  async function upload(file: File) {
    setBusy(true)
    setErr(null)
    try {
      const fd = new FormData()
      fd.append('campaignId', campaignId)
      fd.append('file', file)
      const up = await fetch('/api/dnd/messages/image', { method: 'POST', body: fd })
      const uj = await up.json().catch(() => ({}))
      if (!up.ok || !uj.url) {
        setErr(uj.error ?? 'Upload failed.')
        setBusy(false)
        return
      }
      await saveArt(uj.url)
    } catch {
      setErr('Upload failed.')
      setBusy(false)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <section className={styles.framedPanel}>
      <div className={styles.framedPanelTop} />
      <h2 className={styles.panelTitle}>Campaign Art</h2>
      {err && <p style={{ color: 'var(--hx-danger)', fontSize: 13, margin: '0 0 8px' }}>✕ {err}</p>}
      {artUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={artUrl} alt="Campaign art" style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 260, objectFit: 'cover', borderRadius: 4, marginBottom: 10 }} />
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} style={{ cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Working…' : artUrl ? 'Replace art' : 'Upload art'}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
            disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f) }}
          />
        </label>
        {artUrl && (
          <button className={styles.hexBtn} onClick={() => saveArt(null)} disabled={busy}>Remove</button>
        )}
      </div>
      <p style={{ color: 'var(--hx-muted)', fontSize: 12, margin: '8px 0 0' }}>Players see this banner at the top of the campaign hub.</p>
    </section>
  )
}
