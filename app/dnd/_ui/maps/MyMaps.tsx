'use client'
// MyMaps — a person's own map library, with no campaign involved (owner request 2026-08-01).
//
// The campaign twin of this (`CampaignMapsDm`) fetches its list on mount and shows a spinner. This one
// is HANDED its list by the server page, so "you have no maps yet" is a fact on first paint rather than
// a state the user watches resolve. Only mutations re-fetch.
//
// ── WHY "ADD TO CAMPAIGN" IS HERE AND NOT LEFT FOR LATER ────────────────────────────────────────────
//
// A map you can build and save but never use is the audit's signature defect (§1.4, "authored but not
// wired") — it would ship as a feature and read as a dead end. So the library carries the one path out:
// copy a personal map into a campaign you DM. It is a copy, not a move; the original stays yours, and
// the campaign's own DM check runs server-side on the destination.
import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from '../hextech.module.css'

export interface MyMapRow {
  id: string
  name: string
  kind: 'image' | 'built'
  image_url: string | null
  created_at: string
  updated_at: string
}

export interface DmCampaign {
  id: string
  name: string
}

export default function MyMaps({ initialMaps, campaigns }: { initialMaps: MyMapRow[]; campaigns: DmCampaign[] }) {
  const router = useRouter()
  const [maps, setMaps] = useState<MyMapRow[]>(initialMaps)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const r = await fetch('/api/dnd/maps', { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (r.ok) setMaps(j.maps ?? [])
    } catch { /* leave the current list — a failed refresh is not a reason to blank the page */ }
  }, [])

  async function upload(file: File) {
    setBusy(true); setErr(null); setNote(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (name.trim()) fd.append('name', name.trim())
      const r = await fetch('/api/dnd/maps', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (r.ok) { setName(''); await reload() } else setErr(j.error || 'Upload failed.')
    } catch { setErr('Upload failed — network error.') } finally { setBusy(false) }
  }

  async function rename(m: MyMapRow) {
    const next = window.prompt('Rename map', m.name)
    if (!next || !next.trim() || next.trim() === m.name) return
    setErr(null)
    try {
      const r = await fetch('/api/dnd/maps', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id, name: next.trim() }),
      })
      if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error || `Rename failed (${r.status}).`) }
    } catch { setErr('Rename failed — network error.') } finally { await reload() }
  }

  async function remove(m: MyMapRow) {
    if (!window.confirm(`Delete the map “${m.name}”? This can't be undone.`)) return
    setErr(null)
    // Not removed from the list until the server confirms — the campaign version shipped the optimistic
    // version first and a failed delete looked like it worked until the next refresh.
    try {
      const r = await fetch(`/api/dnd/maps?id=${encodeURIComponent(m.id)}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id }),
      })
      if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error || `Delete failed (${r.status}). The map was not removed.`) }
    } catch { setErr('Delete failed — network error. The map was not removed.') } finally { await reload() }
  }

  async function copyTo(m: MyMapRow, campaignId: string) {
    const campaign = campaigns.find((c) => c.id === campaignId)
    setErr(null); setNote(null); setBusy(true)
    try {
      const r = await fetch(`/api/dnd/maps?copyTo=${encodeURIComponent(campaignId)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok) setNote(`Copied “${m.name}” into ${campaign?.name ?? 'the campaign'}. Publish it there to show your players.`)
      else setErr(j.error || `Copy failed (${r.status}).`)
    } catch { setErr('Copy failed — network error.') } finally { setBusy(false) }
  }

  function open(m: MyMapRow) {
    if (m.kind === 'image' && m.image_url) window.open(m.image_url, '_blank')
    else router.push(`/dnd/maps/studio?map=${m.id}`)
  }

  return (
    <div className={styles.root} style={{ maxWidth: 940, margin: '0 auto', padding: '28px 18px 60px' }}>
      <h1 className={styles.title}>My Maps</h1>
      <p className={styles.subtitle} style={{ marginBottom: 22 }}>
        Build and keep maps here whether or not you are running a campaign. Add one to a campaign you
        run whenever you want your players to see it.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 12, marginBottom: 18 }}>
        <div style={{ border: '1px solid var(--hx-gold-1)', borderRadius: 8, padding: 14, background: 'rgba(200,155,60,0.06)' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--hx-gold-2)', marginBottom: 8 }}>Build a map</div>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--hx-muted)' }}>
            Generate planets, systems, sectors, stars &amp; nebulas, and drop points of interest.
          </p>
          <button className={`${styles.hexBtn} ${styles.hexBtnPrimary}`} onClick={() => router.push('/dnd/maps/studio')}>
            ✦ Open Map Studio
          </button>
        </div>
        <div style={{ border: '1px solid var(--hx-line)', borderRadius: 8, padding: 14, background: 'rgba(1,10,19,0.4)' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--hx-gold-2)', marginBottom: 8 }}>Upload a premade map</div>
          <input
            className={styles.input}
            style={{ width: '100%', padding: '8px 10px', marginBottom: 8 }}
            placeholder="Map name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className={styles.hexBtn} style={{ display: 'inline-flex', cursor: 'pointer', position: 'relative' }}>
            {busy ? 'Working…' : '⬆ Choose image (PNG/JPG/WEBP)'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { upload(f); e.target.value = '' } }}
              disabled={busy}
            />
          </label>
        </div>
      </div>

      {err && <div className={styles.error} style={{ marginBottom: 10 }}>{err}</div>}
      {note && <div className={styles.success} style={{ marginBottom: 10 }}>{note}</div>}

      {maps.length === 0 ? (
        <p style={{ color: 'var(--hx-muted)', fontSize: 13 }}>
          No maps yet. Open the Map Studio to build one, or upload an image you already have.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {maps.map((m) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: 10, border: '1px solid var(--hx-line)', borderRadius: 8, background: 'rgba(1,10,19,0.4)' }}>
              <div style={{ width: 52, height: 40, flexShrink: 0, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--hx-line)', background: '#010a13', display: 'grid', placeItems: 'center' }}>
                {m.kind === 'image' && m.image_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={m.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 18 }}>✦</span>}
              </div>
              <div style={{ minWidth: 140, flex: 1 }}>
                <div style={{ color: 'var(--hx-text)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                <div style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--hx-muted)' }}>
                  {m.kind === 'image' ? 'Uploaded image' : 'Built map'} · Updated {new Date(m.updated_at).toLocaleDateString()}
                </div>
              </div>

              {campaigns.length > 0 && (
                <select
                  className={styles.input}
                  style={{ padding: '4px 8px', fontSize: 12, maxWidth: 190 }}
                  defaultValue=""
                  disabled={busy}
                  onChange={(e) => { const v = e.target.value; e.target.value = ''; if (v) copyTo(m, v) }}
                  title="Copy this map into a campaign you run"
                >
                  <option value="">Add to campaign…</option>
                  {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}

              <button className={styles.hexBtn} style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => open(m)}>Open</button>
              <button className={styles.hexBtn} style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => rename(m)} title="Rename">✎</button>
              <button
                style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#ff6b6b', background: 'transparent', border: '1px solid var(--hx-line)', borderRadius: 4 }}
                onClick={() => remove(m)}
                title="Delete"
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
