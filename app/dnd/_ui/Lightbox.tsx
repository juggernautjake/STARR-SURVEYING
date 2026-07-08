'use client'
// Lightbox (Phase P) — a full-screen image viewer. Click any gallery artwork to expand
// it; click the backdrop, press Esc, or hit ✕ to close.
import { useEffect } from 'react'

export default function Lightbox({ src, alt, onClose }: { src: string; alt?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Expanded artwork"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(2,4,10,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, cursor: 'zoom-out' }}
    >
      <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 12, right: 16, background: 'none', border: 'none', color: '#fff', fontSize: 30, lineHeight: 1, cursor: 'pointer', opacity: 0.85 }}>✕</button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt ?? ''}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '96vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: 6, boxShadow: '0 0 60px rgba(0,0,0,0.8)', cursor: 'default' }}
      />
    </div>
  )
}
