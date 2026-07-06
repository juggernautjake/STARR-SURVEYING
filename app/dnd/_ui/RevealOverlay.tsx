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
  return (
    <div className={styles.revealBackdrop} onClick={() => setActive(null)} role="button" tabIndex={0} aria-label="Dismiss reveal">
      <div className={styles.revealFrame}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.revealImg} src={active.imageUrl} alt={active.caption ?? 'Revealed image'} />
        {active.caption && <div className={styles.revealCaption}>{active.caption}</div>}
      </div>
      <div className={styles.revealHint}>Click anywhere to dismiss</div>
    </div>
  )
}
