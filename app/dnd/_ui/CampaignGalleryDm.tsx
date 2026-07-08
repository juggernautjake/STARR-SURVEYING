'use client'
// CampaignGalleryDm (Phase P) — the DM's campaign image gallery: settings/maps/character
// art/item art/handouts. Each image is either player-visible or DM-only; the DM flips it
// per item and players see only the visible ones on their hub. Upload / re-tag / delete
// via the campaign media API.
import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './hextech.module.css'

interface MediaItem { id: string; url: string; kind: string; label: string | null; gallery_tags: string[] }
const KINDS = ['map', 'art', 'handout', 'token', 'reveal', 'avatar'] as const
const DM_ONLY = 'dm-only'

export default function CampaignGalleryDm({ campaignId }: { campaignId: string }) {
  const [items, setItems] = useState<MediaItem[]>([])
  const [kind, setKind] = useState<(typeof KINDS)[number]>('map')
  const [label, setLabel] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    fetch(`/api/dnd/media?campaignId=${campaignId}`)
      .then((r) => (r.ok ? r.json() : { media: [] }))
      .then((j) => setItems(j.media ?? []))
      .catch(() => {})
  }, [campaignId])
  useEffect(() => { load() }, [load])

  async function upload(file: File) {
    setBusy(true)
    setErr(null)
    try {
      const fd = new FormData()
      fd.append('campaignId', campaignId)
      fd.append('file', file)
      fd.append('kind', kind)
      fd.append('label', label)
      fd.append('private', isPrivate ? '1' : '0')
      const r = await fetch('/api/dnd/media', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.media) { setErr(j.error ?? 'Upload failed.'); return }
      setItems((xs) => [j.media, ...xs])
      setLabel('')
    } catch {
      setErr('Upload failed.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function toggle(item: MediaItem) {
    const nextPrivate = !item.gallery_tags?.includes(DM_ONLY)
    setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, gallery_tags: nextPrivate ? [DM_ONLY] : [] } : x)))
    await fetch('/api/dnd/media', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, private: nextPrivate }) }).catch(() => {})
  }

  async function remove(id: string) {
    setItems((xs) => xs.filter((x) => x.id !== id))
    await fetch(`/api/dnd/media?id=${id}`, { method: 'DELETE' }).catch(() => {})
  }

  return (
    <section className={styles.framedPanel}>
      <div className={styles.framedPanelTop} />
      <h2 className={styles.panelTitle}>Gallery &amp; Maps</h2>
      {err && <p style={{ color: 'var(--hx-danger)', fontSize: 13, margin: '0 0 8px' }}>✕ {err}</p>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <select className={styles.input} style={{ width: 'auto', padding: '8px 10px' }} value={kind} onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}>
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <input className={styles.input} style={{ width: 'auto', flex: 1, minWidth: 120, padding: '8px 10px' }} placeholder="Label (optional)…" value={label} onChange={(e) => setLabel(e.target.value)} />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--hx-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} /> DM-only
        </label>
        <label className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} style={{ cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Uploading…' : '＋ Upload'}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f) }} />
        </label>
      </div>

      {items.length === 0 ? (
        <p style={{ color: 'var(--hx-muted)', fontSize: 14 }}>No images yet. Upload maps, setting art, item art, or handouts.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
          {items.map((m) => {
            const priv = m.gallery_tags?.includes(DM_ONLY)
            return (
              <div key={m.id} style={{ border: `1px solid ${priv ? 'var(--hx-danger)' : 'var(--hx-teal-1)'}`, background: 'rgba(1,10,19,0.4)', padding: 6, display: 'grid', gap: 6 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt={m.label ?? ''} style={{ width: '100%', height: 96, objectFit: 'cover', borderRadius: 3 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--hx-muted)' }}>
                  <span>{m.kind}</span>
                  <span style={{ color: priv ? 'var(--hx-danger)' : 'var(--hx-teal-1)' }}>{priv ? 'DM-only' : 'Players'}</span>
                </div>
                {m.label && <div style={{ fontSize: 12, color: 'var(--hx-text)', wordBreak: 'break-word' }}>{m.label}</div>}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className={styles.hexBtn} style={{ padding: '4px 8px', fontSize: 11, flex: 1 }} onClick={() => toggle(m)}>{priv ? '→ Show players' : '→ Hide'}</button>
                  <button className={styles.hexBtn} style={{ padding: '4px 8px', fontSize: 11, borderColor: 'var(--hx-danger)', color: 'var(--hx-danger)' }} onClick={() => remove(m.id)}>✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
