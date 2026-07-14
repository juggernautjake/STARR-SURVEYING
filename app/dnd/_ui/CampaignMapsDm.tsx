'use client'
// CampaignMapsDm (Phase U) — the DM's "Map Management" section in campaign management.
// Upload a premade map image OR (soon) open the built-in Stardust map maker. Lists the
// campaign's maps with publish / rename / open / delete. The published map is what players
// see in the campaign hub. Hextech-styled to match the rest of the DM control panel.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './hextech.module.css'

interface MapRow {
  id: string
  name: string
  kind: 'image' | 'built'
  image_url: string | null
  published: boolean
  updated_at: string
}

export default function CampaignMapsDm({ campaignId }: { campaignId: string }) {
  const router = useRouter()
  const [maps, setMaps] = useState<MapRow[] | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    try {
      const r = await fetch(`/api/dnd/campaigns/${campaignId}/maps`)
      const j = await r.json().catch(() => ({}))
      setMaps(r.ok ? (j.maps ?? []) : [])
    } catch {
      setMaps([])
    }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(file: File) {
    setBusy(true); setErr(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (name.trim()) fd.append('name', name.trim())
      const r = await fetch(`/api/dnd/campaigns/${campaignId}/maps`, { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (r.ok) { setName(''); if (fileRef.current) fileRef.current.value = ''; load() }
      else setErr(j.error || 'Upload failed.')
    } catch { setErr('Upload failed.') } finally { setBusy(false) }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setMaps((m) => (m ? m.map((x) => (x.id === id ? { ...x, ...body } : x)) : m))
    await fetch(`/api/dnd/campaigns/${campaignId}/maps`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }),
    }).catch(() => {})
  }

  async function remove(m: MapRow) {
    if (!window.confirm(`Delete the map “${m.name}”? This can't be undone.`)) return
    setMaps((list) => (list ? list.filter((x) => x.id !== m.id) : list))
    await fetch(`/api/dnd/campaigns/${campaignId}/maps?id=${m.id}`, { method: 'DELETE' }).catch(() => {})
  }

  function rename(m: MapRow) {
    const next = window.prompt('Rename map', m.name)
    if (next && next.trim() && next.trim() !== m.name) patch(m.id, { name: next.trim() })
  }

  function openMap(m: MapRow) {
    if (m.kind === 'image' && m.image_url) window.open(m.image_url, '_blank')
    else router.push(`/dnd/campaigns/${campaignId}/map-studio?map=${m.id}`)
  }

  return (
    <section className={styles.framedPanel}>
      <div className={styles.framedPanelTop} />
      <h2 className={styles.panelTitle}>Map Management</h2>
      <p style={{ margin: '-4px 0 14px', fontSize: 12.5, color: 'var(--hx-muted)', lineHeight: 1.5 }}>
        Upload a premade map image, or build one with the galaxy map maker. <strong style={{ color: 'var(--hx-gold-2)' }}>Publish</strong> a map to show it to your players in the campaign hub.
      </p>

      {/* Two ways in */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12, marginBottom: 16 }}>
        <div style={{ border: '1px solid var(--hx-line)', borderRadius: 8, padding: 14, background: 'rgba(1,10,19,0.4)' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--hx-gold-2)', marginBottom: 8 }}>Upload a premade map</div>
          <input className={styles.input} style={{ width: '100%', padding: '8px 10px', marginBottom: 8 }} placeholder="Map name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
          <label className={styles.hexBtn} style={{ display: 'inline-flex', cursor: 'pointer' }}>
            {busy ? 'Uploading…' : '⬆ Choose image (PNG/JPG/WEBP)'}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f) }} disabled={busy} />
          </label>
        </div>
        <div style={{ border: '1px solid var(--hx-gold-1)', borderRadius: 8, padding: 14, background: 'rgba(200,155,60,0.06)' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--hx-gold-2)', marginBottom: 8 }}>Build a galaxy map</div>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--hx-muted)' }}>Generate planets, systems, sectors, stars &amp; nebulas, drop points of interest, and publish an interactive map.</p>
          <button
            className={`${styles.hexBtn} ${styles.hexBtnPrimary}`}
            onClick={() => router.push(`/dnd/campaigns/${campaignId}/map-studio`)}
            title="Open the built-in galaxy map maker"
          >
            ✦ Open Map Maker
          </button>
        </div>
      </div>

      {err && <div className={styles.error} style={{ marginBottom: 10 }}>{err}</div>}

      {/* Existing maps */}
      {!maps ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--hx-muted)' }}><span className={styles.spinner} /> Loading maps…</div>
      ) : maps.length === 0 ? (
        <p style={{ color: 'var(--hx-muted)', fontSize: 13, margin: 0 }}>No maps yet. Upload one or open the Map Maker to begin.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {maps.map((m) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, border: `1px solid ${m.published ? 'var(--hx-teal-1)' : 'var(--hx-line)'}`, borderRadius: 8, background: 'rgba(1,10,19,0.4)' }}>
              <div style={{ width: 52, height: 40, flexShrink: 0, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--hx-line)', background: '#010a13', display: 'grid', placeItems: 'center' }}>
                {m.kind === 'image' && m.image_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={m.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 18 }}>✦</span>}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: 'var(--hx-text)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                <div style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--hx-muted)' }}>
                  {m.kind === 'image' ? 'Uploaded image' : 'Built map'}{m.published ? ' · Published' : ''}
                </div>
              </div>
              <button className={styles.hexBtn} style={{ padding: '4px 10px', fontSize: 12, color: m.published ? 'var(--hx-teal-1)' : 'var(--hx-muted)', borderColor: m.published ? 'var(--hx-teal-1)' : 'var(--hx-line)' }}
                onClick={() => patch(m.id, { published: !m.published })} title={m.published ? 'Unpublish (hide from players)' : 'Publish (show to players)'}>
                {m.published ? '✓ Published' : 'Publish'}
              </button>
              <button className={styles.hexBtn} style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => openMap(m)} title="Open this map">Open</button>
              <button className={styles.hexBtn} style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => rename(m)} title="Rename">✎</button>
              <button style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#ff6b6b', background: 'transparent', border: '1px solid var(--hx-line)', borderRadius: 4 }} onClick={() => remove(m)} title="Delete">✕</button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
