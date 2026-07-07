'use client'
// Patron-influence meter (Phase J11) — sits vertically next to the streamer chat. The
// chat is the character's patron deity: the higher the influence (driven by the DM's
// viewer count + engagement dial), the higher the DC to resist chat's demands. The bar
// is always bobbing; it's a glowing rainbow until influence maxes out, then it flips to
// neon pink and shakes violently (DC pinned at 30 — "irresistible"). Pure math in
// lib/dnd/stream-influence; the DM controls both inputs from StreamControl.
import { useEffect, useRef, useState } from 'react'
import { computeInfluence, resistDC, isMaxed } from '@/lib/dnd/stream-influence'
import styles from '@/app/dnd/_ui/hextech.module.css'

export default function InfluenceMeter({ viewers, engagement }: { viewers: number; engagement: number }) {
  const base = computeInfluence(viewers, engagement)
  const [level, setLevel] = useState(base)
  const phaseRef = useRef(0)
  const baseRef = useRef(base)
  baseRef.current = base

  // Continuous bob: a couple of out-of-phase sines + a little noise around the base
  // level, so the meter is always alive even when the inputs hold steady.
  useEffect(() => {
    const t = setInterval(() => {
      phaseRef.current += 0.09
      const b = baseRef.current
      const bob = Math.sin(phaseRef.current) * 0.05 + Math.sin(phaseRef.current * 2.7) * 0.022
      const noise = (Math.random() - 0.5) * 0.02
      setLevel(Math.max(0, Math.min(1, b + bob + noise)))
    }, 90)
    return () => clearInterval(t)
  }, [])

  // DC + the maxed state read from the STABLE base (the DM's actual inputs), not the
  // bobbing `level` — so the rules number holds still and the neon/shake state doesn't
  // flicker. Only the bar's fill height bobs.
  const maxed = isMaxed(base)
  const dc = resistDC(base)

  return (
    <div data-influence-meter="" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, userSelect: 'none', flexShrink: 0 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--muted, #9aa)' }}>RESIST</div>
      <div
        style={{
          // Colors are CSS-var driven so a sheet skin can recolor the meter; the
          // hardcoded values are the default (unskinned) look.
          fontFamily: 'var(--inf-font, "Cinzel", var(--hx-font-display, serif))',
          fontSize: 21,
          fontWeight: 800,
          color: maxed ? 'var(--inf-max, #ff10f0)' : 'var(--inf-dc, #7ab8ff)',
          textShadow: maxed ? '0 0 12px var(--inf-max, #ff10f0)' : '0 0 8px var(--inf-dc, #7ab8ff)',
        }}
      >
        DC {dc}
      </div>
      <div data-inf-track="" className={`${styles.influenceTrack} ${maxed ? styles.influenceTrackMax : ''}`}>
        <div data-inf-fill="" className={`${styles.influenceFill} ${maxed ? styles.influenceFillMax : ''}`} style={{ height: `${Math.round(level * 100)}%` }} />
      </div>
      <div style={{ fontSize: 9.5, letterSpacing: '0.06em', color: maxed ? '#ff10f0' : 'var(--muted, #9aa)', textAlign: 'center', maxWidth: 66, lineHeight: 1.25 }}>
        {maxed ? 'MAXED — IRRESISTIBLE!' : 'CHAT INFLUENCE'}
      </div>
    </div>
  )
}
