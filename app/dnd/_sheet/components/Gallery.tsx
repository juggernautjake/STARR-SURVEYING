'use client'
// Reusable image gallery + lightbox (Phase D4; reused by D5 party / D6 campaign).
// Responsive thumbnail grid → click opens a full-screen lightbox with prev/next,
// keyboard (Esc / ← →), tap-to-zoom, and mobile swipe.
import { useEffect, useRef, useState } from 'react'

export interface GalleryItem {
  url: string
  thumb_url?: string | null
  caption?: string | null
  label?: string | null
}

export default function Gallery({ items, emptyText = 'No images yet.' }: { items: GalleryItem[]; emptyText?: string }) {
  const [open, setOpen] = useState<number | null>(null)
  const [zoom, setZoom] = useState(false)
  const touchX = useRef<number | null>(null)

  const show = (i: number) => {
    setZoom(false)
    setOpen(((i % items.length) + items.length) % items.length)
  }
  const next = () => open != null && show(open + 1)
  const prev = () => open != null && show(open - 1)

  useEffect(() => {
    if (open == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items.length])

  if (!items.length) {
    return <p style={{ color: 'var(--muted, #a09b8c)', fontSize: 14, margin: '8px 0' }}>{emptyText}</p>
  }

  const current = open != null ? items[open] : null

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
        {items.map((it, i) => (
          <button
            key={i}
            onClick={() => show(i)}
            title={it.caption ?? it.label ?? 'View'}
            style={{ padding: 0, border: '1px solid var(--line, #1e2d3d)', background: 'rgba(1,10,19,0.5)', cursor: 'pointer', borderRadius: 4, overflow: 'hidden', aspectRatio: '1 / 1' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.thumb_url || it.url} alt={it.caption ?? it.label ?? 'gallery image'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </button>
        ))}
      </div>

      {current && (
        <div
          onClick={() => setOpen(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 100001, background: 'rgba(2,4,10,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX.current == null) return
            const dx = e.changedTouches[0].clientX - touchX.current
            if (Math.abs(dx) > 40) (dx < 0 ? next : prev)()
            touchX.current = null
          }}
        >
          <button onClick={(e) => { e.stopPropagation(); setOpen(null) }} aria-label="Close" style={ctrl({ top: 12, right: 12 })}>✕</button>
          {items.length > 1 && <button onClick={(e) => { e.stopPropagation(); prev() }} aria-label="Previous" style={ctrl({ left: 12, top: '50%' })}>‹</button>}
          {items.length > 1 && <button onClick={(e) => { e.stopPropagation(); next() }} aria-label="Next" style={ctrl({ right: 12, top: '50%' })}>›</button>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.url}
            alt={current.caption ?? current.label ?? 'image'}
            onClick={(e) => { e.stopPropagation(); setZoom((z) => !z) }}
            style={{ maxWidth: zoom ? 'none' : '92vw', maxHeight: zoom ? 'none' : '82vh', width: zoom ? 'auto' : undefined, objectFit: 'contain', cursor: zoom ? 'zoom-out' : 'zoom-in', borderRadius: 4 }}
          />
          {(current.caption || current.label) && (
            <p style={{ color: 'var(--ink, #f0e6d2)', marginTop: 12, fontSize: 14, textAlign: 'center' }}>{current.caption ?? current.label}</p>
          )}
        </div>
      )}
    </>
  )
}

function ctrl(pos: React.CSSProperties): React.CSSProperties {
  return {
    position: 'absolute',
    ...pos,
    width: 40,
    height: 40,
    borderRadius: '50%',
    border: '1px solid var(--gold-0, #785a28)',
    background: 'rgba(1,10,19,0.7)',
    color: 'var(--gold-2, #c8aa6e)',
    fontSize: 20,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }
}
