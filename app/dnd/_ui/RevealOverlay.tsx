'use client'
// Full-screen reveal overlay (Phase H1) — plays the dim → slide-in → glowing-outline
// animation when a reveal targeting this user arrives. Click anywhere to dismiss (H2
// makes dismiss per-recipient + saves the image into the relevant chat).
import { useState } from 'react'
import styles from './hextech.module.css'
import { useReveals, type RevealPayload } from './useReveals'

export default function RevealOverlay({ campaignId, selfId, initialReveal }: { campaignId: string; selfId: string | null; initialReveal?: RevealPayload }) {
  const [active, setActive] = useState<RevealPayload | null>(initialReveal ?? null)
  useReveals(campaignId, selfId, (p) => setActive(p))

  if (!active) return null
  const body = active.body ?? active.caption ?? null // `caption` kept for old broadcasts
  return (
    <div className={styles.revealBackdrop} onClick={() => setActive(null)} role="button" tabIndex={0} aria-label="Dismiss reveal">
      <div className={styles.revealFrame}>
        {active.title && <div className={styles.revealTitle}>{active.title}</div>}
        {active.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.revealImg} src={active.imageUrl} alt={active.title ?? 'Revealed image'} />
        )}
        {body && <div className={styles.revealBody}>{body}</div>}
      </div>
      <div className={styles.revealHint}>Click anywhere to dismiss</div>
    </div>
  )
}
