'use client'
// Character gallery (Phase D4) — every image tied to this character (art variants,
// tokens, moments) from dnd_media, shown in the reusable Gallery (grid + lightbox).
import { useEffect, useState } from 'react'
import { useChar } from '../state/store'
import Gallery, { type GalleryItem } from './Gallery'

interface MediaRow {
  url: string
  thumb_url?: string | null
  caption?: string | null
  label?: string | null
}

export default function CharacterGallery() {
  const { characterId } = useChar()
  const [items, setItems] = useState<GalleryItem[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!characterId) {
      setLoaded(true)
      return
    }
    let cancelled = false
    fetch(`/api/dnd/media?characterId=${characterId}`)
      .then((r) => (r.ok ? r.json() : { media: [] }))
      .then((j) => {
        if (cancelled) return
        setItems(((j.media ?? []) as MediaRow[]).map((m) => ({ url: m.url, thumb_url: m.thumb_url, caption: m.caption, label: m.label })))
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [characterId])

  return (
    <section className="card" style={{ marginTop: 4 }}>
      <div className="sec-head">
        <span className="sec-num">◲ {'//'}</span>
        <h2 style={{ display: 'inline', marginLeft: 8 }}>Gallery</h2>
      </div>
      {!characterId ? (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>The gallery appears once this character is saved to a campaign.</p>
      ) : (
        <Gallery items={items} emptyText={loaded ? 'No images yet — upload art or a token to start the gallery.' : 'Loading…'} />
      )}
    </section>
  )
}
