'use client'
// Campaign gallery (Phase D6) — all campaign media (handouts, maps, reveal images,
// NPC art, session shots) in one grid + lightbox. Reuses the D4 Gallery and the
// campaign media API. Mounts on the campaign page / DM dashboard (E3).
import { useEffect, useState } from 'react'
import Gallery, { type GalleryItem } from './Gallery'

interface MediaRow {
  url: string
  thumb_url?: string | null
  caption?: string | null
  label?: string | null
  kind?: string | null
}

export default function CampaignGallery({ campaignId, kind }: { campaignId: string; kind?: string }) {
  const [items, setItems] = useState<GalleryItem[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const qs = new URLSearchParams({ campaignId })
    if (kind) qs.set('kind', kind)
    fetch(`/api/dnd/media?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : { media: [] }))
      .then((j) => {
        if (cancelled) return
        setItems(
          ((j.media ?? []) as MediaRow[]).map((m) => ({
            url: m.url,
            thumb_url: m.thumb_url,
            // fall back to the media kind (art/token/map/handout/reveal) as a label
            caption: m.caption ?? m.label ?? m.kind,
            label: m.kind,
          })),
        )
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [campaignId, kind])

  return (
    <section className="card">
      <div className="sec-head">
        <span className="sec-num">▦ {'//'}</span>
        <h2 style={{ display: 'inline', marginLeft: 8 }}>Campaign Gallery</h2>
      </div>
      {!loaded ? (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>Loading campaign media…</p>
      ) : (
        <Gallery items={items} emptyText="No campaign media yet — handouts, maps, and reveals will collect here." />
      )}
    </section>
  )
}
