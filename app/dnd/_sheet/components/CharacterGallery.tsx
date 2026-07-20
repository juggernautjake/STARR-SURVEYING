'use client'
// Character gallery (Phase D4 + image management). Every image tied to this character
// (art variants, tokens, moments) from dnd_media. Beyond viewing, the owner/DM can set
// any image as the character's ART or TOKEN (for the active pink/blue style, if the sheet
// has variants) and delete images — with badges showing which image is currently which.
import { useCallback, useEffect, useState } from 'react'
import { useChar } from '../state/store'

// Mirrors the limits app/api/dnd/characters/[id]/media enforces, so a bad file is rejected
// instantly rather than after a round-trip.
const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

interface MediaRow {
  id: string
  url: string
  thumb_url?: string | null
  caption?: string | null
  label?: string | null
  kind?: string | null
  /** Whether this image also appears in the shared campaign gallery (owner 2026-07-20).
   *  Character art starts unpublished — uploading to your own sheet is not the same as
   *  sharing it with the whole table. */
  published_to_campaign?: boolean | null
}

export default function CharacterGallery() {
  const { characterId, campaignId, canWrite, char, setChar, media, setMedia } = useChar()
  const [items, setItems] = useState<MediaRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [upMsg, setUpMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Active style (streamer pink/blue) — art/token are stored per-style, so the badges and
  // "set as" actions apply to whichever style is currently selected.
  const variant = (char.skinVariant ?? null) as 'pink' | 'blue' | null
  const curArt = (variant && char.variantArt?.[variant]?.art) || media.artUrl || null
  const curToken = (variant && char.variantArt?.[variant]?.token) || media.tokenUrl || null

  const load = useCallback(() => {
    if (!characterId) { setLoaded(true); return }
    fetch(`/api/dnd/media?characterId=${characterId}`)
      .then((r) => (r.ok ? r.json() : { media: [] }))
      .then((j) => setItems((j.media ?? []) as MediaRow[]))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [characterId])

  useEffect(() => { load() }, [load])

  // Upload one or more images into this character's gallery. Reports per-file results rather than
  // failing the whole batch on one bad image.
  const uploadFiles = useCallback(
    async (list: FileList | null) => {
      if (!characterId || !list?.length) return
      setUploading(true)
      setUpMsg(null)
      const files = Array.from(list)
      let ok = 0
      const failures: string[] = []
      for (const file of files) {
        if (!ALLOWED.includes(file.type)) { failures.push(`${file.name}: not a PNG/JPG/WEBP/GIF`); continue }
        if (file.size > MAX_BYTES) { failures.push(`${file.name}: over 8 MB`); continue }
        try {
          const fd = new FormData()
          fd.append('kind', 'gallery')
          fd.append('file', file)
          const r = await fetch(`/api/dnd/characters/${characterId}/media`, { method: 'POST', body: fd })
          if (!r.ok) {
            const j = await r.json().catch(() => ({}))
            failures.push(`${file.name}: ${j?.error ?? 'upload failed'}`)
          } else ok++
        } catch {
          failures.push(`${file.name}: upload failed`)
        }
      }
      load()
      setUploading(false)
      setUpMsg(
        failures.length
          ? { ok: false, text: `${ok} uploaded · ${failures.length} failed — ${failures[0]}` }
          : { ok: true, text: `${ok} image${ok === 1 ? '' : 's'} added.` },
      )
    },
    [characterId, load],
  )

  // Point the character's ART or TOKEN at an existing gallery image. For a variant sheet
  // this also stores it under the active style so switching styles swaps it automatically.
  const setAs = async (kind: 'art' | 'token', url: string) => {
    if (!characterId || !canWrite) return
    setBusy(`${kind}:${url}`)
    try {
      if (variant) {
        setChar((c) => ({ ...c, variantArt: { ...c.variantArt, [variant]: { ...c.variantArt?.[variant], [kind]: url } } }))
      }
      setMedia({ artUrl: kind === 'art' ? url : media.artUrl, tokenUrl: kind === 'token' ? url : media.tokenUrl })
      await fetch(`/api/dnd/characters/${characterId}/media`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, url }),
      }).catch(() => {})
    } finally { setBusy(null) }
  }

  // Publish / unpublish to the shared campaign gallery. Optimistic, with a rollback on failure
  // so the tile can't sit showing a state the server rejected.
  const togglePublish = async (row: MediaRow) => {
    if (!canWrite) return
    const next = !row.published_to_campaign
    setBusy(`pub:${row.id}`)
    setItems((prev) => prev.map((m) => (m.id === row.id ? { ...m, published_to_campaign: next } : m)))
    try {
      const r = await fetch('/api/dnd/media', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, published: next }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        setItems((prev) => prev.map((m) => (m.id === row.id ? { ...m, published_to_campaign: !next } : m)))
        setUpMsg({ ok: false, text: j?.error ?? 'Could not change publishing.' })
      } else {
        setUpMsg({ ok: true, text: next ? 'Published to the campaign gallery.' : 'Removed from the campaign gallery (still here on the sheet).' })
      }
    } catch {
      setItems((prev) => prev.map((m) => (m.id === row.id ? { ...m, published_to_campaign: !next } : m)))
      setUpMsg({ ok: false, text: 'Network error — publishing unchanged.' })
    } finally { setBusy(null) }
  }

  const del = async (row: MediaRow) => {
    if (!canWrite) return
    if (typeof window !== 'undefined' && !window.confirm('Delete this image? This cannot be undone.')) return
    setBusy(`del:${row.id}`)
    setUpMsg(null)
    try {
      const r = await fetch(`/api/dnd/media?id=${row.id}`, { method: 'DELETE' })
      if (!r.ok) {
        // Previously a failed delete was swallowed entirely: the tile stayed put with no
        // explanation, which read as "the button does nothing". Say what went wrong.
        const j = await r.json().catch(() => ({}))
        setUpMsg({ ok: false, text: `Could not delete: ${j?.error ?? `error ${r.status}`}` })
      } else {
        // If it was the current art/token, drop that reference so nothing points at a gone image.
        if (curArt === row.url || curToken === row.url) {
          if (variant) {
            setChar((c) => {
              const v: { art?: string | null; token?: string | null } = { ...c.variantArt?.[variant] }
              if (curArt === row.url) delete v.art
              if (curToken === row.url) delete v.token
              return { ...c, variantArt: { ...c.variantArt, [variant]: v } }
            })
          }
          setMedia({ artUrl: curArt === row.url ? null : media.artUrl, tokenUrl: curToken === row.url ? null : media.tokenUrl })
        }
        // Drop the tile straight away — the delete is confirmed server-side at this point,
        // so there's nothing to wait for.
        setItems((prev) => prev.filter((m) => m.id !== row.id))
        setLightbox((cur) => (cur === row.url ? null : cur)) // don't leave a deleted image open
      }
    } catch {
      setUpMsg({ ok: false, text: 'Could not delete: network error.' })
    } finally { setBusy(null) }
  }

  return (
    <section className="card" style={{ marginTop: 4 }}>
      <div className="sec-head">
        <span className="sec-num">◲ {'//'}</span>
        <h2 style={{ display: 'inline', marginLeft: 8 }}>Gallery</h2>
        {canWrite && variant && (
          <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--muted)' }}>
            managing the <strong style={{ textTransform: 'capitalize' }}>{variant}</strong> style — switch styles above to manage the other
          </span>
        )}
      </div>

      {/* Upload straight into the gallery. Previously images could only arrive via the art/token
          uploader above the sheet, so the gallery told you to "upload art or a token" with no way
          to do it from here. Uploads land in the character's media library and can then be
          promoted to art/token with the buttons on each tile. */}
      {characterId && canWrite && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <label className="btn tiny teal" style={{ cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.6 : 1 }}>
            {uploading ? 'Uploading…' : '⬆ Upload images'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              disabled={uploading}
              onChange={(e) => { void uploadFiles(e.target.files); e.currentTarget.value = '' }}
              style={{ display: 'none' }}
            />
          </label>
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>PNG/JPG/WEBP/GIF · ≤8&nbsp;MB each · pick several at once</span>
          {upMsg && (
            <span style={{ fontSize: 12, color: upMsg.ok ? 'var(--good)' : 'var(--danger)' }}>{upMsg.text}</span>
          )}
        </div>
      )}

      {!characterId ? (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>The gallery appears once this character is saved to a campaign.</p>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          {loaded ? (canWrite ? 'No images yet — use “Upload images” above to start the gallery.' : 'No images yet.') : 'Loading…'}
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
          {items.map((it) => {
            const isArt = curArt === it.url
            const isToken = curToken === it.url
            return (
              <div key={it.id} className="gal-cell" style={{ position: 'relative', border: '1px solid var(--line, #1e2d3d)', borderRadius: 6, overflow: 'hidden', background: 'rgba(0,0,0,0.35)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={it.thumb_url || it.url}
                  alt={it.caption ?? it.label ?? 'gallery image'}
                  onClick={() => setLightbox(it.url)}
                  style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block', cursor: 'zoom-in' }}
                />
                {/* Published state is worth seeing at a glance — you should be able to tell which
                    of your art the rest of the table can see without clicking anything. */}
                {it.published_to_campaign && (
                  <div style={{ position: 'absolute', top: 4, right: 4 }}>
                    <span title="Visible in the campaign gallery" style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', padding: '2px 5px', borderRadius: 3, background: 'var(--tealbright, #22d3ee)', color: 'var(--void)' }}>◈ SHARED</span>
                  </div>
                )}
                {(isArt || isToken) && (
                  <div style={{ position: 'absolute', top: 4, left: 4, display: 'flex', gap: 4 }}>
                    {/* #fff is correct here: the badge sits on a SOLID accent fill, which is dark
                        enough for white on every skin (neon pink, moss green, MLM magenta). */}
                    {isArt && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', padding: '2px 5px', borderRadius: 3, background: 'var(--hotpink, #ff2d8b)', color: '#fff' }}>★ ART</span>}
                    {isToken && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', padding: '2px 5px', borderRadius: 3, background: 'var(--tealbright, #22d3ee)', color: 'var(--void)' }}>◉ TOKEN</span>}
                  </div>
                )}
                {canWrite && (
                  <div style={{ display: 'flex', borderTop: '1px solid var(--line, #1e2d3d)' }}>
                    <button
                      onClick={() => setAs('art', it.url)}
                      disabled={isArt || busy != null}
                      title={isArt ? 'This is the current art' : `Use as the character art${variant ? ` for the ${variant} style` : ''}`}
                      style={galBtn(isArt)}
                    >{busy === `art:${it.url}` ? '…' : '★ Art'}</button>
                    <button
                      onClick={() => setAs('token', it.url)}
                      disabled={isToken || busy != null}
                      title={isToken ? 'This is the current token' : `Use as the round token${variant ? ` for the ${variant} style` : ''}`}
                      style={{ ...galBtn(isToken), borderLeft: '1px solid var(--line, #1e2d3d)' }}
                    >{busy === `token:${it.url}` ? '…' : '◉ Token'}</button>
                    <button
                      onClick={() => del(it)}
                      disabled={busy != null}
                      title="Delete this image permanently"
                      style={{ ...galBtn(false), borderLeft: '1px solid var(--line, #1e2d3d)', flex: '0 0 34px', color: 'var(--danger)' }}
                    >{busy === `del:${it.id}` ? '…' : '🗑'}</button>
                  </div>
                )}
                {/* Share to the campaign gallery — only meaningful for a character in a campaign. */}
                {canWrite && campaignId && (
                  <button
                    onClick={() => togglePublish(it)}
                    disabled={busy != null}
                    title={it.published_to_campaign
                      ? 'Remove from the campaign gallery — it stays here on the sheet'
                      : 'Publish to the campaign gallery so the whole table can see it'}
                    style={{ ...galBtn(false), width: '100%', borderTop: '1px solid var(--line, #1e2d3d)', color: it.published_to_campaign ? 'var(--tealbright)' : 'var(--ink)' }}
                  >
                    {busy === `pub:${it.id}` ? '…' : it.published_to_campaign ? '◈ Shared — unshare' : '◇ Share to campaign'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 100001, background: 'rgba(2,4,10,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          {/* #fff is correct here: the lightbox backdrop is a fixed dark scrim on every skin. */}
          <button onClick={() => setLightbox(null)} aria-label="Close" style={{ position: 'absolute', top: 12, right: 12, width: 40, height: 40, borderRadius: '50%', border: '1px solid var(--line-strong, #785a28)', background: 'rgba(1,10,19,0.7)', color: '#fff', fontSize: 20, cursor: 'pointer' }}>✕</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="image" style={{ maxWidth: '92vw', maxHeight: '86vh', objectFit: 'contain', borderRadius: 4 }} />
        </div>
      )}
    </section>
  )
}

function galBtn(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '5px 4px',
    fontSize: 11,
    fontWeight: 700,
    cursor: active ? 'default' : 'pointer',
    background: active ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.35)',
    color: active ? '#fff' : 'var(--ink, #e8e3f5)',
    border: 'none',
    whiteSpace: 'nowrap',
  }
}
